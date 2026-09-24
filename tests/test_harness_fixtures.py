"""Shared fixtures for the harness tests. Holds no tests itself.

The fake task gateway stands where the task service stands, with the same
four methods the harness is allowed to use. It settles each child according
to a script instead of running the orchestrator, so the runner, the
aggregation and the report can be exercised end to end without a model --
and it records the one property a harness must never break: that a second
child is never submitted while another is still in flight.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Callable

from backend.api.task_service import TaskError
from backend.core.schemas import (
    ApprovalRecord,
    EvidenceItem,
    Sensitivity,
    Task,
    TaskStatus,
    User,
    VerificationCheck,
    VerificationReport,
)
from backend.harness.aggregate import SETTLED_STATUSES

Settle = Callable[[Task], None]


def now() -> datetime:
    return datetime.now(timezone.utc)


def make_user(
    username: str = "operator",
    *,
    role: str = "operator",
    department: str = "operations",
    clearance: Sensitivity = Sensitivity.CONFIDENTIAL,
    user_id: str | None = None,
) -> User:
    from backend.core.config import get_config

    return User(
        id=user_id or f"user-{username}",
        username=username,
        display_name=username.title(),
        role=role,
        department=department,
        permissions=sorted(get_config().role_permissions(role)),
        max_data_classification=clearance,
    )


def evidence(
    item_id: str = "S1",
    *,
    document: str = "SOP-INS-014 — Pressure Vessel External and Internal Inspection",
    location: str = "section: 2. Inspection Intervals",
    excerpt: str = "Corrosive service: external inspection every 12 months.",
    classification: Sensitivity = Sensitivity.CONFIDENTIAL,
) -> EvidenceItem:
    return EvidenceItem(
        id=item_id,
        source_document=document,
        location=location,
        excerpt=excerpt,
        score=0.8,
        classification=classification,
        kind="knowledge_base",
    )


def verification(
    supported: int,
    total: int,
    *,
    valid: bool = True,
    untraced: list[str] | None = None,
) -> VerificationReport:
    return VerificationReport(
        valid=valid,
        checks=[
            VerificationCheck(
                name="source_verification",
                kind="source",
                passed=valid,
                detail=f"{supported} of {total} material claims are supported by local evidence.",
                warnings=list(untraced or []),
            ),
            VerificationCheck(
                name="calculation_verification",
                kind="calculation",
                passed=True,
                detail="No numeric calculations were asserted.",
            ),
            VerificationCheck(
                name="hallucination_check",
                kind="hallucination",
                passed=valid,
                detail=f"{supported} of {total} material claim(s) traceable to local evidence.",
            ),
        ],
        material_claims_total=total,
        material_claims_supported=supported,
        completed_at=now(),
    )


# ------------------------------------------------------------ settle scripts
def delivered(
    supported: int = 2,
    total: int = 2,
    *,
    valid: bool = True,
    answer: str = "External inspection is every 12 months in corrosive service [S1].",
    items: list[EvidenceItem] | None = None,
    untraced: list[str] | None = None,
    approved_by: str | None = None,
    sensitivity: Sensitivity = Sensitivity.NORMAL,
) -> Settle:
    def settle(task: Task) -> None:
        from backend.core.analyzer import get_task_analyzer

        task.profile = get_task_analyzer().analyze(task.prompt, [], requested_format="answer")
        task.profile.sensitivity = sensitivity
        task.status = TaskStatus.DELIVERED
        task.answer = answer
        task.evidence = list(items if items is not None else [evidence()])
        task.verification = verification(supported, total, valid=valid, untraced=untraced)
        task.duration_ms = 151_000
        if approved_by:
            task.approval = ApprovalRecord(
                required=True,
                reasons=["verification_failure: Failed verification cannot be auto-delivered."],
                approver_roles=["reviewer"],
                decision="approved",
                reviewer_name=approved_by,
                decided_at=now(),
            )
        else:
            task.approval = ApprovalRecord(required=False)

    return settle


def held(
    reason: str = "verification_failure: Failed verification cannot be auto-delivered.",
    *,
    answer: str = "DRAFT THAT MUST NOT LEAK: the interval is 99 years [S1].",
) -> Settle:
    def settle(task: Task) -> None:
        task.status = TaskStatus.AWAITING_APPROVAL
        task.answer = answer
        task.evidence = [evidence()]
        task.verification = verification(
            0, 1, valid=False, untraced=["DRAFT THAT MUST NOT LEAK: the interval is 99 years [S1]."]
        )
        task.approval = ApprovalRecord(
            required=True, reasons=[reason], approver_roles=["reviewer"], decision="pending"
        )
        task.duration_ms = 162_000

    return settle


def blocked(reason: str = "model 'x' is not approved for 'restricted' data") -> Settle:
    def settle(task: Task) -> None:
        task.status = TaskStatus.BLOCKED
        task.error = reason

    return settle


def failed(reason: str = "Local inference failed: connection refused") -> Settle:
    def settle(task: Task) -> None:
        task.status = TaskStatus.FAILED
        task.error = reason

    return settle


def running() -> Settle:
    """Starts executing and never finishes on its own."""

    def settle(task: Task) -> None:
        task.status = TaskStatus.EXECUTING

    return settle


class FakeTasks:
    """The task service's four harness-facing methods, scripted."""

    def __init__(self, script: list[Settle] | None = None) -> None:
        self.tasks: dict[str, Task] = {}
        self.created: list[str] = []
        self.prompts: list[str] = []
        self.formats: list[str | None] = []
        self.cancel_requests: list[tuple[str, str]] = []
        self.script = list(script or [])
        # Set if the harness ever submits while an earlier child is unsettled.
        self.overlapped = False

    async def create_task(
        self,
        user: User,
        prompt: str,
        file_ids: list[str],
        deliverable_format: str | None = None,
    ) -> Task:
        if any(task.status not in SETTLED_STATUSES for task in self.tasks.values()):
            self.overlapped = True
        stamp = now()
        task = Task(
            id=str(uuid.uuid4()),
            prompt=prompt,
            status=TaskStatus.CLASSIFIED,
            user_id=user.id,
            user_display_name=user.display_name,
            department=user.department,
            created_at=stamp,
            updated_at=stamp,
        )
        self.tasks[task.id] = task
        self.created.append(task.id)
        self.prompts.append(prompt)
        self.formats.append(deliverable_format)
        if self.script:
            self.script.pop(0)(task)
        return task

    def get_task(self, task_id: str) -> Task | None:
        task = self.tasks.get(task_id)
        # A copy, as a database read would be: the harness must not depend
        # on sharing an object with the task service.
        return task.model_copy(deep=True) if task else None

    async def cancel(self, task_id: str, user: User) -> Task:
        task = self.tasks[task_id]
        self.cancel_requests.append((task_id, user.username))
        if task.status in SETTLED_STATUSES:
            raise TaskError("This task has already finished")
        task.status = TaskStatus.CANCELLED
        task.error = "Stopped at your request."
        return task

    def queue_state(self, task_id: str) -> dict[str, object]:
        return {"running": False, "position": 2, "ahead": 1, "queue_length": 2}

    # Test helpers, not part of the gateway.
    def settle(self, task_id: str, script: Settle) -> None:
        script(self.tasks[task_id])
