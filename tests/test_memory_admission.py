"""A model that would not fit in free memory is acted on, not loaded blind.

Drives the real orchestrator's `_generate` with the runtime, router and
memory faked (the harness in tests/test_usage_telemetry.py), plus the
manager's own projection against a faked free-memory reading.
"""

from __future__ import annotations

from typing import Any

import pytest

from backend.core.schemas import ModelDescriptor, ModelRole, RoutingDecision, Sensitivity
from backend.models_layer.manager import ModelManager
from tests.test_usage_telemetry import (
    MODEL,
    USER,
    FakeClient,
    FakeRouter,
    blocking_result,
    make_task,
    orchestrator_with,
)

GIB = 1024 ** 3

BIG = MODEL.model_copy(update={"id": "big:8b", "display_name": "Big 8B", "provider_model": "big:8b", "parameters_b": 8.0})
SMALL = MODEL  # reason:3b
MODELS = {BIG.id: BIG, SMALL.id: SMALL}


class CandidateRouter(FakeRouter):
    """Routes to BIG, with SMALL (and an ineligible model) among the candidates."""

    def __init__(self, candidates: list[dict[str, Any]]) -> None:
        super().__init__()
        self.candidates = candidates

    async def route(self, profile, **kwargs: Any) -> RoutingDecision:  # type: ignore[no-untyped-def,override]
        decision = await super().route(profile, **kwargs)
        return decision.model_copy(update={
            "selected_model": BIG.id, "selected_display_name": BIG.display_name,
            "candidates": self.candidates,
        })

    async def resolve_descriptor(self, decision: RoutingDecision) -> ModelDescriptor:
        return MODELS[decision.selected_model]  # type: ignore[index]


class MemoryManager:
    """Only the models in `fitting` fit; footprints scale with parameters."""

    def __init__(self, fitting: set[str]) -> None:
        self.fitting = fitting
        self.admitted: list[str] = []

    def footprint_of(self, descriptor: ModelDescriptor, context_tokens: int | None = None) -> int:
        return int((descriptor.parameters_b or 1) * GIB)

    def projected_fit(self, descriptor: ModelDescriptor, context_tokens: int | None = None) -> dict[str, Any]:
        return {"fits": descriptor.id in self.fitting, "footprint_mb": 1, "needed_mb": 6000,
                "available_mb": 3000, "projected_mb": 3000}

    async def admit(self, descriptor: ModelDescriptor, **kwargs: Any) -> dict[str, Any]:
        self.admitted.append(descriptor.id)
        return {}


def _run(candidates: list[dict[str, Any]], fitting: set[str]):  # type: ignore[no-untyped-def]
    import asyncio

    client = FakeClient(results=[blocking_result()])
    orchestrator, recorder, _ = orchestrator_with(client)
    orchestrator.router = CandidateRouter(candidates)  # type: ignore[assignment]
    manager = MemoryManager(fitting)
    orchestrator.manager = manager  # type: ignore[assignment]
    task = make_task()
    _, decision = asyncio.run(orchestrator._generate(
        task, USER, stage="drafting", system_prompt="s", prompt="p",
    ))
    return task, decision, recorder, manager, client


ELIGIBLE = [
    {"model": BIG.id, "eligible": True},
    {"model": "vision:3b", "eligible": False},
    {"model": SMALL.id, "eligible": True},
]


def test_a_model_that_fits_is_left_alone() -> None:
    task, decision, recorder, manager, _ = _run(ELIGIBLE, {BIG.id, SMALL.id})
    assert decision.selected_model == BIG.id
    assert recorder.named("task.model_memory") == []
    assert manager.admitted == [BIG.id]


def test_falls_back_to_a_smaller_eligible_model_that_fits() -> None:
    task, decision, recorder, manager, client = _run(ELIGIBLE, {SMALL.id})
    [warning] = recorder.named("task.model_memory")
    assert warning["action"] == "fallback"
    assert warning["model"] == BIG.id and warning["fallback"] == SMALL.id
    assert decision.selected_model == SMALL.id
    assert "smaller eligible" in decision.reason
    # The model that answered is the one admitted, called and recorded.
    assert manager.admitted == [SMALL.id]
    assert client.generate_calls[0]["model"] == SMALL.provider_model
    assert task.routing[-1].selected_model == SMALL.id
    assert task.usage[-1].model == SMALL.id


def test_no_smaller_model_proceeds_with_a_warning() -> None:
    only_big = [{"model": BIG.id, "eligible": True}, {"model": SMALL.id, "eligible": False}]
    _, decision, recorder, manager, _ = _run(only_big, set())
    [warning] = recorder.named("task.model_memory")
    assert warning["action"] == "proceed"
    assert warning["fallback"] is None
    assert "proceeding" in warning["reason"]
    assert decision.selected_model == BIG.id
    assert manager.admitted == [BIG.id]


def test_a_smaller_model_that_also_does_not_fit_is_not_a_fallback() -> None:
    _, decision, recorder, _, _ = _run(ELIGIBLE, set())
    assert recorder.named("task.model_memory")[0]["action"] == "proceed"
    assert decision.selected_model == BIG.id


def test_the_warning_is_audited() -> None:
    from backend.core.audit import get_audit_log

    task, *_ = _run(ELIGIBLE, {SMALL.id})
    actions = [event.action for event in get_audit_log().query(task_id=task.id)]
    assert "memory_warning" in actions


class TestProjection:
    """The manager's projection counts what admission would evict."""

    def _manager(self, monkeypatch: pytest.MonkeyPatch, available: int) -> ModelManager:
        manager = ModelManager()
        monkeypatch.setattr(ModelManager, "available_bytes", staticmethod(lambda: available))
        return manager

    def _model(self, model_id: str, size: int) -> ModelDescriptor:
        return ModelDescriptor(
            id=model_id, display_name=model_id, family="t", role=ModelRole.REASONING,
            capabilities=["text"], context_window=2048, approved_classifications=[Sensitivity.NORMAL],
            provider="ollama", provider_model=model_id, size_bytes=size, available=True,
        )

    def test_short_of_memory_does_not_fit(self, monkeypatch: pytest.MonkeyPatch) -> None:
        manager = self._manager(monkeypatch, 1 * GIB)
        assert manager.projected_fit(self._model("m:3b", 2 * GIB), 2048)["fits"] is False

    def test_the_evicted_models_memory_is_counted(self, monkeypatch: pytest.MonkeyPatch) -> None:
        manager = self._manager(monkeypatch, 1 * GIB)
        manager.state.provider_model = "other:3b"
        manager.state.footprint_bytes = 4 * GIB
        # Single residency (app.yaml default): the 4 GiB resident model goes.
        assert manager.projected_fit(self._model("m:3b", 2 * GIB), 2048)["fits"] is True

    def test_the_resident_model_always_fits(self, monkeypatch: pytest.MonkeyPatch) -> None:
        manager = self._manager(monkeypatch, 0)
        manager.state.provider_model = "m:3b"
        assert manager.projected_fit(self._model("m:3b", 2 * GIB), 2048)["fits"] is True
