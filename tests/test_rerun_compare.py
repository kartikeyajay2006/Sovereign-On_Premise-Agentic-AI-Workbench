"""Re-run a finished run, and compare two runs with every change named.

A re-run goes through the ordinary creation path and records its parent.
A comparison reads both records and names what differs: models and their
digests, policy, formula versions, provenance where certified, evidence,
figures, verification and approval. Nothing is inferred; a property neither
run recorded is listed as not recorded.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.api.task_service import TaskError, TaskService, get_task_service
from backend.core.audit import get_audit_log
from backend.core.identity import get_identity_service
from backend.core.schemas import (
    ClaimVerdict,
    ModelRole,
    ModelUsage,
    RoutingDecision,
    Task,
    TaskStatus,
    VerificationCheck,
    VerificationReport,
)
from backend.proof.compare import compare_runs
from tests.test_conflicts import REVIEWER, _run

NOW = datetime.now(timezone.utc)


@pytest.fixture
def service():
    """A task service whose worker never starts, so nothing is inferred."""
    from backend.agents.orchestrator import get_orchestrator

    orchestrator = get_orchestrator()
    previous = orchestrator._is_cancelled
    try:
        yield TaskService()
    finally:
        orchestrator._is_cancelled = previous


def _account(username: str):
    identity = get_identity_service()
    identity.ensure_seed_users()
    return identity.authenticate(username, "workbench").user


def _finished(owner: str = "engineer", status: TaskStatus = TaskStatus.DELIVERED) -> Task:
    task = Task(id=str(uuid.uuid4()), prompt="What is the design pressure of V-2104?", status=status,
                user_id=_account(owner).id, created_at=NOW, updated_at=NOW, preferred_model="qwen3:8b")
    get_task_service()._persist(task)
    return task


# -------------------------------------------------------------------- re-run
def test_a_rerun_is_a_new_run_linked_to_its_parent(service) -> None:
    original = _finished()
    engineer = _account("engineer")
    rerun = asyncio.run(service.rerun(original, engineer))
    assert rerun.id != original.id and rerun.parent_task_id == original.id
    assert rerun.prompt == original.prompt and rerun.preferred_model == "qwen3:8b"
    stored = service.get_task(rerun.id)
    assert stored.parent_task_id == original.id and stored.status == TaskStatus.CLASSIFIED
    received = [e for e in get_audit_log().query(task_id=rerun.id) if e.action == "received"]
    assert received[0].detail["rerun_of"] == original.id
    summary = next(s for s in service.list_tasks(engineer, limit=500) if s.id == rerun.id)
    assert summary.parent_task_id == original.id


def test_a_run_still_in_progress_is_not_rerun(service) -> None:
    running = _finished(status=TaskStatus.EXECUTING)
    with pytest.raises(TaskError, match="has not finished"):
        asyncio.run(service.rerun(running, _account("engineer")))


def test_the_rerun_api_checks_permission_and_ownership(monkeypatch, service) -> None:
    import backend.api.routes.runs as runs

    monkeypatch.setattr(runs, "get_task_service", lambda: service)
    original = _finished()
    with TestClient(create_app()) as client:
        def login(username):
            token = client.post("/api/auth/login", json={"username": username, "password": "workbench"}).json()["token"]
            return {"Authorization": f"Bearer {token}"}
        # An auditor may read every run but may not create one.
        assert client.post(f"/api/runs/{original.id}/rerun", headers=login("auditor")).status_code == 403
        # An operator may create runs, but not read this one.
        assert client.post(f"/api/runs/{original.id}/rerun", headers=login("operator")).status_code == 403
        made = client.post(f"/api/runs/{original.id}/rerun", headers=login("engineer"))
        assert made.status_code == 202 and made.json()["parent_task_id"] == original.id


# ------------------------------------------------------------------- compare
def _engineering_run(model: str, digest: str | None) -> Task:
    task, orchestrator = _run()
    asyncio.run(orchestrator.resolve_conflict(task, REVIEWER, "K2", candidate=0, value=None,
                                              reason="the plant grid point governs"))
    task.id = str(uuid.uuid4())
    task.routing = [RoutingDecision(requested_role=ModelRole.REASONING, required_capabilities=[],
                                    selected_model=model, rule="r", reason="best", decided_at=NOW,
                                    stage="drafting")]
    task.usage = [ModelUsage(stage="drafting", model=model, model_digest=digest, latency_ms=1200, started_at=NOW)]
    task.verification = VerificationReport(
        valid=True, completed_at=NOW,
        checks=[VerificationCheck(name="sources", kind="source", passed=True, detail="d")],
        claims=[ClaimVerdict(id="C1", text="t", kind="numerical", verdict="CALCULATED", reason="r")],
    )
    return task


def _rows(comparison) -> dict[str, object]:
    return {row.label: row for row in comparison.changes}


def test_identical_runs_differ_only_where_they_really_differ() -> None:
    a = _engineering_run("qwen3:8b", "sha256:aaa")
    b = a.model_copy(deep=True)
    b.id = str(uuid.uuid4())
    b.parent_task_id = a.id
    comparison = compare_runs(a, b)
    assert comparison.linked and comparison.changed == 0, [r for r in comparison.changes if r.changed]
    rows = _rows(comparison)
    # Nothing certified provenance, and that is said rather than implied equal.
    assert rows["Policy, prompt and config versions"].a == "not recorded"


def test_every_material_change_is_named() -> None:
    a = _engineering_run("qwen3:8b", "sha256:aaa")
    b = _engineering_run("qwen3:8b", "sha256:bbb")
    b.evidence = [item for item in b.evidence if item.kind != "uploaded_file"]
    b.calculations[0].formula_version = 2
    b.assessment.remaining_life_years = 4.2
    b.verification.valid = False
    b.verification.checks[0].passed = False
    b.approval.decision = "rejected"
    b.approval.approver_roles = ["reviewer"]
    rows = _rows(compare_runs(a, b))
    assert rows["Model · drafting"].changed is False
    digest = rows["Model digest · qwen3:8b"]
    assert digest.changed and (digest.a, digest.b) == ("sha256:aaa", "sha256:bbb")
    assert rows["Formula versions"].changed
    assert rows["Evidence set"].changed
    life = next(r for label, r in rows.items() if label.endswith("remaining life years"))
    assert life.changed and life.b == "4.2"
    assert rows["Verification"].changed and (rows["Verification"].a, rows["Verification"].b) == ("valid", "not valid")
    assert rows["Check · sources"].changed
    assert rows["Approval"].changed and rows["Approval rule"].changed


def test_a_digest_that_was_not_recorded_is_said_so() -> None:
    a = _engineering_run("qwen3:8b", None)
    b = _engineering_run("qwen3:8b", "sha256:bbb")
    row = _rows(compare_runs(a, b))["Model digest · qwen3:8b"]
    assert row.a == "not recorded" and row.changed


def test_certified_provenance_is_compared_field_by_field() -> None:
    a = _engineering_run("qwen3:8b", "sha256:aaa")
    b = _engineering_run("qwen3:8b", "sha256:aaa")
    rows = _rows(compare_runs(
        a, b,
        certificate_a={"run": {"provenance": {"policy_version": 1, "prompts_sha256": "p1"}}},
        certificate_b={"run": {"provenance": {"policy_version": 2, "prompts_sha256": "p1"}}},
    ))
    assert rows["Provenance · policy version"].changed
    assert not rows["Provenance · prompts sha256"].changed
    assert "Policy, prompt and config versions" not in rows


def test_the_compare_api_refuses_a_run_the_reader_cannot_see() -> None:
    mine = _finished()
    other = _finished(owner="reviewer")
    with TestClient(create_app()) as client:
        def login(username):
            token = client.post("/api/auth/login", json={"username": username, "password": "workbench"}).json()["token"]
            return {"Authorization": f"Bearer {token}"}
        assert client.get(f"/api/runs/compare?a={mine.id}&b={other.id}", headers=login("engineer")).status_code == 403
        seen = client.get(f"/api/runs/compare?a={mine.id}&b={other.id}", headers=login("auditor"))
        assert seen.status_code == 200 and seen.json()["a"]["task_id"] == mine.id
