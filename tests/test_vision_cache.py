"""The vision cache: reuse a reading only for the same image, weights and prompt.

`_generate` is faked throughout (no model runtime is touched) and counted:
a hit is a call that did not happen. Routing is faked with a descriptor
whose runtime digest each test controls.
"""

from __future__ import annotations

import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from backend.agents.orchestrator import AgentOrchestrator, EvidenceLedger
from backend.agents.vision_cache import VisionCache
from backend.core.schemas import (
    ModelDescriptor, ModelRole, RoutingDecision, Sensitivity, User,
)
from backend.models_layer.router import NoEligibleModelError
from tests.test_visual_inputs import _stored, _task

MODEL = "qwen2.5vl:3b"
DIGEST = "d" * 64
USER = User(id="user-1", username="engineer", display_name="Engineer", role="engineer", department="inspection")


@pytest.fixture
def scan(tmp_path: Path) -> Path:
    fitz = pytest.importorskip("fitz")
    from PIL import Image, ImageDraw

    path = tmp_path / "scan.pdf"
    document = fitz.open()
    for number in range(1, 3):
        image = Image.new("RGB", (400, 500), "white")
        ImageDraw.Draw(image).text((20, 40), f"PAGE {number} VALUE {number * 7}", fill="black")
        stream = io.BytesIO()
        image.save(stream, format="PNG")
        page = document.new_page(width=400, height=500)
        page.insert_image(page.rect, stream=stream.getvalue())
    document.save(str(path))
    document.close()
    return path


class Harness:
    """An orchestrator with a cache in tmp_path, a faked route and a counted model."""

    def __init__(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, scan: Path) -> None:
        self.agent = AgentOrchestrator()
        self.cache_dir = tmp_path / "vision-cache"
        self.scan = scan
        self.work = tmp_path
        self.digest: str | None = DIGEST
        self.approved = [Sensitivity.NORMAL, Sensitivity.CONFIDENTIAL]
        self.calls = 0
        self.audit: list[dict] = []
        self.agent._persist = None
        monkeypatch.setattr(self.agent.audit, "record", lambda **kwargs: self.audit.append(kwargs))
        monkeypatch.setattr(self.agent, "_vision_cache", lambda: VisionCache(self.cache_dir))
        monkeypatch.setattr(self.agent, "_vision_route", self._route)
        monkeypatch.setattr(self.agent, "_generate", self._generate)

    async def _route(self, task):
        decision = RoutingDecision(
            requested_role=ModelRole.VISION, required_capabilities=["vision"], selected_model=MODEL,
            rule="test", reason="faked route", decided_at=datetime.now(timezone.utc),
        )
        descriptor = ModelDescriptor(
            id=MODEL, display_name="Qwen VL", family="qwen", role=ModelRole.VISION, capabilities=["vision"],
            context_window=8192, approved_classifications=self.approved, provider="ollama",
            provider_model=MODEL, actual_digest=self.digest, integrity="verified" if self.digest else "unpinned",
            available=True,
        )
        return decision, descriptor

    async def _generate(self, _task, _user, **kwargs):
        self.calls += 1
        numbers = [int(re.search(r"-p(\d+)\.png$", path.name).group(1)) for path in kwargs["images"]]
        payload = {"pages": [{"page_number": n, "transcription": f"PAGE {n} VALUE {n * 7}"} for n in numbers]}
        return json.dumps(payload), SimpleNamespace(selected_model=MODEL)

    async def read(self, name: str = "run"):
        """One run's vision pass over the scan, as the orchestrator makes it."""
        task = _task([_stored(self.scan, "file-a")])
        batch = self.agent._visual_inputs(task, self.work / name, [])
        await self.agent._extract_pdf_batch(task, USER, EvidenceLedger(task.evidence), batch, [])
        return task

    def actions(self, action: str) -> list[dict]:
        return [record for record in self.audit if record["action"] == action]


@pytest.fixture
def harness(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, scan: Path) -> Harness:
    return Harness(tmp_path, monkeypatch, scan)


@pytest.mark.asyncio
async def test_a_repeat_reading_is_served_from_the_cache_and_audited(harness: Harness) -> None:
    first = await harness.read("first")
    assert harness.calls == 1
    [stored] = harness.actions("vision_cache_stored")
    assert stored["detail"]["model_digest"] == DIGEST

    second = await harness.read("second")
    assert harness.calls == 1, "the second reading must not call the model"
    [hit] = harness.actions("vision_cache_hit")
    entry = json.loads((harness.cache_dir / f"{stored['detail']['cache_key']}.json").read_text())
    assert hit["category"] == "model" and hit["task_id"] == second.id
    assert hit["detail"]["cache_key"] == stored["detail"]["cache_key"]
    assert hit["detail"]["original_extracted_at"] == entry["extracted_at"]
    assert hit["detail"]["model"] == MODEL and hit["detail"]["model_digest"] == DIGEST

    # The evidence is the same reading, by the model that made it, marked.
    assert [e.excerpt for e in second.evidence] == [e.excerpt for e in first.evidence]
    assert all(e.extraction_model == MODEL and e.extraction_method == "vision" for e in second.evidence)
    markers = [e.extraction_data["vision_cache"] for e in second.evidence]
    assert all(m["hit"] and m["key"] == hit["detail"]["cache_key"] for m in markers)
    assert all(m["extracted_at"] == entry["extracted_at"] for m in markers)
    assert not any("vision_cache" in (e.extraction_data or {}) for e in first.evidence)
    # Admitted like a model call: routed and policy-checked on this run.
    assert [d.selected_model for d in second.routing] == [MODEL]
    assert second.policy_events and second.policy_events[-1].decision.value == "allow"


@pytest.mark.asyncio
async def test_other_weights_are_never_served_the_reading(harness: Harness) -> None:
    await harness.read("first")
    harness.digest = "e" * 64
    await harness.read("second")
    assert harness.calls == 2 and not harness.actions("vision_cache_hit")


@pytest.mark.asyncio
async def test_a_changed_prompt_or_prompt_version_is_a_different_question(
    harness: Harness, monkeypatch: pytest.MonkeyPatch,
) -> None:
    await harness.read("first")
    monkeypatch.setitem(harness.agent.config.prompts, "prompts_version", 999)
    await harness.read("second")
    assert harness.calls == 2
    original = harness.agent.config.system_prompt
    monkeypatch.setattr(harness.agent.config, "system_prompt", lambda name: original(name) + "\nRead carefully.")
    await harness.read("third")
    assert harness.calls == 3 and not harness.actions("vision_cache_hit")


@pytest.mark.asyncio
async def test_a_model_without_a_digest_is_never_cached(harness: Harness) -> None:
    harness.digest = None
    await harness.read("first")
    await harness.read("second")
    assert harness.calls == 2
    assert not harness.actions("vision_cache_stored") and not list(harness.cache_dir.glob("*.json"))


@pytest.mark.asyncio
async def test_an_entry_edited_to_another_digest_is_not_served(harness: Harness) -> None:
    await harness.read("first")
    [path] = harness.cache_dir.glob("*.json")
    entry = json.loads(path.read_text())
    entry["model_digest"] = "f" * 64
    path.write_text(json.dumps(entry))
    await harness.read("second")
    assert harness.calls == 2 and not harness.actions("vision_cache_hit")


@pytest.mark.asyncio
async def test_a_cache_hit_still_answers_to_model_policy(harness: Harness) -> None:
    await harness.read("first")
    harness.approved = []
    with pytest.raises(NoEligibleModelError):
        await harness.read("second")
    assert harness.calls == 1 and not harness.actions("vision_cache_hit")


@pytest.mark.asyncio
async def test_a_cached_reading_that_fails_validation_is_read_again(harness: Harness) -> None:
    task = _task([_stored(harness.scan, "file-a")])
    last = harness.agent._visual_inputs(task, harness.work / "seed", [])[-1]
    # Seed the page's entry with a reading of the wrong page.
    good_generate = harness._generate

    async def wrong_page(_task, _user, **kwargs):
        harness.calls += 1
        return json.dumps({"pages": [{"page_number": 7, "transcription": "not this page"}]}), \
            SimpleNamespace(selected_model=MODEL)

    harness.agent._generate = wrong_page
    await harness.agent._vision_extraction(task, USER, [last])
    harness.agent._generate = good_generate
    harness.calls = 0

    pages = await harness.agent._extract_pdf_batch(task, USER, EvidenceLedger(task.evidence), [last], [])
    assert harness.calls == 1, "the retry asks the model rather than the cache"
    assert [page["page_number"] for page in pages] == [2]
    # The fresh reading replaced the bad entry.
    parsed, _, _ = await harness.agent._vision_extraction(task, USER, [last])
    assert harness.calls == 1 and parsed["pages"][0]["transcription"] == "PAGE 2 VALUE 14"


def test_the_switch_and_the_default_path(monkeypatch: pytest.MonkeyPatch) -> None:
    agent = AgentOrchestrator()
    settings = agent.config.settings.raw["vision_cache"]
    # Off for the test session (conftest.py); on by default in config/app.yaml.
    assert agent._vision_cache() is None
    monkeypatch.setitem(settings, "enabled", True)
    cache = agent._vision_cache()
    assert cache is not None and cache.directory == agent.config.settings.storage_root / "vision-cache"
    import yaml
    shipped = yaml.safe_load((Path(__file__).resolve().parents[1] / "config" / "app.yaml").read_text())
    assert shipped["vision_cache"] == {"enabled": True, "path": "vision-cache"}
