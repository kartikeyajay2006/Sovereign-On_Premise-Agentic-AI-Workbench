"""Model manager: residency, memory admission and load/unload.

Implements the reference architecture's Model Manager stage — *registry →
signature check → quantization → memory check → load/unload*. On a constrained
host this is not an optimisation, it is a correctness requirement: two
multi-gigabyte models resident at once will exhaust memory and the inference
runtime dies mid-request.

Policy, in order:

1. **Memory admission** — before a model is invoked, confirm the host has
   enough free memory for its declared footprint plus headroom. If not, the
   currently resident model is evicted first.
2. **Single residency** — when ``inference.single_model_residency`` is set,
   only one generation model stays loaded. Switching roles (reasoning →
   vision) evicts the previous one deliberately rather than letting the
   runtime thrash or crash.
3. **Embedding models are exempt** from eviction: they are small and are
   needed alongside generation for retrieval.

Every load and eviction is an auditable event, because "which model was
resident when this answer was produced" is part of the reproducibility record.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx
import psutil

from backend.core.audit import get_audit_log
from backend.core.config import get_config
from backend.core.schemas import ModelDescriptor, ModelRole

# Bytes of headroom left free after a model is admitted, so the host stays
# responsive and the sandbox can still fork.
DEFAULT_HEADROOM_MB = 1024

# Fallback footprint estimate when the runtime reports no size: roughly one
# byte per parameter at 4-bit quantization plus overhead.
BYTES_PER_BILLION_PARAMS_Q4 = 700 * 1024 * 1024


@dataclass
class ResidencyState:
    model_id: str | None = None
    provider_model: str | None = None
    loaded_at: datetime | None = None
    footprint_bytes: int = 0
    evictions: int = 0
    loads: int = 0
    history: list[dict[str, Any]] = field(default_factory=list)


class ModelManager:
    """Admission control and residency management for local models."""

    def __init__(self) -> None:
        self.config = get_config()
        self.audit = get_audit_log()
        self.state = ResidencyState()
        self._lock = asyncio.Lock()

    # -- configuration -----------------------------------------------------
    @property
    def _inference(self) -> dict[str, Any]:
        return self.config.settings.inference

    @property
    def single_residency(self) -> bool:
        return bool(self._inference.get("single_model_residency", True))

    @property
    def headroom_bytes(self) -> int:
        return int(self._inference.get("memory_headroom_mb", DEFAULT_HEADROOM_MB)) * 1024 * 1024

    @property
    def base_url(self) -> str:
        return str(self._inference.get("base_url", "http://127.0.0.1:11434")).rstrip("/")

    # -- measurement -------------------------------------------------------
    @staticmethod
    def available_bytes() -> int:
        try:
            return int(psutil.virtual_memory().available)
        except Exception:
            return 0

    def footprint_of(self, descriptor: ModelDescriptor) -> int:
        """Best available estimate of what this model costs to hold resident."""
        if descriptor.size_bytes:
            base = int(descriptor.size_bytes)
        elif descriptor.parameters_b:
            base = int(float(descriptor.parameters_b) * BYTES_PER_BILLION_PARAMS_Q4)
        else:
            base = 2 * 1024 * 1024 * 1024

        # The KV cache scales with the context window actually requested.
        ceiling = int(self._inference.get("max_context_tokens", 8192))
        context = min(int(descriptor.context_window or ceiling), ceiling)
        kv_bytes = int(context * 140 * 1024)  # ~140 KB per 1k tokens, order of magnitude
        return base + kv_bytes

    # -- runtime control ---------------------------------------------------
    async def _unload(self, provider_model: str) -> bool:
        """Ask the runtime to release a model immediately (keep_alive: 0)."""
        try:
            async with httpx.AsyncClient(base_url=self.base_url, timeout=30.0) as client:
                response = await client.post(
                    "/api/generate",
                    json={"model": provider_model, "keep_alive": 0, "prompt": ""},
                )
                return response.status_code < 400
        except httpx.HTTPError:
            return False

    async def resident_models(self) -> list[dict[str, Any]]:
        """What the runtime currently holds in memory."""
        try:
            async with httpx.AsyncClient(base_url=self.base_url, timeout=15.0) as client:
                response = await client.get("/api/ps")
                if response.status_code >= 400:
                    return []
                return list(response.json().get("models", []))
        except httpx.HTTPError:
            return []

    # -- admission ---------------------------------------------------------
    async def admit(
        self,
        descriptor: ModelDescriptor,
        *,
        actor: str = "system",
        task_id: str | None = None,
    ) -> dict[str, Any]:
        """Make room for, and record the loading of, ``descriptor``.

        Returns a decision record describing what was done — evicted model,
        memory before and after, and whether admission is expected to fit.
        """
        async with self._lock:
            decision: dict[str, Any] = {
                "model": descriptor.id,
                "role": descriptor.role.value,
                "evicted": None,
                "available_before_mb": self.available_bytes() // (1024 * 1024),
                "footprint_mb": self.footprint_of(descriptor) // (1024 * 1024),
                "single_residency": self.single_residency,
                "at": datetime.now(timezone.utc).isoformat(),
            }

            # Embedding models are small and coexist with generation models.
            if descriptor.role == ModelRole.EMBEDDING:
                decision["action"] = "exempt"
                return decision

            already_resident = self.state.provider_model == descriptor.provider_model
            if already_resident:
                decision["action"] = "already_resident"
                return decision

            needed = self.footprint_of(descriptor) + self.headroom_bytes
            must_evict = self.single_residency and self.state.provider_model is not None
            if not must_evict and self.available_bytes() < needed:
                must_evict = self.state.provider_model is not None
                decision["reason"] = "insufficient free memory for co-residency"

            if must_evict and self.state.provider_model:
                evicted = self.state.provider_model
                released = await self._unload(evicted)
                decision["evicted"] = evicted
                decision["eviction_succeeded"] = released
                self.state.evictions += 1
                self.audit.record(
                    category="model",
                    action="unloaded",
                    actor=actor,
                    task_id=task_id,
                    detail={
                        "model": self.state.model_id,
                        "provider_model": evicted,
                        "reason": decision.get("reason", "single-model residency policy"),
                        "released": released,
                    },
                )
                # Give the runtime a moment to actually release the pages.
                await asyncio.sleep(0.6)

            self.state.model_id = descriptor.id
            self.state.provider_model = descriptor.provider_model
            self.state.loaded_at = datetime.now(timezone.utc)
            self.state.footprint_bytes = self.footprint_of(descriptor)
            self.state.loads += 1

            decision["available_after_mb"] = self.available_bytes() // (1024 * 1024)
            decision["action"] = "admitted"
            decision["fits"] = self.available_bytes() >= needed

            self.state.history.append(decision)
            self.state.history = self.state.history[-50:]

            self.audit.record(
                category="model",
                action="admitted",
                actor=actor,
                task_id=task_id,
                detail={
                    "model": descriptor.id,
                    "quantization": descriptor.quantization,
                    "footprint_mb": decision["footprint_mb"],
                    "available_after_mb": decision["available_after_mb"],
                    "evicted": decision["evicted"],
                    "registered": descriptor.registered,
                },
            )
            return decision

    async def release_all(self, *, actor: str = "system") -> None:
        """Evict the resident generation model (used on shutdown)."""
        async with self._lock:
            if not self.state.provider_model:
                return
            await self._unload(self.state.provider_model)
            self.audit.record(
                category="model",
                action="unloaded",
                actor=actor,
                detail={"model": self.state.model_id, "reason": "shutdown"},
            )
            self.state = ResidencyState(evictions=self.state.evictions, loads=self.state.loads)

    def status(self) -> dict[str, Any]:
        return {
            "resident_model": self.state.model_id,
            "loaded_at": self.state.loaded_at.isoformat() if self.state.loaded_at else None,
            "footprint_mb": self.state.footprint_bytes // (1024 * 1024),
            "loads": self.state.loads,
            "evictions": self.state.evictions,
            "single_residency": self.single_residency,
            "available_mb": self.available_bytes() // (1024 * 1024),
            "total_mb": (psutil.virtual_memory().total // (1024 * 1024)) if psutil else 0,
            "recent_decisions": self.state.history[-10:],
        }


_manager: ModelManager | None = None


def get_model_manager() -> ModelManager:
    global _manager
    if _manager is None:
        _manager = ModelManager()
    return _manager
