"""Approved model names are not enough: the runtime artifact must match too."""

from __future__ import annotations

from backend.models_layer.registry import ModelRegistry


def _declaration(expected_digest: str | None) -> dict[str, object]:
    return {
        "id": "reasoning:3b",
        "family": "reasoning",
        "display_name": "Reasoning 3B",
        "role": "reasoning",
        "capabilities": ["text", "reasoning"],
        "approved_classifications": ["normal"],
        "serving": {"provider": "ollama", "model": "reasoning:3b"},
        "expected_digest": expected_digest,
    }


def test_pinned_digest_must_match_before_a_model_is_available() -> None:
    registry = ModelRegistry()
    descriptor = registry._descriptor(
        _declaration("a" * 64), {"reasoning:3b": {"digest": "b" * 64, "size": 1}}
    )
    assert descriptor.integrity == "mismatch"
    assert descriptor.available is False
    assert "Integrity refusal" in (descriptor.notes or "")


def test_matching_pinned_digest_is_routable() -> None:
    registry = ModelRegistry()
    descriptor = registry._descriptor(
        _declaration("a" * 64), {"reasoning:3b": {"digest": "a" * 64, "size": 1}}
    )
    assert descriptor.integrity == "verified"
    assert descriptor.available is True


def test_unpinned_legacy_model_is_visible_but_not_described_as_verified() -> None:
    registry = ModelRegistry()
    descriptor = registry._descriptor(
        _declaration(None), {"reasoning:3b": {"digest": "a" * 64, "size": 1}}
    )
    assert descriptor.integrity == "unpinned"
    assert descriptor.available is True
