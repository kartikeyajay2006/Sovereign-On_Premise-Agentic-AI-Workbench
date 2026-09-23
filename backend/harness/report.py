"""The harness report: one JSON document, and markdown rendered from it.

The JSON is built first and the markdown is a pure function of it, so the two
files cannot disagree about a single count. The markdown also states the
JSON's sha256, which binds the pair: neither file can state its own hash, and
both hashes go to the run record and the audit log.

What the report may contain is narrower than what the harness can read. An
answer appears only when its child was delivered -- released -- and a held,
rejected, refused, failed or cancelled child contributes its outcome and the
reason, never its draft. That is what lets a report with no approval
requirement leave the workbench without becoming a way round the approval
gate on the runs inside it.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.core.config import get_config
from backend.core.schemas import Sensitivity, Task
from backend.harness.aggregate import OUTCOME_LABELS, child_view, tally
from backend.harness.corpus import document_code, section_name
from backend.harness.definitions import AggregationKind
from backend.harness.models import (
    DELIVERED_OUTCOMES,
    HarnessItem,
    HarnessOutcome,
    HarnessRun,
    HarnessTally,
)

REPORT_SCHEMA = "aegis.harness.report/1"

# Stated in every report. Worded for an engineer deciding whether to act on
# a row, so it says what "supported" does NOT establish before anything else.
LEXICAL_LIMITATION = (
    "Claim tracing is lexical. The verifier counts a material claim as traced when it "
    "shares a figure or enough distinctive words with a passage retrieved for that run. "
    "It cannot tell whether the claim reads the right row of a cited table, or whether "
    "the passage actually says what the claim says: a claim that quotes the wrong row of "
    "a table it cites passes. Traced means the claim is about that passage, not that the "
    "passage proves it."
)

WITHHELD: dict[HarnessOutcome, str] = {
    HarnessOutcome.HELD: (
        "Held for review and not released, so its answer is not part of this report."
    ),
    HarnessOutcome.REJECTED: "Rejected at review; its answer was not released.",
    HarnessOutcome.REFUSED: "Refused before an answer was released.",
    HarnessOutcome.FAILED: "No answer was released.",
    HarnessOutcome.CANCELLED: "Cancelled; no answer was released.",
    HarnessOutcome.NOT_SUBMITTED: "Never submitted, so there is no answer.",
    HarnessOutcome.PENDING: "Not yet submitted when this report was written.",
    HarnessOutcome.QUEUED: "Still queued when this report was written.",
    HarnessOutcome.RUNNING: "Still running when this report was written.",
}

# Report order for the outcome table: delivered first, then the rest.
OUTCOME_ORDER = [
    HarnessOutcome.SUPPORTED,
    HarnessOutcome.PARTIALLY_SUPPORTED,
    HarnessOutcome.NO_MATERIAL_CLAIMS,
    HarnessOutcome.RELEASED_UNVERIFIED,
    HarnessOutcome.HELD,
    HarnessOutcome.REJECTED,
    HarnessOutcome.REFUSED,
    HarnessOutcome.FAILED,
    HarnessOutcome.CANCELLED,
    HarnessOutcome.NOT_SUBMITTED,
    HarnessOutcome.PENDING,
    HarnessOutcome.QUEUED,
    HarnessOutcome.RUNNING,
]


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _rank(level: Sensitivity) -> int:
    return get_config().classification_rank(level.value)


def report_classification(rows: list[tuple[HarnessItem, Task | None]]) -> Sensitivity:
    """The highest classification among what the report actually carries.

    Only released children contribute: their answers are in the report, and
    so are excerpts of the passages they cite. A held child's content is not
    in the file, so it does not raise the file's classification.
    """
    highest = Sensitivity.NORMAL
    for item, task in rows:
        if task is None:
            continue
        view = child_view(item, task)
        if view.outcome not in DELIVERED_OUTCOMES:
            continue
        levels = [citation.classification for citation in view.citations]
        if task.profile is not None:
            levels.append(task.profile.sensitivity)
        for level in levels:
            if _rank(level) > _rank(highest):
                highest = level
    return highest


def _threshold() -> float:
    rules = get_config().approval_rules.get("verification") or {}
    return float(rules.get("min_supported_fraction", 0.6))


def run_limitations(run: HarnessRun) -> list[str]:
    """What every view of this run must say it did not establish."""
    return [*standard_limitations(run, threshold=_threshold()), *run.harness.limitations]


def standard_limitations(run: HarnessRun, *, threshold: float) -> list[str]:
    scope = run.scope
    searched = (
        "every department"
        if scope.departments is None
        else "the departments " + ", ".join(scope.departments)
    )
    return [
        LEXICAL_LIMITATION,
        "Only material claims are checked: sentences carrying a quantity, a directive such "
        "as shall or must, a clause reference, or a citation marker. Any other sentence in an "
        "answer was not checked at all.",
        f"A run is delivered when at least {threshold:.0%} of its material claims are traced, "
        "so a delivered answer can still contain untraced claims. Those rows are counted "
        "separately as delivered with some material claims untraced.",
        "Only released answers appear here. Items held for review, rejected, refused, failed, "
        "cancelled or never submitted contribute their outcome and its reason, not their text.",
        f"Retrieval covered {searched}, up to {scope.max_classification.value} classification, "
        f"which held {scope.documents} indexed document(s) when the run started. A document "
        "outside that scope was never consulted, so 'not covered' can mean 'not visible to "
        "this role'.",
        "Each item ran as an independent task. No run saw another run's answer, and the "
        "harness does not reconcile answers that disagree.",
        "Outcomes are derived only from each run's recorded status, verification report and "
        "approval record. The harness does not grade answers for correctness.",
    ]


def build_report_data(
    run: HarnessRun,
    rows: list[tuple[HarnessItem, Task | None]],
    *,
    version: int,
    generated_at: datetime,
    generated_by: str,
    reason: str,
) -> tuple[dict[str, Any], HarnessTally, Sensitivity]:
    threshold = _threshold()
    views = [(item, task, child_view(item, task)) for item, task in rows]
    counts = tally(view.outcome for _item, _task, view in views)
    classification = report_classification(rows)

    report_rows: list[dict[str, Any]] = []
    for item, task, view in views:
        released = view.released and task is not None
        approval = task.approval if task else None
        report_rows.append(
            {
                "index": item.index,
                "key": item.key,
                "label": item.label,
                "group": item.group,
                "prompt": item.prompt,
                "task_id": item.task_id,
                "run_link": f"/console?run={item.task_id}" if item.task_id else None,
                "task_status": task.status.value if task else None,
                "outcome": view.outcome.value,
                "outcome_label": OUTCOME_LABELS[view.outcome],
                "outcome_detail": view.outcome_detail,
                "released": released,
                "answer": (task.answer if released and task else None),
                "answer_withheld": None if released else WITHHELD.get(view.outcome),
                "verification": (
                    {
                        "valid": view.verification_valid,
                        "material_claims_total": view.claims_total,
                        "material_claims_traced": view.claims_supported,
                        "checks": [check.model_dump(mode="json") for check in view.checks],
                    }
                    if view.claims_total is not None
                    else None
                ),
                "untraced_claims": view.unsupported_claims if released else [],
                "citations": [c.model_dump(mode="json") for c in view.citations] if released else [],
                "unretrieved_citations": view.unretrieved_citations if released else [],
                "approval": (
                    {
                        "required": approval.required,
                        "reasons": list(approval.reasons),
                        "decision": approval.decision,
                        "reviewer_name": approval.reviewer_name,
                        "decided_at": _iso(approval.decided_at),
                    }
                    if approval and approval.required
                    else None
                ),
                "error": view.error,
                "note": view.note,
                "duration_ms": view.duration_ms,
                "submitted_at": _iso(item.submitted_at),
                "settled_at": _iso(item.settled_at),
                "classification": (
                    task.profile.sensitivity.value if task and task.profile else None
                ),
            }
        )

    data: dict[str, Any] = {
        "schema": REPORT_SCHEMA,
        "title": run.harness.report_title,
        "version": version,
        "generated_at": generated_at.isoformat(),
        "generated_by": generated_by,
        "reason": reason,
        "classification": classification.value,
        "run": {
            "id": run.id,
            "status": run.status.value,
            "created_at": _iso(run.created_at),
            "finished_at": _iso(run.finished_at),
            "cancel_requested_at": _iso(run.cancel_requested_at),
            "cancel_requested_by": run.cancel_requested_by,
            "error": run.error,
            "started_by": {
                "username": run.username,
                "display_name": run.user_display_name,
                "role": run.role,
                "department": run.department,
            },
            "inputs": run.inputs,
            "inputs_sha256": run.inputs_sha256,
            "excluded": [entry.model_dump(mode="json") for entry in run.excluded],
            "scope": run.scope.model_dump(mode="json"),
        },
        "harness": {
            "id": run.harness.id,
            "version": run.harness.version,
            "name": run.harness.name,
            "source": run.harness.source,
            "sha256": run.harness.sha256,
            "aggregation": run.harness.aggregation.value,
            "template": run.harness.template,
        },
        "tally": counts.model_dump(mode="json"),
        "outcome_labels": {outcome.value: OUTCOME_LABELS[outcome] for outcome in HarnessOutcome},
        "rows": report_rows,
        "limitations": [
            *standard_limitations(run, threshold=threshold),
            f"This report reflects the child run records as they stood at "
            f"{generated_at.isoformat()}. An approval or rejection after that time is not "
            "reflected until the report is regenerated.",
            *run.harness.limitations,
        ],
        "integrity": (
            "The sha256 of this file and of its markdown companion are recorded on the run "
            "and in the audit log (category 'harness', action 'report_generated')."
        ),
    }
    return data, counts, classification


# ----------------------------------------------------------------- markdown
def _cell(text: Any) -> str:
    """One markdown table cell: no pipes, no line breaks."""
    flat = " ".join(str(text if text is not None else "").split())
    return flat.replace("|", "\\|") or "—"


def _source_label(citation: dict[str, Any]) -> str:
    code = document_code(str(citation.get("source_document") or ""))
    where = section_name(citation.get("location"))
    return f"{code} · {where}" if where else code


def _claims_cell(row: dict[str, Any]) -> str:
    verification = row.get("verification")
    if not verification:
        return "—"
    total = verification.get("material_claims_total")
    traced = verification.get("material_claims_traced")
    if total is None or traced is None:
        return "—"
    return f"{traced} of {total}"


def _sources_cell(row: dict[str, Any]) -> str:
    if not row.get("released"):
        return "—"
    labels: list[str] = []
    for citation in row.get("citations") or []:
        label = _source_label(citation)
        if label not in labels:
            labels.append(label)
    return "; ".join(labels) if labels else "none cited"


def _row_block(row: dict[str, Any], heading: str) -> list[str]:
    lines = [heading, ""]
    lines.append(f"- **Outcome:** {row['outcome_label']}. {row['outcome_detail']}")
    if row.get("task_id"):
        lines.append(f"- **Run:** `{row['run_link']}`")
    verification = row.get("verification")
    if verification:
        checks = ", ".join(
            f"{check['name']} {'passed' if check['passed'] else 'did not pass'}"
            for check in verification.get("checks") or []
        )
        lines.append(
            f"- **Verification:** {_claims_cell(row)} material claims traced"
            + (f"; {checks}" if checks else "")
        )
    approval = row.get("approval")
    if approval and approval.get("reasons"):
        lines.append("- **Approval required because:** " + "; ".join(approval["reasons"]))
    if row.get("note"):
        lines.append(f"- **Note:** {row['note']}")
    lines.append("")

    if not row.get("released"):
        lines.append(f"_{row.get('answer_withheld') or 'No answer was released.'}_")
        # A refusal or failure already reads its recorded reason as the
        # outcome detail; it is repeated only when it says something else.
        if row.get("error") and row["error"] != row.get("outcome_detail"):
            lines.append("")
            lines.append(f"Recorded reason: `{_cell(row['error'])}`")
        lines.append("")
        return lines

    lines.append((row.get("answer") or "").strip() or "_The released answer is empty._")
    lines.append("")
    citations = row.get("citations") or []
    if citations:
        lines.append("**Sources cited**")
        lines.append("")
        for citation in citations:
            lines.append(
                f"- [{citation['id']}] {citation['source_document']}"
                + (f" — {citation['location']}" if citation.get("location") else "")
            )
            lines.append(f"  > {citation['excerpt']}")
        lines.append("")
    else:
        lines.append("_The answer cites no retrieved passage._")
        lines.append("")
    if row.get("unretrieved_citations"):
        lines.append(
            "**Cites passages this run never retrieved:** "
            + ", ".join(f"[{marker}]" for marker in row["unretrieved_citations"])
        )
        lines.append("")
    untraced = row.get("untraced_claims") or []
    if untraced:
        verification = row.get("verification") or {}
        total = verification.get("material_claims_total") or 0
        traced = verification.get("material_claims_traced") or 0
        missing = max(0, total - traced)
        lines.append(
            "**Claims the verifier could not trace**"
            + (f" (listing {len(untraced)} of {missing})" if missing > len(untraced) else "")
        )
        lines.append("")
        for claim in untraced:
            lines.append(f"- {claim}")
        lines.append("")
    return lines


def render_markdown(data: dict[str, Any], *, json_sha256: str) -> str:
    run = data["run"]
    harness = data["harness"]
    tally_data = data["tally"]
    counts: dict[str, int] = tally_data["counts"]
    rows: list[dict[str, Any]] = data["rows"]
    register = harness["aggregation"] == AggregationKind.REQUIREMENTS_REGISTER.value
    started_by = run["started_by"]

    out: list[str] = [f"# {data['title']}", ""]
    out.append(
        f"**Classification: {data['classification'].upper()}** — the highest classification "
        "among the released answers and the passages they cite."
    )
    out.append("")
    out.append("| | |")
    out.append("|---|---|")
    out.append(f"| Run | `{run['id']}` |")
    out.append(
        f"| Harness | {_cell(harness['name'])} (`{harness['id']}` v{harness['version']}, "
        f"`{harness['source']}` sha256 `{harness['sha256']}`) |"
    )
    out.append(
        f"| Started by | {_cell(started_by['display_name'])} (user `{_cell(started_by['username'])}`, "
        f"role {_cell(started_by['role'])}, department {_cell(started_by['department'])}) |"
    )
    out.append(f"| Started | {run['created_at']} |")
    out.append(f"| Ended | {run['finished_at'] or 'not recorded'} ({run['status']}) |")
    if run.get("cancel_requested_at"):
        out.append(
            f"| Cancel requested | {run['cancel_requested_at']} by "
            f"{_cell(run.get('cancel_requested_by'))} |"
        )
    out.append(
        f"| Report | version {data['version']}, generated {data['generated_at']} "
        f"({data['reason']}) by {_cell(data['generated_by'])} |"
    )
    out.append(f"| JSON companion sha256 | `{json_sha256}` |")
    out.append("")
    if run.get("error"):
        out.append(f"> {run['error']}")
        out.append("")

    out.append("## Outcome")
    out.append("")
    out.append(
        f"{tally_data['total']} item(s): {tally_data['delivered']} delivered, "
        f"{counts.get(HarnessOutcome.SUPPORTED.value, 0)} of them with every material claim "
        f"traced; {counts.get(HarnessOutcome.HELD.value, 0)} held for review; "
        f"{tally_data['total'] - tally_data['settled']} not settled when this was written."
    )
    out.append("")
    out.append("| Outcome | Items |")
    out.append("|---|---:|")
    for outcome in OUTCOME_ORDER:
        count = counts.get(outcome.value, 0)
        if count or outcome not in {
            HarnessOutcome.PENDING,
            HarnessOutcome.QUEUED,
            HarnessOutcome.RUNNING,
        }:
            out.append(f"| {OUTCOME_LABELS[outcome]} | {count} |")
    out.append("")
    if run.get("excluded"):
        out.append(
            f"{len(run['excluded'])} item(s) were deselected at preview by the person who "
            "started the run and were never submitted: "
            + "; ".join(_cell(entry["label"]) for entry in run["excluded"])
            + "."
        )
        out.append("")

    out.append("## Register" if register else "## Answer matrix")
    out.append("")
    if register:
        out.append("| # | Document | Section | Outcome | Claims traced | Sources | Run |")
        out.append("|---:|---|---|---|---|---|---|")
    else:
        out.append("| # | Item | Outcome | Claims traced | Sources | Run |")
        out.append("|---:|---|---|---|---|---|")
    for row in rows:
        run_cell = f"`{row['task_id'][:8]}`" if row.get("task_id") else "—"
        if register:
            label = str(row["label"])
            section = label.split(" · ", 1)[1] if " · " in label else label
            out.append(
                f"| {row['index']} | {_cell(document_code(row.get('group') or ''))} | "
                f"{_cell(section)} | {_cell(row['outcome_label'])} | {_claims_cell(row)} | "
                f"{_cell(_sources_cell(row))} | {run_cell} |"
            )
        else:
            out.append(
                f"| {row['index']} | {_cell(row['label'])} | {_cell(row['outcome_label'])} | "
                f"{_claims_cell(row)} | {_cell(_sources_cell(row))} | {run_cell} |"
            )
    out.append("")

    if register:
        out.append("## Requirements by section")
        out.append("")
        current_group: str | None = None
        for row in rows:
            group = row.get("group") or "Ungrouped"
            if group != current_group:
                out.append(f"### {group}")
                out.append("")
                current_group = group
            out.extend(_row_block(row, f"#### {row['index']}. {row['label']}"))
    else:
        out.append("## Answers")
        out.append("")
        for row in rows:
            out.extend(_row_block(row, f"### {row['index']}. {row['label']}"))

    out.append("## What was verified, and what was not")
    out.append("")
    for limitation in data["limitations"]:
        out.append(f"- {limitation}")
    out.append("")
    out.append("## Integrity")
    out.append("")
    out.append(
        f"The JSON companion's sha256 is `{json_sha256}`. This file cannot state its own "
        "hash; both are recorded on the run and in the audit log (category `harness`, action "
        "`report_generated`)."
    )
    out.append("")
    return "\n".join(out)
