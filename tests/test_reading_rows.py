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
