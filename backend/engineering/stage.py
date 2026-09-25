"""The engineering stage of a run, kept out of the orchestrator's body.

It finds an inspection record in the run's evidence, assesses it with the
registered formulas, turns the records into citable ``C`` evidence, and
writes the block the model is shown. The model is told the figures; it does
not produce them.
"""

from __future__ import annotations

import re
from typing import Any, Callable

from backend.core.schemas import (
    CalculationRecord,
    ConflictCandidate,
    ConflictRecord,
    EvidenceItem,
    IntegrityAssessment,
    Sensitivity,
)
from backend.engineering.assessment import assess_piping, assess_vessel
from backend.engineering.extraction import InputConflict, piping_inputs, vessel_inputs
from backend.engineering.formulas import BoundValue, output_value

_RANK = {Sensitivity.NORMAL: 0, Sensitivity.CONFIDENTIAL: 1, Sensitivity.SENSITIVE: 2, Sensitivity.RESTRICTED: 3}


def assess_with_conflicts(
    evidence: list[EvidenceItem],
    *,
    include_retrieved: bool = False,
    overrides: dict[str, BoundValue] | None = None,
) -> tuple[list[CalculationRecord], IntegrityAssessment, list[InputConflict]] | None:
    """A vessel assessment from attachments and scans, else a piping one.

    Retrieved knowledge-base passages are considered only for a request that
    is itself a calculation: a question that merely retrieves a survey record
    has not asked for its arithmetic.

    Where the sources disagree about an input a formula reads, nothing is
    calculated: the assessment is ``conflicted``, names the disputed inputs,
    and waits for a person to choose. ``overrides`` carries those choices.
    """
    vessel = vessel_inputs(evidence, overrides)
    if vessel is not None:
        blocking = vessel.blocking_conflicts
        if blocking:
            assessment = IntegrityAssessment(
                kind="vessel",
                subject=vessel.tag or "vessel",
                status="conflicted",
                report=vessel.report_no,
                conflicts=[conflict.field for conflict in blocking],
                source_evidence_ids=list(vessel.source_evidence_ids),
            )
            return [], assessment, vessel.conflicts
        records, assessment = assess_vessel(vessel)
        return records, assessment, vessel.conflicts
    pool = [item for item in evidence if item.kind in ("uploaded_file", "vision_extraction")]
    if include_retrieved:
        pool += [item for item in evidence if item.kind == "knowledge_base"]
    piping = piping_inputs(pool)
    if piping is not None:
        records, assessment = assess_piping(piping)
        return records, assessment, []
    return None


def assess_from_evidence(
    evidence: list[EvidenceItem], *, include_retrieved: bool = False
) -> tuple[list[CalculationRecord], IntegrityAssessment] | None:
    result = assess_with_conflicts(evidence, include_retrieved=include_retrieved)
    return None if result is None else (result[0], result[1])


# ---------------------------------------------------------------- conflicts
def _candidate(bound: BoundValue, name: str, evidence: list[EvidenceItem]) -> ConflictCandidate:
    recorded = bound.record(name)
    source = next((item for item in evidence if item.id == bound.evidence_id), None)
    return ConflictCandidate(
        value=recorded.value,
        stated=recorded.stated,
        unit=recorded.unit,
        evidence_id=bound.evidence_id,
        locator=bound.locator,
        source_document=source.source_document if source else None,
        source_text=bound.source_text,
    )


def conflict_records(
    conflicts: list[InputConflict],
    subject: str | None,
    evidence: list[EvidenceItem],
    existing: list[ConflictRecord],
) -> list[ConflictRecord]:
    """The run's conflicts, old and new, each with a stable K identifier.

    A conflict already on the task keeps its id and its resolution; one seen
    for the first time is numbered after the last.
    """
    records = list(existing)
    by_field = {record.field: record for record in records}
    counter = max((int(record.id[1:]) for record in records if record.id[1:].isdigit()), default=0)
    for conflict in conflicts:
        if conflict.field in by_field:
            continue
        counter += 1
        values = " vs ".join(value.stated or str(value.value) for value in conflict.values)
        record = ConflictRecord(
            id=f"K{counter}",
            kind="input",
            subject=subject,
            field=conflict.field,
            label=conflict.label,
            impact="high" if conflict.impact == "high" else "medium",
            status="unresolved",
            candidates=[_candidate(value, conflict.field, evidence) for value in conflict.values],
            note=(
                f"The sources disagree on {conflict.label} ({values}). "
                + (
                    "Every figure that depends on it is withheld until a person chooses."
                    if conflict.impact == "high"
                    else "No formula reads it, so the decision is not withheld, but the record is inconsistent."
                )
            ),
        )
        records.append(record)
        by_field[record.field] = record
    return records


_PROCEDURE_REVISION = re.compile(
    r"\b(SOP-[A-Z]{3}-\d{3})\s*,?\s*Rev(?:ision)?\.?\s*(\d+(?:\.\d+)*)", re.IGNORECASE
)


def revision_conflicts(
    evidence: list[EvidenceItem],
    active: dict[str, tuple[str, str]],
    existing: list[ConflictRecord],
) -> list[ConflictRecord]:
    """A record written against a procedure revision that is no longer in force.

    ``active`` maps a document code to (revision in force, its title). The
    conflict is resolved automatically in favour of the revision in force --
    that is the rule, not a judgement -- and recorded so a reader sees that
    the record and the procedure applied to it do not match.
    """
    records = list(existing)
    seen = {record.field for record in records}
    counter = max((int(record.id[1:]) for record in records if record.id[1:].isdigit()), default=0)
    for item in evidence:
        if item.kind not in ("uploaded_file", "vision_extraction"):
            continue
        for match in _PROCEDURE_REVISION.finditer(item.excerpt or ""):
            code, cited = match.group(1).upper(), match.group(2)
            if code not in active:
                continue
            current, title = active[code]
            field = f"revision:{code}"
            if cited == current or field in seen:
                continue
            seen.add(field)
            counter += 1
            in_force = next(
                (e for e in evidence if e.kind == "knowledge_base" and e.document_code == code
                 and (e.revision_status or "active") == "active"),
                None,
            )
            records.append(ConflictRecord(
                id=f"K{counter}",
                kind="revision",
                subject=code,
                field=field,
                label=f"{code} revision",
                impact="medium",
                status="auto_resolved",
                candidates=[
                    ConflictCandidate(
                        value=cited, stated=f"{code} Rev {cited}", evidence_id=item.id,
                        locator="procedure reference", source_document=item.source_document,
                        source_text=match.group(0),
                    ),
                    ConflictCandidate(
                        value=current, stated=f"{code} Rev {current} (in force)",
                        evidence_id=in_force.id if in_force else None,
                        locator="knowledge base · active revision", source_document=title,
                    ),
                ],
                note=(
                    f"{item.id} was written against {code} Rev {cited}, which is not the revision in "
                    f"force. The assessment applies Rev {current}; the record's own conclusions under "
                    f"Rev {cited} are not relied on."
                ),
            ))
    return records


def unresolved(conflicts: list[ConflictRecord]) -> list[ConflictRecord]:
    return [record for record in conflicts if record.status == "unresolved" and record.impact == "high"]


def _group(records: list[CalculationRecord]) -> list[tuple[str, list[CalculationRecord]]]:
    groups: dict[str, list[CalculationRecord]] = {}
    for record in records:
        groups.setdefault(record.subject or "calculation", []).append(record)
    # The decision last, after the per-location work it summarises.
    return sorted(groups.items(), key=lambda pair: pair[0].endswith("· decision"))


def register_evidence(
    records: list[CalculationRecord],
    assessment: IntegrityAssessment,
    evidence: list[EvidenceItem],
    add: Callable[[EvidenceItem], EvidenceItem],
) -> list[str]:
    """One C item per subject; every record learns which C item carries it."""
    sources = [item for item in evidence if item.id in set(assessment.source_evidence_ids)]
    classification = max(
        (item.classification for item in sources), key=lambda level: _RANK.get(level, 0),
        default=Sensitivity.NORMAL,
    )
    ids: list[str] = []
    for subject, group in _group(records):
        lines = []
        for record in group:
            if record.status == "calculated":
                lines.append(f"{record.title}: {record.display}")
            else:
                lines.append(f"{record.title}: {record.reason}")
        item = add(EvidenceItem(
            id="pending",
            source_document="formula registry",
            location=subject,
            excerpt="; ".join(lines)[:2000],
            extraction_method="formula",
            extraction_model=", ".join(sorted({f"{r.formula_id}@{r.formula_version}" for r in group})),
            extraction_data={
                "result_hashes": [r.result_hash for r in group if r.result_hash],
                "inputs_from": sorted({i.evidence_id for r in group for i in r.inputs if i.evidence_id}),
            },
            classification=classification,
            kind="computation",
        ))
        for record in group:
            record.evidence_id = item.id
        ids.append(item.id)
    assessment.evidence_ids = ids
    return ids


def _decision_id(assessment: IntegrityAssessment, records: list[CalculationRecord]) -> str | None:
    for record in records:
        if (record.subject or "").endswith("· decision") and record.evidence_id:
            return record.evidence_id
    return assessment.evidence_ids[-1] if assessment.evidence_ids else None


def _location_id(assessment: IntegrityAssessment, records: list[CalculationRecord]) -> str | None:
    target = f"{assessment.subject} · {assessment.governing_location}"
    return next((r.evidence_id for r in records if r.subject == target and r.evidence_id), None)


def prompt_block(
    assessment: IntegrityAssessment | None,
    records: list[CalculationRecord],
    conflicts: list[ConflictRecord] | None = None,
) -> str:
    """What the model is told. Figures stated here are the only ones it may use."""
    conflicts_text = [
        f"{record.label} ("
        + " vs ".join(
            f"{candidate.stated} in [{candidate.evidence_id}]" if candidate.evidence_id else str(candidate.stated)
            for candidate in record.candidates
        )
        + f"; conflict {record.id})"
        for record in unresolved(conflicts or [])
    ]
    if assessment is None:
        return ""
    if assessment.status == "conflicted":
        return (
            "\nDeterministic engineering: CONFLICTED for "
            f"{assessment.subject}. The evidence disagrees about {', '.join(conflicts_text or assessment.conflicts)}. "
            "No corrosion rate, remaining life, severity or due date can be stated until a person resolves "
            "the conflict. Say that the sources disagree, name both values and their sources, say that the "
            "conclusion is withheld pending a human resolution, and do not choose between them.\n"
        )
    if assessment.status != "calculated":
        return (
            "\nDeterministic engineering: CANNOT CALCULATE for "
            f"{assessment.subject}. Missing from the evidence: {', '.join(assessment.missing) or 'required inputs'}. "
            "Say plainly that these figures cannot be calculated from the evidence provided, name what is "
            "missing, and do not estimate them.\n"
        )
    lines = [
        "",
        "Deterministic engineering results. These were computed by registered formulas from the evidence, "
        "not by you. State these figures exactly as given, cite the bracketed identifier, and never "
        "recompute them, round them differently or add figures of your own.",
        *decision_lines(assessment, records),
    ]
    for record in conflicts or []:
        if record.kind == "revision":
            lines.append(f"Procedure revision: {record.note}")
    others = []
    for record in records:
        if record.formula_id == "integrity.remaining_life" and record.status == "calculated":
            location = (record.subject or "").split(" · ", 1)[-1]
            if location != assessment.governing_location:
                life = output_value(record, "remaining_life")
                others.append(f"{location} {life:g} years" if life is not None else f"{location} not limited")
    if others:
        lines.append("Remaining life at the other locations: " + "; ".join(others) + ".")
    return "\n".join(lines) + "\n"


def decision_lines(assessment: IntegrityAssessment, records: list[CalculationRecord]) -> list[str]:
    """The calculated decision as cited sentences, one per finding."""
    decision = _decision_id(assessment, records)
    governing = _location_id(assessment, records)
    lines = [
        f"[{governing or decision}] {assessment.subject}: governing location {assessment.governing_location}; "
        f"governing corrosion rate {assessment.governing_rate_mm_yr:g} mm/year ({assessment.governing_rate_is} governs); "
        f"remaining life {assessment.remaining_life_years:g} years"
        + (" (at or below t-min now, not a time left to run)." if assessment.remaining_life_years <= 0 else ".")
        if assessment.remaining_life_years is not None
        else f"[{governing or decision}] {assessment.subject}: governing location {assessment.governing_location}; "
        "no measurable corrosion, so remaining life is not limited by corrosion.",
    ]
    if assessment.severity:
        lines.append(
            f"[{decision}] Severity {assessment.severity.capitalize()}. Basis: {assessment.severity_basis}. "
            f"Required action: {assessment.required_action}. Approving authority: {assessment.approver}."
        )
    authority = authority_statement(assessment)
    if authority:
        lines.append(f"[{decision}] {authority}")
    if assessment.locations_below_t_min:
        lines.append(f"[{decision}] Below t-min: {', '.join(assessment.locations_below_t_min)}.")
    if assessment.ffs_triggers:
        lines.append(f"[{decision}] Fitness-For-Service triggers: {'; '.join(assessment.ffs_triggers)}.")
    elif assessment.kind == "vessel":
        lines.append(f"[{decision}] No Fitness-For-Service trigger applies "
                     f"(local metal loss {assessment.local_metal_loss_percent:g}% of nominal).")
    if assessment.withdraw_from_service:
        # Never a routine date for equipment that is out of service: "next
        # survey in 12 months" read as permission to run for 12 months.
        lines.append(
            f"[{decision}] {assessment.subject} is below minimum thickness and is withdrawn from service; "
            "no routine inspection interval applies. "
            + (assessment.next_due_basis or f"Required action: {assessment.required_action}.")
        )
    elif assessment.next_due:
        lines.append(f"[{decision}] Next {'thickness survey' if assessment.kind == 'vessel' else 'measurement'} "
                     f"due {assessment.next_due} ({assessment.next_due_basis}).")
    return lines


def authority_statement(assessment: IntegrityAssessment) -> str | None:
    """Who recommends and who approves, and that the workbench is neither.

    SOP-OPS-008 Clause 2 names a recommending officer and an approving
    authority for each decision. A run that only said "approving authority:
    Head of Inspection + Plant Manager" let an answer, or a reader, take the
    recommendation the workbench drafts for the approval itself.
    """
    if not assessment.approved_by:
        return None
    recommend = (
        f"recommended by the {' and the '.join(assessment.recommended_by)}"
        if assessment.recommended_by else "no recommendation required"
    )
    return (
        f"Under SOP-OPS-008 this finding is {recommend}, and approved by the "
        f"{' and the '.join(assessment.approved_by)}. AEGIS prepares the recommendation only; "
        "it takes effect when the approving authority signs it."
    )


def as_deliverable_calculations(records: list[CalculationRecord]) -> list[dict[str, Any]]:
    """The shape the document renderer's Calculations section reads."""
    rows: list[dict[str, Any]] = []
    for record in records:
        if record.status != "calculated" or record.formula_id in ("integrity.below_t_min", "time.years_between"):
            continue
        primary = next(iter(record.outputs.items()), None)
        if primary is None:
            continue
        name, entry = primary
        if entry.get("value") is None and output_value(record, "withdraw_from_service"):
            # A withdrawn vessel has no interval; say so, not "None months".
            entry = {"value": "none: withdrawn from service", "unit": ""}
        rows.append({
            "label": f"{record.title} — {record.subject}" if record.subject else record.title,
            "expression": record.display or record.expression,
            "recomputed": entry.get("value"),
            "units": entry.get("unit") or "",
            "matched": True,
            "source": f"{record.formula_id}@{record.formula_version} [{record.evidence_id}]",
        })
    return rows
