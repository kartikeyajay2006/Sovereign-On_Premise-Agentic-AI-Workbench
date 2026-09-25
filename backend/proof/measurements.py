"""Measurements: every figure the workbench can show about itself, with its source.

Nothing here is a benchmark claim written down in advance. Each metric is
computed, when the dashboard is read, from an artifact the backend itself
produced and kept:

- model usage records on the runs (latency, generation speed, load time),
  timed around each call by the orchestrator;
- verification reports and claim verdicts on the runs;
- the egress window the task service audits at the end of every run;
- the latest sandbox self-test, from the audit event it recorded;
- the latest red-team report in storage/reports, re-hashed on read;
- the stored run certificates, re-verified on read.

A metric with no artifact behind it is returned as ``skipped`` with the
reason, and carries no value. Golden-answer accuracy, retrieval top-k and
formula accuracy are skipped that way today: the workbench has no evaluator
that writes a report for them, and a figure without one would be a claim.
"""

from __future__ import annotations

import hashlib
import json
import re
import statistics
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from backend.core.audit import AuditLog
from backend.core.schemas import Task
from backend.proof.certificate import verify_certificate

#: What a red-team report file is called (scripts/red_team.py). Anything else
#: in storage/reports is not read, and is never served by name.
REPORT_NAME = re.compile(r"^red-team-\d{8}T\d{6}Z\.json$")


class MetricSource(BaseModel):
    """Where a figure came from, precisely enough to go and look."""

    kind: Literal["runs", "audit_event", "report_file", "certificates"]
    #: In words: "412 model calls in 37 runs", "red-team-20260925T101500Z.json".
    name: str
    #: A file under storage/, relative to it, when the source is a file.
    path: str | None = None
    sha256: str | None = None
    #: When the artifact was produced (the newest one, for a set).
    at: str | None = None
    #: The API route that returns the artifact itself.
    href: str | None = None
    #: Runs the figure was computed over, newest first, at most twenty.
    run_ids: list[str] = Field(default_factory=list)


class MetricPart(BaseModel):
    label: str
    display: str


class Metric(BaseModel):
    id: str
    group: str
    label: str
    status: Literal["measured", "skipped"]
    value: float | None = None
    unit: str | None = None
    #: The figure as it should read: "11.8 s median · 24.0 s p95".
    display: str | None = None
    #: What the figure is over: "412 calls".
    sample: str | None = None
    #: Why a skipped metric has no value; also a caveat on a measured one.
    reason: str | None = None
    #: good: the control held; bad: it did not; None: a figure, not a verdict.
    verdict: Literal["good", "bad"] | None = None
    source: MetricSource | None = None
    breakdown: list[MetricPart] = Field(default_factory=list)


class Measurements(BaseModel):
    generated_at: str
    #: "all runs" for a role holding task.read.all, "your runs" otherwise.
    scope: str
    runs_considered: int
    metrics: list[Metric]


# ------------------------------------------------------------------ helpers
def _seconds(ms: float) -> str:
    return f"{ms / 1000:.1f} s" if ms >= 1000 else f"{ms:.0f} ms"


def _percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(fraction * (len(ordered) - 1))))
    return ordered[index]


def _skipped(metric_id: str, group: str, label: str, reason: str) -> Metric:
    return Metric(id=metric_id, group=group, label=label, status="skipped", reason=reason)


def _runs_source(name: str, tasks: list[Task]) -> MetricSource:
    newest = max((task.updated_at for task in tasks), default=None)
    return MetricSource(
        kind="runs", name=name, at=newest.isoformat() if newest else None,
        run_ids=[task.id for task in sorted(tasks, key=lambda t: t.created_at, reverse=True)[:20]],
    )


# ---------------------------------------------------------------- inference
def _latency(metric_id: str, label: str, tasks: list[Task], stage: str | None, empty: str) -> Metric:
    samples: list[tuple[Task, float]] = [
        (task, float(usage.latency_ms))
        for task in tasks for usage in task.usage
        if not usage.cancelled and (stage is None or usage.stage == stage)
    ]
    if not samples:
        return _skipped(metric_id, "Inference", label, empty)
    values = [value for _, value in samples]
    runs = list({task.id: task for task, _ in samples}.values())
    by_model: dict[str, list[float]] = {}
    for task in runs:
        for usage in task.usage:
            if not usage.cancelled and (stage is None or usage.stage == stage):
                by_model.setdefault(usage.model, []).append(float(usage.latency_ms))
    median = statistics.median(values)
    return Metric(
        id=metric_id, group="Inference", label=label, status="measured",
        value=round(median), unit="ms",
        display=f"{_seconds(median)} median · {_seconds(_percentile(values, 0.95))} p95",
        sample=f"{len(values)} call(s)",
        reason="Wall clock around each call: queueing, model load, prompt and output.",
        source=_runs_source(f"model usage records: {len(values)} call(s) in {len(runs)} run(s)", runs),
        breakdown=[
            MetricPart(label=model, display=f"{_seconds(statistics.median(v))} median over {len(v)}")
            for model, v in sorted(by_model.items())
        ],
    )


def _usage_figure(
    metric_id: str, label: str, tasks: list[Task], field: str, unit: str, fmt, empty: str, note: str
) -> Metric:
    runs: dict[str, Task] = {}
    by_model: dict[str, list[float]] = {}
    for task in tasks:
        for usage in task.usage:
            value = getattr(usage, field)
            if value is None or usage.cancelled:
                continue
            runs[task.id] = task
            by_model.setdefault(usage.model, []).append(float(value))
    values = [v for group in by_model.values() for v in group]
    if not values:
        return _skipped(metric_id, "Inference", label, empty)
    median = statistics.median(values)
    return Metric(
        id=metric_id, group="Inference", label=label, status="measured",
        value=round(median, 1), unit=unit, display=f"{fmt(median)} median",
        sample=f"{len(values)} call(s)", reason=note,
        source=_runs_source(f"model usage records: {len(values)} call(s) in {len(runs)} run(s)", list(runs.values())),
        breakdown=[
            MetricPart(label=model, display=f"{fmt(statistics.median(v))} median over {len(v)}")
            for model, v in sorted(by_model.items())
        ],
    )


# ------------------------------------------------------------- verification
def _verification(tasks: list[Task]) -> list[Metric]:
    verified = [task for task in tasks if task.verification is not None]
    metrics: list[Metric] = []
    if not verified:
        metrics.append(_skipped("verification_valid", "Verification", "Runs passing verification",
                                "No run has reached verification yet."))
    else:
        valid = sum(1 for task in verified if task.verification.valid)
        metrics.append(Metric(
            id="verification_valid", group="Verification", label="Runs passing verification",
            status="measured", value=round(100 * valid / len(verified), 1), unit="%",
            display=f"{valid} / {len(verified)}", sample=f"{len(verified)} verified run(s)",
            source=_runs_source(f"verification reports on {len(verified)} run(s)", verified),
        ))
    counts: dict[str, int] = {}
    claimed = [task for task in verified if task.verification.claims]
    for task in claimed:
        for claim in task.verification.claims:
            counts[claim.verdict] = counts.get(claim.verdict, 0) + 1
    total = sum(counts.values())
    if not total:
        metrics.append(_skipped("claims_supported", "Verification", "Material claims supported or calculated",
                                "No verified run has recorded a material claim yet."))
    else:
        good = counts.get("SUPPORTED", 0) + counts.get("CALCULATED", 0)
        metrics.append(Metric(
            id="claims_supported", group="Verification", label="Material claims supported or calculated",
            status="measured", value=round(100 * good / total, 1), unit="%",
            display=f"{good} / {total}", sample=f"{total} claim(s) in {len(claimed)} run(s)",
            reason="A claim's verdict is the verifier's, not a comparison with a known right answer.",
            source=_runs_source(f"claim verdicts on {len(claimed)} run(s)", claimed),
            breakdown=[MetricPart(label=verdict, display=str(count)) for verdict, count in sorted(counts.items())],
        ))
    records = [(task, record) for task in tasks for record in task.calculations]
    if records:
        calculated = sum(1 for _, record in records if record.status == "calculated")
        runs = list({task.id: task for task, _ in records}.values())
        statuses: dict[str, int] = {}
        for _, record in records:
            statuses[record.status] = statuses.get(record.status, 0) + 1
        metrics.append(Metric(
            id="formula_evaluations", group="Verification", label="Formula evaluations calculated",
            status="measured", value=float(calculated), display=f"{calculated} / {len(records)}",
            sample=f"{len(records)} evaluation(s) in {len(runs)} run(s)",
            reason="How many registered-formula evaluations had every input; not their accuracy.",
            source=_runs_source(f"calculation records on {len(runs)} run(s)", runs),
            breakdown=[MetricPart(label=s.replace("_", " "), display=str(n)) for s, n in sorted(statuses.items())],
        ))
    return metrics


# ------------------------------------------------------------------ security
def _egress(tasks: list[Task], audit: AuditLog) -> Metric:
    label = "Unapproved egress during runs"
    in_scope = {task.id for task in tasks}
    events = [
        event for event in audit.query(category="task", limit=100_000)
        if event.action.startswith("finished:") and event.task_id in in_scope
    ]
    watched = [e for e in events if isinstance((e.detail.get("egress") or {}).get("unapproved_connections_observed"), int)]
    unwatched = len(events) - len(watched)
    if not watched:
        return _skipped(
            "egress_runs", "Security", label,
            "No run was watched by the egress monitor from start to finish"
            + (f" ({unwatched} run(s) ended with the monitor not running)." if unwatched else "."),
        )
    observed = sum(int(e.detail["egress"]["unapproved_connections_observed"]) for e in watched)
    newest = watched[0]
    return Metric(
        id="egress_runs", group="Security", label=label, status="measured", value=float(observed),
        display=f"{observed} over {len(watched)} watched run(s)", sample=f"{len(watched)} run(s)",
        verdict="good" if observed == 0 else "bad",
        reason=str(newest.detail["egress"].get("method") or "")
        + (f"; {unwatched} run(s) were not watched and are not counted" if unwatched else ""),
        source=MetricSource(kind="audit_event", name=f"{len(watched)} task finished event(s) in the audit log",
                            at=newest.at.isoformat(), href="/api/audit?category=task",
                            run_ids=[e.task_id for e in watched[:20] if e.task_id]),
    )


def _sandbox(audit: AuditLog) -> Metric:
    label = "Sandbox self-test"
    event = next((e for e in audit.query(category="security", limit=100_000) if e.action == "sandbox_self_test"), None)
    if event is None:
        return _skipped("sandbox_self_test", "Security", label,
                        "The sandbox self-test has not been run on this host. Run it from Assurance.")
    detail = event.detail
    source = MetricSource(kind="audit_event", name=f"audit event #{event.sequence}", sha256=event.hash,
                          at=event.at.isoformat(), href=f"/api/audit?category=security")
    if not detail.get("assessable"):
        return Metric(id="sandbox_self_test", group="Security", label=label, status="skipped",
                      reason=str(detail.get("reason") or "The sandbox refused to execute on this host, "
                                 "so no containment claim was made either way."), source=source)
    passed, total = int(detail.get("passed") or 0), int(detail.get("total") or 0)
    return Metric(
        id="sandbox_self_test", group="Security", label=label, status="measured",
        value=float(passed), display=f"{passed} / {total} held", sample=f"backend {detail.get('backend')}",
        verdict="good" if total and passed == total else "bad", source=source,
    )


def latest_red_team_report(reports_dir: Path) -> Path | None:
    if not reports_dir.is_dir():
        return None
    files = sorted(path for path in reports_dir.iterdir() if REPORT_NAME.match(path.name))
    return files[-1] if files else None


def _red_team(reports_dir: Path, storage_root: Path) -> Metric:
    label = "Red team: attacks held"
    path = latest_red_team_report(reports_dir)
    if path is None:
        return _skipped("red_team", "Security", label,
                        "No red-team report in storage/reports. Run scripts/red_team.py against this host.")
    raw = path.read_bytes()
    try:
        report = json.loads(raw)
        results = report["results"]
        summary = report["summary"]
    except (ValueError, KeyError, TypeError):
        return _skipped("red_team", "Security", label, f"{path.name} could not be read as a red-team report.")
    # Re-hashed the way the runner hashed it, so an edited report is named.
    canonical = json.dumps(results, sort_keys=True, separators=(",", ":"), default=str)
    intact = hashlib.sha256(canonical.encode()).hexdigest() == report.get("results_sha256")
    held, total = int(summary.get("held", 0)), int(summary.get("total", 0))
    try:
        relative = str(path.relative_to(storage_root)).replace("\\", "/")
    except ValueError:
        relative = path.name
    return Metric(
        id="red_team", group="Security", label=label, status="measured", value=float(held),
        display=f"{held} / {total}", sample=f"against {report.get('target') or report.get('host')}",
        verdict="good" if intact and total and held == total else "bad",
        reason=None if intact else "The report's results no longer hash to its recorded results_sha256: it was edited.",
        source=MetricSource(kind="report_file", name=path.name, path=relative,
                            sha256=hashlib.sha256(raw).hexdigest(), at=report.get("finished_at"),
                            href=f"/api/measurements/reports/{path.name}"),
        breakdown=[MetricPart(label=key, display=str(summary.get(key, 0))) for key in ("breached", "inconclusive")]
        + [MetricPart(label="results_sha256", display=("matches" if intact else "DOES NOT MATCH"))],
    )


# --------------------------------------------------------------------- proof
def _certificates(tasks: list[Task], proofs_dir: Path, trusted_key_b64: str) -> Metric:
    label = "Run certificates verifying"
    files = [(task, proofs_dir / f"{task.id}.json") for task in tasks]
    present = [(task, path) for task, path in files if path.is_file()]
    if not present:
        return _skipped("certificates", "Proof", label, "No run certificate has been issued yet.")
    valid = 0
    failed: list[str] = []
    for task, path in present[:200]:
        try:
            result = verify_certificate(json.loads(path.read_text()), trusted_key_b64=trusted_key_b64)
        except (OSError, ValueError, KeyError, TypeError):
            result = {"valid": False}
        if result.get("valid"):
            valid += 1
        else:
            failed.append(task.id)
    checked = min(len(present), 200)
    return Metric(
        id="certificates", group="Proof", label=label, status="measured", value=float(valid),
        display=f"{valid} / {checked}", sample=f"{checked} certificate(s)",
        verdict="good" if valid == checked else "bad",
        reason="Offline checks: content hash, signature, this host's key, audit root and inclusion proofs."
        + (f" Failing: {', '.join(failed[:5])}." if failed else ""),
        source=MetricSource(kind="certificates", name=f"{checked} file(s) in storage/proofs", path="proofs",
                            run_ids=[task.id for task, _ in present[:20]]),
    )


# ---------------------------------------------------------------------- all
NO_EVALUATOR = (
    "Not measured: the workbench has no evaluator that produces a report for this, "
    "so no figure is shown."
)


def build_measurements(
    tasks: list[Task],
    *,
    scope: str,
    audit: AuditLog,
    storage_root: Path,
    trusted_key_b64: str,
) -> Measurements:
    metrics = [
        _latency("latency_all", "Model call latency", tasks, None, "No model call has been recorded yet."),
        _latency("latency_vision", "Vision latency", tasks, "vision_extraction",
                 "No vision extraction call has been recorded yet."),
        _usage_figure("tokens_per_second", "Generation speed", tasks, "tokens_per_second", "tok/s",
                      lambda v: f"{v:.1f} tok/s", "No call has reported generation timing yet.",
                      "Output tokens over the runtime's own generation time, excluding load and prompt."),
        _usage_figure("load_ms", "Model load time", tasks, "load_ms", "ms", _seconds,
                      "No call has reported a load time yet.",
                      "As the runtime reports it; a model already resident loads in near zero."),
        *_verification(tasks),
        _skipped("formula_accuracy", "Verification", "Formula accuracy", NO_EVALUATOR
                 + " The registry's reference cases run in tests/test_engineering.py, which stores no report."),
        _skipped("golden_accuracy", "Accuracy", "Golden-answer accuracy", NO_EVALUATOR),
        _skipped("retrieval_top1", "Accuracy", "Retrieval top-1", NO_EVALUATOR),
        _skipped("retrieval_top3", "Accuracy", "Retrieval top-3", NO_EVALUATOR),
        _red_team(storage_root / "reports", storage_root),
        _sandbox(audit),
        _egress(tasks, audit),
        _certificates(tasks, storage_root / "proofs", trusted_key_b64),
    ]
    return Measurements(
        generated_at=datetime.now(timezone.utc).isoformat(),
        scope=scope, runs_considered=len(tasks), metrics=metrics,
    )
