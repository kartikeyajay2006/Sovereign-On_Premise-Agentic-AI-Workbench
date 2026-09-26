"""The governing location is a computed figure, and is verified as one.

The engineering stage tells the model "governing location Shell course 2
(mid)" and to cite the C item of that location. A live golden-demo run did
exactly that, and claim verification called it UNSUPPORTED ("It cites C4,
which does not carry it"): the C item holds the location's formula results,
not the words "governing location", so the flagship run failed verification
and was held for it. Which location governs is an output of the assessment
(the lowest remaining life, SOP-INS-014 Clause 4.3), as the approving
authority is an output of the severity formula, and is judged the same way.
"""

from __future__ import annotations

from backend.agents.verifier import get_verification_engine
from backend.engineering.assessment import assess_vessel
from backend.engineering.extraction import vessel_inputs
from backend.engineering.stage import register_evidence
from tests.test_engineering import scan_evidence


def _calculated():
    evidence = scan_evidence()
    records, assessment = assess_vessel(vessel_inputs(evidence))
    numbers = iter(range(1, 100))

    def add(item):
        item.id = f"C{next(numbers)}"
        evidence.append(item)
        return item

    register_evidence(records, assessment, evidence, add)
    governing = next(r.evidence_id for r in records if r.subject == "V-2104 · Shell course 2 (mid)")
    return evidence, records, assessment, governing


def test_the_governing_location_as_the_stage_tells_it_is_calculated() -> None:
    evidence, records, assessment, governing = _calculated()
    verdicts = get_verification_engine().claim_verdicts(
        f"Governing location: Shell course 2 (mid) [{governing}].", evidence,
        assessment=assessment, records=records)
    assert [v.verdict for v in verdicts] == ["CALCULATED"], verdicts[0].reason
    assert "Shell course 2 (mid)" in verdicts[0].reason


def test_a_location_that_does_not_govern_is_not_calculated() -> None:
    evidence, records, assessment, governing = _calculated()
    verdicts = get_verification_engine().claim_verdicts(
        f"Governing location: Shell course 1 (top) [{governing}].", evidence,
        assessment=assessment, records=records)
    assert verdicts[0].verdict != "CALCULATED"
