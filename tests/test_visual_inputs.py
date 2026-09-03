"""Scanned documents must actually reach the vision model.

The platform exists to read scanned inspection reports. A scan classified as
needing vision, for which no image was ever collected, was silently skipped —
the reading step reported "not needed" on the very document it was asked to
read. These tests pin the routing decision that prevents that.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.rag.parsing import has_extractable_text, rasterize_pdf


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

    def test_page_count_is_capped(self, tmp_path: Path) -> None:
        """Each page costs a full vision pass, so long documents are bounded."""
        fitz = pytest.importorskip("fitz")
        path = tmp_path / "long.pdf"
        document = fitz.open()
        for _ in range(9):
            document.new_page()
        document.save(str(path))
        document.close()

        pages = rasterize_pdf(path, tmp_path / "out", max_pages=3)
        assert len(pages) == 3

    def test_non_pdf_is_left_alone(self, tmp_path: Path) -> None:
        """Only PDFs are inspected for a text layer."""
        image = tmp_path / "scan.png"
        image.write_bytes(b"not really a png")
        assert has_extractable_text(image) is True
