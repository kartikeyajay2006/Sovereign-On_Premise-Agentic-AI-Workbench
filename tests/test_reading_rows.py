"""Every row of a thickness table is read, whatever its location is called.

A live golden-demo run's vision text set the V-2104 table out with single
spaces ("Inlet nozzle N1 11.5 10.2 10.2"). The fallback that splits a row's
trailing numbers from its label wanted the label to end in a letter or a
bracket, so "N1" did not match; the row read as no row, the table was taken
to have ended there, and Inlet nozzle N1 and Manway M1 flange were never
assessed. Nothing said so: the assessment went on with four of six
locations. A location dropped this way is a location whose remaining life
is never compared, so it can never govern.
"""

from __future__ import annotations

from backend.core.schemas import EvidenceItem
from backend.engineering.extraction import vessel_inputs_from_text

SINGLE_SPACED = """PLANT INSPECTION REPORT
Report No.: INS-2026-0417 Equipment Tag: V-2104
Nominal Thickness: 12.0 mm t-min: 6.0 mm (INS-014 Cl. 3.2)
Date of Inspection: 18 February 2026 Previous Inspection: 20 February 2022
ULTRASONIC THICKNESS READINGS (mm)
Location 2022 2026 Min. Recorded
Shell course 1 (top) 11.8 10.9 10.9
Shell course 2 (mid) 11.6 9.4 9.4
Shell course 3 (bot) 11.9 11.1 11.1
Bottom head 12.0 11.4 11.4
Inlet nozzle N1 11.5 10.2 10.2
Manway M1 flange 12.0 11.8 11.8
VISUAL OBSERVATIONS
1. External cladding damaged over approx. 35% of shell course 2.
"""


def _rows(text: str) -> list[tuple[str, str, str]]:
    item = EvidenceItem(id="V1", source_document="scan.pdf", excerpt=text, kind="vision_extraction")
    return [(r.location, r.previous.stated, r.current.stated) for r in vessel_inputs_from_text(text, item).readings]


def test_a_single_spaced_table_is_read_to_its_last_row() -> None:
    assert _rows(SINGLE_SPACED) == [
        ("Shell course 1 (top)", "11.8 mm", "10.9 mm"),
        ("Shell course 2 (mid)", "11.6 mm", "9.4 mm"),
        ("Shell course 3 (bot)", "11.9 mm", "11.1 mm"),
        ("Bottom head", "12.0 mm", "11.4 mm"),
        ("Inlet nozzle N1", "11.5 mm", "10.2 mm"),
        ("Manway M1 flange", "12.0 mm", "11.8 mm"),
    ]


def test_the_table_still_ends_at_the_first_line_that_is_not_a_row() -> None:
    assert [row[0] for row in _rows(SINGLE_SPACED)][-1] == "Manway M1 flange"


# ------------------------------------------------------- a reading to confirm
# The same run's vision text read the 2026 column at Shell course 1 (top) as
# 18.9 mm (the report prints 10.9, and its own Min. Recorded column 10.9),
# on a vessel built at 12.0 mm. Corrosion only removes metal, so the formulas
# called it "no measurable corrosion: remaining life not limited", and the
# location dropped out of the comparison. Had the misread been at the
# governing location, another location would have governed, and nothing said
# so. A reading thicker than both the earlier reading and the nominal
# thickness is withheld for a person to confirm.

def _assess(table: str):
    from backend.engineering.assessment import assess_vessel
    from backend.engineering.extraction import vessel_inputs
    from tests.test_engineering import V2104_TRANSCRIPTION, scan_evidence

    head, _, rest = V2104_TRANSCRIPTION.partition("Location | 2022")
    tail = rest[rest.index("\n\nVISUAL OBSERVATIONS"):]
    return assess_vessel(vessel_inputs(scan_evidence(head + table + tail)))[1]


TABLE = """Location 2022 2026 Min. Recorded
Shell course 1 (top) 11.8 10.9 10.9
Shell course 2 (mid) 11.6 9.4 9.4
Shell course 3 (bot) 11.9 11.1 11.1
Bottom head 12.0 11.4 11.4
Inlet nozzle N1 11.5 10.2 10.2
Manway M1 flange 12.0 11.8 11.8"""


def test_the_table_as_printed_is_calculated() -> None:
    assessment = _assess(TABLE)
    assert assessment.status == "calculated", assessment.missing
    assert assessment.governing_location == "Shell course 2 (mid)"


def test_a_reading_thicker_than_the_wall_ever_was_withholds_the_decision() -> None:
    assessment = _assess(TABLE.replace("Shell course 1 (top) 11.8 10.9", "Shell course 1 (top) 11.8 18.9"))
    assert assessment.status == "cannot_calculate"
    assert assessment.governing_location is None and assessment.severity is None
    [note] = [m for m in assessment.missing if "Shell course 1 (top)" in m]
    assert "18.9 mm" in note and "11.8 mm" in note and "12.0 mm" in note


def test_a_misread_at_the_governing_location_cannot_move_the_decision() -> None:
    assessment = _assess(TABLE.replace("Shell course 2 (mid) 11.6 9.4", "Shell course 2 (mid) 11.6 19.4"))
    assert assessment.status == "cannot_calculate"
    assert any("Shell course 2 (mid)" in m for m in assessment.missing)


def test_measurement_scatter_within_the_as_built_wall_is_not_questioned() -> None:
    # 11.7 then 11.8 on a 12.0 mm wall: thicker than last time, not than the
    # wall was built. No corrosion measured there; nothing to confirm.
    assessment = _assess(TABLE.replace("Manway M1 flange 12.0 11.8", "Manway M1 flange 11.7 11.8"))
    assert assessment.status == "calculated", assessment.missing
