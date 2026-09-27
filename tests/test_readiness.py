"""Readiness: the checks scripts/warmup.py prints and GET /api/ready serves.

Ollama is never reached: the registry snapshot, the resident list and the
prewarm call are all faked, as the other model tests fake them.
"""

from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path
from typing import Any

import pytest

from backend.agents.orchestrator import PDF_PAGES_PER_BATCH, page_batch_prompt
from backend.agents.vision_cache import VisionCache, identity
from backend.core.config import get_config
from backend.core.schemas import ModelDescriptor, ModelRole, Sensitivity
from backend.models_layer.registry import RegistrySnapshot
from backend.ops import readiness

DIGEST = "d" * 64


def _model(model_id: str, role: ModelRole, *, integrity: str = "verified",
           pinned: bool = True, digest: str | None = DIGEST) -> ModelDescriptor:
    return ModelDescriptor(
        id=model_id, display_name=model_id, family="test", role=role,
        capabilities=["text", "reasoning", "vision"] if role == ModelRole.VISION else ["text", "reasoning"],
        context_window=32768, approved_classifications=[Sensitivity.NORMAL],
        provider="ollama", provider_model=model_id,
        expected_digest=DIGEST if pinned else None, actual_digest=digest,
        integrity=integrity, available=integrity != "not_installed" and integrity != "mismatch",
        size_bytes=1_900_000_000,
    )


def _snapshot(*models: ModelDescriptor, reachable: bool = True) -> RegistrySnapshot:
    return RegistrySnapshot(models=list(models), unregistered=[], provider_reachable=reachable, refreshed_at=0.0)


class TestPinned:
    def test_all_installed_pins_verified_passes(self) -> None:
        check = readiness.check_pinned(_snapshot(
            _model("a:3b", ModelRole.REASONING),
            _model("b:8b", ModelRole.REASONING, integrity="not_installed", digest=None),
        ))
        assert check.ok is True

    def test_a_mismatch_fails_and_is_named(self) -> None:
        check = readiness.check_pinned(_snapshot(
            _model("a:3b", ModelRole.REASONING), _model("b:8b", ModelRole.REASONING, integrity="mismatch"),
        ))
        assert check.ok is False
        assert "b:8b" in check.detail

    def test_unreachable_runtime_is_not_verified(self) -> None:
        check = readiness.check_pinned(_snapshot(_model("a:3b", ModelRole.REASONING), reachable=False))
        assert check.ok is False


class TestDraftingResident:
    def _patch_resident(self, monkeypatch: pytest.MonkeyPatch, resident: list[dict[str, Any]]) -> None:
        from backend.models_layer import manager as manager_module

        class Manager:
            async def resident_models(self) -> list[dict[str, Any]]:
                return resident

        monkeypatch.setattr(manager_module, "get_model_manager", lambda: Manager())

    def test_resident_at_the_asked_context(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_resident(monkeypatch, [{"model": "a:3b", "context_length": 5120}])
        check = asyncio.run(readiness.check_drafting_resident(_model("a:3b", ModelRole.REASONING), {"num_ctx": 5120}))
        assert check.ok is True

    def test_resident_at_another_context_would_reload(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_resident(monkeypatch, [{"model": "a:3b", "context_length": 4096}])
        check = asyncio.run(readiness.check_drafting_resident(_model("a:3b", ModelRole.REASONING), {"num_ctx": 5120}))
        assert check.ok is False
        assert "reload" in check.detail

    def test_not_loaded(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_resident(monkeypatch, [{"model": "other:7b", "context_length": 5120}])
        check = asyncio.run(readiness.check_drafting_resident(_model("a:3b", ModelRole.REASONING), {"num_ctx": 5120}))
        assert check.ok is False


def test_free_memory_threshold() -> None:
    assert readiness.check_free_memory(0).ok is True
    low = readiness.check_free_memory(10**9)
    assert low.ok is False
    assert "swap" in low.detail


class TestVisionCache:
    """The key rebuilt by readiness must be the key a run stores under."""

    def _store_like_a_run(self, directory: Path, digest: str) -> None:
        """Render and key the demo scan with the functions the orchestrator uses."""
        from backend.rag.parsing import inspect_pdf_pages, rasterize_pdf
        from backend.models_layer.router import get_model_router

        config = get_config()
        options = get_model_router().generation_options("vision:3b", stage="vision_extraction")
        sample = readiness.demo_sample()
        assert sample is not None
        numbers = [page.number for page in inspect_pdf_pages(sample) if page.needs_vision]
        with tempfile.TemporaryDirectory() as scratch:
            images = rasterize_pdf(sample, Path(scratch), page_numbers=numbers)
            cache = VisionCache(directory)
            for offset in range(0, len(numbers), PDF_PAGES_PER_BATCH):
                batch = numbers[offset:offset + PDF_PAGES_PER_BATCH]
                ident = identity(
                    images[offset:offset + PDF_PAGES_PER_BATCH], digest,
                    config.prompts.get("prompts_version"), config.system_prompt("vision"),
                    page_batch_prompt(config, sample.name, batch),
                    options,
                )
                cache.put(ident, text="{}", model="vision:3b", task_id="t")

    def test_cold_then_warm(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        monkeypatch.setattr(readiness, "vision_cache_directory", lambda: tmp_path)
        snapshot = _snapshot(_model("vision:3b", ModelRole.VISION))
        cold = readiness.check_vision_cache(snapshot)
        assert cold.ok is False
        self._store_like_a_run(tmp_path, DIGEST)
        warm = readiness.check_vision_cache(snapshot)
        assert warm.ok is True, warm.detail

    def test_a_different_model_digest_is_cold(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        monkeypatch.setattr(readiness, "vision_cache_directory", lambda: tmp_path)
        self._store_like_a_run(tmp_path, "e" * 64)
        assert readiness.check_vision_cache(_snapshot(_model("vision:3b", ModelRole.VISION))).ok is False

    def test_no_sample_configured_does_not_apply(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(readiness, "demo_sample", lambda: None)
        check = readiness.check_vision_cache(_snapshot())
        assert check.ok is None


def test_not_applicable_checks_do_not_decide_readiness() -> None:
    report = readiness.Readiness(
        checks=[readiness.Check("a", True, ""), readiness.Check("b", None, "")], checked_at=0.0
    )
    assert report.ready is True
    assert report.public() == {"ready": True, "checks": {"a": True, "b": None}}


class TestWarmupScript:
    def _fake(self, monkeypatch: pytest.MonkeyPatch, *, loaded: list[str]) -> None:
        drafting = _model("a:3b", ModelRole.REASONING)

        async def check_inference(*, force: bool = False):  # type: ignore[no-untyped-def]
            return readiness.Check("inference_reachable", True, "ok"), _snapshot(drafting)

        async def drafting_model():  # type: ignore[no-untyped-def]
            return drafting, {"num_ctx": 5120}

        async def prewarm(descriptor, options):  # type: ignore[no-untyped-def]
            loaded.append(descriptor.id)

            class Result:
                latency_ms, load_duration_ns = 10, 0

            return Result()

        async def resident(descriptor, options):  # type: ignore[no-untyped-def]
            ok = bool(loaded)
            return readiness.Check("drafting_model_resident", ok, "", {"resident": ["a:3b"] if ok else []})

        monkeypatch.setattr(readiness, "check_inference", check_inference)
        monkeypatch.setattr(readiness, "drafting_model", drafting_model)
        monkeypatch.setattr(readiness, "prewarm_drafting_model", prewarm)
        monkeypatch.setattr(readiness, "check_drafting_resident", resident)
        monkeypatch.setattr(readiness, "check_vision_cache", lambda snapshot: readiness.Check("vision_cache_warm", None, ""))

    def test_check_mode_loads_nothing(self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
        from scripts import warmup

        loaded: list[str] = []
        self._fake(monkeypatch, loaded=loaded)
        code = warmup.main(["--check", "--min-free-mb", "0"])
        assert loaded == []
        assert code == 1
        assert "NOT READY" in capsys.readouterr().out

    def test_warmup_loads_the_drafting_model_and_ends_ready(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        from scripts import warmup

        loaded: list[str] = []
        self._fake(monkeypatch, loaded=loaded)
        code = warmup.main(["--min-free-mb", "0"])
        assert loaded == ["a:3b"]
        out = capsys.readouterr().out
        assert code == 0, out
        assert out.rstrip().endswith("READY")

    def test_warmup_creates_no_task_and_writes_no_audit(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from backend.core.audit import get_audit_log
        from scripts import warmup

        log = get_audit_log().path
        before = log.read_bytes() if log.exists() else b""
        self._fake(monkeypatch, loaded=[])
        warmup.main(["--min-free-mb", "0"])
        assert (log.read_bytes() if log.exists() else b"") == before
