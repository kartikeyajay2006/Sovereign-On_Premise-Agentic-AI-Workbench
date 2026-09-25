"""The deterministic engineering engine.

Held against three independent references:

* the worked examples the procedures print (SOP-INS-014 Clause 3.2, SOP-INS-017
  Clauses 4.3, 5.3 and 6.2);
* sample_data/expected-answers.json, which scripts/seed_demo_data.py computes
  with its own code from the numbers the documents carry;
* the vision transcription of the scanned V-2104 report, exactly as a live
  run recorded it, so the extraction is tested on what a model really wrote.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from backend.core.schemas import EvidenceItem
from backend.engineering.assessment import assess_piping, assess_vessel
from backend.engineering.extraction import piping_inputs, vessel_inputs
from backend.engineering.formulas import BoundValue, catalogue, evaluate, output_value
from backend.engineering.units import (
    DimensionError,
    LENGTH,
    PRESSURE,
    Quantity,
    UnitError,
    parse_quantity,
)

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = json.loads((ROOT / "sample_data" / "expected-answers.json").read_text(encoding="utf-8"))

# The V4 transcription of scanned-inspection-report-V-2104, as qwen2.5vl:3b
# returned it on a live run (including its "FICTlONAL" misreading).
V2104_TRANSCRIPTION = """PLANT INSPECTION REPORT
Inspection & Integrity Department — Field Record
SYNTHETIC DOCUMENT — FICTlONAL DATA FOR THE AEGIS DEMONSTRATION
Report No.: INS-2026-0417
Equipment Tag: V-2104
Description: Crude Overhead Knock-Out Drum
Service: Sour hydrocarbon vapour / condensate
Service Category: Corrosive (SOP-INS-014 Cl. 2.2)
Design Pressure: 10.5 bar(g) Design Temp.: 145 deg C
Material: SA-516 Gr.70 Carbon Steel In Service Since: 18 Feb 2006
Nominal Thickness: 12.0 mm t-min: 6.0 mm (INS-014 Cl. 3.2)
Date of Inspection: 18 February 2026 Previous Inspection: 20 February 2022
Inspector: R. Menon, Inspection Engineer Method: UT survey + external visual
ULTRASONIC THICKNESS READINGS (mm)
Location | 2022 | 2026 | Min. Recorded
Shell course 1 (top) | 11.8 | 10.9
Shell course 2 (mid) | 11.6 | 9.4 |
Shell course 3 (bot) | 11.9 | 11.1
Bottom head | 12.0 | 11.4
Inlet nozzle N1 | 11.5 | 10.2
Manway M1 flange | 12.0 | 11.8

VISUAL OBSERVATIONS
1. External cladding damaged over approx. 35% of shell course 2; insulation found waterlogged on removal.
2. Localised external metal loss beneath damaged insulation on shell course 2.
"""


def scan_evidence(text: str = V2104_TRANSCRIPTION) -> list[EvidenceItem]:
    return [EvidenceItem(id="V4", source_document="scanned-inspection-report-V-2104.png",
                         excerpt=text, kind="vision_extraction")]


def q(text: str) -> BoundValue:
    return BoundValue(parse_quantity(text), stated=text)


# -------------------------------------------------------------------- units
class TestUnits:
    def test_conversions_are_exact(self) -> None:
        assert parse_quantity("10.5 bar(g)").to("MPa") == pytest.approx(1.05)
        assert parse_quantity("0.5 in").to("mm") == pytest.approx(12.7)
        assert parse_quantity("0.55 mm/yr").to("mm/year") == pytest.approx(0.55)
        assert parse_quantity("10 mpy").to("mm/year") == pytest.approx(0.254)
        assert parse_quantity("24 months").to("year") == pytest.approx(2.0)

    def test_an_annotation_after_the_unit_is_ignored(self) -> None:
        quantity = parse_quantity("6.0 mm (INS-014 Cl. 3.2)")
        assert quantity.dimension == LENGTH and quantity.value == 6.0

    def test_gauge_pressure_is_remembered(self) -> None:
        assert parse_quantity("10.5 bar(g)").gauge
        assert parse_quantity("1.05 MPa").dimension == PRESSURE

    def test_pressure_plus_thickness_is_refused(self) -> None:
        with pytest.raises(DimensionError, match="pressure and length"):
            _ = parse_quantity("10.5 bar") + parse_quantity("9.4 mm")

    def test_an_unknown_unit_is_refused_not_guessed(self) -> None:
        with pytest.raises(UnitError):
            parse_quantity("12 cubits")


# ----------------------------------------------------------------- formulas
class TestFormulas:
    def test_every_formula_names_its_clause_and_hashes_its_source(self) -> None:
        entries = catalogue()
        assert len(entries) >= 12
        for entry in entries:
            assert entry["clause"] and "SOP-" in entry["clause"]
            assert len(entry["source_sha256"]) == 64

    def test_sop_ins_014_clause_3_2_worked_example(self) -> None:
        record = evaluate("design.shell_t_min_ug27", {
            "design_pressure": q("1.05 MPa"), "inside_radius": q("600 mm"),
            "allowable_stress": q("138 MPa"), "joint_efficiency": BoundValue(1.0),
        })
        assert output_value(record, "t_calculated") == 4.59
        assert output_value(record, "t_min") == 6.0

    def test_the_same_example_in_bar_normalises_to_the_same_answer(self) -> None:
        record = evaluate("design.shell_t_min_ug27", {
            "design_pressure": q("10.5 bar(g)"), "inside_radius": q("0.6 m"),
            "allowable_stress": q("138 MPa"), "joint_efficiency": BoundValue(1.0),
        })
        assert output_value(record, "t_calculated") == 4.59

    def test_sop_ins_017_clause_4_3_worked_example(self) -> None:
        record = evaluate("design.pipe_t_min", {
            "design_pressure": q("0.35 MPa"), "outside_diameter": q("219.1 mm"),
            "allowable_stress": q("138 MPa"), "joint_quality": BoundValue(1.0),
            "weld_strength": BoundValue(1.0), "coefficient_y": BoundValue(0.4),
        })
        assert output_value(record, "t_pressure") == 0.28
        assert output_value(record, "t_min") == 2.8

    def test_sop_ins_017_clause_5_3_and_6_2_worked_example(self) -> None:
        short = evaluate("corrosion.short_term_rate", {"t_previous": q("7.0 mm"), "t_current": q("6.2 mm"),
                                                       "years_between": q("4.0 years")})
        long = evaluate("corrosion.long_term_rate", {"t_nominal": q("8.18 mm"), "t_current": q("6.2 mm"),
                                                     "years_in_service": q("8.0 years")})
        governing = evaluate("corrosion.governing_rate", {
            "short_term_rate": BoundValue(Quantity.of(output_value(short, "rate"), "mm/year")),
            "long_term_rate": BoundValue(Quantity.of(output_value(long, "rate"), "mm/year")),
        })
        assert output_value(short, "rate") == pytest.approx(0.2)
        assert output_value(long, "rate") == pytest.approx(0.2475)
        assert output_value(governing, "governing") == "long-term"
        life = evaluate("integrity.remaining_life", {
            "t_current": q("6.2 mm"), "t_min": q("2.8 mm"),
            "rate": BoundValue(Quantity.of(output_value(governing, "rate"), "mm/year")),
        })
        assert output_value(life, "remaining_life") == pytest.approx(13.74, abs=0.01)
        schedule = evaluate("schedule.piping_next_measurement", {
            "remaining_life": q("13.7 years"), "class_max_interval": q("10 years"),
            "survey_date": BoundValue(date(2026, 1, 1)),
        })
        assert output_value(schedule, "interval_months") == 82

    def test_a_missing_input_cannot_be_calculated_and_says_which(self) -> None:
        record = evaluate("integrity.remaining_life", {"t_current": q("9.4 mm"), "t_min": None, "rate": q("0.55 mm/yr")})
        assert record.status == "cannot_calculate"
        assert record.missing == ["t_min"]
        assert record.reason == "cannot calculate: missing t_min"

    def test_a_pressure_given_as_a_thickness_is_refused(self) -> None:
        record = evaluate("integrity.remaining_life", {
            "t_current": q("10.5 bar"), "t_min": q("6.0 mm"), "rate": q("0.55 mm/yr"),
        })
        assert record.status == "refused"
        assert "t_current must be a length" in record.reason and "pressure" in record.reason

    def test_the_same_inputs_always_give_the_same_hashes(self) -> None:
        inputs = {"t_previous": q("11.6 mm"), "t_current": q("9.4 mm"), "years_between": q("4.0 years")}
        first = evaluate("corrosion.short_term_rate", inputs)
        second = evaluate("corrosion.short_term_rate", dict(inputs))
        assert first.result_hash == second.result_hash and first.input_hash == second.input_hash
        changed = evaluate("corrosion.short_term_rate", {**inputs, "t_current": q("9.5 mm")})
        assert changed.result_hash != first.result_hash


# --------------------------------------------------------------- extraction
class TestExtraction:
    def test_every_input_is_bound_to_its_evidence_and_place(self) -> None:
        inputs = vessel_inputs(scan_evidence())
        assert inputs is not None and inputs.tag == "V-2104"
        assert inputs.nominal.value.value == 12.0 and inputs.t_min.value.value == 6.0
        assert inputs.current_date.value == date(2026, 2, 18)
        assert inputs.previous_date.value == date(2022, 2, 20)
        assert inputs.in_service_date.value == date(2006, 2, 18)
        assert len(inputs.readings) == 6
        mid = next(row for row in inputs.readings if row.location == "Shell course 2 (mid)")
        assert mid.previous.value.value == 11.6 and mid.current.value.value == 9.4
        assert mid.current.evidence_id == "V4"
        assert mid.current.locator == "readings table · row 'Shell course 2 (mid)' · column 2026"
        assert inputs.cladding_damage_percent.value == 35.0

    def test_a_report_without_readings_is_not_an_inspection_record(self) -> None:
        assert vessel_inputs(scan_evidence("Equipment Tag: V-2104\nNominal Thickness: 12.0 mm")) is None


# --------------------------------------------------------------- assessment
class TestAssessment:
    def test_v2104_matches_the_expected_answers(self) -> None:
        records, assessment = assess_vessel(vessel_inputs(scan_evidence()))
        assert assessment.status == "calculated"
        assert assessment.governing_location == EXPECTED["governing_location"]
        assert assessment.governing_rate_mm_yr == pytest.approx(EXPECTED["governing_rate_mm_yr"])
        assert assessment.remaining_life_years == pytest.approx(EXPECTED["governing_remaining_life_years"])
        assert assessment.severity == EXPECTED["severity"] == "medium"
        assert assessment.approver.startswith("Head of Inspection (")
        assert assessment.ffs_triggers == []
        assert assessment.local_metal_loss_percent == pytest.approx(21.7)
        # Corrosive service: 24-month thickness survey, not halved (life > 4 years).
        assert assessment.next_due == "2028-02-18" and assessment.interval_months == 24
        assert all(record.status == "calculated" for record in records)

    def test_the_governing_location_is_the_lowest_life_not_the_thinnest(self) -> None:
        _, assessment = assess_vessel(vessel_inputs(scan_evidence()))
        vessel = EXPECTED["vessels"]["V-2104"]
        thinnest = min(vessel["per_location"], key=lambda row: row["current_mm"])["location"]
        assert assessment.governing_location == vessel["governing_location"]
        assert thinnest == vessel["governing_location"] or assessment.governing_location != thinnest

    def test_every_expected_location_matches(self) -> None:
        records, _ = assess_vessel(vessel_inputs(scan_evidence()))
        for row in EXPECTED["per_location"]:
            life = next(r for r in records if r.formula_id == "integrity.remaining_life"
                        and r.subject == f"V-2104 · {row['location']}")
            assert output_value(life, "remaining_life") == pytest.approx(row["remaining_life_years"])

    def test_piping_matches_the_expected_answers(self) -> None:
        text = (ROOT / "sample_data/records/INS-2026-0522-P-2104-OVHD-01-thickness-survey.md").read_text(encoding="utf-8")
        _, assessment = assess_piping(piping_inputs([EvidenceItem(id="S1", source_document="INS-2026-0522",
                                                                  excerpt=text, kind="knowledge_base")]))
        expected = EXPECTED["piping"]
        assert assessment.governing_location == expected["governing_cml"]
        assert assessment.governing_rate_mm_yr == pytest.approx(expected["governing_rate_mm_yr"], abs=1e-4)
        assert assessment.remaining_life_years == pytest.approx(expected["governing_remaining_life_years"])
        assert assessment.next_due == expected["next_measurement_due"]
        assert assessment.interval_months == expected["next_measurement_interval_months"]

    def test_missing_dates_mean_cannot_calculate_not_a_guess(self) -> None:
        text = V2104_TRANSCRIPTION.replace("Previous Inspection: 20 February 2022", "")
        records, assessment = assess_vessel(vessel_inputs(scan_evidence(text)))
        assert assessment.status == "cannot_calculate"
        assert any("years between inspections" in item for item in assessment.missing)
        assert assessment.remaining_life_years is None

    def test_thickness_alone_does_not_clear_the_visual_criteria(self) -> None:
        csv = (ROOT / "sample_data/datasets/V-2104-thickness-survey.csv").read_text(encoding="utf-8")
        _, assessment = assess_vessel(vessel_inputs([EvidenceItem(
            id="F1", source_document="V-2104-thickness-survey.csv", excerpt=csv, kind="uploaded_file")]))
        assert assessment.remaining_life_years == pytest.approx(6.18)
        assert assessment.severity == "low"
        assert "could not be assessed" in assessment.severity_basis


# ---------------------------------------------------- below t-min: V-2107
# The fields and readings of scanned-inspection-report-V-2107, as
# scripts/make_sample_inspection_report.py prints them on the scan.
V2107_TRANSCRIPTION = """PLANT INSPECTION REPORT
Report No.: INS-2026-0588
Equipment Tag: V-2107
Description: Amine Flash Drum
Service Category: Corrosive (SOP-INS-014 Cl. 2.2)
Design Pressure: 7.0 bar(g) Design Temp.: 90 deg C
Material: SA-516 Gr.70 Carbon Steel In Service Since: 18 May 2011
Nominal Thickness: 10.0 mm t-min: 6.0 mm (INS-014 Cl. 3.2)
Date of Inspection: 18 May 2026 Previous Inspection: 18 May 2024
ULTRASONIC THICKNESS READINGS (mm)
Location | 2024 | 2026 | Min. Recorded
Shell course 1 (liquid zone) | 7.1 | 5.8 | 5.8
Shell course 2 (vapour zone) | 9.2 | 9.0 | 9.0
Top head | 9.5 | 9.4 | 9.4
Bottom head | 8.6 | 8.2 | 8.2
Outlet nozzle N2 | 8.8 | 8.3 | 8.3
Inlet nozzle N1 | 9.4 | 9.3 | 9.3
"""


class TestBelowTMin:
    """A vessel already below t-min is withdrawn, not scheduled.

    V-2107's governing remaining life is -0.31 years. The survey formula used
    to halve the corrosive-service interval for "life below 4 years" and state
    a thickness survey 12 months out -- a routine date for a vessel SOP-INS-014
    Clause 3.3 takes out of service immediately.
    """

    @pytest.fixture(scope="class")
    def v2107(self):
        return assess_vessel(vessel_inputs(scan_evidence(V2107_TRANSCRIPTION)))

    def test_v2107_matches_the_expected_answers(self, v2107) -> None:
        _, assessment = v2107
        expected = EXPECTED["vessels"]["V-2107"]
        assert assessment.status == "calculated"
        assert assessment.governing_location == expected["governing_location"]
        assert assessment.governing_rate_mm_yr == pytest.approx(expected["governing_rate_mm_yr"])
        assert assessment.remaining_life_years == pytest.approx(expected["governing_remaining_life_years"])
        assert assessment.locations_below_t_min == expected["locations_below_t_min"]
        assert assessment.severity == expected["severity"] == "high"
        assert assessment.approver == expected["approver"]
        assert len(assessment.ffs_triggers) == len(expected["ffs_triggers"]) == 3

    def test_no_routine_interval_is_stated(self, v2107) -> None:
        records, assessment = v2107
        assert assessment.withdraw_from_service
        assert assessment.next_due is None and assessment.interval_months is None
        survey = next(r for r in records if r.formula_id == "schedule.vessel_thickness_survey")
        assert survey.status == "calculated" and survey.formula_version == 2
        assert output_value(survey, "due") is None
        assert "12 months" not in survey.display

    def test_the_sop_immediate_action_is_stated(self, v2107) -> None:
        _, assessment = v2107
        action = assessment.required_action
        assert "Withdraw from service immediately (SOP-INS-014 Clause 3.3)" in action
        assert "within 24 hours" in action and "Clause 5.1" in action
        assert "SOP-INS-021 Clause 2.1" in action
        assert "interim operation is not permitted" in action and "Clause 6.1" in action
        assert "repair, re-rating or replacement" in action

    def test_the_decision_lines_say_withdrawn_not_next_survey(self, v2107) -> None:
        from backend.engineering.stage import decision_lines

        records, assessment = v2107
        text = "\n".join(decision_lines(assessment, records))
        assert "below minimum thickness and is withdrawn from service" in text
        assert "no routine inspection interval applies" in text
        assert "Next thickness survey" not in text and "months after" not in text
        assert "-0.31 years (at or below t-min now" in text

    def test_recommend_and_approve_are_separate_roles(self, v2107) -> None:
        from backend.engineering.stage import authority_statement

        _, assessment = v2107
        # SOP-OPS-008 Clause 2.3: the Inspection Engineer and Head of
        # Inspection recommend; the Plant Manager approves.
        assert assessment.recommended_by == ["Inspection Engineer", "Head of Inspection"]
        assert assessment.approved_by == ["Plant Manager"]
        statement = authority_statement(assessment)
        assert "recommended by the Inspection Engineer and the Head of Inspection" in statement
        assert "approved by the Plant Manager" in statement
        assert "AEGIS prepares the recommendation only" in statement

    def test_v2104_keeps_its_routine_interval(self) -> None:
        _, assessment = assess_vessel(vessel_inputs(scan_evidence()))
        assert not assessment.withdraw_from_service
        assert assessment.recommended_by == ["Inspection Engineer"]
        assert assessment.approved_by == ["Head of Inspection"]

    def test_a_spent_piping_life_gets_no_negative_interval(self) -> None:
        record = evaluate("schedule.piping_next_measurement", {
            "remaining_life": q("-0.31 years"), "class_max_interval": q("10 years"),
            "survey_date": BoundValue(date(2026, 5, 18)),
        })
        assert record.status == "calculated" and record.formula_version == 2
        assert output_value(record, "interval_months") is None and output_value(record, "due") is None
        assert output_value(record, "withdraw_from_service") is True
        assert "SOP-INS-017 Clause 7.3" in record.display
