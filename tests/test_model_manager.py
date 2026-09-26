"""The model manager: startup reconciliation, the KV estimate, and memory admission.

Ollama is faked (tests/fake_ollama.py). Nothing here may reach the runtime
on this host: reconciliation unloads models.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from backend.core.config import get_config
from backend.core.schemas import ModelDescriptor, ModelRole, Sensitivity
from backend.models_layer.manager import DEFAULT_KV_BYTES_PER_TOKEN, ModelManager
from tests.fake_ollama import FakeOllama

GIB = 1024 ** 3


def _ps(model: str, *, size: int, context: int = 5120, expires: str = "2026-09-27T00:46:28.5314726+05:30") -> dict[str, Any]:
    return {"name": model, "model": model, "size": size, "size_vram": 0,
            "context_length": context, "expires_at": expires}


def _descriptor(model_id: str, *, role: ModelRole = ModelRole.REASONING,
                size: int | None = 1_929_000_000, params: float = 3.0) -> ModelDescriptor:
    return ModelDescriptor(
        id=model_id, display_name=model_id, family="t", role=role, capabilities=["text"],
        context_window=32768, parameters_b=params, approved_classifications=[Sensitivity.NORMAL],
        provider="ollama", provider_model=model_id, size_bytes=size, available=True,
    )


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeOllama:
    return FakeOllama().install(monkeypatch)


def _reconcile(manager: ModelManager, **kwargs: Any) -> dict[str, Any]:
    return asyncio.run(manager.reconcile(**kwargs))


class TestReconcile:
    def test_adopts_the_resident_generation_model(self, fake: FakeOllama) -> None:
        fake.resident = [_ps("qwen2.5:3b", size=2_292_627_536), _ps("nomic-embed-text:latest", size=300_000_000)]
        manager = ModelManager()
        result = _reconcile(manager)
        assert result["adopted"] == "qwen2.5:3b"
        assert manager.state.provider_model == "qwen2.5:3b"
        assert manager.state.footprint_bytes == 2_292_627_536
        assert result["evicted"] == []  # the embedding model is exempt
        assert fake.unloads() == []

    def test_single_residency_evicts_the_extra_generation_model(self, fake: FakeOllama) -> None:
        fake.resident = [
            _ps("qwen2.5vl:3b", size=4 * GIB, expires="2026-09-27T00:10:00.0000000+05:30"),
            _ps("qwen2.5:3b", size=2 * GIB, expires="2026-09-27T00:40:00.1234567+05:30"),
        ]
        manager = ModelManager()
        result = _reconcile(manager)
        # The most recently used is kept.
        assert result["adopted"] == "qwen2.5:3b"
        assert result["evicted"] == ["qwen2.5vl:3b"]
        assert fake.unloads() == ["qwen2.5vl:3b"]
        assert manager.state.evictions == 1

    def test_the_preferred_model_is_kept_whatever_was_used_last(self, fake: FakeOllama) -> None:
        fake.resident = [
            _ps("qwen2.5vl:3b", size=4 * GIB, expires="2026-09-27T00:50:00+05:30"),
            _ps("qwen2.5:3b", size=2 * GIB, expires="2026-09-27T00:10:00+05:30"),
        ]
        result = _reconcile(ModelManager(), prefer="qwen2.5:3b")
        assert result["adopted"] == "qwen2.5:3b"
        assert fake.unloads() == ["qwen2.5vl:3b"]

    def test_without_single_residency_nothing_is_evicted(self, fake: FakeOllama, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setitem(get_config().settings.inference, "single_model_residency", False)
        fake.resident = [_ps("qwen2.5vl:3b", size=4 * GIB), _ps("qwen2.5:3b", size=2 * GIB)]
        result = _reconcile(ModelManager())
        assert result["adopted"] is not None
        assert result["evicted"] == []
        assert fake.unloads() == []

    def test_unregistered_models_are_reported_and_left_alone(self, fake: FakeOllama) -> None:
        fake.resident = [_ps("llama3.2:1b", size=GIB), _ps("qwen2.5:3b", size=2 * GIB)]
        result = _reconcile(ModelManager())
        assert result["unregistered"] == ["llama3.2:1b"]
        assert "llama3.2:1b" not in fake.unloads()

    def test_unreachable_runtime_changes_nothing(self, fake: FakeOllama) -> None:
        fake.reachable = False
        manager = ModelManager()
        result = _reconcile(manager)
        assert result["reachable"] is False
        assert manager.state.provider_model is None

    def test_admission_after_reconcile_evicts_the_adopted_model(self, fake: FakeOllama, monkeypatch: pytest.MonkeyPatch) -> None:
        """The point of adopting: a vision call now knows the 3B is there to evict."""
        fake.resident = [_ps("qwen2.5:3b", size=2 * GIB)]
        manager = ModelManager()
        _reconcile(manager)
        decision = asyncio.run(manager.admit(_descriptor("qwen2.5vl:3b", role=ModelRole.VISION)))
        assert decision["evicted"] == "qwen2.5:3b"


def test_startup_reconciles_before_it_prewarms(fake: FakeOllama) -> None:
    """The API's startup task: adopt the drafting model, unload the vision model."""
    from backend.api import main
    from backend.models_layer.manager import get_model_manager

    fake.installed = {"qwen2.5:3b": 1_929_000_000, "qwen2.5vl:3b": 3_200_000_000}
    fake.resident = [
        _ps("qwen2.5vl:3b", size=4 * GIB, expires="2026-09-27T00:50:00+05:30"),
        _ps("qwen2.5:3b", size=2 * GIB, expires="2026-09-27T00:10:00+05:30"),
    ]
    asyncio.run(main._settle_models(reconcile=True, prewarm=False))
    assert get_model_manager().state.model_id == "qwen2.5:3b"
    assert fake.unloads() == ["qwen2.5vl:3b"]


class TestKvEstimate:
    def test_architecture_gives_the_3b_a_quarter_of_the_old_figure(self) -> None:
        per_token, source = ModelManager().kv_bytes_per_token(_descriptor("qwen2.5:3b"))
        assert source == "architecture"
        assert per_token == 2 * 36 * 2 * 128 * 2 == 36 * 1024
        assert per_token * 4 <= 144 * 1024

    def test_the_8b_keeps_the_8b_figure(self) -> None:
        per_token, _ = ModelManager().kv_bytes_per_token(_descriptor("qwen3:8b", params=8.0))
        assert per_token == 144 * 1024

    def test_an_unknown_model_gets_the_conservative_default(self) -> None:
        assert ModelManager().kv_bytes_per_token(_descriptor("mystery:3b")) == (DEFAULT_KV_BYTES_PER_TOKEN, "default")

    def test_the_runtimes_report_wins(self, fake: FakeOllama) -> None:
        fake.resident = [_ps("qwen2.5:3b", size=1_929_000_000 + 5120 * 70_000, context=5120)]
        manager = ModelManager()
        asyncio.run(manager.resident_models())
        per_token, source = manager.kv_bytes_per_token(_descriptor("qwen2.5:3b"))
        assert source == "observed"
        assert per_token == 70_000
        # At the window it was reported at, the report is the footprint.
        assert manager.footprint_of(_descriptor("qwen2.5:3b"), 5120) == 1_929_000_000 + 5120 * 70_000
        # At another window, the weights plus the observed rate.
        assert manager.footprint_of(_descriptor("qwen2.5:3b"), 8192) == 1_929_000_000 + 8192 * 70_000

    def test_footprint_follows_the_requested_window(self) -> None:
        manager = ModelManager()
        small = manager.footprint_of(_descriptor("qwen2.5:3b"), 2048)
        large = manager.footprint_of(_descriptor("qwen2.5:3b"), 8192)
        assert large - small == (8192 - 2048) * 36 * 1024
