"""The upload gate refuses what a file carries, not just what it is called."""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.security.file_guard import inspect_upload
from tests.adversarial import fixtures

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize(
    ("filename", "builder", "reason"),
    [
        ("report.pdf", fixtures.javascript_pdf, "runs JavaScript"),
        ("report.pdf", fixtures.hex_escaped_javascript_pdf, "runs JavaScript"),
        ("report.pdf", fixtures.hidden_javascript_pdf, "hidden inside a compressed object stream"),
        ("report.pdf", fixtures.launch_pdf, "launches another program"),
        ("report.pdf", lambda: fixtures.attachment_pdf(b"invoice.exe"), "invoice.exe"),
        ("note.docx", fixtures.macro_docx, "macros"),
        ("note.docx", fixtures.remote_template_docx, "fetches content from outside the file"),
        ("note.docx", fixtures.dde_docx, "DDE"),
        ("note.docx", fixtures.zip_bomb_docx, "archive bomb"),
        ("report.pdf", fixtures.renamed_zip, "its bytes are a ZIP archive"),
        ("readings.csv", fixtures.elf_executable, "executable"),
        ("scan.png", fixtures.truncated_png, "does not decode"),
        ("scan.png", fixtures.pixel_bomb_png, "decompression bomb"),
        ("scan.jpg", fixtures.plain_pdf, "named .jpg but its bytes are a PDF"),
    ],
)
def test_a_hostile_upload_is_refused_with_its_reason(filename, builder, reason) -> None:
    verdict = inspect_upload(filename, builder())
    assert verdict.accepted is False
    assert any(reason in text for text in verdict.reasons), verdict.reasons


def test_a_plain_pdf_passes() -> None:
    verdict = inspect_upload("report.pdf", fixtures.plain_pdf())
    assert verdict.accepted, verdict.reasons


def test_a_data_attachment_is_listed_not_refused() -> None:
    # LibreOffice attaches C2PA "Content Credentials" to exported PDFs.
    verdict = inspect_upload("roadmap.pdf", fixtures.attachment_pdf(b"Content Credentials"))
    assert verdict.accepted, verdict.reasons
    assert any("Content Credentials" in note for note in verdict.notes)


def test_a_hyperlink_is_noted_not_refused() -> None:
    verdict = inspect_upload("note.docx", fixtures.hyperlink_docx())
    assert verdict.accepted, verdict.reasons
    assert any("web link" in note for note in verdict.notes)


def test_every_sample_file_passes() -> None:
    samples = [p for p in (ROOT / "sample_data").rglob("*") if p.is_file()]
    assert samples
    refused = {p.name: inspect_upload(p.name, p.read_bytes()).reasons for p in samples}
    assert not {name: reasons for name, reasons in refused.items() if reasons}
