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
4. **Reconcile at startup** -- the runtime outlives the API. After an API
   restart the manager's state is empty while Ollama may still hold the
   drafting model, a vision model, or both; ``reconcile()`` reads /api/ps,
   adopts the resident generation model and, under single residency, evicts
   the others, so the first admission does not act on a fiction.

Every load and eviction is an auditable event, because "which model was
resident when this answer was produced" is part of the reproducibility record.
"""

from __future__ import annotations

import asyncio
import re
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

# KV-cache bytes per token of context, when neither the runtime nor the
# registry says better. This used to be the only figure, 140 KiB for every
# model: right for an 8B-class model with grouped-query attention (qwen3:8b,
# 36 layers x 8 KV heads x 128 dims x 2 (K and V) x 2 bytes = 144 KiB) and
# four times too high for qwen2.5:3b (2 KV heads: 36 KiB), which made a 3B
# look like it needed 1.1 GB of cache at 8192 tokens instead of 0.3. It stays
# as the default because an unknown model is safer over-estimated: the cost
# of that is a warning, the cost of under-estimating is swap.
DEFAULT_KV_BYTES_PER_TOKEN = 144 * 1024

# Cache element size: Ollama's default KV cache type is f16.
KV_BYTES_PER_ELEMENT = 2


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
        # What the runtime reported holding for each model the last time it
        # was asked (/api/ps): total resident bytes and the context window
        # it was loaded with. The best evidence of a model's real cost here.
        self._observed: dict[str, dict[str, int]] = {}

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

    def _declaration(self, model_id: str) -> dict[str, Any]:
        for declaration in self.config.models.get("models", []):
            if declaration.get("id") == model_id:
                return declaration
        return {}

    def _weights_bytes(self, descriptor: ModelDescriptor) -> int:
        if descriptor.size_bytes:
            return int(descriptor.size_bytes)
        if descriptor.parameters_b:
            return int(float(descriptor.parameters_b) * BYTES_PER_BILLION_PARAMS_Q4)
        return 2 * 1024 * 1024 * 1024

    def kv_bytes_per_token(self, descriptor: ModelDescriptor) -> tuple[int, str]:
        """KV-cache cost of one token of context for this model, and where it came from.

        In order of evidence:

        1. ``observed`` -- the runtime's own report (/api/ps) of what the
           model occupies at the window it was loaded with, less the weights
           file: (size - weights) / context. This includes the compute
           buffers, which also grow with the window, so it errs high.
        2. ``architecture`` -- 2 (K and V) x layers x KV heads x head
           dimension x 2 bytes, from ``architecture`` in config/models.yaml.
        3. ``default`` -- DEFAULT_KV_BYTES_PER_TOKEN, sized for an 8B-class
           model so an unknown model is over- rather than under-estimated.
        """
        observed = self._observed.get(descriptor.provider_model)
        weights = int(descriptor.size_bytes or 0)
        if observed and weights and observed.get("context") and observed["size"] > weights:
            return int((observed["size"] - weights) / observed["context"]), "observed"
        architecture = self._declaration(descriptor.id).get("architecture") or {}
        try:
            layers = int(architecture["layers"])
            kv_heads = int(architecture["kv_heads"])
            head_dim = int(architecture["head_dim"])
        except (KeyError, TypeError, ValueError):
            return DEFAULT_KV_BYTES_PER_TOKEN, "default"
        return 2 * layers * kv_heads * head_dim * KV_BYTES_PER_ELEMENT, "architecture"

    def footprint_of(self, descriptor: ModelDescriptor, context_tokens: int | None = None) -> int:
        """Best available estimate of what this model costs to hold resident.

        ``context_tokens`` is the window the call will ask for; without it
        the model's declared window, capped at inference.max_context_tokens.
        When the runtime already reported this model at exactly that window,
        its report is the answer.
        """
        ceiling = int(self._inference.get("max_context_tokens", 8192))
        context = int(context_tokens or min(int(descriptor.context_window or ceiling), ceiling))
        observed = self._observed.get(descriptor.provider_model)
        if observed and observed.get("context") == context and observed.get("size"):
            return int(observed["size"])
        per_token, _ = self.kv_bytes_per_token(descriptor)
        return self._weights_bytes(descriptor) + context * per_token

    # -- runtime control ---------------------------------------------------
    def _http(self, timeout: float) -> httpx.AsyncClient:
        """One place the manager's runtime calls are made from, so a test can fake them."""
        return httpx.AsyncClient(base_url=self.base_url, timeout=timeout)

    async def _unload(self, provider_model: str) -> bool:
        """Ask the runtime to release a model immediately (keep_alive: 0)."""
        try:
            async with self._http(30.0) as client:
                response = await client.post(
                    "/api/generate",
                    json={"model": provider_model, "keep_alive": 0, "prompt": ""},
                )
                return response.status_code < 400
        except httpx.HTTPError:
            return False

    async def _read_resident(self) -> list[dict[str, Any]] | None:
        """/api/ps, or None when the runtime could not be asked.

        None and [] are different answers: "nothing is loaded" may be acted
        on, "could not tell" may not.
        """
        try:
            async with self._http(15.0) as client:
                response = await client.get("/api/ps")
                if response.status_code >= 400:
                    return None
                models = list(response.json().get("models", []))
        except (httpx.HTTPError, ValueError):
            return None
        for entry in models:
            name = str(entry.get("model") or entry.get("name") or "")
            size = max(int(entry.get("size") or 0), int(entry.get("size_vram") or 0))
            context = entry.get("context_length")
            if name and size and isinstance(context, int) and context > 0:
                self._observed[name] = {"size": size, "context": context}
        return models

    async def resident_models(self) -> list[dict[str, Any]]:
        """What the runtime currently holds in memory."""
        return await self._read_resident() or []

    @staticmethod
    def _expires(entry: dict[str, Any]) -> datetime:
        """When the runtime will release a model: the latest was used most recently."""
        raw = str(entry.get("expires_at") or "")
        # Ollama writes nanoseconds; fromisoformat takes at most microseconds.
        raw = re.sub(r"(\.\d{6})\d+", r"\1", raw).replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError:
            return datetime.min.replace(tzinfo=timezone.utc)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

    async def reconcile(self, *, prefer: str | None = None, actor: str = "system") -> dict[str, Any]:
        """Bring the residency state in line with what the runtime holds.

        After an API restart the state is empty but Ollama may still hold
        models. Left alone, the first admission under single residency
        evicts nothing (it believes nothing is loaded) and a second model
        loads beside the first: on an 8 GB host, that is the swap this
        manager exists to prevent.

        The registered generation model found resident is adopted -- the
        one named by ``prefer`` (the drafting model) if it is there, else
        the most recently used. Under single residency every other
        registered generation model is evicted through the ordinary unload
        call (keep_alive 0) and audited as such. Embedding models are
        exempt, as in admission. Resident models the registry does not
        declare are reported, not evicted: they are not this workbench's to
        manage, and an operator may be using them.
        """
        async with self._lock:
            resident = await self._read_resident()
            result: dict[str, Any] = {
                "reachable": resident is not None, "adopted": None, "evicted": [], "unregistered": [],
            }
            if resident is None:
                return result

            declared = {
                str((declaration.get("serving") or {}).get("model") or declaration["id"]): declaration
                for declaration in self.config.models.get("models", [])
            }
            generation: list[tuple[dict[str, Any], dict[str, Any]]] = []
            for entry in resident:
                name = str(entry.get("model") or entry.get("name") or "")
                declaration = declared.get(name)
                if declaration is None:
                    result["unregistered"].append(name)
                elif declaration.get("role") != ModelRole.EMBEDDING.value:
                    generation.append((entry, declaration))
            if not generation:
                return result

            generation.sort(key=lambda item: self._expires(item[0]), reverse=True)
            preferred = [
                item for item in generation
                if prefer and prefer in {item[1]["id"], str(item[0].get("model") or item[0].get("name"))}
            ]
            chosen = preferred[0] if preferred else generation[0]
            entry, declaration = chosen
            provider_model = str(entry.get("model") or entry.get("name"))
            self.state.model_id = str(declaration["id"])
            self.state.provider_model = provider_model
            self.state.loaded_at = datetime.now(timezone.utc)
            self.state.footprint_bytes = max(int(entry.get("size") or 0), int(entry.get("size_vram") or 0))
            result["adopted"] = self.state.model_id
            self.audit.record(
                category="model",
                action="adopted",
                actor=actor,
                detail={
                    "model": self.state.model_id,
                    "provider_model": provider_model,
                    "resident_mb": self.state.footprint_bytes // (1024 * 1024),
                    "context": entry.get("context_length"),
                    "reason": "resident in the runtime at API startup",
                },
            )

            if self.single_residency:
                for other, other_declaration in generation:
                    if other is entry:
                        continue
                    name = str(other.get("model") or other.get("name"))
                    released = await self._unload(name)
                    self.state.evictions += 1
                    result["evicted"].append(name)
                    self.audit.record(
                        category="model",
                        action="unloaded",
                        actor=actor,
                        detail={
                            "model": other_declaration["id"],
                            "provider_model": name,
                            "reason": "startup reconciliation: single-model residency policy",
                            "released": released,
                        },
                    )
            return result

    # -- admission ---------------------------------------------------------
    async def admit(
        self,
        descriptor: ModelDescriptor,
        *,
        actor: str = "system",
        task_id: str | None = None,
        context_tokens: int | None = None,
    ) -> dict[str, Any]:
        """Make room for, and record the loading of, ``descriptor``.

        Returns a decision record describing what was done — evicted model,
        memory before and after, and whether admission is expected to fit.
        ``context_tokens`` is the window the call will ask for: the KV cache
        is sized by it, so it is part of the footprint.
        """
        async with self._lock:
            decision: dict[str, Any] = {
                "model": descriptor.id,
                "role": descriptor.role.value,
                "evicted": None,
                "available_before_mb": self.available_bytes() // (1024 * 1024),
                "footprint_mb": self.footprint_of(descriptor, context_tokens) // (1024 * 1024),
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

            needed = self.footprint_of(descriptor, context_tokens) + self.headroom_bytes
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
            self.state.footprint_bytes = self.footprint_of(descriptor, context_tokens)
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
