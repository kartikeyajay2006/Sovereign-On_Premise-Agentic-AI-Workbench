"""GET /api/ready: unauthenticated, booleans only, measured against a fake Ollama."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.ops import readiness
from tests.fake_ollama import FakeOllama

CHECKS = {
    "inference_reachable",
    "pinned_models_verified",
    "drafting_model_resident",
    "free_memory_ok",
    "audit_chain_valid",
    "vision_cache_warm",
}


@pytest.fixture
def ollama(monkeypatch: pytest.MonkeyPatch) -> FakeOllama:
    fake = FakeOllama(
        installed={"qwen2.5:3b": 1_929_000_000, "qwen2.5vl:3b": 3_200_000_000,
                   "nomic-embed-text:latest": 274_000_000},
        resident=[{"name": "qwen2.5:3b", "model": "qwen2.5:3b", "size": 2_292_627_536,
                   "size_vram": 0, "context_length": 5120}],
    ).install(monkeypatch)
    monkeypatch.setattr(readiness, "min_free_mb", lambda: 0)
    # The demo scan's cache is its own test (tests/test_readiness.py); here
    # it does not apply unless a test says otherwise.
    monkeypatch.setattr(readiness, "demo_sample", lambda: None)
    return fake


def _ready(client: TestClient) -> tuple[int, dict]:
    response = client.get("/api/ready")
    return response.status_code, response.json()


def test_ready_without_signing_in(ollama: FakeOllama) -> None:
    code, body = _ready(TestClient(create_app()))
    assert code == 200, body
    assert body["ready"] is True
    assert set(body["checks"]) == CHECKS
    assert body["checks"]["vision_cache_warm"] is None


def test_discloses_booleans_only(ollama: FakeOllama) -> None:
    response = TestClient(create_app()).get("/api/ready")
    assert set(response.json()) == {"ready", "checks"}
    assert all(value in (True, False, None) for value in response.json()["checks"].values())
    text = response.text.lower()
    for secret in ("qwen", "nomic", "digest", "engineer", "admin", "storage", "mb"):
        assert secret not in text


def test_drafting_model_not_resident_is_not_ready(ollama: FakeOllama) -> None:
    ollama.resident = []
    code, body = _ready(TestClient(create_app()))
    assert code == 503
    assert body["ready"] is False
    assert body["checks"]["drafting_model_resident"] is False
    assert body["checks"]["inference_reachable"] is True


def test_resident_at_the_wrong_context_is_not_ready(ollama: FakeOllama) -> None:
    ollama.resident[0]["context_length"] = 2048
    _, body = _ready(TestClient(create_app()))
    assert body["checks"]["drafting_model_resident"] is False


def test_unreachable_runtime(ollama: FakeOllama) -> None:
    ollama.reachable = False
    code, body = _ready(TestClient(create_app()))
    assert code == 503
    assert body["checks"]["inference_reachable"] is False
    assert body["checks"]["pinned_models_verified"] is False
    assert body["checks"]["drafting_model_resident"] is False


def test_low_memory_is_not_ready(ollama: FakeOllama, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(readiness, "min_free_mb", lambda: 10**9)
    _, body = _ready(TestClient(create_app()))
    assert body["checks"]["free_memory_ok"] is False
    assert body["ready"] is False


def test_cold_vision_cache_is_not_ready_when_a_sample_is_configured(
    ollama: FakeOllama, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.undo()  # drop the sample override; reinstall the rest
    ollama.install(monkeypatch)
    monkeypatch.setattr(readiness, "min_free_mb", lambda: 0)
    monkeypatch.setattr(readiness, "vision_cache_directory", lambda: None)
    _, body = _ready(TestClient(create_app()))
    assert body["checks"]["vision_cache_warm"] is False


def test_readings_are_reused_briefly(ollama: FakeOllama) -> None:
    client = TestClient(create_app())
    _ready(client)
    calls = len(ollama.requests)
    _ready(client)
    assert len(ollama.requests) == calls
