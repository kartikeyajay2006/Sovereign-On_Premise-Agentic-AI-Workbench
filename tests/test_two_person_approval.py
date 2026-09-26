"""Two-person approval of a High finding.

SOP-INS-014 Clause 5.1 names the Head of Inspection + Plant Manager as the
approving authority for a High finding, and SOP-OPS-008 Clauses 2.3 and 3.5
say both sign: the Head of Inspection recommending, the Plant Manager
approving. Before this, one reviewer released V-2107 alone. The signatures
come from policies/approval-rules.yaml (`high_severity_finding`).
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

import pytest

from backend.api.task_service import TaskError, get_task_service
from backend.core.audit import get_audit_log
from backend.core.identity import get_identity_service
from backend.core.schemas import (
    ApprovalRecord,
    Deliverable,
    IntegrityAssessment,
    Sensitivity,
    Task,
    TaskProfile,
    TaskStatus,
)
from backend.policy.gateway import get_policy_gateway


def _account(username: str):
    identity = get_identity_service()
    identity.ensure_seed_users()
    return identity.authenticate(username, "workbench").user


def _held_high_finding(owner) -> Task:
    """V-2107 as the gate leaves it: High, held, nobody has signed."""
    now = datetime.now(timezone.utc)
    task = Task(
        id=str(uuid.uuid4()),
        prompt="Read the attached scanned inspection report for vessel V-2107.",
        status=TaskStatus.AWAITING_APPROVAL,
        user_id=owner.id,
        user_display_name=owner.display_name,
        department=owner.department,
        created_at=now,
        updated_at=now,
        answer="V-2107 is below minimum thickness and is withdrawn from service.",
        assessment=IntegrityAssessment(
            kind="vessel", subject="V-2107", status="calculated", severity="high",
            remaining_life_years=-0.31, governing_rate_mm_yr=0.65,
            locations_below_t_min=["Shell course 1 (liquid zone)"],
        ),
        deliverables=[Deliverable(
            id="d1", filename="approval-note.docx", format="docx", size_bytes=1, sha256="0" * 64,
            download_url="/api/deliverables/d1", created_at=now,
        )],
        approval=ApprovalRecord(
            required=True,
            reasons=["high_severity_finding"],
            approver_roles=["head_of_inspection", "plant_manager"],
            decision="pending",
            required_signatures=get_policy_gateway().required_signatures("high"),
        ),
    )
    get_task_service()._persist(task)
    return task


def _decide(task: Task, user, decision: str = "approve") -> Task:
    return asyncio.run(get_task_service().decide_approval(task.id, user, decision, None))


@pytest.fixture
def people():
    return {name: _account(name) for name in ("engineer", "reviewer", "head_of_inspection", "plant_manager")}


class TestPolicy:
    def test_a_high_finding_is_decided_only_by_its_signatories(self) -> None:
        profile = TaskProfile.model_construct(
            sensitivity=Sensitivity.NORMAL,
            produces_deliverable=True, confidence=0.9,
        )
        required, reasons, roles = get_policy_gateway().approval_requirement(
            profile, prompt="V-2107", severity="high"
        )
        assert required and any(r.startswith("high_severity_finding") for r in reasons)
        assert roles == ["head_of_inspection", "plant_manager"]

    def test_the_signatures_are_ordered_recommend_then_approve(self) -> None:
        plan = get_policy_gateway().required_signatures("high")
        assert [(s["authority"], s["capacity"]) for s in plan] == [
            ("Head of Inspection", "recommends"), ("Plant Manager", "approves"),
        ]
        assert get_policy_gateway().required_signatures("medium") == []


class TestTwoPersonApproval:
    def test_one_approval_leaves_the_run_waiting_for_the_second(self, people) -> None:
        task = _held_high_finding(people["engineer"])
        after = _decide(task, people["head_of_inspection"])

        assert after.status == TaskStatus.AWAITING_APPROVAL
        assert after.approval.decision == "pending"
        assert [s.authority for s in after.approval.signatures] == ["Head of Inspection"]
        assert not any(d.released for d in after.deliverables)
        stored = get_task_service().get_task(task.id)
        assert len(stored.approval.signatures) == 1
        audited = get_audit_log().query(task_id=task.id, category="approval")
        signed = [e for e in audited if e.action == "signature_recorded"]
        assert signed and signed[0].detail["awaiting"] == "Plant Manager"

    def test_the_same_person_cannot_sign_twice(self, people) -> None:
        task = _held_high_finding(people["engineer"])
        _decide(task, people["head_of_inspection"])
        with pytest.raises(TaskError, match="cannot sign twice"):
            _decide(task, people["head_of_inspection"])
        assert get_task_service().get_task(task.id).status == TaskStatus.AWAITING_APPROVAL

    def test_a_role_that_is_not_a_signatory_is_refused(self, people) -> None:
        task = _held_high_finding(people["engineer"])
        with pytest.raises(TaskError, match="not an approving authority"):
            _decide(task, people["reviewer"])

    def test_the_plant_manager_cannot_approve_before_the_recommendation(self, people) -> None:
        task = _held_high_finding(people["engineer"])
        with pytest.raises(TaskError, match="next signature on this finding is the Head of Inspection"):
            _decide(task, people["plant_manager"])
        assert get_task_service().get_task(task.id).approval.signatures == []

    def test_two_valid_signatures_release_it(self, people) -> None:
        task = _held_high_finding(people["engineer"])
        _decide(task, people["head_of_inspection"])
        released = _decide(task, people["plant_manager"])

        assert released.status == TaskStatus.DELIVERED
        assert released.approval.decision == "approved"
        assert released.approval.reviewer_id == people["plant_manager"].id
        assert [(s.authority, s.capacity) for s in released.approval.signatures] == [
            ("Head of Inspection", "recommends"), ("Plant Manager", "approves"),
        ]
        assert all(d.released for d in released.deliverables)
        actions = [e.action for e in get_audit_log().query(task_id=task.id, category="approval")]
        assert actions.count("signature_recorded") == 2 and "approved" in actions

    def test_a_change_after_the_first_signature_voids_it(self, people) -> None:
        task = _held_high_finding(people["engineer"])
        _decide(task, people["head_of_inspection"])
        changed = get_task_service().get_task(task.id)
        changed.answer = "A different answer from the one the Head of Inspection read."
        get_task_service()._persist(changed)

        with pytest.raises(TaskError, match="Head of Inspection"):
            _decide(changed, people["plant_manager"])
        stored = get_task_service().get_task(task.id)
        assert stored.approval.signatures == []
        assert stored.status == TaskStatus.AWAITING_APPROVAL
        actions = [e.action for e in get_audit_log().query(task_id=task.id, category="approval")]
        assert "signatures_voided" in actions

    def test_the_account_that_ran_it_cannot_sign(self, people) -> None:
        task = _held_high_finding(people["head_of_inspection"])
        with pytest.raises(TaskError, match="cannot approve or reject"):
            _decide(task, people["head_of_inspection"])
