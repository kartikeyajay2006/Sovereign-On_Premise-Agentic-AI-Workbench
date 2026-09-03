"""Intelligent local model router.

Given a task profile (or an explicit pipeline stage), the router resolves the
rule set in ``config/routing.yaml`` to a required role plus required
capabilities, scores every registered model against those requirements, and
returns the winner with a human-readable reason. The reason is what the UI
shows on the agent timeline and what the audit trail records — a routing
decision nobody can explain is not auditable.

The router never names a model in code. Adding a model is a YAML edit.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend.core.config import get_config
from backend.core.schemas import (
    ModelDescriptor,
    ModelRole,
    RoutingDecision,
    Sensitivity,
    TaskProfile,
)
from backend.models_layer.registry import ModelRegistry, get_model_registry


class NoEligibleModelError(RuntimeError):
    """Raised when no registered, installed, policy-approved model can serve."""


class ModelRouter:
    def __init__(self, registry: ModelRegistry | None = None) -> None:
        self.config = get_config()
        self.registry = registry or get_model_registry()

    # -- rule resolution ---------------------------------------------------
    def _rules(self) -> list[dict[str, Any]]:
        return list(self.config.routing.get("rules", []))

    @staticmethod
    def _clause_matches(clause: Any, value: str | None) -> bool:
        if clause is None:
            return True
        if value is None:
            return False
        return value in set(clause)

    def _select_rule(self, profile: TaskProfile) -> dict[str, Any]:
        for rule in self._rules():
            when = rule.get("when") or {}
            if not self._clause_matches(when.get("input_types"), profile.input_type.value):
                continue
            if not self._clause_matches(when.get("task_types"), profile.task_type.value):
                continue
            if not self._clause_matches(when.get("complexities"), profile.complexity.value):
                continue
            if not self._clause_matches(when.get("sensitivities"), profile.sensitivity.value):
                continue
            return rule
        rules = self._rules()
        if not rules:
            raise NoEligibleModelError("config/routing.yaml declares no rules")
        return rules[-1]

    # -- scoring -----------------------------------------------------------
    def _score(
        self,
        model: ModelDescriptor,
        *,
        role: ModelRole,
        capabilities: list[str],
        sensitivity: Sensitivity,
        largest_parameters: float,
    ) -> tuple[float, list[str]]:
        weights = self.config.routing.get("scoring", {})
        score = 0.0
        notes: list[str] = []

        if model.available:
            score += float(weights.get("availability", 100))
        else:
            notes.append("not installed locally")

        if model.role == role:
            score += float(weights.get("role_match", 50))
            notes.append(f"role={role.value}")

        matched = [cap for cap in capabilities if cap in model.capabilities]
        if matched:
            score += float(weights.get("capability_match_each", 15)) * len(matched)
            notes.append("capabilities=" + ",".join(matched))
        missing = [cap for cap in capabilities if cap not in model.capabilities]
        if missing:
            notes.append("missing=" + ",".join(missing))

        if sensitivity in model.approved_classifications:
            score += float(weights.get("classification_approved", 40))
            notes.append(f"approved for {sensitivity.value}")
        else:
            notes.append(f"NOT approved for {sensitivity.value}")

        if model.parameters_b and largest_parameters:
            headroom = max(0.0, largest_parameters - float(model.parameters_b))
            score += headroom * float(weights.get("smaller_model_bonus", 5))
        score += model.context_window * float(weights.get("context_window_bonus", 0.0))

        return score, notes

    def _eligible(
        self, model: ModelDescriptor, capabilities: list[str], sensitivity: Sensitivity
    ) -> bool:
        """Hard gates: installed, policy-approved, and capability-complete."""
        if not model.available:
            return False
        if sensitivity not in model.approved_classifications:
            return False
        return all(capability in model.capabilities for capability in capabilities)

    # -- public API --------------------------------------------------------
    async def route(
        self,
        profile: TaskProfile,
        *,
        stage: str | None = None,
        extra_capabilities: list[str] | None = None,
    ) -> RoutingDecision:
        snapshot = await self.registry.refresh()
        rule = self._select_rule(profile)

        requirement = dict(rule.get("require") or {})
        stage_roles = self.config.routing.get("stage_roles") or {}
        stage_capabilities = self.config.routing.get("stage_capabilities") or {}
        if stage and stage in stage_roles:
            requirement["role"] = stage_roles[stage]
            # A stage override replaces the rule's capabilities as well as its
            # role. Otherwise a visual task would demand the vision capability
            # for its planning and drafting stages too.
            if stage in stage_capabilities:
                requirement["capabilities"] = list(stage_capabilities[stage])

        role = ModelRole(requirement.get("role", ModelRole.REASONING.value))
        capabilities = list(requirement.get("capabilities") or [])
        for capability in extra_capabilities or []:
            if capability not in capabilities:
                capabilities.append(capability)

        largest = max(
            [float(model.parameters_b or 0.0) for model in snapshot.models] or [0.0]
        )

        def evaluate(target_role: ModelRole, required: list[str]) -> list[dict[str, Any]]:
            scored: list[dict[str, Any]] = []
            for model in snapshot.models:
                score, notes = self._score(
                    model,
                    role=target_role,
                    capabilities=required,
                    sensitivity=profile.sensitivity,
                    largest_parameters=largest,
                )
                scored.append(
                    {
                        "model": model.id,
                        "display_name": model.display_name,
                        "role": model.role.value,
                        "available": model.available,
                        "eligible": self._eligible(model, required, profile.sensitivity),
                        "score": round(score, 2),
                        "notes": notes,
                    }
                )
            scored.sort(key=lambda item: item["score"], reverse=True)
            return scored

        candidates = evaluate(role, capabilities)
        eligible = [item for item in candidates if item["eligible"]]
        used_fallback = False
        applied_role = role

        if not eligible:
            fallback = dict(rule.get("fallback") or {})
            if fallback:
                used_fallback = True
                applied_role = ModelRole(fallback.get("role", role.value))
                fallback_capabilities = list(fallback.get("capabilities") or capabilities)
                candidates = evaluate(applied_role, fallback_capabilities)
                eligible = [item for item in candidates if item["eligible"]]
                capabilities = fallback_capabilities

        decided_at = datetime.now(timezone.utc)

        if not eligible:
            unavailable = [
                item["model"] for item in candidates if not item["available"]
            ][:3]
            reason = (
                f"No installed model satisfies role '{applied_role.value}' with "
                f"capabilities {capabilities} approved for classification "
                f"'{profile.sensitivity.value}'."
            )
            if unavailable:
                reason += f" Registered but not installed: {', '.join(unavailable)}."
            if not snapshot.provider_reachable:
                reason = (
                    "Local inference server is unreachable; no model can be "
                    "selected. Start the on-premise runtime and retry."
                )
            return RoutingDecision(
                requested_role=applied_role,
                required_capabilities=capabilities,
                selected_model=None,
                selected_display_name=None,
                rule=str(rule.get("name", "unknown")),
                reason=reason,
                used_fallback=used_fallback,
                candidates=candidates[:6],
                decided_at=decided_at,
            )

        winner = eligible[0]
        matched = [
            capability
            for capability in capabilities
            if capability
            in (snapshot.by_id(winner["model"]).capabilities if snapshot.by_id(winner["model"]) else [])
        ]
        reason_parts = [
            f"rule '{rule.get('name')}' requires a {applied_role.value} model",
            f"capabilities {matched or capabilities} matched",
            f"approved for {profile.sensitivity.value} data",
            "installed locally",
        ]
        if used_fallback:
            reason_parts.insert(0, "primary requirement unmet, applied configured fallback")
        if stage:
            reason_parts.insert(0, f"stage '{stage}'")

        return RoutingDecision(
            requested_role=applied_role,
            required_capabilities=capabilities,
            selected_model=winner["model"],
            selected_display_name=winner["display_name"],
            rule=str(rule.get("name", "unknown")),
            reason="; ".join(reason_parts),
            used_fallback=used_fallback,
            candidates=candidates[:6],
            decided_at=decided_at,
        )

    async def resolve_descriptor(self, decision: RoutingDecision) -> ModelDescriptor:
        if not decision.selected_model:
            raise NoEligibleModelError(decision.reason)
        descriptor = await self.registry.get(decision.selected_model)
        if descriptor is None:
            raise NoEligibleModelError(
                f"Routed model '{decision.selected_model}' is no longer registered"
            )
        return descriptor

    def serving_options(self, model_id: str) -> dict[str, Any]:
        """Top-level request fields declared for a model, e.g. thinking mode.

        These sit alongside ``options`` in the runtime payload rather than
        inside it, so they are resolved separately.
        """
        for declaration in self.config.models.get("models", []):
            if declaration.get("id") != model_id:
                continue
            serving = declaration.get("serving") or {}
            extras: dict[str, Any] = {}
            if "thinking" in serving:
                extras["think"] = bool(serving["thinking"])
            return extras
        return {}

    def generation_options(self, model_id: str, stage: str | None = None) -> dict[str, Any]:
        """Per-model generation defaults, straight from config/models.yaml.

        The context window is passed explicitly: the runtime otherwise applies
        its own small default (4096 for Ollama) regardless of what the model
        supports, which silently truncates or rejects image-bearing prompts.

        When a stage is named, its output budget from routing.yaml overrides
        the model default — response length is the dominant cost on a CPU host,
        and a plan does not need the budget a drafted document does.
        """
        for declaration in self.config.models.get("models", []):
            if declaration.get("id") != model_id:
                continue
            options = dict(declaration.get("generation_defaults") or {})
            declared_context = int(declaration.get("context_window") or 0)
            ceiling = int(
                self.config.settings.inference.get("max_context_tokens", 8192)
            )
            if declared_context:
                options.setdefault("num_ctx", min(declared_context, ceiling))

            budgets = self.config.routing.get("stage_output_tokens") or {}
            if stage and stage in budgets:
                options["num_predict"] = int(budgets[stage])
            return options
        return {}


_router: ModelRouter | None = None


def get_model_router() -> ModelRouter:
    global _router
    if _router is None:
        _router = ModelRouter()
    return _router
