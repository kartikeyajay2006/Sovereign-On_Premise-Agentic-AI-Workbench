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
from backend.engineering.extraction import InputConflict, parse_date
from backend.engineering.formulas import BoundValue, evaluate, output_value, relief_service_key
from backend.engineering.units import Quantity, UnitError, parse_quantity

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
    # Where the protected-equipment tag was read from, for a conflict over it.
    protects_source: BoundValue | None = None
    # The name the run shows for this record: the tag, or the tag and test
    # date where one valve has records of more than one test.
    subject: str | None = None
    conflicts: list[InputConflict] = field(default_factory=list)

    # What two records of one bench test must agree on, every one read by a
    # formula. The as-received result is one field whether the valve opened
    # (a pressure) or did not.
    _SCALARS = ("service", "mawp", "set_pressure", "popping_pressure", "inlet_loss", "previous_test")

    @property
    def event(self) -> str | None:
        """The bench test this record describes: its test date."""
        if self.test_date is None or self.test_date.value is None:
            return None
        return self.test_date.value.isoformat()

    def field_name(self, name: str) -> str:
        """The conflict field for one value of this valve's test."""
        return f"relief:{self.tag.upper()}:{self.event or 'undated'}:{name}"

    def as_received(self) -> BoundValue | None:
        return self.did_not_open if self.did_not_open is not None else self.opening_pressure

    def _dispute(self, name: str, label: str, impact: str, mine: BoundValue, theirs: BoundValue,
                 note: str | None = None) -> None:
        key = self.field_name(name)
        for conflict in self.conflicts:
            if conflict.field == key:
                if all(_comparable(value) != _comparable(theirs) for value in conflict.values):
                    conflict.values.append(theirs)
                return
        self.conflicts.append(InputConflict(key, f"{self.tag} · {label}", impact, [mine, theirs], note=note))

    def merge(self, other: "ReliefInputs") -> None:
        """Two records of one bench test: fill gaps, and record every disagreement.

        This is the comparison the vessel path makes between two surveys
        (``VesselInputs.merge``): a value another record of the same test
        contradicts becomes a conflict, and nothing that reads it is
        calculated until a person chooses.
        """
        for name in self._SCALARS:
            mine, theirs = getattr(self, name), getattr(other, name)
            if theirs is None:
                continue
            if mine is None:
                setattr(self, name, theirs)
            elif _comparable(mine) != _comparable(theirs):
                self._dispute(name, _RELIEF_LABELS[name], "high", mine, theirs)
        mine, theirs = self.as_received(), other.as_received()
        if mine is None and theirs is not None:
            self.opening_pressure, self.did_not_open = other.opening_pressure, other.did_not_open
        elif mine is not None and theirs is not None and _comparable(mine) != _comparable(theirs):
            self._dispute("as_received", "as-received result", "high", mine, theirs)
        if self.test_date is None and other.test_date is not None:
            self.test_date = other.test_date
        if other.protects:
            if self.protects is None:
                self.protects, self.protects_source = other.protects, other.protects_source
            elif _normal(self.protects) != _normal(other.protects):
                self._dispute("protects", "protected equipment", "medium",
                              self.protects_source or BoundValue(self.protects, stated=self.protects),
                              other.protects_source or BoundValue(other.protects, stated=other.protects))
        if self.report_no is None:
            self.report_no = other.report_no
        for evidence_id in other.source_evidence_ids:
            if evidence_id not in self.source_evidence_ids:
                self.source_evidence_ids.append(evidence_id)

    def override(self, name: str, bound: BoundValue) -> None:
        """Apply a person's resolution of a conflict over one of this test's values."""
        if name == "as_received":
            if isinstance(bound.value, bool) or (isinstance(bound.value, str) and _NO_LIFT.search(bound.value)):
                self.did_not_open, self.opening_pressure = BoundValue(True, bound.stated, bound.evidence_id,
                                                                      bound.locator, bound.source_text), None
            else:
                self.opening_pressure, self.did_not_open = bound, None
        elif name == "protects":
            self.protects, self.protects_source = str(bound.value), bound
        elif name in self._SCALARS:
            setattr(self, name, bound)
        key = self.field_name(name)
        self.conflicts = [conflict for conflict in self.conflicts if conflict.field != key]

    @property
    def blocking_conflicts(self) -> list[InputConflict]:
        return [conflict for conflict in self.conflicts if conflict.impact == "high"]


_RELIEF_LABELS = {
    "service": "Service",
    "mawp": "MAWP of protected equipment",
    "set_pressure": "Set pressure",
    "popping_pressure": "Popping pressure after overhaul",
    "inlet_loss": "Inlet pressure loss",
    "previous_test": "Previous test date",
}


def _normal(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().casefold()


def _comparable(bound: BoundValue) -> object:
    """What two records must agree on: the value, not how it was written."""
    value = bound.value
    if isinstance(value, Quantity):
        return (value.dimension, round(value.value, 6))
    if isinstance(value, bool):
        return ("did not open", value)
    if isinstance(value, str):
        return relief_service_key(value) or _normal(value)
    return value


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
    if protects:
        inputs.protects_source = BoundValue(inputs.protects, stated=protects[1], evidence_id=item.id,
                                            locator=f"field '{protects[0]}'", source_text=protects[2])
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


# Across two bench tests of one valve these describe the valve and what it
# protects, not the test. A difference is recorded, not withheld: each test
# is judged on its own record, and a valve can be re-set (a change under
# SOP-ENG-009, SOP-INS-025 Clause 4.2) or its equipment re-rated between tests.
_ACROSS_TESTS = ("set_pressure", "mawp", "service")
_ACROSS_TESTS_WHY = {
    "set_pressure": "a change of set pressure is a change under SOP-ENG-009 (SOP-INS-025 Clause 4.2), "
                    "so a person should confirm which setting is current.",
    "mawp": "a reduced MAWP is a re-rating under SOP-INS-021 Clause 5, and the valve's setting must not exceed "
            "the MAWP in force (SOP-INS-025 Clause 4.1), so a person should confirm which MAWP is current.",
    "service": "the service sets the bench-test interval (SOP-INS-025 Clauses 2.1-2.2), so a person should "
               "confirm which service is current.",
}


def relief_tests(
    evidence: list[EvidenceItem], overrides: dict[str, BoundValue] | None = None
) -> tuple[list[ReliefInputs], list[InputConflict]]:
    """Every relief-valve test in the evidence, one per valve and test date.

    Records of one valve and one test date are merged and compared, as two
    surveys of one vessel are. A record without a test date joins the valve's
    only dated test, else stands alone. Tests of one valve on different dates
    are each assessed, and compared on what describes the valve itself.
    ``overrides`` are resolved conflicts, keyed by conflict field.
    """
    by_tag: dict[str, list[ReliefInputs]] = {}
    order: list[str] = []
    for item in evidence:
        found = _read_one(item)
        if found is None:
            continue
        key = found.tag.upper()
        if key not in by_tag:
            by_tag[key] = []
            order.append(key)
        by_tag[key].append(found)

    tests: list[ReliefInputs] = []
    conflicts: list[InputConflict] = []
    for key in order:
        records = by_tag[key]
        if not any(record.set_pressure is not None for record in records):
            continue  # not a test record: nothing states the setting it was tested against
        dated: dict[str, ReliefInputs] = {}
        undated: list[ReliefInputs] = []
        for record in records:
            if record.event is None:
                undated.append(record)
            elif record.event in dated:
                dated[record.event].merge(record)
            else:
                dated[record.event] = record
        valve = sorted(dated.values(), key=lambda test: test.event or "")
        for record in undated:
            if len(valve) == 1:
                valve[0].merge(record)
            elif valve and valve[-1].event is None:
                valve[-1].merge(record)
            else:
                valve.append(record)
        for test in valve:
            test.subject = test.tag if len(valve) == 1 else f"{test.tag} (test {test.event or 'undated'})"
            for name, bound in (overrides or {}).items():
                prefix = test.field_name("")
                if name.startswith(prefix):
                    test.override(name[len(prefix):], bound)
            conflicts.extend(test.conflicts)
        conflicts.extend(_across_tests(valve))
        tests.extend(valve)
    return tests, conflicts


def _across_tests(valve: list[ReliefInputs]) -> list[InputConflict]:
    """What two tests of one valve disagree on about the valve itself."""
    found: list[InputConflict] = []
    for name in _ACROSS_TESTS:
        values = [getattr(test, name) for test in valve if getattr(test, name) is not None]
        distinct: list[BoundValue] = []
        for value in values:
            if all(_comparable(value) != _comparable(seen) for seen in distinct):
                distinct.append(value)
        if len(distinct) < 2:
            continue
        tag = valve[0].tag
        found.append(InputConflict(
            f"relief:{tag.upper()}:tests:{name}", f"{tag} · {_RELIEF_LABELS[name]} across tests", "medium", distinct,
            note=(
                f"The test records of {tag} state different values for {_RELIEF_LABELS[name].lower()} "
                f"({' vs '.join(value.stated or str(value.value) for value in distinct)}). Each test is judged "
                f"on its own record, so no figure is withheld; {_ACROSS_TESTS_WHY[name]}"
            ),
        ))
    return found


def _check(record: CalculationRecord, label: str, output: str) -> AssessmentCheck | None:
    if record.status != "calculated":
        return None
    return AssessmentCheck(label=label, passed=bool(output_value(record, output)),
                           detail=record.display or "", formula_id=record.formula_id)


def assess_relief(inputs: ReliefInputs) -> tuple[list[CalculationRecord], IntegrityAssessment]:
    subject = inputs.subject or inputs.tag
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


_SEVERITY_RANK = {"high": 3, "medium": 2, "low": 1}


def _unique(values: list[str | None]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def assess_relief_tests(tests: list[ReliefInputs]) -> tuple[list[CalculationRecord], IntegrityAssessment]:
    """Every relief-valve test in a run, as one decision.

    One test is assessed exactly as before. Several are each assessed on their
    own record, and every clause verdict is kept, named by the test it
    belongs to. The decision rests on each valve's latest test: an earlier
    test's failure is shown, but it was a finding at the time, not the
    valve's condition now. The highest severity among those latest tests is
    the run's, with its action and authority.
    """
    if len(tests) == 1:
        return assess_relief(tests[0])
    results = [(test, *assess_relief(test)) for test in tests]
    records = [record for _, found, _ in results for record in found]
    combined = IntegrityAssessment(
        kind="relief",
        subject=", ".join(_unique([test.tag for test in tests])),
        status="cannot_calculate",
        report=", ".join(_unique([test.report_no for test in tests])) or None,
        protected_equipment=", ".join(_unique([test.protects for test in tests])) or None,
        source_evidence_ids=_unique([evidence_id for test in tests for evidence_id in test.source_evidence_ids]),
    )
    # Each valve's current test: its latest dated one, else its only record.
    current: dict[str, IntegrityAssessment] = {}
    for test, _, assessment in results:
        key = test.tag.upper()
        if key not in current or test.event is not None:
            current[key] = assessment
    for _, _, assessment in results:
        combined.checks += [
            AssessmentCheck(label=f"{assessment.subject} · {check.label}", passed=check.passed,
                            detail=check.detail, formula_id=check.formula_id)
            for check in assessment.checks
        ]
        combined.missing += [f"{assessment.subject}: {item}" for item in assessment.missing]
    if not any(assessment.status == "calculated" for _, _, assessment in results):
        return records, combined

    combined.status = "calculated"
    latest = list(current.values())
    judged = [assessment for assessment in latest if assessment.status == "calculated"]
    governing = max(judged, key=lambda a: _SEVERITY_RANK.get((a.severity or "").lower(), 0), default=None)
    if governing is not None and governing.severity:
        combined.severity = governing.severity
        combined.severity_basis = f"{governing.subject}: {governing.severity_basis}"
        combined.approver = governing.approver
        combined.recommended_by = list(governing.recommended_by)
        combined.approved_by = list(governing.approved_by)
    combined.withdraw_from_service = any(assessment.withdraw_from_service for assessment in judged)
    actions = [f"{a.subject}: {a.required_action}" for a in judged if a.required_action]
    actions += [f"{a.subject}: cannot be judged, missing {', '.join(a.missing)}" for a in latest
                if a.status != "calculated"]
    combined.required_action = "; ".join(actions) or None
    due = min((a for a in judged if a.next_due and not a.withdraw_from_service), key=lambda a: a.next_due or "", default=None)
    if due is not None:
        combined.next_due = due.next_due
        combined.interval_months = due.interval_months
        combined.next_due_basis = f"{due.subject}: {due.next_due_basis}"
    return records, combined
