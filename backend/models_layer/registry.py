"""Model registry.

Reconciles the declared registry (``config/models.yaml``) against what the
local inference runtime actually has installed. Three states result:

* **available**   - declared and installed; routable.
* **unavailable** - declared but not installed; never routed to, surfaced in
  the UI so an operator knows what to pull.
* **unregistered** - installed but not declared; refused by policy, because
  the reference architecture blocks unregistered models by default.

Availability is cached briefly (``inference.registry_refresh_seconds``) so
routing decisions do not each pay a round trip.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from backend.core.config import get_config
from backend.core.schemas import ModelDescriptor, ModelRole, Sensitivity
from backend.models_layer.client import InferenceError, get_inference_client


@dataclass
class RegistrySnapshot:
    models: list[ModelDescriptor]
    unregistered: list[str]
    provider_reachable: bool
    refreshed_at: float

    def available(self) -> list[ModelDescriptor]:
        return [model for model in self.models if model.available]

    def by_id(self, model_id: str) -> ModelDescriptor | None:
        for model in self.models:
            if model.id == model_id:
                return model
        return None


class ModelRegistry:
    """Declared models reconciled with locally installed ones."""

    def __init__(self) -> None:
        self.config = get_config()
        self.client = get_inference_client()
        self._snapshot: RegistrySnapshot | None = None
        self._ttl = float(
            self.config.settings.inference.get("registry_refresh_seconds", 30)
        )

    def _declared(self) -> list[dict[str, Any]]:
        return list(self.config.models.get("models", []))

    def _descriptor(
        self, declaration: dict[str, Any], installed: dict[str, dict[str, Any]]
    ) -> ModelDescriptor:
        serving = declaration.get("serving") or {}
        provider_model = str(serving.get("model") or declaration["id"])
        installed_record = installed.get(provider_model)
        return ModelDescriptor(
            id=str(declaration["id"]),
            display_name=str(declaration.get("display_name", declaration["id"])),
            family=str(declaration.get("family", "unknown")),
            role=ModelRole(declaration["role"]),
            capabilities=list(declaration.get("capabilities", [])),
            context_window=int(declaration.get("context_window", 4096)),
            quantization=declaration.get("quantization"),
            parameters_b=declaration.get("parameters_b"),
            approved_classifications=[
                Sensitivity(level) for level in declaration.get("approved_classifications", [])
            ],
            provider=str(serving.get("provider", "ollama")),
            provider_model=provider_model,
            available=installed_record is not None,
            registered=True,
            size_bytes=installed_record.get("size") if installed_record else None,
            notes=declaration.get("notes"),
        )

    async def refresh(self, force: bool = False) -> RegistrySnapshot:
        now = time.monotonic()
        if (
            not force
            and self._snapshot is not None
            and now - self._snapshot.refreshed_at < self._ttl
        ):
            return self._snapshot

        installed: dict[str, dict[str, Any]] = {}
        reachable = True
        try:
            for record in await self.client.list_models():
                name = str(record.get("model") or record.get("name") or "")
                if name:
                    installed[name] = record
                    # Ollama reports "qwen3:8b"; tolerate a bare-name declaration.
                    installed.setdefault(name.split(":")[0], record)
        except InferenceError:
            reachable = False

        descriptors = [
            self._descriptor(declaration, installed) for declaration in self._declared()
        ]
        declared_provider_models = {
            descriptor.provider_model for descriptor in descriptors
        } | {descriptor.provider_model.split(":")[0] for descriptor in descriptors}
        unregistered = sorted(
            {
                name
                for name in installed
                if ":" in name and name not in declared_provider_models
            }
        )

        self._snapshot = RegistrySnapshot(
            models=descriptors,
            unregistered=unregistered,
            provider_reachable=reachable,
            refreshed_at=now,
        )
        return self._snapshot

    async def get(self, model_id: str) -> ModelDescriptor | None:
        snapshot = await self.refresh()
        return snapshot.by_id(model_id)

    async def is_registered(self, provider_model: str) -> bool:
        """Policy check: refuse inference on models not declared in config."""
        snapshot = await self.refresh()
        return any(
            descriptor.provider_model == provider_model for descriptor in snapshot.models
        )

    async def embedding_model(self) -> ModelDescriptor | None:
        snapshot = await self.refresh()
        candidates = [
            model
            for model in snapshot.models
            if model.role == ModelRole.EMBEDDING and model.available
        ]
        return candidates[0] if candidates else None


_registry: ModelRegistry | None = None


def get_model_registry() -> ModelRegistry:
    global _registry
    if _registry is None:
        _registry = ModelRegistry()
    return _registry
