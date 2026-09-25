"""An uploaded record reaches the formulas whole.

A contractor sheet contradicting the plant scan was uploaded, and the run
computed a decision as if the two agreed: file evidence kept the first 800
characters of each section and the first six sections, and the sheet's
readings table sat past both cuts. Nothing said so. The whole of each
section is now kept within a budget, and a cut past it is declared.

The vision model's own output hid a second fault: it opens with a JSON copy
of the readings table, and the table reader took that line for the header,
then read the real header row "Location | 2022 | 2026" as a location called
"Location" measured at 2022 mm and 2026 mm.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path

import pytest

from backend.core.schemas import EvidenceItem, InputType, Sensitivity, StoredFile, User
from backend.engineering.extraction import vessel_inputs
from backend.tools.registry import ToolContext, ToolRegistry
from tests.test_engineering import V2104_TRANSCRIPTION

ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / "sample_data" / "conflict" / "V-2104-contractor-field-sheet.md"

LIVE_VISION = (
    'Corrosion under insulation confirmed on shell course 2\n'
    '{"caption": "ULTRASONIC THICKNESS READINGS (mm)", "rows": [["Location", "2022", "2026", "Min. Recorded"], '
    '["Shell course 1 (top)", "11.8", "10.9", ""], ["Shell course 2 (mid)", "11.6", "9.4", ""]]}\n'
    + V2104_TRANSCRIPTION
)


def _stored(path: Path) -> StoredFile:
    return StoredFile(
        id="file-sheet", filename=path.name, stored_path=str(path), media_type="text/markdown",
        size_bytes=path.stat().st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        input_type=InputType.DOCUMENT, classification=Sensitivity.CONFIDENTIAL,
        owner_id="user-1", department="inspection", uploaded_at=datetime.now(timezone.utc),
    )


@pytest.mark.asyncio
async def test_a_readings_table_past_the_first_800_characters_reaches_the_evidence(
    isolated_storage: Path, tmp_path: Path,
) -> None:
    path = isolated_storage / "uploads" / SHEET.name
    path.write_text(SHEET.read_text())
    stored = _stored(path)
    user = User(id="user-1", username="engineer", display_name="Engineer", role="engineer", department="inspection")
    result = await ToolRegistry()._file_read(
        {"file_id": stored.id},
        ToolContext(user=user, task_id="task", sensitivity=Sensitivity.CONFIDENTIAL, files=[stored], workspace=tmp_path),
    )
    text = "\n".join(item["excerpt"] for item in result["evidence"])
    assert "Shell course 2 (mid) | 11.6 | 9.9" in text
    assert "SOP-INS-014 Rev 4.1" in text


@pytest.mark.asyncio
async def test_every_section_of_a_long_record_is_kept(isolated_storage: Path, tmp_path: Path) -> None:
    path = isolated_storage / "uploads" / "long-record.md"
    path.write_text("\n\n".join(f"## Section {n}\n\n" + f"Reading {n} is {n}.5 mm. " * 40 for n in range(1, 12)))
    stored = _stored(path)
    user = User(id="user-1", username="engineer", display_name="Engineer", role="engineer", department="inspection")
    result = await ToolRegistry()._file_read(
        {"file_id": stored.id},
        ToolContext(user=user, task_id="task", sensitivity=Sensitivity.CONFIDENTIAL, files=[stored], workspace=tmp_path),
    )
    text = "\n".join(item["excerpt"] for item in result["evidence"])
    assert "Reading 11 is 11.5 mm" in text
    assert not any((item.get("extraction_data") or {}).get("truncated") for item in result["evidence"])


def test_the_header_row_is_never_read_as_a_location() -> None:
    inputs = vessel_inputs([EvidenceItem(id="V1", source_document="scan.pdf", excerpt=LIVE_VISION,
                                         kind="vision_extraction")])
    locations = [row.location for row in inputs.readings]
    assert "Location" not in locations
    assert locations[:2] == ["Shell course 1 (top)", "Shell course 2 (mid)"]
    assert len(locations) == 6
