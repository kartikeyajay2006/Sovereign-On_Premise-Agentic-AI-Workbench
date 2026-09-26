"""A survey CSV is assessed as a run receives it, not as it sits on disk.

The upload parser renders a CSV as rows of cells joined by " | " (it has
since the first commit), and that rendering is the evidence a run holds.
The survey reader expected commas, so an uploaded survey gave no readings:
no assessment, no conflict with the contractor's field sheet, and the model
did the arithmetic itself (0.75 mm/year, where the registry gives 0.55).
The tests read the file straight from disk and never saw it.

These build the evidence the way a run does, through parse_document.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.core.schemas import EvidenceItem
from backend.engineering.assessment import assess_vessel
from backend.engineering.extraction import vessel_inputs
from backend.engineering.stage import assess_with_conflicts
from backend.rag.parsing import parse_document

ROOT = Path(__file__).resolve().parents[1]
SURVEY = ROOT / "sample_data" / "datasets" / "V-2104-thickness-survey.csv"
FIELD_SHEET = ROOT / "sample_data" / "conflict" / "V-2104-contractor-field-sheet.md"


def uploaded(path: Path, evidence_id: str) -> EvidenceItem:
    parsed = parse_document(path)
    return EvidenceItem(id=evidence_id, source_document=path.name, kind="uploaded_file",
                        extraction_method=parsed.parser,
                        excerpt="\n\n".join(segment.text for segment in parsed.segments))


def test_the_parser_renders_a_csv_with_pipes() -> None:
    # The premise: if this changes, the reader below needs to know.
    assert "location | thickness_2022_mm | thickness_2026_mm" in uploaded(SURVEY, "F1").excerpt


def test_an_uploaded_survey_gives_every_reading_bound_to_its_row() -> None:
    item = uploaded(SURVEY, "F1")
    inputs = vessel_inputs([item])
    assert inputs is not None and len(inputs.readings) == 6
    assert inputs.nominal.value.value == 12.0 and inputs.t_min.value.value == 6.0
    mid = next(row for row in inputs.readings if row.location == "Shell course 2 (mid)")
    assert mid.current.value.value == 9.4 and mid.current.evidence_id == "F1"
    assert mid.current.locator == "CSV row 'Shell course 2 (mid)' · column thickness_2026_mm"
    # The cited line is one the evidence actually shows.
    assert mid.current.source_text in item.excerpt


def test_an_uploaded_survey_is_assessed_as_the_file_is() -> None:
    _, assessment = assess_vessel(vessel_inputs([uploaded(SURVEY, "F1")]))
    assert assessment.status == "calculated"
    assert assessment.governing_location == "Shell course 2 (mid)"
    assert assessment.governing_rate_mm_yr == pytest.approx(0.55)
    assert assessment.remaining_life_years == pytest.approx(6.18)


def test_an_uploaded_survey_and_field_sheet_disagree_and_nothing_is_calculated() -> None:
    result = assess_with_conflicts([uploaded(SURVEY, "F1"), uploaded(FIELD_SHEET, "F2")])
    assert result is not None
    records, assessment, disputes = result
    assert assessment.status == "conflicted" and records == []
    disputed = {value.stated for dispute in disputes for value in dispute.values}
    assert {"9.4 mm", "9.9 mm"} <= disputed
