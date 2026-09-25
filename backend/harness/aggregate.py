"""Child records into outcomes.

Every outcome here is derived from a child task's persisted record -- its
status, its verification report, its approval record -- and from nothing
else. The harness does not grade answers, does not re-verify them and does
not decide that a refusal was "fine". If the record cannot support a
statement, the statement is not made: a child whose record is missing is
reported as missing, not as delivered.

Answer content (the text, the passages it cites, the claims the verifier
could not trace) is carried only for a child whose answer was released. A
held draft is readable by its owner in the thread, labelled as held; it is
not re-published through the harness, where it could end up in a report
that leaves the workbench before a reviewer has seen it.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

from backend.core.schemas import Task, TaskStatus
from backend.harness.models import (
    DELIVERED_OUTCOMES,
    UNSETTLED_OUTCOMES,
    CheckSummary,
    Citation,
    HarnessChildView,
    HarnessItem,
    HarnessOutcome,
    HarnessTally,
    ItemState,
)

# The same identifier alphabet the verifier treats as a citation
# (backend/agents/verifier.py CITATION_PATTERN): S retrieved passage, F
# attached file, V vision extraction, C computation, E fallback.
CITATION_MARKER = re.compile(r"\[([SFVCEH]\d+)\]")

QUEUED_STATUSES = frozenset({TaskStatus.RECEIVED, TaskStatus.CLASSIFIED})
RUNNING_STATUSES = frozenset(
    {TaskStatus.PLANNED, TaskStatus.RETRIEVING, TaskStatus.EXECUTING, TaskStatus.VERIFYING}
)
# A child in one of these will not move again without a person: the runner
# goes on to the next item. AWAITING_APPROVAL is settled for sequencing and
# is still not delivered.
SETTLED_STATUSES = frozenset(
    {
        TaskStatus.DELIVERED,
        TaskStatus.APPROVED,
        TaskStatus.AWAITING_APPROVAL,
        TaskStatus.REJECTED,
        TaskStatus.BLOCKED,
        TaskStatus.FAILED,
        TaskStatus.CANCELLED,
    }
)

CITATION_EXCERPT_CHARS = 320
CLAIM_EXCERPT_CHARS = 200

OUTCOME_LABELS: dict[HarnessOutcome, str] = {
    HarnessOutcome.PENDING: "Not yet submitted",
    HarnessOutcome.QUEUED: "Queued",
    HarnessOutcome.RUNNING: "Running",
    HarnessOutcome.SUPPORTED: "Delivered — every material claim traced",
    HarnessOutcome.PARTIALLY_SUPPORTED: "Delivered — some material claims untraced",
    HarnessOutcome.NO_MATERIAL_CLAIMS: "Delivered — no material claim to check",
    HarnessOutcome.RELEASED_UNVERIFIED: "Released without passing verification",
    HarnessOutcome.HELD: "Held for review",
    HarnessOutcome.REJECTED: "Rejected at review",
    HarnessOutcome.REFUSED: "Refused by policy",
    HarnessOutcome.FAILED: "Failed",
    HarnessOutcome.CANCELLED: "Cancelled",
    HarnessOutcome.NOT_SUBMITTED: "Never submitted",
}


def clip(text: str, limit: int) -> str:
    flat = re.sub(r"\s+", " ", text or "").strip()
    return flat if len(flat) <= limit else flat[: limit - 1].rstrip() + "…"


def _plural(count: int, word: str) -> str:
    return f"{count} {word}{'' if count == 1 else 's'}"


def derive_outcome(item: HarnessItem, task: Task | None) -> tuple[HarnessOutcome, str]:
    """The outcome of one item and a sentence saying why, from records only."""
    if item.state == ItemState.NOT_SUBMITTED:
        return HarnessOutcome.NOT_SUBMITTED, item.note or "Never submitted."
    if item.state == ItemState.SUBMIT_FAILED:
        return (
            HarnessOutcome.FAILED,
            f"The task service did not accept this item: {item.error or 'no reason given'}",
        )
    if item.state == ItemState.SUBMIT_REFUSED:
        return (
            HarnessOutcome.REFUSED,
            f"Refused before submission: {item.error or 'no reason given'}",
        )
    if item.task_id is None:
        return HarnessOutcome.PENDING, "Waits for the items before it to settle."
    if task is None:
        return (
            HarnessOutcome.FAILED,
            f"Child task {item.task_id} was submitted but its record could not be read back.",
        )

    status = task.status
    if status in QUEUED_STATUSES:
        return HarnessOutcome.QUEUED, "Submitted; waiting for the worker."
    if status in RUNNING_STATUSES:
        return HarnessOutcome.RUNNING, f"At stage '{status.value}'."

    approval = task.approval
    reviewer = approval.reviewer_name if approval and approval.reviewer_name else None

    if status == TaskStatus.AWAITING_APPROVAL:
        return HarnessOutcome.HELD, "Awaiting a reviewer; its answer is not released."
    if status == TaskStatus.REJECTED:
        said = f": {approval.comment}" if approval and approval.comment else "."
        return (
            HarnessOutcome.REJECTED,
            f"{f'By {reviewer}' if reviewer else 'No reviewer recorded'}{said}",
        )
    if status == TaskStatus.BLOCKED:
        return HarnessOutcome.REFUSED, task.error or "Refused; no reason was recorded."
    if status == TaskStatus.FAILED:
        return HarnessOutcome.FAILED, task.error or "Failed; no reason was recorded."
    if status == TaskStatus.CANCELLED:
        return HarnessOutcome.CANCELLED, task.error or "Cancelled."

    if status not in {TaskStatus.DELIVERED, TaskStatus.APPROVED}:
        # A status this module does not know is reported as unknown rather
        # than guessed into a bucket.
        return HarnessOutcome.FAILED, f"Unrecognised child status '{status.value}'."

    # Delivered. APPROVED is declared in the schema but never assigned --
    # an approval moves a task straight to DELIVERED -- and is read the same
    # way here should that ever change.
    after_review = ""
    if approval and approval.decision == "approved":
        after_review = f" Released by {reviewer} after review." if reviewer else " Released after review."
    verification = task.verification
    if verification is None:
        return (
            HarnessOutcome.RELEASED_UNVERIFIED,
            "Delivered without a verification record." + after_review,
        )
    total = verification.material_claims_total
    supported = verification.material_claims_supported
    if not verification.valid:
        return (
            HarnessOutcome.RELEASED_UNVERIFIED,
            "Released although automated verification did not pass "
            f"({supported} of {_plural(total, 'material claim')} traced)." + after_review,
        )
    if total == 0:
        return (
            HarnessOutcome.NO_MATERIAL_CLAIMS,
            "The verifier found no material claim in this answer, so nothing in it was "
            "checked against evidence." + after_review,
        )
    if supported >= total:
        return (
            HarnessOutcome.SUPPORTED,
            f"All {_plural(total, 'material claim')} traced to a retrieved passage."
            + after_review,
        )
    return (
        HarnessOutcome.PARTIALLY_SUPPORTED,
        f"{total - supported} of {_plural(total, 'material claim')} untraced "
        f"({supported} traced)." + after_review,
    )


def cited_evidence(task: Task) -> tuple[list[Citation], list[str]]:
    """Passages the answer actually cites, in first-cited order.

    Returns the resolved citations and any marker that names a passage this
    run never retrieved -- which cites nothing, and is a finding about the
    answer rather than a broken link.
    """
    evidence = {item.id: item for item in task.evidence}
    citations: list[Citation] = []
    unretrieved: list[str] = []
    seen: set[str] = set()
    for marker in CITATION_MARKER.findall(task.answer or ""):
        if marker in seen:
            continue
        seen.add(marker)
        item = evidence.get(marker)
        if item is None:
            unretrieved.append(marker)
            continue
        citations.append(
            Citation(
                id=item.id,
                source_document=item.source_document,
                location=item.location,
                excerpt=clip(item.excerpt, CITATION_EXCERPT_CHARS),
                score=item.score,
                classification=item.classification,
                kind=item.kind,
            )
        )
    return citations, unretrieved


def unsupported_claims(task: Task) -> list[str]:
    """The claims the source check could not trace, as the verifier listed them.

    The verifier lists at most five, so this can be shorter than the count of
    untraced claims; callers state both numbers rather than implying the
    list is complete.
    """
    if task.verification is None:
        return []
    for check in task.verification.checks:
        if check.name == "source_verification":
            return [clip(claim, CLAIM_EXCERPT_CHARS) for claim in check.warnings]
    return []


def child_view(
    item: HarnessItem, task: Task | None, *, queue: dict[str, Any] | None = None
) -> HarnessChildView:
    outcome, detail = derive_outcome(item, task)
    released = outcome in DELIVERED_OUTCOMES
    verification = task.verification if task else None
    approval = task.approval if task else None

    citations: list[Citation] = []
    unretrieved: list[str] = []
    claims: list[str] = []
    if task is not None and released:
        citations, unretrieved = cited_evidence(task)
        claims = unsupported_claims(task)

    error = item.error
    if task is not None and outcome in {
        HarnessOutcome.FAILED,
        HarnessOutcome.REFUSED,
        HarnessOutcome.CANCELLED,
    }:
        error = task.error or error

    queue_position = None
    queue_ahead = None
    if outcome == HarnessOutcome.QUEUED and queue:
        position = queue.get("position")
        queue_position = int(position) if position is not None else None
        queue_ahead = int(queue.get("ahead") or 0) if position is not None else None

    return HarnessChildView(
        index=item.index,
        key=item.key,
        label=item.label,
        prompt=item.prompt,
        group=item.group,
        state=item.state,
        task_id=item.task_id,
        task_status=task.status if task else None,
        outcome=outcome,
        outcome_detail=detail,
        released=released,
        claims_total=verification.material_claims_total if verification else None,
        claims_supported=verification.material_claims_supported if verification else None,
        verification_valid=verification.valid if verification else None,
        # Check names, verdicts and details carry counts, never answer text,
        # so they are shown for held children too: they are why it was held.
        checks=[
            CheckSummary(name=check.name, passed=check.passed, detail=check.detail)
            for check in (verification.checks if verification else [])
        ],
        citations=citations,
        unretrieved_citations=unretrieved,
        unsupported_claims=claims,
        approval_reasons=list(approval.reasons) if approval and approval.required else [],
        reviewer_name=approval.reviewer_name if approval else None,
        error=error,
        note=item.note,
        duration_ms=task.duration_ms if task else None,
        queue_position=queue_position,
        queue_ahead=queue_ahead,
        submitted_at=item.submitted_at,
        started_at=item.started_at,
        settled_at=item.settled_at,
    )


def tally(outcomes: Iterable[HarnessOutcome]) -> HarnessTally:
    counts = {outcome: 0 for outcome in HarnessOutcome}
    total = 0
    for outcome in outcomes:
        counts[outcome] += 1
        total += 1
    return HarnessTally(
        total=total,
        settled=sum(count for outcome, count in counts.items() if outcome not in UNSETTLED_OUTCOMES),
        delivered=sum(counts[outcome] for outcome in DELIVERED_OUTCOMES),
        counts=counts,
    )
