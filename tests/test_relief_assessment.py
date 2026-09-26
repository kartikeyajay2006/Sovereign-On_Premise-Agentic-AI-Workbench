"""A relief-valve test record, assessed in a run by SOP-INS-025's formulas.

The record in sample_data/relief is the one the demo attaches: PSV-2104A,
set at 10.5 bar(g) on V-2104, opened at 11.9 bar(g) as received. Clause 3.2
fails it above 11.55 bar(g), and Clause 3.3 makes that a High finding on the
vessel, withdrawn within 24 hours, for the Head of Inspection and the Plant
Manager. Every figure asserted below is one the procedure or the record
states.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.agents.verifier import VerificationEngine
from backend.core.schemas import EvidenceItem
from backend.engineering.relief import assess_relief, relief_inputs
from backend.engineering.stage import assess_with_conflicts, decision_lines, register_evidence

ROOT = Path(__file__).resolve().parents[1]
RECORD = (ROOT / "sample_data" / "relief" / "PSV-2104A-bench-test-record.md").read_text(encoding="utf-8")


def evidence(text: str = RECORD) -> list[EvidenceItem]:
    return [EvidenceItem(id="F1", source_document="PSV-2104A-bench-test-record.md", excerpt=text,
                         kind="uploaded_file")]


def assessed(text: str = RECORD):
    records, assessment = assess_relief(relief_inputs(evidence(text)))
    return records, assessment


class TestReading:
    def test_every_field_is_bound_to_the_record_and_its_line(self) -> None:
        inputs = relief_inputs(evidence())
        assert inputs is not None
        assert inputs.tag == "PSV-2104A" and inputs.protects == "V-2104"
        assert inputs.set_pressure.value.value == pytest.approx(1.05)
        assert inputs.opening_pressure.value.value == pytest.approx(1.19)
        assert inputs.opening_pressure.evidence_id == "F1"
        assert inputs.opening_pressure.locator == "field 'As-Received Opening Pressure'"
        assert inputs.opening_pressure.source_text == "As-Received Opening Pressure: 11.9 bar(g)"
        assert inputs.test_date.value.isoformat() == "2026-03-12"

    def test_a_document_without_a_relief_tag_is_not_a_relief_record(self) -> None:
        assert relief_inputs(evidence("Set Pressure: 10.5 bar(g)\nEquipment Tag: V-2104")) is None


class TestAssessment:
    def test_a_valve_that_opened_above_110_percent_is_a_high_finding(self) -> None:
        _, assessment = assessed()
        assert assessment.kind == "relief" and assessment.status == "calculated"
        assert assessment.subject == "PSV-2104A"
        assert assessment.severity == "high"
        assert assessment.withdraw_from_service is True
        assert "24 hours" in assessment.required_action and "SOP-HSE-004" in assessment.required_action
        assert assessment.recommended_by == ["Inspection Engineer", "Head of Inspection"]
        assert assessment.approved_by == ["Plant Manager"]

    def test_each_clause_is_a_check_with_its_own_verdict(self) -> None:
        _, assessment = assessed()
        verdicts = {check.label: check.passed for check in assessment.checks}
        assert verdicts == {
            "As-received test": False,
            "Set pressure within MAWP": True,
            "Setting after overhaul": True,
            "Inlet pressure loss": True,
            "Previous test on time": True,
        }
        as_received = next(c for c in assessment.checks if c.label == "As-received test")
        assert "11.55 bar" in as_received.detail and "11.9 bar" in as_received.detail

    def test_the_next_bench_test_is_24_months_on_in_corrosive_service(self) -> None:
        _, assessment = assessed()
        assert assessment.next_due == "2028-03-12" and assessment.interval_months == 24

    def test_a_valve_within_its_limit_returns_to_service(self) -> None:
        _, assessment = assessed(RECORD.replace("Opening Pressure: 11.9", "Opening Pressure: 11.2"))
        assert assessment.severity is None and assessment.withdraw_from_service is False
        assert "Return" in assessment.required_action and "2028-03-12" in assessment.required_action

    def test_a_valve_that_did_not_open_fails(self) -> None:
        _, assessment = assessed(RECORD.replace("Opening Pressure: 11.9 bar(g)", "Opening Pressure: did not open"))
        assert assessment.severity == "high"

    def test_without_the_as_received_result_nothing_is_judged(self) -> None:
        _, assessment = assessed(RECORD.replace("As-Received Opening Pressure: 11.9 bar(g)\n", ""))
        assert assessment.status == "cannot_calculate"
        assert assessment.severity is None
        assert any("as-received" in item for item in assessment.missing)


class TestInARun:
    def test_the_stage_finds_a_relief_record_among_the_attachments(self) -> None:
        result = assess_with_conflicts(evidence())
        assert result is not None
        _, assessment, disputes = result
        assert assessment.kind == "relief" and disputes == []

    def test_the_model_is_told_the_verdicts_and_nothing_about_thickness(self) -> None:
        records, assessment = assessed()
        items = evidence()
        register_evidence(records, assessment, items, lambda item: (setattr(item, "id", "C1"), item)[1])
        lines = "\n".join(decision_lines(assessment, records))
        assert "[C1]" in lines
        assert "As-received test: FAILED" in lines
        assert "Severity High" in lines and "Head of Inspection + Plant Manager" in lines
        assert "thickness" not in lines.lower() and "corrosion" not in lines.lower()

    def test_the_verifier_checks_the_severity_without_a_corrosion_rate(self) -> None:
        records, assessment = assessed()
        engine = VerificationEngine()
        right = engine.check_engineering("PSV-2104A failed its as-received test: severity High [C1].",
                                          assessment, records)
        wrong = engine.check_engineering("The finding is Medium severity [C1].", assessment, records)
        assert right.passed, right.detail
        assert not wrong.passed and "High" in wrong.detail


def test_proof_mode_lists_each_clause_verdict() -> None:
    from datetime import datetime, timezone

    from backend.core.schemas import Task, TaskStatus
    from backend.proof.proof_view import _formula

    records, assessment = assessed()
    now = datetime.now(timezone.utc)
    task = Task(id="t-relief", prompt="May V-2104 stay in service?", status=TaskStatus.AWAITING_APPROVAL,
                user_id="u", created_at=now, updated_at=now, calculations=records, assessment=assessment)
    facts = {fact.label: fact.value for fact in _formula(task).facts}
    assert facts["As-received test"].startswith("FAILED")
    assert facts["Set pressure within MAWP"].startswith("passed")
    assert facts["Severity"] == "high"
