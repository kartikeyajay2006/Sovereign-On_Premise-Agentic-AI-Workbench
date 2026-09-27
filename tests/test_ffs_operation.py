"""Operating limits after a Fitness-For-Service finding: SOP-INS-021 Clauses 5 and 6.

The build plan's first phase names pressure limits among the registry's
formulas, and the registry had none: a question about a re-rated MAWP or
about running a vessel while it awaits its assessment was the model's to
answer. Every figure asserted here is one the procedure states: the worked
re-rating example (10.5 bar(g) x RSF 0.86 = 9.03 bar(g), Clause 5.1), and the
interim-operation conditions (90% of MAWP, 30-day inspections, 180 days,
thickness at or above t-min, no through-wall defect; Clauses 6.1-6.2).
"""

from __future__ import annotations

from datetime import date

import pytest

from backend.engineering.formulas import BoundValue, catalogue, evaluate, output_value
from backend.engineering.units import parse_quantity


def q(text: str) -> BoundValue:
    return BoundValue(parse_quantity(text), stated=text)


def test_both_formulas_are_registered_and_cite_sop_ins_021() -> None:
    entries = {entry["id"]: entry for entry in catalogue()}
    assert "SOP-INS-021 Clause 5" in entries["ffs.rerated_mawp"]["clause"]
    assert "SOP-INS-021 Clauses 6.1-6.2" in entries["ffs.interim_operation"]["clause"]


class TestRerating:
    def test_the_clause_5_1_worked_example(self) -> None:
        record = evaluate("ffs.rerated_mawp", {"mawp": q("10.5 bar(g)"), "rsf": BoundValue(0.86)})
        assert record.status == "calculated"
        assert output_value(record, "mawp_rerated") == pytest.approx(0.903)
        assert "9.03 bar" in record.display

    def test_a_re_rating_names_its_authority_and_what_must_follow(self) -> None:
        record = evaluate("ffs.rerated_mawp", {"mawp": q("10.5 bar(g)"), "rsf": BoundValue(0.86)})
        assert output_value(record, "approver").startswith("Head of Inspection + Plant Manager")
        actions = " ".join(output_value(record, "required_actions"))
        assert "30 days" in actions and "SOP-INS-025 Clause 4.2" in actions and "SOP-ENG-009" in actions

    @pytest.mark.parametrize("rsf", [1.2, 0.0, -0.5])
    def test_an_rsf_that_does_not_reduce_the_mawp_is_refused(self, rsf: float) -> None:
        record = evaluate("ffs.rerated_mawp", {"mawp": q("10.5 bar(g)"), "rsf": BoundValue(rsf)})
        assert record.status == "refused" and "RSF" in record.reason


def _interim(**overrides) -> dict:
    inputs = {
        "through_wall_or_leak": BoundValue(False),
        "below_t_min": BoundValue(False),
        "operating_pressure": q("9.4 bar(g)"),
        "mawp": q("10.5 bar(g)"),
        "inspection_interval": q("30 days"),
        "finding_date": BoundValue(date(2026, 2, 18)),
        "planned_end": BoundValue(date(2026, 8, 17)),
    }
    inputs.update(overrides)
    return inputs


class TestInterimOperation:
    def test_every_condition_met_permits_interim_operation(self) -> None:
        record = evaluate("ffs.interim_operation", _interim())
        assert record.status == "calculated"
        assert output_value(record, "permitted") is True
        assert output_value(record, "operating_limit") == pytest.approx(0.945)
        assert output_value(record, "latest_end") == "2026-08-17"
        assert output_value(record, "unmet") == []
        assert output_value(record, "approver").startswith("Head of Inspection + Plant Manager")

    @pytest.mark.parametrize(
        ("override", "clause_text"),
        [
            ({"operating_pressure": q("9.5 bar(g)")}, "90% of the registered MAWP"),
            ({"below_t_min": BoundValue(True)}, "t-min"),
            ({"through_wall_or_leak": BoundValue(True)}, "through-wall"),
            ({"inspection_interval": q("45 days")}, "30-day"),
            ({"planned_end": BoundValue(date(2026, 8, 18))}, "180 days"),
        ],
    )
    def test_any_unmet_condition_refuses_it_and_says_which(self, override: dict, clause_text: str) -> None:
        record = evaluate("ffs.interim_operation", _interim(**override))
        assert output_value(record, "permitted") is False
        assert any(clause_text in item for item in output_value(record, "unmet"))

    @pytest.mark.parametrize("operating", ["9.45 bar(g)", "9.46 bar(g)", "9.0 bar(g)"])
    def test_its_pressure_condition_is_the_envelope_check(self, operating: str) -> None:
        # Two formulas state Clause 6.1's pressure limit; they must never disagree.
        whole = evaluate("ffs.interim_operation", _interim(operating_pressure=q(operating)))
        envelope = evaluate(
            "envelope.interim_operating_pressure", {"operating_pressure": q(operating), "mawp": q("10.5 bar(g)")}
        )
        assert output_value(whole, "operating_limit") == output_value(envelope, "limit")
        assert output_value(whole, "permitted") is output_value(envelope, "within_limit")

    def test_without_the_operating_pressure_it_cannot_be_judged(self) -> None:
        record = evaluate("ffs.interim_operation", _interim(operating_pressure=None))
        assert record.status == "cannot_calculate" and record.missing == ["operating_pressure"]
