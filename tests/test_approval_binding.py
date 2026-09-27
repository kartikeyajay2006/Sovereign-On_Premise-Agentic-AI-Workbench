"""An approval is bound to the whole run a reviewer saw.

Review digest version 2 binds the prompt, the evidence set (ids and source
hashes), the policy files and the model digests alongside the answer, the
deliverables, the results and the conflicts. A change to any of them between
the first and the second signature voids the first and blocks the release,
and the refusal names what changed. Signatures and decisions recorded under
version 1 keep verifying under version 1 rules.
"""

from __future__ import annotations

import asyncio
import shutil
from datetime import datetime, timezone
from pathlib import Path

import pytest

from backend.api.task_service import TaskError, get_task_service
from backend.core.audit import get_audit_log
from backend.core.config import POLICY_DIR
from backend.core.schemas import ApprovalSignature, EvidenceItem, ModelUsage, Task, TaskStatus
from backend.proof import provenance
from backend.proof.certificate import (
    REVIEW_DIGEST_VERSION,
    binding_changes,
    review_binding,
    review_digest,
)
from tests.test_two_person_approval import _account, _held_high_finding


@pytest.fixture
def people():
    return {name: _account(name) for name in ("engineer", "head_of_inspection", "plant_manager", "reviewer")}


@pytest.fixture
def policies(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A copy of the policy files the binding reads, so a test can edit one."""
    copy = tmp_path / "policies"
    shutil.copytree(POLICY_DIR, copy)
    monkeypatch.setattr(provenance, "POLICY_DIR", copy)
    return copy


def _usage(digest: str, model: str = "qwen2.5:3b") -> ModelUsage:
    return ModelUsage(stage="answer", model=model, model_digest=digest, latency_ms=10,
                      started_at=datetime.now(timezone.utc))


def _held(owner) -> Task:
    task = _held_high_finding(owner)
    task.evidence = [
        EvidenceItem(id="S1", source_document="SOP-INS-014.pdf", excerpt="Clause 5.1 ...", source_sha256="a" * 64),
        EvidenceItem(id="S2", source_document="UT-V-2107.pdf", excerpt="Shell course 1 ...", source_sha256="b" * 64),
    ]
    task.usage = [_usage("sha256:" + "1" * 64)]
    get_task_service()._persist(task)
    return get_task_service().get_task(task.id)


def _decide(task: Task, user, seen: str | None = None) -> Task:
    return asyncio.run(get_task_service().decide_approval(task.id, user, "approve", None, seen))


def _change_prompt(task: Task, _: Path) -> None:
    task.prompt = task.prompt + " Also check the nozzles."


def _change_evidence(task: Task, _: Path) -> None:
    task.evidence[1].source_sha256 = "c" * 64


def _change_policy(_: Task, policies: Path) -> None:
    path = policies / "approval-rules.yaml"
    path.write_bytes(path.read_bytes() + b"\n# edited after the first signature\n")


def _change_model(task: Task, _: Path) -> None:
    task.usage = [_usage("sha256:" + "2" * 64)]


CHANGES = [
    ("prompt", _change_prompt, "the prompt changed"),
    ("evidence", _change_evidence, "the evidence set changed"),
    ("policy", _change_policy, "the policy files changed"),
    ("models", _change_model, "the model changed"),
]


@pytest.mark.parametrize(("part", "change", "reason"), CHANGES, ids=[c[0] for c in CHANGES])
def test_a_changed_bound_input_voids_the_first_signature_and_blocks_release(
    people, policies, part, change, reason
) -> None:
    task = _held(people["engineer"])
    _decide(task, people["head_of_inspection"], task.review_digest)

    changed = get_task_service().get_task(task.id)
    change(changed, policies)
    get_task_service()._persist(changed)

    with pytest.raises(TaskError, match=f"voided: {reason} since review"):
        _decide(changed, people["plant_manager"])
    stored = get_task_service().get_task(task.id)
    assert stored.status == TaskStatus.AWAITING_APPROVAL
    assert stored.approval.signatures == []
    assert stored.approval.void_reason == f"{reason} since review"
    assert not any(d.released for d in stored.deliverables)
    voided = [e for e in get_audit_log().query(task_id=task.id, category="approval")
              if e.action == "signatures_voided"]
    assert voided and voided[-1].detail["changed"] == [part]
    assert voided[-1].detail["reason"] == f"{reason} since review"


@pytest.mark.parametrize(("part", "change", "reason"), CHANGES, ids=[c[0] for c in CHANGES])
def test_a_decision_on_a_view_taken_before_the_change_names_it(people, policies, part, change, reason) -> None:
    task = _held(people["engineer"])
    seen = task.review_digest
    change(task, policies)
    get_task_service()._persist(task)
    with pytest.raises(TaskError, match=f"changed since you opened it: {reason} since review"):
        _decide(task, people["head_of_inspection"], seen)


def test_the_policy_edit_is_seen_without_the_run_being_written_again(people, policies) -> None:
    task = _held(people["engineer"])
    _decide(task, people["head_of_inspection"], task.review_digest)
    _change_policy(task, policies)
    with pytest.raises(TaskError, match="the policy files changed since review"):
        _decide(get_task_service().get_task(task.id), people["plant_manager"])


def test_an_unchanged_run_is_released_by_both_signatures(people, policies) -> None:
    task = _held(people["engineer"])
    _decide(task, people["head_of_inspection"], task.review_digest)
    released = _decide(get_task_service().get_task(task.id), people["plant_manager"], task.review_digest)
    assert released.status == TaskStatus.DELIVERED
    assert released.approval.bound_digest == task.review_digest
    assert released.approval.bound_digest_version == REVIEW_DIGEST_VERSION
    assert all(s.digest_version == 2 and s.binding for s in released.approval.signatures)


# ------------------------------------------------------------- determinism
def test_the_digest_is_deterministic(people) -> None:
    task = _held(people["engineer"])
    first = review_binding(task)
    reordered = task.model_copy(deep=True)
    reordered.evidence.reverse()
    reordered.usage = [*reordered.usage, _usage("sha256:" + "1" * 64)]  # the same digest again
    assert review_binding(reordered)["digest"] == first["digest"]
    assert review_binding(Task(**task.model_dump(mode="json")))["digest"] == first["digest"]
    assert review_digest(task) == first["digest"]


def test_each_part_moves_only_its_own_hash(people, policies) -> None:
    task = _held(people["engineer"])
    before = review_binding(task)
    for part, change, _ in CHANGES:
        copy = task.model_copy(deep=True)
        change(copy, policies)
        after = review_binding(copy)
        assert binding_changes(before, after) == [part]
        before = after if part == "policy" else before  # the policy edit stays on disk


def test_the_binding_summary_is_what_the_pane_shows(people) -> None:
    binding = review_binding(_held(people["engineer"]))
    labels = [item["label"] for item in binding["summary"]]
    assert labels[0] == "prompt" and labels[1] == "2 sources"
    assert labels[2].startswith("policy set (") and labels[3] == "model digest"
    assert binding["summary"][3]["hash"] == "1" * 12


# -------------------------------------------------------------- version 1
def test_version_1_is_the_digest_written_before(people) -> None:
    """The version 1 digest is byte for byte what the old review_digest returned."""
    import hashlib

    from backend.proof.signer import canonical

    task = _held(people["engineer"])
    body = {
        "answer": hashlib.sha256(task.answer.encode()).hexdigest(),
        "deliverables": sorted((d.filename, d.sha256) for d in task.deliverables),
        "results": [r.result_hash for r in task.calculations if r.result_hash],
        "conflicts": [(c.id, c.status, c.resolution.evidence_id if c.resolution else None) for c in task.conflicts],
        "assessment": task.assessment.status if task.assessment else None,
    }
    assert review_digest(task, version=1) == hashlib.sha256(canonical(body)).hexdigest()
    assert review_binding(task)["parts"]["content"] == review_digest(task, version=1)


def _as_version_1(task: Task, signatures: list[ApprovalSignature] | None = None) -> None:
    """Rewrite the stored record as it was before version 2: v1 digest, no binding."""
    payload = task.model_dump(mode="json")
    v1 = review_digest(task, version=1)
    for key in ("review_digest_version", "review_binding", "review_history"):
        payload.pop(key, None)
    payload["review_digest"] = v1
    if signatures is not None:
        payload["approval"]["signatures"] = [
            {k: v for k, v in s.model_dump(mode="json").items() if k not in ("digest_version", "binding")}
            for s in signatures
        ]
    get_task_service().db.update_task(task.id, task.status.value, payload)


def test_a_version_1_first_signature_still_counts(people) -> None:
    task = _held(people["engineer"])
    first = ApprovalSignature(
        role="head_of_inspection", authority="Head of Inspection", capacity="recommends",
        user_id=people["head_of_inspection"].id, username="head_of_inspection", name="Head of Inspection",
        signed_at=datetime.now(timezone.utc), review_digest=review_digest(task, version=1),
    )
    _as_version_1(task, [first])
    stored = get_task_service().get_task(task.id)
    assert stored.review_digest_version == 1 and stored.approval.signatures[0].digest_version == 1

    released = _decide(stored, people["plant_manager"])
    assert released.status == TaskStatus.DELIVERED
    assert [s.digest_version for s in released.approval.signatures] == [1, 2]


def test_a_version_1_signature_is_voided_by_what_version_1_bound(people) -> None:
    task = _held(people["engineer"])
    first = ApprovalSignature(
        role="head_of_inspection", authority="Head of Inspection", capacity="recommends",
        user_id=people["head_of_inspection"].id, username="head_of_inspection", name="Head of Inspection",
        signed_at=datetime.now(timezone.utc), review_digest=review_digest(task, version=1),
    )
    _as_version_1(task, [first])
    stored = get_task_service().get_task(task.id)
    stored.answer = "A different answer."
    get_task_service()._persist(stored)
    with pytest.raises(TaskError, match="voided: the answer, a deliverable"):
        _decide(stored, people["plant_manager"])


def test_a_page_opened_before_version_2_can_still_decide(people) -> None:
    task = _held(people["engineer"])
    # A single-approver run: no severity, so no signature plan.
    task.assessment = None
    task.approval.required_signatures = []
    task.approval.approver_roles = ["reviewer"]
    get_task_service()._persist(task)
    _as_version_1(task)
    stored = get_task_service().get_task(task.id)
    seen_v1 = stored.review_digest
    decided = _decide(stored, people["reviewer"], seen_v1)
    assert decided.status == TaskStatus.DELIVERED
    assert decided.approval.bound_digest_version == 2


def test_a_version_1_decision_still_reads_unchanged_on_the_proof_page(people) -> None:
    from backend.proof.proof_view import _approval

    task = _held(people["engineer"])
    task.approval.decision = "approved"
    task.approval.bound_digest = review_digest(task, version=1)
    task.approval.bound_digest_version = 1
    row = _approval(task)
    facts = {fact.label: fact.value for fact in row.facts}
    assert facts["Run since decision"].startswith("unchanged")
    assert "digest version 1" in facts["Signature binds"]
    assert row.tone != "fail"
