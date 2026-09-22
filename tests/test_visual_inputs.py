"""Scanned documents must actually reach the vision model.

The platform exists to read scanned inspection reports. A scan classified as
needing vision, for which no image was ever collected, was silently skipped —
the reading step reported "not needed" on the very document it was asked to
read. These tests pin the routing decision that prevents that.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from backend.agents.orchestrator import AgentOrchestrator, EvidenceLedger
from backend.agents.verifier import VerificationEngine
from backend.core.analyzer import TaskAnalyzer
from backend.core.schemas import EvidenceItem, InputType, Sensitivity, StoredFile, Task, TaskStatus, User
from backend.models_layer.client import InferenceError
from backend.rag.parsing import OCRResult, has_extractable_text, inspect_pdf_pages, parse_document, rasterize_pdf
from backend.tools.registry import ToolContext, ToolRegistry


@pytest.fixture
def text_pdf(tmp_path: Path) -> Path:
    """A born-digital PDF: real text, no scanning involved."""
    fitz = pytest.importorskip("fitz")
    path = tmp_path / "born-digital.pdf"
    document = fitz.open()
    page = document.new_page()
    # insert_text does not wrap or break lines, so each line is placed.
    lines = [
        "PLANT INSPECTION REPORT — Vessel V-2104",
        "Inspection & Integrity Department, field record 2026",
        "Shell course 1: 10.9 mm     Shell course 2: 9.4 mm",
        "Shell course 3: 11.1 mm     Bottom head: 11.4 mm",
        "Minimum allowable thickness is 6.0 mm per SOP-INS-014 Clause 3.",
        "Corrosion under insulation confirmed at shell course 2.",
    ]
    for offset, line in enumerate(lines):
        page.insert_text((60, 100 + offset * 24), line, fontsize=11)
    document.save(str(path))
    document.close()
    return path


@pytest.fixture
def scanned_pdf(tmp_path: Path) -> Path:
    """A scan: an image of a page, carrying no text layer."""
    fitz = pytest.importorskip("fitz")
    from PIL import Image, ImageDraw

    image_path = tmp_path / "page.png"
    image = Image.new("RGB", (1240, 1754), "white")
    draw = ImageDraw.Draw(image)
    draw.text((80, 120), "PLANT INSPECTION REPORT", fill="black")
    draw.text((80, 180), "Shell course 2: 9.4 mm", fill="black")
    image.save(image_path)

    path = tmp_path / "scanned.pdf"
    document = fitz.open()
    page = document.new_page(width=595, height=842)
    page.insert_image(page.rect, filename=str(image_path))
    document.save(str(path))
    document.close()
    return path


class TestDocumentRouting:
    def test_born_digital_pdf_keeps_the_text_path(self, text_pdf: Path) -> None:
        """Text extraction is exact and instant; do not spend a vision pass."""
        assert has_extractable_text(text_pdf) is True

    def test_scan_is_recognised_as_needing_vision(self, scanned_pdf: Path) -> None:
        assert has_extractable_text(scanned_pdf) is False

    def test_scan_renders_to_pages_a_model_can_read(
        self, scanned_pdf: Path, tmp_path: Path
    ) -> None:
        from PIL import Image

        pages = rasterize_pdf(scanned_pdf, tmp_path / "rendered")
        assert pages, "a scan must produce at least one page image"
        for page in pages:
            assert page.exists()
            with Image.open(page) as rendered:
                assert max(rendered.size) <= 1200, "rendered no larger than the model is given"

    def test_default_renders_every_page(self, tmp_path: Path) -> None:
        """Later scanned pages must not disappear behind a default cap."""
        fitz = pytest.importorskip("fitz")
        path = tmp_path / "long.pdf"
        document = fitz.open()
        for _ in range(20):
            document.new_page()
        document.save(str(path))
        document.close()

        pages = rasterize_pdf(path, tmp_path / "out", target_edge=200)
        assert len(pages) == 20
        assert pages[-1].name.endswith("-p20.png")

    def test_non_pdf_is_left_alone(self, tmp_path: Path) -> None:
        """Only PDFs are inspected for a text layer."""
        image = tmp_path / "scan.png"
        image.write_bytes(b"not really a png")
        assert has_extractable_text(image) is True


def _stored(path: Path, file_id: str, filename: str | None = None) -> StoredFile:
    return StoredFile(
        id=file_id, filename=filename or path.name, stored_path=str(path),
        media_type="application/pdf", size_bytes=path.stat().st_size,
        sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        input_type=InputType.PDF, classification=Sensitivity.NORMAL,
        owner_id="user-1", department="inspection",
        uploaded_at=datetime.now(timezone.utc),
    )


def _task(files: list[StoredFile]) -> Task:
    now = datetime.now(timezone.utc)
    return Task(
        id="pdf-completeness-test", prompt="What is the value on page 20?",
        status=TaskStatus.CLASSIFIED, user_id="user-1",
        created_at=now, updated_at=now, files=files,
        profile=TaskAnalyzer().analyze("What is the value on page 20?", files),
    )


@pytest.fixture
def twenty_page_scan(tmp_path: Path) -> Path:
    fitz = pytest.importorskip("fitz")
    from PIL import Image, ImageDraw

    path = tmp_path / "twenty-page-scan.pdf"
    document = fitz.open()
    for number in range(1, 21):
        image = Image.new("RGB", (400, 500), "white")
        ImageDraw.Draw(image).text((20, 40), f"PAGE {number} VALUE {number * 7}", fill="black")
        stream = io.BytesIO()
        image.save(stream, format="PNG")
        page = document.new_page(width=400, height=500)
        page.insert_image(page.rect, stream=stream.getvalue())
    document.save(str(path))
    document.close()
    return path


def test_mixed_pdf_routes_only_scan_pages(tmp_path: Path) -> None:
    fitz = pytest.importorskip("fitz")
    from PIL import Image

    path = tmp_path / "mixed.pdf"
    image = Image.new("RGB", (100, 100), "white")
    stream = io.BytesIO()
    image.save(stream, format="PNG")
    document = fitz.open()
    for number in range(1, 5):
        page = document.new_page()
        if number % 2:
            page.insert_text((50, 50), f"Digital page {number}: " + "measured thickness and inspection record " * 5)
        else:
            page.insert_image(page.rect, stream=stream.getvalue())
    document.save(str(path))
    document.close()

    assert [page.number for page in inspect_pdf_pages(path) if page.needs_vision] == [2, 4]
    assert [segment.page_number for segment in parse_document(path).segments] == [1, 3]
    rendered = rasterize_pdf(path, tmp_path / "pages", page_numbers=[2, 4], target_edge=200)
    assert [item.name for item in rendered] == ["mixed-p2.png", "mixed-p4.png"]


@pytest.mark.asyncio
async def test_twenty_scanned_pages_get_independent_evidence_and_reach_reasoning(
    twenty_page_scan: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    stored = _stored(twenty_page_scan, "file-a")
    task = _task([stored])
    user = User(id="user-1", username="engineer", display_name="Engineer", role="engineer", department="inspection")
    agent = AgentOrchestrator()
    monkeypatch.setattr(agent.audit, "record", lambda **kwargs: None)
    checkpoints: list[int] = []
    agent._persist = lambda current: checkpoints.append(len(current.evidence))
    inputs = agent._visual_inputs(task, tmp_path / "work", [])
    assert [item.page_number for item in inputs] == list(range(1, 21))

    batch_sizes: list[int] = []
    prompts: list[str] = []

    async def fake_generate(_task, _user, **kwargs):
        images = kwargs.get("images") or []
        if images:
            batch_sizes.append(len(images))
            prompts.append(kwargs["prompt"])
            numbers = [int(re.search(r"-p(\d+)\.png$", path.name).group(1)) for path in images]
            payload = {"pages": [
                {"page_number": number, "transcription": f"PAGE {number} VALUE {number * 7}", "confidence": 0.8}
                for number in numbers
            ]}
            return json.dumps(payload), SimpleNamespace(selected_model="local-vision")
        prompts.append(kwargs["prompt"])
        return "The page 20 value is 140 [V20].", SimpleNamespace(selected_model="local-reasoning")

    monkeypatch.setattr(agent, "_generate", fake_generate)
    ledger = EvidenceLedger(task.evidence)
    for offset in range(0, len(inputs), 3):
        batch = inputs[offset:offset + 3]
        parsed, _, model = await agent._vision_extraction(task, user, batch)
        agent._record_pdf_batch(task, ledger, batch, parsed, model, [])

    assert batch_sizes == [3, 3, 3, 3, 3, 3, 2]
    assert "page 19" in prompts[-1] and "page 20" in prompts[-1]
    assert '"page_number": 20' in prompts[-1]
    assert checkpoints == list(range(1, 21))
    assert len(task.evidence) == 20
    assert [(item.id, item.page_number, item.source_document) for item in task.evidence] == [
        (f"V{number}", number, stored.filename) for number in range(1, 21)
    ]
    assert all(item.document_id == stored.id and item.source_sha256 == stored.sha256 for item in task.evidence)
    assert all(item.extraction_method == "vision" and item.extraction_model == "local-vision" for item in task.evidence)
    assert task.evidence[-1].extraction_data == {
        "page_number": 20, "transcription": "PAGE 20 VALUE 140", "confidence": 0.8,
    }
    answer = await agent._reason(task, user, task.evidence, {"findings": []}, None)
    assert answer.endswith("[V20].")
    assert "[V20]" in prompts[-1] and "PAGE 20 VALUE 140" in prompts[-1]


def test_missing_or_mislabelled_batch_page_fails(
    twenty_page_scan: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    stored = _stored(twenty_page_scan, "file-a")
    task = _task([stored])
    agent = AgentOrchestrator()
    monkeypatch.setattr(agent.audit, "record", lambda **kwargs: None)
    batch = agent._visual_inputs(task, tmp_path / "work", [])[:3]
    with pytest.raises(InferenceError, match="omitted pages"):
        agent._record_pdf_batch(task, EvidenceLedger(task.evidence), batch, {"pages": [{"page_number": 1}]}, "vision", [])
    assert task.evidence == []


@pytest.mark.asyncio
async def test_ambiguous_batch_retries_each_page(
    twenty_page_scan: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    stored = _stored(twenty_page_scan, "file-a")
    task = _task([stored])
    user = User(id="user-1", username="engineer", display_name="Engineer", role="engineer", department="inspection")
    agent = AgentOrchestrator()
    monkeypatch.setattr(agent.audit, "record", lambda **kwargs: None)
    batch = agent._visual_inputs(task, tmp_path / "work", [])[17:20]
    calls: list[int] = []

    async def fake_generate(_task, _user, **kwargs):
        images = kwargs["images"]
        calls.append(len(images))
        numbers = [int(re.search(r"-p(\d+)\.png$", path.name).group(1)) for path in images]
        return json.dumps({"pages": [
            {"page_number": 1, "transcription": f"PAGE {number} VALUE {number * 7}"}
            for number in numbers
        ]}), SimpleNamespace(selected_model="local-vision")

    monkeypatch.setattr(agent, "_generate", fake_generate)
    pages = await agent._extract_pdf_batch(task, user, EvidenceLedger(task.evidence), batch, [])
    assert calls == [3, 1, 1, 1]
    assert [page["page_number"] for page in pages] == [18, 19, 20]
    assert [item.page_number for item in task.evidence] == [18, 19, 20]
    assert [item.excerpt for item in task.evidence] == [
        "PAGE 18 VALUE 126", "PAGE 19 VALUE 133", "PAGE 20 VALUE 140",
    ]
    assert task.evidence[-1].extraction_data["model_reported_page_number"] == 1


@pytest.mark.asyncio
async def test_empty_batch_retries_visible_pages(
    twenty_page_scan: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    stored = _stored(twenty_page_scan, "file-a")
    task = _task([stored])
    user = User(id="user-1", username="engineer", display_name="Engineer", role="engineer", department="inspection")
    agent = AgentOrchestrator()
    monkeypatch.setattr(agent.audit, "record", lambda **kwargs: None)
    batch = agent._visual_inputs(task, tmp_path / "work", [])[17:20]
    calls: list[int] = []

    async def fake_generate(_task, _user, **kwargs):
        images = kwargs["images"]
        calls.append(len(images))
        numbers = [int(re.search(r"-p(\d+)\.png$", path.name).group(1)) for path in images]
        return json.dumps({"pages": [
            {"page_number": number, "transcription": "" if len(images) > 1 else f"PAGE {number}"}
            for number in numbers
        ]}), SimpleNamespace(selected_model="local-vision")

    monkeypatch.setattr(agent, "_generate", fake_generate)
    await agent._extract_pdf_batch(task, user, EvidenceLedger(task.evidence), batch, [])
    assert calls == [3, 1, 1, 1]
    assert [item.excerpt for item in task.evidence] == ["PAGE 18", "PAGE 19", "PAGE 20"]


def test_invalid_single_page_label_fails(
    twenty_page_scan: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    stored = _stored(twenty_page_scan, "file-a")
    task = _task([stored])
    agent = AgentOrchestrator()
    monkeypatch.setattr(agent.audit, "record", lambda **kwargs: None)
    last = agent._visual_inputs(task, tmp_path / "work", [])[-1]
    with pytest.raises(InferenceError, match="page mismatch"):
        agent._record_pdf_batch(
            task, EvidenceLedger(task.evidence), [last],
            {"pages": [{"page_number": 2, "transcription": "wrong page"}]}, "vision", [],
        )
    assert task.evidence == []


def test_empty_vision_page_uses_local_ocr(
    twenty_page_scan: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    stored = _stored(twenty_page_scan, "file-a")
    task = _task([stored])
    agent = AgentOrchestrator()
    monkeypatch.setattr(agent.audit, "record", lambda **kwargs: None)
    last = agent._visual_inputs(task, tmp_path / "work", [])[-1]
    monkeypatch.setattr(
        "backend.rag.parsing.ocr_image",
        lambda path: OCRResult(text="PAGE 20 VALUE 140", confidence=0.96),
    )
    pages = agent._record_pdf_batch(
        task, EvidenceLedger(task.evidence), [last],
        {"pages": [{"page_number": 1, "transcription": ""}]}, "local-vision", [],
    )
    assert pages[0]["page_number"] == 20
    assert task.evidence[0].excerpt == "PAGE 20 VALUE 140"
    assert task.evidence[0].extraction_method == "ocr"
    assert task.evidence[0].extraction_model == "tesseract"
    assert task.evidence[0].confidence == 0.96
    assert task.evidence[0].extraction_data["model_reported_page_number"] == 1


def test_page_citation_must_name_its_actual_page() -> None:
    evidence = [EvidenceItem(
        id="V1", source_document="scan.pdf", page_number=1,
        location="page 1", excerpt="PAGE 1 VALUE 7", kind="vision_extraction",
    )]
    verifier = VerificationEngine()
    wrong = verifier.check_page_citations("[V1] scan.pdf, page 20 says VALUE 7.", evidence)
    assert not wrong.passed
    assert "page 1" in wrong.detail
    correct = verifier.check_page_citations("[V1] scan.pdf, page 1 says VALUE 7.", evidence)
    assert correct.passed


@pytest.mark.asyncio
async def test_text_pdf_file_read_exposes_all_twenty_pages(
    isolated_storage: Path, tmp_path: Path,
) -> None:
    fitz = pytest.importorskip("fitz")
    path = isolated_storage / "uploads" / "digital.pdf"
    document = fitz.open()
    for number in range(1, 21):
        page = document.new_page()
        page.insert_text((40, 40), f"PAGE {number} " + "documented inspection measurement " * 5)
    document.save(str(path))
    document.close()
    stored = _stored(path, "file-text")
    user = User(id="user-1", username="engineer", display_name="Engineer", role="engineer", department="inspection")
    result = await ToolRegistry()._file_read(
        {"file_id": stored.id},
        ToolContext(user=user, task_id="task", sensitivity=Sensitivity.NORMAL, files=[stored], workspace=tmp_path),
    )
    assert [item["page_number"] for item in result["evidence"]] == list(range(1, 21))
    assert result["evidence"][-1]["source_document"] == "digital.pdf"


def test_same_named_uploads_keep_separate_page_sources(
    scanned_pdf: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    other = tmp_path / "other.pdf"
    shutil.copyfile(scanned_pdf, other)
    first = _stored(scanned_pdf, "file-a", "inspection.pdf")
    second = _stored(other, "file-b", "inspection.pdf")
    task = _task([first, second])
    agent = AgentOrchestrator()
    monkeypatch.setattr(agent.audit, "record", lambda **kwargs: None)
    inputs = agent._visual_inputs(task, tmp_path / "work", [])
    assert len(inputs) == 2
    assert inputs[0].path.parent != inputs[1].path.parent
    ledger = EvidenceLedger(task.evidence)
    for item in inputs:
        agent._record_pdf_batch(
            task, ledger, [item],
            {"pages": [{"page_number": 1, "transcription": f"content from {item.source.id}"}]},
            "vision", [],
        )
    assert [item.document_id for item in task.evidence] == ["file-a", "file-b"]
    assert [item.id for item in task.evidence] == ["V1", "V2"]
    assert "file-b" in task.evidence[1].excerpt


@pytest.mark.asyncio
async def test_complete_scanned_task_uses_page_twenty_citation(
    twenty_page_scan: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    stored = _stored(twenty_page_scan, "file-a")
    task = _task([stored])
    user = User(id="user-1", username="engineer", display_name="Engineer", role="engineer", department="inspection")
    agent = AgentOrchestrator()
    monkeypatch.setattr(agent.audit, "record", lambda **kwargs: None)
    persisted: list[int] = []

    async def fake_generate(_task, _user, **kwargs):
        images = kwargs.get("images") or []
        if images:
            numbers = [int(re.search(r"-p(\d+)\.png$", path.name).group(1)) for path in images]
            return json.dumps({"pages": [
                {"page_number": index, "transcription": f"PAGE {number} VALUE {number * 7}"}
                for index, number in enumerate(numbers, start=1)
            ]}), SimpleNamespace(selected_model="local-vision")
        if kwargs["stage"] == "planning":
            return '{"steps": [{"id": 1, "action": "reason", "objective": "answer"}]}', SimpleNamespace(selected_model="reasoning")
        return "The page 20 value is 140 [V20].", SimpleNamespace(selected_model="reasoning")

    monkeypatch.setattr(agent, "_generate", fake_generate)
    completed = await agent.run(task, user, persist=lambda current: persisted.append(len(current.evidence)))
    assert completed.status == TaskStatus.DELIVERED, completed.error
    assert completed.answer == "The page 20 value is 140 [V20]."
    assert len(completed.evidence) == 20
    assert [item.page_number for item in completed.evidence] == list(range(1, 21))
    assert completed.evidence[-1].extraction_data["model_reported_page_number"] == 2
    assert list(range(1, 21)) == sorted(set(persisted) - {0})
    assert completed.verification is not None
    assert completed.verification.checks[0].passed
    assert next(check for check in completed.verification.checks if check.name == "page_citation_verification").passed
    supported, ids = VerificationEngine._claim_supported(completed.answer, completed.evidence)
    assert supported and ids == ["V20"]
