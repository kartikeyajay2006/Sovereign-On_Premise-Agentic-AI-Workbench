"""A relief-valve test record, read and judged by SOP-INS-025's formulas.

A pressure safety valve's bench-test record states a set pressure, what the
valve did on its as-received test, how it was re-set, and when it was
tested. Each is a clause of SOP-INS-025 with a registered formula: the
as-received limit (Clauses 3.2-3.3), the MAWP ceiling (4.1), the setting
tolerance after overhaul (3.4), the inlet loss (5.2) and the test interval
(2.1-2.2). The record is read field by field, every value bound to the line
it came from, and the verdicts are the registry's, never the model's.

A failed as-received test is a failed relief device: a High finding on the
equipment it protects (Clause 3.3), so the run carries that severity to the
approval gate, where a High finding needs two signatures.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from backend.core.schemas import AssessmentCheck, CalculationRecord, EvidenceItem, IntegrityAssessment
from backend.engineering.extraction import parse_date
from backend.engineering.formulas import BoundValue, evaluate, output_value
from backend.engineering.units import UnitError, parse_quantity

# Labels as a record writes them, first match wins. Anchored at the start of
# a line, so "Test Date" never reads "Previous Test Date".
_FIELDS: dict[str, tuple[str, ...]] = {
    "tag": ("PSV Tag", "PRV Tag", "Relief Valve Tag", "Relief Device Tag"),
    "protects": ("Protected Equipment",),
    "report": ("Report No.", "Report No", "Report Number"),
    "service": ("Service",),
    "mawp": ("MAWP of Protected Equipment", "MAWP"),
    "set_pressure": ("Set Pressure",),
    "test_date": ("Test Date",),
    "previous_test": ("Previous Test", "Previous Test Date", "Last Test Date"),
    "opening_pressure": ("As-Received Opening Pressure", "As Received Opening Pressure"),
    "popping_pressure": ("Popping Pressure After Overhaul", "Post-Overhaul Popping Pressure"),
    "inlet_loss": ("Inlet Pressure Loss",),
}
_NO_LIFT = re.compile(r"\b(did not open|failed to open|no lift|did not lift)\b", re.IGNORECASE)


@dataclass
class ReliefInputs:
    tag: str
    protects: str | None = None
    report_no: str | None = None
    service: BoundValue | None = None
    mawp: BoundValue | None = None
    set_pressure: BoundValue | None = None
    opening_pressure: BoundValue | None = None
    did_not_open: BoundValue | None = None
    popping_pressure: BoundValue | None = None
    inlet_loss: BoundValue | None = None
    test_date: BoundValue | None = None
    previous_test: BoundValue | None = None
    source_evidence_ids: list[str] = field(default_factory=list)


def _field(text: str, labels: tuple[str, ...]) -> tuple[str, str, str] | None:
    """(label, value, whole line) for the first label present, or None."""
    for label in labels:
        match = re.search(
            rf"^[ \t>*_-]*{re.escape(label)}[ \t]*(?:\*\*)?[ \t]*:[ \t]*(?:\*\*)?[ \t]*(.+?)[ \t]*$",
            text, re.IGNORECASE | re.MULTILINE,
        )
        if match and match.group(1).strip():
            return label, match.group(1).strip(), match.group(0).strip()
    return None


def _read_one(item: EvidenceItem) -> ReliefInputs | None:
    text = item.excerpt or ""
    tag = _field(text, _FIELDS["tag"])
    if tag is None:
        return None
    inputs = ReliefInputs(tag=tag[1].split()[0], source_evidence_ids=[item.id])

    def bound(key: str, kind: str) -> BoundValue | None:
        found = _field(text, _FIELDS[key])
        if found is None:
            return None
        label, raw, line = found
        value: object
        if kind == "quantity":
            try:
                value = parse_quantity(raw)
            except UnitError:
                return None
        elif kind == "date":
            value = parse_date(raw)
            if value is None:
                return None
        else:
            value = raw
        return BoundValue(value, stated=raw, evidence_id=item.id, locator=f"field '{label}'", source_text=line)

    protects = _field(text, _FIELDS["protects"])
    inputs.protects = protects[1].split()[0] if protects else None
    report = _field(text, _FIELDS["report"])
    inputs.report_no = report[1] if report else None
    inputs.service = bound("service", "text")
    inputs.mawp = bound("mawp", "quantity")
    inputs.set_pressure = bound("set_pressure", "quantity")
    inputs.popping_pressure = bound("popping_pressure", "quantity")
    inputs.inlet_loss = bound("inlet_loss", "quantity")
    inputs.test_date = bound("test_date", "date")
    inputs.previous_test = bound("previous_test", "date")

    opening = _field(text, _FIELDS["opening_pressure"])
    if opening is not None and _NO_LIFT.search(opening[1]):
        inputs.did_not_open = BoundValue(True, stated=opening[1], evidence_id=item.id,
                                         locator=f"field '{opening[0]}'", source_text=opening[2])
    else:
        inputs.opening_pressure = bound("opening_pressure", "quantity")
    return inputs


def relief_inputs(evidence: list[EvidenceItem]) -> ReliefInputs | None:
    """The first relief-device test record in the evidence, read field by field."""
    for item in evidence:
        inputs = _read_one(item)
        if inputs is not None and inputs.set_pressure is not None:
            return inputs
    return None


def _check(record: CalculationRecord, label: str, output: str) -> AssessmentCheck | None:
    if record.status != "calculated":
        return None
    return AssessmentCheck(label=label, passed=bool(output_value(record, output)),
                           detail=record.display or "", formula_id=record.formula_id)


def assess_relief(inputs: ReliefInputs) -> tuple[list[CalculationRecord], IntegrityAssessment]:
    subject = inputs.tag
    decision = f"{subject} · decision"
    assessment = IntegrityAssessment(
        kind="relief", subject=subject, status="cannot_calculate", report=inputs.report_no,
        protected_equipment=inputs.protects, source_evidence_ids=list(inputs.source_evidence_ids),
    )
    missing = []
    if inputs.set_pressure is None:
        missing.append("set pressure")
    if inputs.opening_pressure is None and inputs.did_not_open is None:
        missing.append("as-received opening pressure (or a record that the valve did not open)")
    if missing:
        assessment.missing = missing
        return [], assessment

    records: list[CalculationRecord] = []
    as_received = evaluate("relief.as_received_test", {
        "set_pressure": inputs.set_pressure,
        "opening_pressure": inputs.opening_pressure,
        "did_not_open": inputs.did_not_open,
    }, subject=decision)
    records.append(as_received)
    if as_received.status != "calculated":
        assessment.missing = [as_received.reason or "the as-received test could not be judged"]
        return records, assessment

    checks = [_check(as_received, "As-received test", "passed")]
    if inputs.mawp is not None:
        limit = evaluate("relief.set_pressure_limit",
                         {"set_pressure": inputs.set_pressure, "mawp": inputs.mawp}, subject=decision)
        records.append(limit)
        checks.append(_check(limit, "Set pressure within MAWP", "within_limit"))
    if inputs.popping_pressure is not None:
        setting = evaluate("relief.post_overhaul_setting",
                           {"set_pressure": inputs.set_pressure, "popping_pressure": inputs.popping_pressure},
                           subject=decision)
        records.append(setting)
        checks.append(_check(setting, "Setting after overhaul", "within_tolerance"))
    if inputs.inlet_loss is not None:
        inlet = evaluate("relief.inlet_loss",
                         {"set_pressure": inputs.set_pressure, "inlet_loss": inputs.inlet_loss}, subject=decision)
        records.append(inlet)
        checks.append(_check(inlet, "Inlet pressure loss", "within_limit"))
    if inputs.previous_test is not None and inputs.test_date is not None and inputs.service is not None:
        kept = evaluate("relief.test_due", {"last_test_date": inputs.previous_test, "service": inputs.service,
                                            "as_of": inputs.test_date}, subject=decision)
        records.append(kept)
        if kept.status == "calculated":
            checks.append(AssessmentCheck(label="Previous test on time",
                                          passed=not output_value(kept, "overdue"),
                                          detail=kept.display or "", formula_id=kept.formula_id))
    due = None
    if inputs.test_date is not None and inputs.service is not None:
        due = evaluate("relief.test_due", {"last_test_date": inputs.test_date, "service": inputs.service},
                       subject=decision)
        records.append(due)

    assessment.status = "calculated"
    assessment.checks = [check for check in checks if check is not None]
    if due is not None and due.status == "calculated":
        assessment.next_due = output_value(due, "due")
        assessment.interval_months = output_value(due, "interval_months")
        assessment.next_due_basis = due.display

    if not output_value(as_received, "passed"):
        assessment.severity = output_value(as_received, "severity")
        assessment.severity_basis = f"SOP-INS-025 Clauses 3.2-3.3: {as_received.display}"
        assessment.required_action = (
            f"{output_value(as_received, 'required_action')}; {output_value(as_received, 'report')}"
        )
        assessment.approver = output_value(as_received, "approver")
        # A High finding: recommended by the Inspection Engineer and the Head
        # of Inspection, approved by the Plant Manager (SOP-OPS-008 Clause 2.3).
        assessment.recommended_by = ["Inspection Engineer", "Head of Inspection"]
        assessment.approved_by = ["Plant Manager"]
        assessment.withdraw_from_service = True
        return records, assessment

    failed = [check for check in assessment.checks if not check.passed]
    if failed:
        assessment.required_action = "Before return to service, correct: " + "; ".join(
            f"{check.label} ({check.detail})" for check in failed
        )
    else:
        assessment.required_action = (
            "Return to service"
            + (f"; next bench test due {assessment.next_due}" if assessment.next_due else "")
        )
    return records, assessment
