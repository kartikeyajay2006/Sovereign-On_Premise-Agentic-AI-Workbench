"""Every relief-valve record in a run, and two records of one valve compared.

A run used to assess only the first relief record it found, and never looked
at a second record of the same valve. Now every record is assessed, and two
records of one bench test are compared the way two surveys of V-2104 are
(the plant scan against the contractor's field sheet): a value they disagree
on becomes a conflict, the valve's verdicts are withheld, and the run is held
until a person chooses. Two tests of one valve on different dates are both
judged, the latest governs, and a difference in what describes the valve
itself is recorded without withholding anything.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from backend.core.schemas import ConflictResolution, EvidenceItem
from backend.engineering.formulas import BoundValue
from backend.engineering.relief import relief_tests
from backend.engineering.stage import (
    assess_with_conflicts,
    conflict_records,
    decision_lines,
    prompt_block,
    register_evidence,
    unresolved,
)
from backend.engineering.units import Quantity

ROOT = Path(__file__).resolve().parents[1]
RECORD = (ROOT / "sample_data" / "relief" / "PSV-2104A-bench-test-record.md").read_text(encoding="utf-8")
# PSV-2104B protects the same vessel and passed: it opened at 11.2 bar(g),
# under the 11.55 bar(g) limit of SOP-INS-025 Clause 3.2.
PASSING_B = RECORD.replace("PSV-2104A", "PSV-2104B").replace("Opening Pressure: 11.9", "Opening Pressure: 11.2")
# The same valve's previous bench test, two years earlier, which passed.
EARLIER_A = (
    RECORD.replace("Test Date: 12 March 2026", "Test Date: 14 March 2024")
    .replace("Previous Test: 14 March 2024", "Previous Test: 10 March 2022")
    .replace("Opening Pressure: 11.9", "Opening Pressure: 10.8")
    .replace("PRV-2026-0311", "PRV-2024-0207")
)


def item(evidence_id: str, text: str, name: str | None = None) -> EvidenceItem:
    return EvidenceItem(id=evidence_id, source_document=name or f"{evidence_id}.md", excerpt=text, kind="uploaded_file")


def run(*texts: str, overrides: dict[str, BoundValue] | None = None):
    evidence = [item(f"F{index}", text) for index, text in enumerate(texts, 1)]
    result = assess_with_conflicts(evidence, overrides=overrides)
    assert result is not None
    return evidence, result


def numbered(records, assessment, evidence):
    counter = iter(range(1, 100))
    register_evidence(records, assessment, evidence,
                      lambda entry: (setattr(entry, "id", f"C{next(counter)}"), entry)[1])


# ------------------------------------------------------- every record assessed
class TestEveryRecord:
    def test_two_valves_are_both_assessed(self) -> None:
        evidence, (records, assessment, disputes) = run(RECORD, PASSING_B)
        assert disputes == []
        assert assessment.status == "calculated" and assessment.subject == "PSV-2104A, PSV-2104B"
        verdicts = {c.label: c.passed for c in assessment.checks}
        assert verdicts["PSV-2104A · As-received test"] is False
        assert verdicts["PSV-2104B · As-received test"] is True
        assert {r.subject for r in records if r.subject.endswith("· decision")} == {
            "PSV-2104A · decision", "PSV-2104B · decision",
        }

    def test_the_failed_valve_governs_the_severity_and_authority(self) -> None:
        _, (_, assessment, _) = run(PASSING_B, RECORD)
        assert assessment.severity == "high" and assessment.withdraw_from_service is True
        assert assessment.severity_basis.startswith("PSV-2104A: SOP-INS-025 Clauses 3.2-3.3")
        assert assessment.approved_by == ["Plant Manager"]
        assert "PSV-2104A: Withdraw" in assessment.required_action
        assert "PSV-2104B: Return to service" in assessment.required_action

    def test_each_verdict_cites_its_own_valves_computation(self) -> None:
        evidence, (records, assessment, _) = run(RECORD, PASSING_B)
        numbered(records, assessment, evidence)
        by_subject = {r.subject: r.evidence_id for r in records if r.subject.endswith("· decision")}
        lines = decision_lines(assessment, records)
        a_line = next(line for line in lines if "PSV-2104A · As-received test" in line)
        b_line = next(line for line in lines if "PSV-2104B · As-received test" in line)
        assert a_line.startswith(f"[{by_subject['PSV-2104A · decision']}]") and "FAILED" in a_line
        assert b_line.startswith(f"[{by_subject['PSV-2104B · decision']}]") and "passed" in b_line

    def test_one_record_is_assessed_exactly_as_before(self) -> None:
        _, (records, assessment, disputes) = run(RECORD)
        assert disputes == [] and assessment.subject == "PSV-2104A"
        assert "As-received test" in {c.label for c in assessment.checks}
        assert all(r.subject == "PSV-2104A · decision" for r in records)


# ------------------------------------------------------ two records, one test
class TestTwoRecordsOfOneTest:
    def test_a_disagreement_on_the_as_received_result_withholds_the_valve(self) -> None:
        field_sheet = RECORD.replace("Opening Pressure: 11.9", "Opening Pressure: 11.4")
        evidence, (records, assessment, disputes) = run(RECORD, field_sheet)
        assert assessment.status == "conflicted" and records == []
        assert assessment.conflicts == ["relief:PSV-2104A:2026-03-12:as_received"]
        conflict = disputes[0]
        assert conflict.impact == "high"
        assert [(v.stated, v.evidence_id) for v in conflict.values] == [("11.9 bar(g)", "F1"), ("11.4 bar(g)", "F2")]

        records_k = conflict_records(disputes, assessment.subject, evidence, [])
        assert [r.id for r in unresolved(records_k)] == ["K1"]
        assert records_k[0].label == "PSV-2104A · as-received result"
        block = prompt_block(assessment, [], records_k)
        assert "CONFLICTED" in block and "11.9 bar(g) in [F1] vs 11.4 bar(g) in [F2]" in block
        assert "corrosion" not in block.lower()

    def test_a_disagreement_on_set_pressure_withholds_the_valve(self) -> None:
        other = RECORD.replace("Set Pressure: 10.5 bar(g)", "Set Pressure: 10.0 bar(g)")
        _, (_, assessment, disputes) = run(RECORD, other)
        assert assessment.status == "conflicted"
        assert [c.field for c in disputes] == ["relief:PSV-2104A:2026-03-12:set_pressure"]

    def test_the_same_value_in_other_units_is_not_a_conflict(self) -> None:
        other = RECORD.replace("Opening Pressure: 11.9 bar(g)", "Opening Pressure: 1.19 MPa")
        _, (_, assessment, disputes) = run(RECORD, other)
        assert disputes == [] and assessment.status == "calculated"
        assert assessment.source_evidence_ids == ["F1", "F2"]

    def test_one_record_fills_what_the_other_lacks(self) -> None:
        partial = RECORD.replace("Inlet Pressure Loss: 0.25 bar\n", "")
        extra = "PSV Tag: PSV-2104A\nTest Date: 12 March 2026\nInlet Pressure Loss: 0.25 bar\n"
        _, (_, assessment, disputes) = run(partial, extra)
        assert disputes == [] and "Inlet pressure loss" in {c.label for c in assessment.checks}

    def test_a_person_s_choice_resolves_it_and_the_valve_is_judged(self) -> None:
        field_sheet = RECORD.replace("Opening Pressure: 11.9", "Opening Pressure: 11.4")
        evidence = [item("F1", RECORD), item("F2", field_sheet)]
        _, _, disputes = assess_with_conflicts(evidence)
        conflict = conflict_records(disputes, "PSV-2104A", evidence, [])[0]
        conflict.resolution = ConflictResolution(
            candidate=0, value=conflict.candidates[0].value, unit=conflict.candidates[0].unit,
            stated="11.9 bar(g)", reason="The plant bench record is the witnessed test.", resolved_by="u-r",
            resolved_by_name="Reviewer", resolved_by_role="reviewer", resolved_at=datetime.now(timezone.utc),
            evidence_id="H1",
        )
        chosen = BoundValue(Quantity.of(float(conflict.resolution.value), conflict.resolution.unit),
                            stated="11.9 bar(g)", evidence_id="H1", locator="human resolution K1")
        records, assessment, remaining = assess_with_conflicts(evidence, overrides={conflict.field: chosen})
        assert assessment.status == "calculated" and assessment.severity == "high"
        assert [c for c in remaining if c.impact == "high"] == []
        as_received = next(r for r in records if r.formula_id == "relief.as_received_test")
        assert next(i for i in as_received.inputs if i.name == "opening_pressure").evidence_id == "H1"

    def test_an_undated_record_joins_the_valves_only_test(self) -> None:
        undated = "PSV Tag: PSV-2104A\nAs-Received Opening Pressure: 11.4 bar(g)\n"
        tests, conflicts = relief_tests([item("F1", RECORD), item("F2", undated)])
        assert len(tests) == 1
        assert [c.field for c in conflicts] == ["relief:PSV-2104A:2026-03-12:as_received"]


# ---------------------------------------------------- two tests of one valve
class TestTwoTestsOfOneValve:
    def test_both_tests_are_judged_and_the_latest_governs(self) -> None:
        _, (records, assessment, disputes) = run(EARLIER_A, RECORD)
        assert disputes == []
        assert assessment.subject == "PSV-2104A"
        verdicts = {c.label: c.passed for c in assessment.checks}
        assert verdicts["PSV-2104A (test 2024-03-14) · As-received test"] is True
        assert verdicts["PSV-2104A (test 2026-03-12) · As-received test"] is False
        assert assessment.severity == "high"
        assert {r.subject for r in records if r.subject.endswith("· decision")} == {
            "PSV-2104A (test 2024-03-14) · decision", "PSV-2104A (test 2026-03-12) · decision",
        }

    def test_an_earlier_failure_is_shown_but_the_latest_pass_decides(self) -> None:
        failed_2024 = EARLIER_A.replace("Opening Pressure: 10.8", "Opening Pressure: 11.9")
        passed_2026 = RECORD.replace("Opening Pressure: 11.9", "Opening Pressure: 10.9")
        _, (_, assessment, _) = run(passed_2026, failed_2024)
        verdicts = {c.label: c.passed for c in assessment.checks}
        assert verdicts["PSV-2104A (test 2024-03-14) · As-received test"] is False
        assert assessment.severity is None and assessment.withdraw_from_service is False
        assert assessment.next_due == "2028-03-12"

    def test_a_changed_set_pressure_between_tests_is_recorded_not_withheld(self) -> None:
        reset = RECORD.replace("Set Pressure: 10.5 bar(g)", "Set Pressure: 10.0 bar(g)")
        evidence, (_, assessment, disputes) = run(EARLIER_A, reset)
        assert assessment.status == "calculated"
        assert [(c.field, c.impact) for c in disputes] == [("relief:PSV-2104A:tests:set_pressure", "medium")]
        record = conflict_records(disputes, assessment.subject, evidence, [])[0]
        assert "SOP-ENG-009" in record.note and unresolved([record]) == []

    def test_the_fact_stage_does_not_hold_what_the_relief_path_compared(self) -> None:
        from backend.engineering.facts import extract_facts, fact_conflicts

        reset = RECORD.replace("Set Pressure: 10.5 bar(g)", "Set Pressure: 10.0 bar(g)")
        evidence, (_, assessment, disputes) = run(EARLIER_A, reset)
        # The set pressure is a statement about the valve, not about the
        # clause its service line cites.
        assert {(f.subject, f.stated) for f in extract_facts(evidence[1]) if f.attribute == "set_pressure"} == {
            ("PSV-2104A", "10.0 bar(g)")
        }
        recorded = conflict_records(disputes, assessment.subject, evidence, [])
        assert [c.kind for c in fact_conflicts(evidence, recorded)] == ["input"]
