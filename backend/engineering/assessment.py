"""Asset-integrity assessments composed from registered formulas.

An assessment is a chain of formula evaluations, each recorded: the years
between dates, the short- and long-term rates at every location, the higher of
the two, the remaining life, which location governs, the local metal loss,
the severity and approving authority, the Fitness-For-Service triggers and
the next due date. The governing location is the one with the lowest
remaining life (SOP-INS-014 Clause 4.3), which is not necessarily the thinnest
reading or the fastest rate, a distinction a language model gets wrong.

Nothing is inferred. When an input is missing the assessment's status is
``cannot_calculate`` and it names what is missing.
"""

from __future__ import annotations

import math
from typing import Any

from backend.core.schemas import CalculationRecord, IntegrityAssessment
from backend.engineering.extraction import PipingInputs, VesselInputs
from backend.engineering.formulas import BoundValue, as_bound, evaluate, output_value
from backend.engineering.units import Quantity


def _years(
    records: list[CalculationRecord],
    direct: BoundValue | None,
    start: BoundValue | None,
    end: BoundValue | None,
    subject: str,
    label: str,
) -> BoundValue | None:
    """Years from dates when both are present, else a stated number of years."""
    if start is not None and end is not None:
        record = evaluate("time.years_between", {"start_date": start, "end_date": end}, subject=f"{subject} · {label}")
        records.append(record)
        return as_bound(record, "years", "year")
    return direct


def _location_chain(
    records: list[CalculationRecord],
    subject: str,
    location: str,
    previous: BoundValue | None,
    current: BoundValue | None,
    nominal: BoundValue | None,
    t_min: BoundValue | None,
    between: BoundValue | None,
    in_service: BoundValue | None,
) -> dict[str, Any]:
    where = f"{subject} · {location}"
    short = evaluate("corrosion.short_term_rate",
                     {"t_previous": previous, "t_current": current, "years_between": between}, subject=where)
    long = evaluate("corrosion.long_term_rate",
                    {"t_nominal": nominal, "t_current": current, "years_in_service": in_service}, subject=where)
    governing = evaluate(
        "corrosion.governing_rate",
        {"short_term_rate": as_bound(short, "rate", "mm/year"), "long_term_rate": as_bound(long, "rate", "mm/year")},
        subject=where,
    )
    life = evaluate("integrity.remaining_life",
                    {"t_current": current, "t_min": t_min, "rate": as_bound(governing, "rate", "mm/year")},
                    subject=where)
    below = evaluate("integrity.below_t_min", {"t_current": current, "t_min": t_min}, subject=where)
    records.extend([short, long, governing, life, below])
    life_value = output_value(life, "remaining_life") if life.status == "calculated" else None
    return {
        "location": location,
        "current": current,
        "rate": output_value(governing, "rate") if governing.status == "calculated" else None,
        "rate_is": output_value(governing, "governing") if governing.status == "calculated" else None,
        "life": life_value,
        "life_sort": (math.inf if life_value is None else life_value) if life.status == "calculated" else None,
        "below": bool(output_value(below, "below_t_min")) if below.status == "calculated" else False,
        "complete": all(r.status == "calculated" for r in (short, long, governing, life, below)),
        "missing": sorted({m for r in (short, long, governing, life, below) for m in r.missing}),
        "refused": [r.reason for r in (short, long, governing, life, below) if r.status == "refused"],
    }


def _missing_summary(inputs: VesselInputs | PipingInputs, rows: list[dict[str, Any]]) -> list[str]:
    missing: list[str] = []
    if inputs.nominal is None:
        missing.append("nominal thickness")
    if inputs.t_min is None:
        missing.append("t-min")
    if not inputs.readings:
        missing.append("thickness readings")
    for row in rows:
        for name in row["missing"]:
            text = {
                "years_between": "years between inspections (or both inspection dates)",
                "years_in_service": "years in service (or the in-service date)",
                "t_previous": "previous thickness readings",
                "t_current": "current thickness readings",
            }.get(name, name)
            if text not in missing and name not in ("rate", "short_term_rate", "long_term_rate"):
                missing.append(text)
    return missing


def assess_vessel(inputs: VesselInputs) -> tuple[list[CalculationRecord], IntegrityAssessment]:
    subject = inputs.tag or "vessel"
    records: list[CalculationRecord] = []
    between = _years(records, inputs.years_between, inputs.previous_date, inputs.current_date,
                     subject, "years between inspections")
    in_service = _years(records, inputs.years_in_service, inputs.in_service_date, inputs.current_date,
                        subject, "years in service")

    rows = [
        _location_chain(records, subject, row.location, row.previous, row.current,
                        inputs.nominal, inputs.t_min, between, in_service)
        for row in inputs.readings
    ]
    complete = [row for row in rows if row["complete"]]
    missing = _missing_summary(inputs, rows)
    assessment = IntegrityAssessment(
        kind="vessel", subject=subject, status="cannot_calculate", report=inputs.report_no,
        t_min_mm=inputs.t_min.value.value if inputs.t_min and isinstance(inputs.t_min.value, Quantity) else None,
        missing=missing, source_evidence_ids=list(inputs.source_evidence_ids),
    )
    if not complete or missing:
        refused = [reason for row in rows for reason in row["refused"] if reason]
        if refused and not missing:
            assessment.missing = refused
        return records, assessment

    governing = min(complete, key=lambda row: row["life_sort"])
    below = [row["location"] for row in complete if row["below"]]
    life_bound = (
        BoundValue(Quantity.of(governing["life"], "year"), stated=f"{governing['life']} years",
                   locator=f"governing location '{governing['location']}' (lowest remaining life)")
        if governing["life"] is not None else None
    )

    loss = evaluate("integrity.local_metal_loss",
                    {"t_nominal": inputs.nominal, "t_current": governing["current"]},
                    subject=f"{subject} · {governing['location']}")
    loss_percent = output_value(loss, "loss_percent") if loss.status == "calculated" else None

    decision = f"{subject} · decision"
    severity = evaluate(
        "severity.vessel_finding",
        {
            "locations_below_t_min": BoundValue(below, stated=", ".join(below) or "none",
                                                locator="integrity.below_t_min at every location"),
            "remaining_life": life_bound,
            "cladding_damage_percent": inputs.cladding_damage_percent,
        },
        subject=decision,
    )
    ffs = evaluate(
        "ffs.triggers",
        {
            "locations_below_t_min": BoundValue(below, stated=", ".join(below) or "none",
                                                locator="integrity.below_t_min at every location"),
            "remaining_life": life_bound,
            "local_metal_loss_percent": (BoundValue(loss_percent, stated=f"{loss_percent}%",
                                                    locator="integrity.local_metal_loss at the governing location")
                                         if loss_percent is not None else None),
        },
        subject=decision,
    )
    records.extend([loss, severity, ffs])

    survey = None
    if inputs.current_date is not None and inputs.service_category is not None:
        survey = evaluate(
            "schedule.vessel_thickness_survey",
            {"inspection_date": inputs.current_date, "service_category": inputs.service_category,
             "remaining_life": life_bound},
            subject=decision,
        )
        records.append(survey)

    assessment.status = "calculated"
    assessment.missing = []
    assessment.governing_location = governing["location"]
    assessment.governing_rate_mm_yr = governing["rate"]
    assessment.governing_rate_is = governing["rate_is"]
    assessment.remaining_life_years = governing["life"]
    assessment.locations_below_t_min = below
    assessment.local_metal_loss_percent = loss_percent
    if severity.status == "calculated":
        assessment.severity = output_value(severity, "severity")
        assessment.severity_basis = output_value(severity, "basis")
        assessment.required_action = output_value(severity, "required_action")
        assessment.approver = output_value(severity, "approver")
    if ffs.status == "calculated":
        assessment.ffs_triggers = list(output_value(ffs, "triggers") or [])
    if survey is not None and survey.status == "calculated":
        assessment.next_due = output_value(survey, "due")
        assessment.interval_months = output_value(survey, "interval_months")
        assessment.next_due_basis = survey.display
    return records, assessment


def assess_piping(inputs: PipingInputs) -> tuple[list[CalculationRecord], IntegrityAssessment]:
    subject = inputs.circuit or "piping circuit"
    records: list[CalculationRecord] = []
    between = _years(records, None, inputs.previous_date, inputs.current_date, subject, "years between surveys")
    in_service = _years(records, None, inputs.in_service_date, inputs.current_date, subject, "years in service")
    rows = [
        _location_chain(records, subject, row.location, row.previous, row.current,
                        inputs.nominal, inputs.t_min, between, in_service)
        for row in inputs.readings
    ]
    complete = [row for row in rows if row["complete"]]
    missing = _missing_summary(inputs, rows)
    assessment = IntegrityAssessment(
        kind="piping", subject=subject, status="cannot_calculate",
        t_min_mm=inputs.t_min.value.value if inputs.t_min and isinstance(inputs.t_min.value, Quantity) else None,
        missing=missing, source_evidence_ids=list(inputs.source_evidence_ids),
    )
    if not complete or missing:
        return records, assessment
    governing = min(complete, key=lambda row: row["life_sort"])
    below = [row["location"] for row in complete if row["below"]]
    assessment.status = "calculated"
    assessment.missing = []
    assessment.governing_location = governing["location"]
    assessment.governing_rate_mm_yr = governing["rate"]
    assessment.governing_rate_is = governing["rate_is"]
    assessment.remaining_life_years = governing["life"]
    assessment.locations_below_t_min = below
    if governing["life"] is not None and inputs.class_max_interval is not None and inputs.current_date is not None:
        schedule = evaluate(
            "schedule.piping_next_measurement",
            {
                "remaining_life": BoundValue(Quantity.of(governing["life"], "year"), stated=f"{governing['life']} years",
                                             locator=f"governing CML '{governing['location']}'"),
                "class_max_interval": inputs.class_max_interval,
                "survey_date": inputs.current_date,
            },
            subject=f"{subject} · decision",
        )
        records.append(schedule)
        if schedule.status == "calculated":
            assessment.next_due = output_value(schedule, "due")
            assessment.interval_months = output_value(schedule, "interval_months")
            assessment.next_due_basis = schedule.display
    return records, assessment
