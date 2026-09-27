"""A vision reading that dropped header labels is asked again, narrowly.

On the V-2104 report qwen2.5vl:3b transcribed the left column of the header
and skipped the right one ("In Service Since", "t-min", "Previous
Inspection"), so the formula registry could not calculate. The orchestrator
now shows the page once more asking for only the missing labels, keeps an
answer only when it reads as that label's value, and caches it.

`_generate` is faked (no model runtime is touched): the page-batch prompt
gets the partial transcription, the field prompt gets the labels.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from backend.agents.orchestrator import EvidenceLedger
from tests.test_vision_cache import MODEL, USER, Harness
from tests.test_visual_inputs import _stored, _task

LEFT_COLUMN = (
    "PLANT INSPECTION REPORT\nReport No.: INS-2026-0417\nNominal Thickness: 12.0 mm\n"
    "Date of Inspection: 18 February 2026\nShell course 2 (mid) 11.6 9.4 9.4"
)


@pytest.fixture
def one_page(tmp_path: Path) -> Path:
    fitz = pytest.importorskip("fitz")
    from PIL import Image, ImageDraw
    import io

    path = tmp_path / "report.pdf"
    document = fitz.open()
    image = Image.new("RGB", (400, 500), "white")
    ImageDraw.Draw(image).text((20, 40), "PLANT INSPECTION REPORT", fill="black")
    stream = io.BytesIO()
    image.save(stream, format="PNG")
    page = document.new_page(width=400, height=500)
    page.insert_image(page.rect, stream=stream.getvalue())
    document.save(str(path))
    document.close()
    return path


class Report(Harness):
    def __init__(self, tmp_path, monkeypatch, scan, *, transcription=LEFT_COLUMN, fields=None):
        super().__init__(tmp_path, monkeypatch, scan)
        self.transcription = transcription
        self.fields = fields if fields is not None else [
            {"label": "t-min", "value": "6.0 mm (INS-014 Cl. 3.2)"},
            {"label": "Previous Inspection", "value": "20 February 2022"},
            {"label": "In Service Since", "value": "18 Feb 2006"},
        ]
        self.prompts: list[str] = []

    async def _generate(self, _task, _user, **kwargs):
        self.calls += 1
        self.prompts.append(kwargs["prompt"])
        if "Read ONLY these labels" in kwargs["prompt"]:
            return json.dumps({"fields": self.fields}), SimpleNamespace(selected_model=MODEL)
        return (
            json.dumps({"pages": [{"page_number": 1, "transcription": self.transcription}]}),
            SimpleNamespace(selected_model=MODEL),
        )

    async def read_task(self, name: str = "run"):
        task = _task([_stored(self.scan, "file-a")])
        batch = self.agent._visual_inputs(task, self.work / name, [])
        await self.agent._extract_pdf_batch(task, USER, EvidenceLedger(task.evidence), batch, [])
        return task


@pytest.mark.asyncio
async def test_missing_header_labels_are_read_again_and_kept(tmp_path, monkeypatch, one_page):
    report = Report(tmp_path, monkeypatch, one_page)
    task = await report.read_task()

    assert report.calls == 2
    assert "t-min; Previous Inspection; In Service Since" in report.prompts[1]
    [item] = task.evidence
    assert "In Service Since: 18 Feb 2006" in item.excerpt
    assert "t-min: 6.0 mm" in item.excerpt
    assert item.extraction_data["header_recovery"]["recovered"] == ["t-min", "Previous Inspection", "In Service Since"]
    [audit] = report.actions("vision_header_recovery")
    assert audit["detail"]["asked"] == ["t-min", "Previous Inspection", "In Service Since"]


@pytest.mark.asyncio
async def test_the_re_read_is_cached_like_any_reading(tmp_path, monkeypatch, one_page):
    report = Report(tmp_path, monkeypatch, one_page)
    await report.read_task("first")
    await report.read_task("second")
    assert report.calls == 2, "the second run reads both prompts from the cache"


@pytest.mark.asyncio
async def test_an_answer_that_is_not_the_labels_value_is_dropped(tmp_path, monkeypatch, one_page):
    report = Report(tmp_path, monkeypatch, one_page, fields=[
        {"label": "t-min", "value": "not legible"},
        {"label": "Previous Inspection", "value": None},
        {"label": "In Service Since", "value": "18 Feb 2006"},
    ])
    task = await report.read_task()
    [item] = task.evidence
    assert item.extraction_data["header_recovery"]["recovered"] == ["In Service Since"]
    assert "not legible" not in item.excerpt


@pytest.mark.asyncio
async def test_a_complete_header_or_another_document_is_not_asked_again(tmp_path, monkeypatch, one_page):
    complete = LEFT_COLUMN + "\nt-min: 6.0 mm\nPrevious Inspection: 20 February 2022\nIn Service Since: 18 Feb 2006"
    report = Report(tmp_path, monkeypatch, one_page, transcription=complete)
    await report.read_task()
    assert report.calls == 1

    other = Report(tmp_path / "other", monkeypatch, one_page, transcription="Delivery note for pallet 14")
    await other.read_task()
    assert other.calls == 1
