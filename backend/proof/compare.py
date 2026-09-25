"""Two runs side by side, with every material difference named.

Re-running a request is only useful for audit if the second run can be read
against the first: which model and weights served each stage, which policy
applied, which formula versions computed, which evidence was used, which
figures moved and whether verification or approval came out differently.
Every row here is read from the two run records and, where a certificate is
stored, from its provenance block. A property neither run recorded is
listed once as "not recorded", so its absence is visible rather than read
as "unchanged".
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Iterable

from pydantic import BaseModel, Field

from backend.core.schemas import Task

NOT_RECORDED = "not recorded"


class CompareSide(BaseModel):
    task_id: str
    status: str
    prompt: str
    created_at: str
    parent_task_id: str | None = None
    duration_ms: int | None = None
    answer: str | None = None


class Change(BaseModel):
    #: Configuration (what the run was given) or outcome (what it produced).
    group: str
    label: str
    a: str
    b: str
    changed: bool
    note: str | None = None


class EvidenceDiff(BaseModel):
    only_a: list[str] = Field(default_factory=list)
    only_b: list[str] = Field(default_factory=list)
    common: int = 0


class RunComparison(BaseModel):
    a: CompareSide
    b: CompareSide
    #: One run is a re-run of the other.
    linked: bool
    changes: list[Change]
    evidence: EvidenceDiff
    #: How many rows differ.
    changed: int


def _value(item: Any) -> str:
    return str(getattr(item, "value", item))


def _sha(text: str | None) -> str | None:
    return hashlib.sha256(text.encode("utf-8")).hexdigest() if text else None


def _text(value: Any) -> str:
    if value is None or value == "" or value == [] or value == {}:
        return NOT_RECORDED
    if isinstance(value, (list, tuple, set)):
        return ", ".join(str(item) for item in value)
    if isinstance(value, dict):
        return json.dumps(value, sort_keys=True, default=str)
    return str(value)


class _Rows:
    def __init__(self) -> None:
        self.rows: list[Change] = []

    def add(self, group: str, label: str, a: Any, b: Any, note: str | None = None) -> None:
        left, right = _text(a), _text(b)
        self.rows.append(Change(group=group, label=label, a=left, b=right, changed=left != right, note=note))


def _stage_models(task: Task) -> dict[str, str]:
    models: dict[str, str] = {}
    for decision in task.routing:
        stage = decision.stage or _value(decision.requested_role)
        models[stage] = decision.selected_model or "no eligible model"
    return models


def _digests(task: Task) -> dict[str, str]:
    return {usage.model: usage.model_digest for usage in task.usage if getattr(usage, "model_digest", None)}


def _evidence_keys(task: Task) -> dict[str, str]:
    """Evidence by what it is, not its id: S1 in one run need not be S1 in the next."""
    keys: dict[str, str] = {}
    for item in task.evidence:
        where = f" ({item.location})" if item.location else ""
        keys[f"{item.kind}|{item.source_document}|{_sha(item.excerpt)}"] = f"{item.source_document}{where}"
    return keys


def _figures(task: Task) -> dict[str, str]:
    figures = {
        f"{record.formula_id} · {record.subject or '—'}": record.display or record.status.replace("_", " ")
        for record in task.calculations
    }
    assessment = task.assessment
    if assessment is not None:
        for field in ("status", "governing_rate_mm_yr", "remaining_life_years", "t_min_mm", "severity", "next_due"):
            value = getattr(assessment, field)
            if value is not None:
                figures[f"{assessment.subject} · {field.replace('_', ' ')}"] = str(value)
    return figures


def _union(*keys: Iterable[str]) -> list[str]:
    seen: dict[str, None] = {}
    for group in keys:
        for key in group:
            seen[key] = None
    return list(seen)


def compare_runs(
    a: Task,
    b: Task,
    *,
    certificate_a: dict[str, Any] | None = None,
    certificate_b: dict[str, Any] | None = None,
) -> RunComparison:
    rows = _Rows()
    config, outcome = "Configuration", "Outcome"

    # -- what each run was given ------------------------------------------
    rows.add(config, "Request", _sha(a.prompt), _sha(b.prompt), "SHA-256 of the prompt the pipeline saw")
    rows.add(config, "Input files", sorted(f"{f.filename}:{f.sha256[:12]}" for f in a.files),
             sorted(f"{f.filename}:{f.sha256[:12]}" for f in b.files))
    rows.add(config, "Skill", f"/{a.skill.id}@{a.skill.sha256[:12]}" if a.skill else None,
             f"/{b.skill.id}@{b.skill.sha256[:12]}" if b.skill else None)
    rows.add(config, "Model requested", a.preferred_model or "automatic", b.preferred_model or "automatic")
    rows.add(config, "Classification",
             f"{_value(a.profile.task_type)} · {_value(a.profile.sensitivity)}" if a.profile else None,
             f"{_value(b.profile.task_type)} · {_value(b.profile.sensitivity)}" if b.profile else None)

    models_a, models_b = _stage_models(a), _stage_models(b)
    for stage in _union(models_a, models_b):
        rows.add(config, f"Model · {stage.replace('_', ' ')}", models_a.get(stage, "not routed"),
                 models_b.get(stage, "not routed"))
    digests_a, digests_b = _digests(a), _digests(b)
    for model in _union(sorted(set(models_a.values()) | set(models_b.values()))):
        if model == "no eligible model":
            continue
        rows.add(config, f"Model digest · {model}", digests_a.get(model), digests_b.get(model),
                 "as the runtime reported it when the call was made")

    rows.add(config, "Approval rule",
             ("required · " + " or ".join(a.approval.approver_roles)) if a.approval and a.approval.required
             else "not required" if a.approval else None,
             ("required · " + " or ".join(b.approval.approver_roles)) if b.approval and b.approval.required
             else "not required" if b.approval else None)
    rows.add(config, "Approval reasons", sorted(a.approval.reasons) if a.approval else None,
             sorted(b.approval.reasons) if b.approval else None)
    rows.add(config, "Policy rules applied",
             sorted({f"{e.rule}:{_value(e.decision)}" for e in a.policy_events if e.rule}),
             sorted({f"{e.rule}:{_value(e.decision)}" for e in b.policy_events if e.rule}))
    rows.add(config, "Formula versions",
             sorted({f"{r.formula_id}@{r.formula_version}:{r.formula_hash[:12]}" for r in a.calculations}),
             sorted({f"{r.formula_id}@{r.formula_version}:{r.formula_hash[:12]}" for r in b.calculations}))

    # Policy, prompt and configuration versions are recorded on a run only
    # through its certificate's provenance block (format 2). Where neither
    # certificate carries one, that is said once rather than implied equal.
    provenance_a = ((certificate_a or {}).get("run") or {}).get("provenance") or {}
    provenance_b = ((certificate_b or {}).get("run") or {}).get("provenance") or {}
    if provenance_a or provenance_b:
        for key in _union(provenance_a, provenance_b):
            rows.add(config, f"Provenance · {key.replace('_', ' ')}", provenance_a.get(key), provenance_b.get(key),
                     "from the run's signed certificate")
    else:
        rows.add(config, "Policy, prompt and config versions", None, None,
                 "neither run's certificate records provenance, so these cannot be compared")

    # -- what each run produced -------------------------------------------
    keys_a, keys_b = _evidence_keys(a), _evidence_keys(b)
    only_a = [keys_a[k] for k in keys_a if k not in keys_b]
    only_b = [keys_b[k] for k in keys_b if k not in keys_a]
    common = len(set(keys_a) & set(keys_b))
    rows.add(outcome, "Evidence set", f"{len(keys_a)} item(s)", f"{len(keys_b)} item(s)",
             f"{common} in both, {len(only_a)} only in A, {len(only_b)} only in B")
    if (only_a or only_b) and rows.rows[-1].a == rows.rows[-1].b:
        rows.rows[-1].changed = True

    figures_a, figures_b = _figures(a), _figures(b)
    for key in _union(figures_a, figures_b):
        rows.add(outcome, f"Figure · {key}", figures_a.get(key), figures_b.get(key))
    rows.add(outcome, "Recommendation", a.assessment.required_action if a.assessment else None,
             b.assessment.required_action if b.assessment else None)
    rows.add(outcome, "Conflicts", sorted(f"{c.label}:{c.status}" for c in a.conflicts),
             sorted(f"{c.label}:{c.status}" for c in b.conflicts))

    def verdicts(task: Task) -> str | None:
        if not task.verification:
            return None
        counts: dict[str, int] = {}
        for claim in task.verification.claims:
            counts[claim.verdict] = counts.get(claim.verdict, 0) + 1
        return ", ".join(f"{n} {v}" for v, n in sorted(counts.items())) or "no claims"

    rows.add(outcome, "Verification", ("valid" if a.verification.valid else "not valid") if a.verification else None,
             ("valid" if b.verification.valid else "not valid") if b.verification else None)
    rows.add(outcome, "Claim verdicts", verdicts(a), verdicts(b))
    checks_a = {c.name: c.passed for c in a.verification.checks} if a.verification else {}
    checks_b = {c.name: c.passed for c in b.verification.checks} if b.verification else {}
    for name in _union(checks_a, checks_b):
        left = checks_a.get(name)
        right = checks_b.get(name)
        if left is not None and right is not None and left == right:
            continue  # unchanged checks are summarised by the verdict rows above
        rows.add(outcome, f"Check · {name}", None if left is None else ("passed" if left else "failed"),
                 None if right is None else ("passed" if right else "failed"))
    rows.add(outcome, "Approval", a.approval.decision if a.approval and a.approval.decision else None,
             b.approval.decision if b.approval and b.approval.decision else None)
    rows.add(outcome, "Status", _value(a.status), _value(b.status))
    rows.add(outcome, "Answer", _sha(a.answer), _sha(b.answer), "SHA-256 of the answer; both texts are below")
    rows.add(outcome, "Deliverables", sorted(f"{d.filename}:{d.sha256[:12]}" for d in a.deliverables),
             sorted(f"{d.filename}:{d.sha256[:12]}" for d in b.deliverables))
    rows.add(outcome, "Run duration", f"{a.duration_ms} ms" if a.duration_ms is not None else None,
             f"{b.duration_ms} ms" if b.duration_ms is not None else None, "wall clock; varies between runs")
    rows.add(outcome, "Model time", f"{sum(u.latency_ms for u in a.usage)} ms over {len(a.usage)} call(s)"
             if a.usage else None,
             f"{sum(u.latency_ms for u in b.usage)} ms over {len(b.usage)} call(s)" if b.usage else None)

    def side(task: Task) -> CompareSide:
        return CompareSide(task_id=task.id, status=_value(task.status), prompt=task.prompt,
                           created_at=task.created_at.isoformat(), parent_task_id=task.parent_task_id,
                           duration_ms=task.duration_ms, answer=task.answer)

    return RunComparison(
        a=side(a), b=side(b),
        linked=b.parent_task_id == a.id or a.parent_task_id == b.id,
        changes=rows.rows,
        evidence=EvidenceDiff(only_a=only_a, only_b=only_b, common=common),
        changed=sum(1 for row in rows.rows if row.changed),
    )
