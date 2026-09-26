"""Pressure relief devices: SOP-INS-025 as registered formulas.

Every figure asserted here is one the procedure itself states: the 24- and
48-month bench-test intervals (Clauses 2.1-2.2), the 10% as-received limit
and its worked example of 10.5 bar(g) failing above 11.55 bar(g) (Clause
3.2), the ±3% / ±0.14 bar setting tolerance (Clause 3.4), the MAWP ceiling
on set pressure (Clause 4.1) and the 3% inlet loss limit (Clause 5.2).
"""

from __future__ import annotations

from datetime import date

import pytest

from backend.engineering.formulas import BoundValue, catalogue, evaluate, output_value
from backend.engineering.units import parse_quantity


def q(text: str) -> BoundValue:
    return BoundValue(parse_quantity(text), stated=text)


def test_every_relief_formula_is_registered_and_cites_sop_ins_025() -> None:
    relief = {entry["id"]: entry for entry in catalogue() if entry["id"].startswith("relief.")}
    assert set(relief) == {
        "relief.test_due",
        "relief.as_received_test",
        "relief.set_pressure_limit",
        "relief.post_overhaul_setting",
        "relief.inlet_loss",
    }
    for entry in relief.values():
        assert "SOP-INS-025" in entry["clause"]


class TestTestInterval:
    def test_corrosive_service_is_bench_tested_every_24_months(self) -> None:
        record = evaluate("relief.test_due", {
            "last_test_date": BoundValue(date(2024, 3, 10)),
            "service": BoundValue("Corrosive"),
        })
        assert record.status == "calculated"
        assert output_value(record, "interval_months") == 24
        assert output_value(record, "due") == "2026-03-10"

    def test_clean_service_is_bench_tested_every_48_months(self) -> None:
        record = evaluate("relief.test_due", {
            "last_test_date": BoundValue(date(2024, 3, 10)),
            "service": BoundValue("clean, non-fouling, non-corrosive"),
        })
        assert output_value(record, "interval_months") == 48
        assert output_value(record, "due") == "2028-03-10"

    def test_a_test_past_its_due_date_is_overdue_on_the_date_given(self) -> None:
        record = evaluate("relief.test_due", {
            "last_test_date": BoundValue(date(2024, 3, 10)),
            "service": BoundValue("fouling"),
            "as_of": BoundValue(date(2026, 9, 26)),
        })
        assert output_value(record, "overdue") is True
        assert output_value(record, "days_overdue") == 200

    def test_a_service_the_procedure_does_not_name_is_refused_not_guessed(self) -> None:
        record = evaluate("relief.test_due", {
            "last_test_date": BoundValue(date(2024, 3, 10)),
            "service": BoundValue("vapour"),
        })
        assert record.status == "refused"
        assert "Clauses 2.1-2.2" in record.reason


class TestAsReceived:
    def test_the_clause_3_2_example_passes_at_exactly_the_limit(self) -> None:
        record = evaluate("relief.as_received_test", {
            "set_pressure": q("10.5 bar(g)"), "opening_pressure": q("11.55 bar(g)"),
        })
        assert record.status == "calculated"
        assert output_value(record, "fail_above") == pytest.approx(1.155)
        assert output_value(record, "passed") is True
        assert output_value(record, "severity") is None

    def test_opening_above_the_limit_is_a_high_finding_on_the_protected_equipment(self) -> None:
        record = evaluate("relief.as_received_test", {
            "set_pressure": q("10.5 bar(g)"), "opening_pressure": q("11.6 bar(g)"),
        })
        assert output_value(record, "passed") is False
        assert output_value(record, "severity") == "high"
        assert "24 hours" in output_value(record, "required_action")
        assert output_value(record, "approver").startswith("Head of Inspection + Plant Manager")
        assert "SOP-HSE-004" in output_value(record, "report")

    def test_a_valve_that_did_not_open_fails(self) -> None:
        record = evaluate("relief.as_received_test", {
            "set_pressure": q("10.5 bar(g)"), "did_not_open": BoundValue(True),
        })
        assert output_value(record, "passed") is False
        assert output_value(record, "severity") == "high"

    def test_without_an_opening_pressure_or_a_no_lift_there_is_nothing_to_judge(self) -> None:
        record = evaluate("relief.as_received_test", {"set_pressure": q("10.5 bar(g)")})
        assert record.status == "refused"
        assert "opening pressure" in record.reason

    def test_a_thickness_given_as_the_set_pressure_is_refused(self) -> None:
        record = evaluate("relief.as_received_test", {
            "set_pressure": q("10.5 mm"), "opening_pressure": q("11.0 bar(g)"),
        })
        assert record.status == "refused"
        assert "set_pressure must be a pressure" in record.reason


class TestSetting:
    def test_set_pressure_above_mawp_breaches_clause_4_1(self) -> None:
        record = evaluate("relief.set_pressure_limit", {
            "set_pressure": q("11.0 bar(g)"), "mawp": q("10.5 bar(g)"),
        })
        assert output_value(record, "within_limit") is False

    def test_set_pressure_at_mawp_is_within_clause_4_1(self) -> None:
        record = evaluate("relief.set_pressure_limit", {
            "set_pressure": q("10.5 bar(g)"), "mawp": q("10.5 bar(g)"),
        })
        assert output_value(record, "within_limit") is True

    def test_above_4_8_bar_the_tolerance_is_three_percent(self) -> None:
        inside = evaluate("relief.post_overhaul_setting", {
            "set_pressure": q("10.0 bar(g)"), "popping_pressure": q("10.3 bar(g)"),
        })
        outside = evaluate("relief.post_overhaul_setting", {
            "set_pressure": q("10.0 bar(g)"), "popping_pressure": q("10.31 bar(g)"),
        })
        assert output_value(inside, "tolerance") == pytest.approx(0.03)
        assert output_value(inside, "within_tolerance") is True
        assert output_value(outside, "within_tolerance") is False

    def test_at_or_below_4_8_bar_the_tolerance_is_0_14_bar(self) -> None:
        record = evaluate("relief.post_overhaul_setting", {
            "set_pressure": q("4.0 bar(g)"), "popping_pressure": q("4.14 bar(g)"),
        })
        assert output_value(record, "tolerance") == pytest.approx(0.014)
        assert output_value(record, "within_tolerance") is True

    def test_inlet_loss_above_three_percent_of_set_breaches_clause_5_2(self) -> None:
        within = evaluate("relief.inlet_loss", {
            "set_pressure": q("10.0 bar(g)"), "inlet_loss": q("0.3 bar"),
        })
        beyond = evaluate("relief.inlet_loss", {
            "set_pressure": q("10.0 bar(g)"), "inlet_loss": q("0.31 bar"),
        })
        assert output_value(within, "within_limit") is True
        assert output_value(beyond, "within_limit") is False
        assert output_value(beyond, "loss_percent") == pytest.approx(3.1)
