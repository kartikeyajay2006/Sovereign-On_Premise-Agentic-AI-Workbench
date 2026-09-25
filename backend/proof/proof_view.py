"""One run's chain of custody, top to bottom, as the record states it.

Proof Mode puts ten links on one screen: the request, how it was
classified, what policy decided, which models served it, the evidence it
used, the formulas that computed its figures, the claims in its answer,
their verification, the approval and the signed certificate. Every row is
copied from the run record or from the certificate on disk. A link the run
never reached, or that did not apply to it, is returned empty with the
reason -- "No formula applied" -- and never filled in with something that
reads as a result.

The certificate is verified here, read-only: its signature, the key it was
signed with, the audit root and inclusion proofs, the log it was sealed
over, and the deliverable bytes it names. Nothing is issued, sealed or
audited by reading this view; a run that has no certificate says so.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from backend.core.audit import AuditLog
from backend.core.schemas import Task
from backend.proof.certificate import review_digest, verify_certificate

#: ok: the link holds; attention: it holds but waits on a person or carries
#: a caveat; fail: it did not hold; none: there is nothing recorded for it.
Tone = Literal["ok", "attention", "fail", "none"]


class ProofFact(BaseModel):
    label: str
    value: str
    #: Hashes, ids and figures are set in mono so they can be compared by eye.
    mono: bool = False


class ProofEntry(BaseModel):
    """One item inside a link: an evidence item, a claim, a check."""

    id: str | None = None
    title: str
    detail: str | None = None
    meta: list[str] = Field(default_factory=list)
    tone: Tone = "none"


class ProofRow(BaseModel):
    key: str
    label: str
    tone: Tone
    #: One line saying what this link came to, or None when it is empty.
    summary: str | None = None
    #: Why the link is empty. Set exactly when there is nothing recorded.
    empty: str | None = None
    facts: list[ProofFact] = Field(default_factory=list)
    entries: list[ProofEntry] = Field(default_factory=list)


class ProofView(BaseModel):
    task_id: str
    status: str
    prompt: str
    created_at: str
    completed_at: str | None = None
    parent_task_id: str | None = None
    rows: list[ProofRow]


def _value(item: Any) -> str:
    return str(getattr(item, "value", item))


def _short(digest: str | None, length: int = 16) -> str:
    return f"{digest[:length]}…" if digest and len(digest) > length else (digest or "")


# ------------------------------------------------------------------- links
def _request(task: Task) -> ProofRow:
    facts = [
        ProofFact(label="Submitted by", value=task.user_display_name or task.user_id),
        ProofFact(label="Received", value=task.created_at.isoformat(), mono=True),
    ]
    if task.skill:
        facts.append(ProofFact(label="Skill", value=f"/{task.skill.id} · {_short(task.skill.sha256, 12)}", mono=True))
        facts.append(ProofFact(label="Typed", value=task.skill.input))
    if task.preferred_model:
        facts.append(ProofFact(label="Model requested", value=task.preferred_model, mono=True))
    entries = [
        ProofEntry(
            id=stored.id,
            title=stored.filename,
            detail=f"sha256 {stored.sha256}",
            meta=[_value(stored.input_type), _value(stored.classification), f"{stored.size_bytes} bytes"],
        )
        for stored in task.files
    ]
    return ProofRow(
        key="request", label="Request", tone="ok",
        summary=task.prompt, facts=facts, entries=entries,
    )


def _classification(task: Task) -> ProofRow:
    profile = task.profile
    if profile is None:
        return ProofRow(key="classification", label="Classification", tone="none",
                        empty="The run was not classified.")
    return ProofRow(
        key="classification", label="Classification", tone="ok",
        summary=f"{_value(profile.task_type).replace('_', ' ')} · {_value(profile.sensitivity)}",
        facts=[
            ProofFact(label="Input", value=_value(profile.input_type)),
            ProofFact(label="Complexity", value=_value(profile.complexity)),
            ProofFact(label="Sensitivity", value=_value(profile.sensitivity)),
            ProofFact(label="Confidence", value=f"{profile.confidence:.2f}", mono=True),
        ],
        entries=[ProofEntry(title=reason) for reason in profile.reasons],
    )


def _policy(task: Task) -> ProofRow:
    approval = task.approval
    events = task.policy_events
    if approval is None and not events:
        return ProofRow(key="policy", label="Policy", tone="none",
                        empty="No policy decision was recorded for this run.")
    denied = [event for event in events if _value(event.decision) == "deny"]
    facts: list[ProofFact] = []
    if approval is not None:
        facts.append(ProofFact(
            label="Human approval",
            value=("required · " + " or ".join(r.replace("_", " ") for r in approval.approver_roles))
            if approval.required else "not required",
        ))
    facts.append(ProofFact(label="Policy checks", value=f"{len(events)} recorded, {len(denied)} denied", mono=True))
    entries = [ProofEntry(title=reason, tone="attention") for reason in (approval.reasons if approval else [])]
    entries.extend(
        ProofEntry(
            title=f"{event.subject} · {event.action}",
            detail=event.reason,
            meta=[_value(event.decision)] + ([event.rule] if event.rule else []),
            tone="fail" if _value(event.decision) == "deny" else "ok",
        )
        for event in events
    )
    if denied:
        tone: Tone = "fail"
        summary = f"{len(denied)} request(s) denied by policy"
    elif approval is not None and approval.required:
        tone, summary = "attention", "Human approval required"
    else:
        tone, summary = "ok", "Allowed without human approval"
    return ProofRow(key="policy", label="Policy", tone=tone, summary=summary, facts=facts, entries=entries)


def _routing(task: Task) -> ProofRow:
    if not task.routing:
        return ProofRow(key="routing", label="Model routing", tone="none",
                        empty="No model was routed for this run.")
    # The digest is what the runtime reported for the model when it served
    # the call. Runs recorded before digests were kept on usage have none.
    digests = {usage.model: usage.model_digest for usage in task.usage if getattr(usage, "model_digest", None)}
    calls: dict[str, int] = {}
    for usage in task.usage:
        calls[usage.model] = calls.get(usage.model, 0) + 1
    entries = []
    for decision in task.routing:
        model = decision.selected_model
        meta = [f"rule {decision.rule}"]
        if decision.used_fallback:
            meta.append("fallback")
        if model and model in digests:
            meta.append(f"digest {_short(digests[model], 12)}")
        elif model:
            meta.append("digest not recorded")
        if decision.preferred_model:
            meta.append(
                f"requested {decision.preferred_model}: "
                + ("honoured" if decision.preference_honoured else f"declined ({decision.preference_reason})")
            )
        entries.append(ProofEntry(
            title=f"{(decision.stage or _value(decision.requested_role)).replace('_', ' ')}: "
                  f"{decision.selected_display_name or model or 'no eligible model'}",
            detail=decision.reason,
            meta=meta,
            tone="ok" if model else "fail",
        ))
    models = sorted({d.selected_model for d in task.routing if d.selected_model})
    return ProofRow(
        key="routing", label="Model routing", tone="ok" if models else "fail",
        summary=", ".join(models) if models else "No eligible model",
        facts=[ProofFact(label="Model calls", value=str(len(task.usage)), mono=True)]
        + [ProofFact(label=model, value=f"{count} call(s)", mono=True) for model, count in sorted(calls.items())],
        entries=entries,
    )


def _evidence(task: Task) -> ProofRow:
    if not task.evidence:
        return ProofRow(key="evidence", label="Evidence", tone="none",
                        empty="No evidence was retrieved or attached for this run.")
    entries = []
    for item in task.evidence:
        meta = [item.kind.replace("_", " ")]
        if item.location:
            meta.append(item.location)
        if item.page_number is not None:
            meta.append(f"page {item.page_number}")
        if item.document_code:
            meta.append(f"{item.document_code} {item.version or ''} {item.revision_status or ''}".strip())
        if item.source_sha256:
            meta.append(f"sha256 {_short(item.source_sha256, 12)}")
        superseded = item.revision_status == "superseded"
        entries.append(ProofEntry(
            id=item.id, title=item.source_document, detail=item.excerpt[:280],
            meta=meta, tone="attention" if superseded else "ok",
        ))
    kinds: dict[str, int] = {}
    for item in task.evidence:
        kinds[item.kind] = kinds.get(item.kind, 0) + 1
    return ProofRow(
        key="evidence", label="Evidence", tone="ok",
        summary=", ".join(item.id for item in task.evidence),
        facts=[ProofFact(label=kind.replace("_", " "), value=str(count), mono=True) for kind, count in sorted(kinds.items())],
        entries=entries,
    )


def _formula(task: Task) -> ProofRow:
    if not task.calculations and task.assessment is None and not task.conflicts:
        return ProofRow(key="formula", label="Formula", tone="none", empty="No formula applied.")
    entries = [
        ProofEntry(
            id=record.evidence_id,
            title=f"{record.title}{f' · {record.subject}' if record.subject else ''}",
            detail=record.display or record.reason
            or (f"missing: {', '.join(record.missing)}" if record.missing else None),
            meta=[f"{record.formula_id}@{record.formula_version}", record.status.replace("_", " ")]
            + ([f"result {_short(record.result_hash, 12)}"] if record.result_hash else []),
            tone="ok" if record.status == "calculated" else "attention",
        )
        for record in task.calculations
    ]
    entries.extend(
        ProofEntry(
            id=conflict.id,
            title=f"Conflict: {conflict.label}",
            detail=(
                f"resolved by {conflict.resolution.resolved_by_name}: {conflict.resolution.stated}"
                if conflict.resolution else conflict.note
            ),
            meta=[conflict.kind, conflict.status.replace("_", " "), f"{len(conflict.candidates)} sources"],
            tone="attention" if conflict.status == "unresolved" else "ok",
        )
        for conflict in task.conflicts
    )
    facts: list[ProofFact] = []
    assessment = task.assessment
    tone: Tone = "ok"
    summary = f"{sum(1 for r in task.calculations if r.status == 'calculated')} of {len(task.calculations)} calculated"
    if assessment is not None:
        if assessment.governing_rate_mm_yr is not None:
            facts.append(ProofFact(label="Governing corrosion rate",
                                   value=f"{assessment.governing_rate_mm_yr} mm/year", mono=True))
        if assessment.remaining_life_years is not None:
            facts.append(ProofFact(label="Remaining life", value=f"{assessment.remaining_life_years} years", mono=True))
        if assessment.severity:
            facts.append(ProofFact(label="Severity", value=assessment.severity))
        if assessment.status != "calculated":
            tone = "attention"
            summary = f"{assessment.subject}: {assessment.status.replace('_', ' ')}"
    return ProofRow(key="formula", label="Formula", tone=tone, summary=summary, facts=facts, entries=entries)


def _claims(task: Task) -> ProofRow:
    claims = task.verification.claims if task.verification else []
    if not claims:
        return ProofRow(
            key="claim", label="Claim", tone="none",
            empty="No material claims were recorded." if task.verification
            else "The answer was not verified, so no claims were extracted.",
        )
    counts: dict[str, int] = {}
    for claim in claims:
        counts[claim.verdict] = counts.get(claim.verdict, 0) + 1
    good = {"SUPPORTED", "CALCULATED"}
    tone: Tone = "ok" if all(c.verdict in good for c in claims) else (
        "fail" if any(c.verdict == "UNSUPPORTED" for c in claims) else "attention")
    return ProofRow(
        key="claim", label="Claim", tone=tone,
        summary=" · ".join(f"{count} {verdict.lower().replace('_', ' ')}" for verdict, count in sorted(counts.items())),
        entries=[
            ProofEntry(
                id=claim.id, title=claim.text, detail=claim.reason,
                meta=[claim.verdict, claim.kind] + ([", ".join(claim.evidence_ids)] if claim.evidence_ids else []),
                tone="ok" if claim.verdict in good else "fail" if claim.verdict == "UNSUPPORTED" else "attention",
            )
            for claim in claims
        ],
    )


def _verification(task: Task) -> ProofRow:
    report = task.verification
    if report is None:
        return ProofRow(key="verification", label="Verification", tone="none",
                        empty="The run did not reach verification.")
    passed = sum(1 for check in report.checks if check.passed)
    return ProofRow(
        key="verification", label="Verification", tone="ok" if report.valid else "fail",
        summary=f"{'Valid' if report.valid else 'Not valid'} · {passed} of {len(report.checks)} checks passed",
        facts=[
            ProofFact(label="Material claims", value=f"{report.material_claims_supported} of "
                      f"{report.material_claims_total} supported", mono=True),
            ProofFact(label="Completed", value=report.completed_at.isoformat(), mono=True),
        ],
        entries=[
            ProofEntry(title=check.name, detail=check.detail, meta=[check.kind] + check.warnings,
                       tone="ok" if check.passed else "fail")
            for check in report.checks
        ] + [ProofEntry(title=limitation, tone="attention") for limitation in report.limitations],
    )


def _approval(task: Task) -> ProofRow:
    approval = task.approval
    if approval is None:
        return ProofRow(key="approval", label="Approval", tone="none",
                        empty="No approval record exists for this run.")
    if not approval.required and approval.decision is None:
        return ProofRow(key="approval", label="Approval", tone="ok",
                        summary="Not required by policy; released without a reviewer")
    facts = [ProofFact(label="Approving roles",
                       value=", ".join(r.replace("_", " ") for r in approval.approver_roles) or "any")]
    decision = approval.decision or "pending"
    if approval.reviewer_name:
        facts.append(ProofFact(label="Reviewer", value=approval.reviewer_name))
    if approval.decided_at:
        facts.append(ProofFact(label="Decided", value=approval.decided_at.isoformat(), mono=True))
    if approval.comment:
        facts.append(ProofFact(label="Comment", value=approval.comment))
    current = review_digest(task)
    if approval.bound_digest:
        facts.append(ProofFact(label="Bound to digest", value=approval.bound_digest, mono=True))
        facts.append(ProofFact(
            label="Run since decision",
            value="unchanged: the digest still matches" if approval.bound_digest == current
            else f"changed: the run now digests to {_short(current, 12)}",
        ))
    tone: Tone = {"approved": "ok", "rejected": "fail"}.get(decision, "attention")  # type: ignore[assignment]
    if approval.bound_digest and approval.bound_digest != current:
        tone = "fail"
    by = f" by {approval.reviewer_name}" if approval.reviewer_name else ""
    return ProofRow(key="approval", label="Approval", tone=tone,
                    summary=f"{decision.replace('_', ' ').capitalize()}{by}", facts=facts)


def _certificate(certificate: dict[str, Any] | None, verification: dict[str, Any] | None, status: str) -> ProofRow:
    if certificate is None:
        return ProofRow(
            key="certificate", label="Signed certificate", tone="none",
            empty=(
                f"No certificate has been issued. Certificates are issued for finished runs; this one is {status}."
                if status not in ("delivered", "rejected", "revision_requested", "awaiting_approval")
                else "No certificate is stored for this run. Opening its certificate issues one."
            ),
        )
    signature = certificate.get("signature") or {}
    root = (certificate.get("audit") or {}).get("root") or {}
    facts = [
        ProofFact(label="Issued", value=str(certificate.get("issued_at")), mono=True),
        ProofFact(label="Format version", value=str(certificate.get("version")), mono=True),
        ProofFact(label="Content sha256", value=str(certificate.get("content_sha256")), mono=True),
        ProofFact(label="Signing key", value=f"{signature.get('algorithm', 'Ed25519')} · {signature.get('key_id')}", mono=True),
        ProofFact(label="Audit root", value=f"{root.get('merkle_root')} over {root.get('events')} events", mono=True),
    ]
    # Provenance arrived with certificate format 2. It is shown field for
    # field when the certificate carries it, and not mentioned when it does
    # not: an older certificate is not missing anything it ever claimed.
    provenance = (certificate.get("run") or {}).get("provenance")
    if isinstance(provenance, dict):
        for key, value in provenance.items():
            text = value if isinstance(value, str) else json.dumps(value, sort_keys=True, default=str)
            facts.append(ProofFact(label=f"Provenance · {key.replace('_', ' ')}", value=text, mono=True))
    entries = [
        ProofEntry(title=check["name"], detail=check["detail"],
                   tone="ok" if check["passed"] else "fail")
        for check in (verification or {}).get("checks", [])
    ]
    valid = bool(verification and verification.get("valid"))
    failed = [c["name"] for c in (verification or {}).get("checks", []) if not c["passed"]]
    return ProofRow(
        key="certificate", label="Signed certificate", tone="ok" if valid else "fail",
        summary="Verified: every check passed" if valid else f"Not verified: {', '.join(failed)} failed",
        facts=facts, entries=entries,
    )


# -------------------------------------------------------------------- view
def stored_certificate(task_id: str, storage_root: Path) -> dict[str, Any] | None:
    path = storage_root / "proofs" / f"{task_id}.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def build_proof_view(
    task: Task,
    *,
    storage_root: Path,
    trusted_key_b64: str,
    audit: AuditLog,
    deliverables_dir: Path,
) -> ProofView:
    certificate = stored_certificate(task.id, storage_root)
    verification = (
        verify_certificate(certificate, trusted_key_b64=trusted_key_b64, audit=audit, deliverables_dir=deliverables_dir)
        if certificate is not None else None
    )
    status = _value(task.status)
    return ProofView(
        task_id=task.id,
        status=status,
        prompt=task.prompt,
        created_at=task.created_at.isoformat(),
        completed_at=task.completed_at.isoformat() if task.completed_at else None,
        parent_task_id=getattr(task, "parent_task_id", None),
        rows=[
            _request(task),
            _classification(task),
            _policy(task),
            _routing(task),
            _evidence(task),
            _formula(task),
            _claims(task),
            _verification(task),
            _approval(task),
            _certificate(certificate, verification, status),
        ],
    )
