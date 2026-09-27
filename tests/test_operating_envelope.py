"""The operating envelope: SOP-INS-021 Clause 6.1's interim pressure limit.

Clause 6.1 permits interim operation of equipment awaiting a
Fitness-For-Service assessment only where "operating pressure is reduced to
90% of the registered MAWP or lower". That is the only operating limit the
corpus states: it has no clause holding operating pressure to MAWP in
general, and none holding operating temperature to a design range, so those
are not registered and nothing here pretends otherwise.

The vessel below is V-2104's transcription with shell course 2 read at
8.8 mm: local metal loss (12.0 - 8.8) / 12.0 = 26.7% of nominal exceeds the
25% trigger of SOP-INS-021 Clause 2.3, the reading is above t-min, so the
vessel awaits an assessment and any operation meanwhile is interim operation.
"""

from __future__ import annotations

import pytest

from backend.core.schemas import Complexity, EvidenceItem, InputType, Sensitivity, TaskProfile, TaskType
from backend.engineering.formulas import FORMULAS, BoundValue, catalogue, evaluate, output_value
from backend.engineering.stage import assess_with_conflicts, decision_lines, register_evidence
from backend.engineering.units import TEMPERATURE, parse_quantity
from tests.test_engineering import V2104_TRANSCRIPTION

FORMULA = "envelope.interim_operating_pressure"

AWAITING_FFS = V2104_TRANSCRIPTION.replace(
    "Shell course 2 (mid) | 11.6 | 9.4 |", "Shell course 2 (mid) | 11.6 | 8.8 |"
)


def with_pressures(text: str, operating: str | None = "9.2 bar(g)", mawp: str | None = "10.5 bar(g)") -> str:
    line = " ".join(part for part in (
        f"Operating Pressure: {operating}" if operating else None,
        f"MAWP: {mawp}" if mawp else None,
    ) if part)
    return text.replace("Material: SA-516", f"{line}\nMaterial: SA-516")


def scan(text: str) -> list[EvidenceItem]:
    return [EvidenceItem(id="V4", source_document="scanned-inspection-report-V-2104.png",
                         excerpt=text, kind="vision_extraction")]


def q(text: str) -> BoundValue:
    return BoundValue(parse_quantity(text), stated=text)


def judge(operating: str, mawp: str):
    return evaluate(FORMULA, {"operating_pressure": q(operating), "mawp": q(mawp)})


def assessed(text: str):
    result = assess_with_conflicts(scan(text))
    assert result is not None
    return result


# ------------------------------------------------------------------ formula
class TestTheFormula:
    def test_it_is_registered_and_cites_the_clause_that_states_it(self) -> None:
        formula = FORMULAS[FORMULA]
        assert formula.clause == "SOP-INS-021 Clause 6.1"
        assert "0.90 × MAWP" in formula.expression
        assert len(catalogue()) == 19

    def test_no_envelope_formula_is_registered_without_a_clause_for_it(self) -> None:
        # The corpus supports only the interim limit; operating ≤ MAWP and a
        # design temperature range have no clause, so no formula.
        assert [f for f in FORMULAS if f.startswith("envelope.")] == [FORMULA]

    def test_in_envelope(self) -> None:
        record = judge("9.2 bar(g)", "10.5 bar(g)")
        assert record.status == "calculated"
        assert output_value(record, "within_limit") is True
        assert output_value(record, "limit") == pytest.approx(0.945)
        assert output_value(record, "percent_of_mawp") == pytest.approx(87.6)
        assert "9.45 bar" in record.display

    def test_exactly_ninety_percent_is_within_the_limit(self) -> None:
        # "90% of the registered MAWP or lower": the limit itself is allowed.
        assert output_value(judge("9.45 bar(g)", "10.5 bar(g)"), "within_limit") is True

    def test_breach(self) -> None:
        record = judge("9.8 bar(g)", "10.5 bar(g)")
        assert output_value(record, "within_limit") is False
        assert output_value(record, "margin") == pytest.approx(-0.035)
        assert "not permitted" in record.display

    def test_a_missing_input_cannot_be_calculated(self) -> None:
        record = evaluate(FORMULA, {"operating_pressure": q("9.2 bar(g)"), "mawp": None})
        assert record.status == "cannot_calculate" and record.missing == ["mawp"]
        assert record.outputs == {}

    def test_a_temperature_given_as_a_pressure_is_refused(self) -> None:
        record = evaluate(FORMULA, {"operating_pressure": q("145 deg C"), "mawp": q("10.5 bar(g)")})
        assert record.status == "refused" and "operating_pressure must be a pressure" in record.reason


class TestUnits:
    @pytest.mark.parametrize("operating, mawp", [
        ("9.2 bar(g)", "10.5 bar(g)"),
        ("920 kPa", "1050 kPa"),
        ("0.92 MPa", "10.5 bar"),
        ("133.4347 psi", "152.2889 psig"),
    ])
    def test_bar_kpa_and_psi_give_one_verdict(self, operating: str, mawp: str) -> None:
        record = judge(operating, mawp)
        assert output_value(record, "within_limit") is True
        assert output_value(record, "limit") == pytest.approx(0.945, abs=1e-5)

    def test_a_breach_in_psi_against_mawp_in_kpa(self) -> None:
        # 142.1 psi = 9.797 bar against 90% of 1050 kPa = 9.45 bar.
        assert output_value(judge("142.1 psi", "1050 kPa"), "within_limit") is False

    def test_celsius_and_kelvin(self) -> None:
        kelvin = parse_quantity("418.15 K")
        assert kelvin.dimension == TEMPERATURE and kelvin.value == pytest.approx(145.0)
        assert parse_quantity("145 deg C").to("K") == pytest.approx(418.15)
        assert parse_quantity("293.15 kelvin").to("degC") == pytest.approx(20.0)
        assert parse_quantity("-40 degF").to("K") == pytest.approx(233.15)


# ------------------------------------------------------------------ in a run
class TestInTheVesselAssessment:
    def test_the_example_vessel_awaits_an_assessment(self) -> None:
        _, assessment, _ = assessed(AWAITING_FFS)
        assert assessment.status == "calculated" and not assessment.withdraw_from_service
        assert any("Clause 2.3" in trigger for trigger in assessment.ffs_triggers)

    def test_in_envelope_is_a_passed_check_on_the_card_and_in_the_note(self) -> None:
        records, assessment, _ = assessed(with_pressures(AWAITING_FFS))
        record = next(r for r in records if r.formula_id == FORMULA)
        assert record.status == "calculated" and record.subject == "V-2104 · decision"
        assert {i.name: i.evidence_id for i in record.inputs} == {"operating_pressure": "V4", "mawp": "V4"}
        assert [(c.label, c.passed, c.formula_id) for c in assessment.checks] == [
            ("Interim operating pressure within 90% of MAWP", True, FORMULA)
        ]
        assert "not permitted" not in (assessment.required_action or "")
        register_evidence(records, assessment, scan(""), lambda item: (setattr(item, "id", "C1"), item)[1])
        lines = "\n".join(decision_lines(assessment, records))
        assert "interim operating pressure (SOP-INS-021 Clause 6.1): within the limit" in lines
        assert "SOP-OPS-008 Clause 2.8" in lines

    def test_breach_fails_the_check_and_names_the_required_action(self) -> None:
        records, assessment, _ = assessed(with_pressures(AWAITING_FFS, operating="9.8 bar(g)"))
        check = assessment.checks[0]
        assert check.passed is False
        assert "not permitted" in assessment.required_action and "9.45 bar" in assessment.required_action
        assert "SOP-INS-021 Clause 6.1" in assessment.required_action
        # No severity is invented for it: the SOP-INS-014 Clause 5 finding stands.
        assert assessment.severity == "medium"
        lines = "\n".join(decision_lines(assessment, records))
        assert "EXCEEDS the limit" in lines

    def test_breach_holds_the_run_for_the_interim_operation_authorities(self) -> None:
        from datetime import datetime, timezone

        from backend.agents.orchestrator import _operating_limit_breaches
        from backend.core.schemas import Task, TaskStatus
        from backend.policy.gateway import get_policy_gateway

        records, assessment, _ = assessed(with_pressures(AWAITING_FFS, operating="9.8 bar(g)"))
        now = datetime.now(timezone.utc)
        task = Task(id="t-env", prompt="May V-2104 continue in interim operation?", status=TaskStatus.EXECUTING,
                    user_id="u", created_at=now, updated_at=now, calculations=records, assessment=assessment)
        assert _operating_limit_breaches(task) == 1
        profile = TaskProfile(
            input_type=InputType.TEXT, task_type=TaskType.CALCULATION, complexity=Complexity.SIMPLE,
            sensitivity=Sensitivity.NORMAL, confidence=0.9, step_budget=4, requires_retrieval=False,
            requires_vision=False, requires_code_execution=False, produces_deliverable=False,
        )
        gateway = get_policy_gateway()
        required, reasons, approvers = gateway.approval_requirement(
            profile, prompt="What is the corrosion rate?", operating_limit_breaches=1,
        )
        assert required and any(r.startswith("interim_operation_limit") for r in reasons)
        assert {"head_of_inspection", "plant_manager"} <= set(approvers)
        within, _, _ = gateway.approval_requirement(profile, prompt="What is the corrosion rate?")
        assert within is False

    def test_without_an_ffs_trigger_the_clause_does_not_apply(self) -> None:
        records, assessment, _ = assessed(with_pressures(V2104_TRANSCRIPTION, operating="10.4 bar(g)"))
        assert not assessment.ffs_triggers
        assert all(r.formula_id != FORMULA for r in records) and assessment.checks == []

    def test_below_t_min_the_vessel_is_withdrawn_so_there_is_no_interim_pressure(self) -> None:
        withdrawn = AWAITING_FFS.replace("| 11.6 | 8.8 |", "| 11.6 | 5.8 |")
        records, assessment, _ = assessed(with_pressures(withdrawn))
        assert assessment.withdraw_from_service
        assert all(r.formula_id != FORMULA for r in records)

    def test_an_operating_pressure_without_an_mawp_cannot_be_calculated(self) -> None:
        records, assessment, _ = assessed(with_pressures(AWAITING_FFS, mawp=None))
        record = next(r for r in records if r.formula_id == FORMULA)
        assert record.status == "cannot_calculate" and record.missing == ["mawp"]
        assert assessment.checks == []
        lines = "\n".join(decision_lines(assessment, records))
        assert "cannot be calculated" in lines and "Do not estimate it" in lines

    def test_nothing_is_judged_when_neither_value_is_in_the_evidence(self) -> None:
        records, _, _ = assessed(AWAITING_FFS)
        assert all(r.formula_id != FORMULA for r in records)

    def test_two_sources_disagreeing_on_mawp_withhold_the_decision(self) -> None:
        sheet = EvidenceItem(id="F2", source_document="nameplate.md", kind="uploaded_file",
                             excerpt="Equipment Tag: V-2104\nMAWP: 9.0 bar(g)\n")
        result = assess_with_conflicts([*scan(with_pressures(AWAITING_FFS)), sheet])
        assert result is not None
        _, assessment, disputes = result
        assert assessment.status == "conflicted" and "mawp" in assessment.conflicts
        assert next(c for c in disputes if c.field == "mawp").impact == "high"
