"""Proof Mode: one run's chain, every link read from the record.

The screen's promise is that nothing on it is filled in. These check that a
run's links come from its record, that a link it never reached says so in
words rather than showing a blank figure, and that the certificate row is
verified against this host's key and log rather than taken on trust.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.api.task_service import get_task_service
from backend.core.config import get_config
from backend.core.identity import get_identity_service
from backend.core.schemas import Task, TaskStatus
from tests.test_conflicts import REVIEWER, _run

ROWS = ["request", "classification", "policy", "routing", "evidence",
        "formula", "claim", "verification", "approval", "certificate"]


def _account(username: str):
    identity = get_identity_service()
    identity.ensure_seed_users()
    return identity.authenticate(username, "workbench").user


def _login(client: TestClient, username: str) -> dict[str, str]:
    token = client.post("/api/auth/login", json={"username": username, "password": "workbench"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def _stored_run() -> Task:
    task, orchestrator = _run()
    asyncio.run(orchestrator.resolve_conflict(task, REVIEWER, "K2", candidate=0, value=None,
                                              reason="the plant grid point governs"))
    task.id = str(uuid.uuid4())
    task.user_id = _account("engineer").id
    get_task_service()._persist(task)
    return task


def _bare_run() -> Task:
    now = datetime.now(timezone.utc)
    task = Task(id=str(uuid.uuid4()), prompt="hello", status=TaskStatus.FAILED,
                user_id=_account("engineer").id, created_at=now, updated_at=now)
    get_task_service()._persist(task)
    return task


def test_the_chain_has_every_link_in_order_and_reads_the_record() -> None:
    task = _stored_run()
    with TestClient(create_app()) as client:
        view = client.get(f"/api/runs/{task.id}/proof", headers=_login(client, "engineer")).json()
    rows = {row["key"]: row for row in view["rows"]}
    assert [row["key"] for row in view["rows"]] == ROWS
    assert rows["request"]["summary"] == task.prompt
    assert rows["request"]["entries"][0]["detail"] == f"sha256 {task.files[0].sha256}"
    assert {e["id"] for e in rows["evidence"]["entries"]} == {item.id for item in task.evidence}
    formulas = [e for e in rows["formula"]["entries"] if not e["title"].startswith("Conflict")]
    assert {m for e in formulas for m in e["meta"]} >= {"corrosion.short_term_rate@1"}
    assert rows["formula"]["empty"] is None
    assert rows["approval"]["summary"] == "Pending"
    # Never routed, never verified, no certificate: said, not shown as zero.
    assert rows["routing"]["empty"] == "No model was routed for this run."
    assert rows["verification"]["empty"] == "The run did not reach verification."
    assert rows["certificate"]["tone"] == "none" and rows["certificate"]["empty"]


def test_a_run_with_nothing_recorded_says_so_on_every_link() -> None:
    task = _bare_run()
    with TestClient(create_app()) as client:
        view = client.get(f"/api/runs/{task.id}/proof", headers=_login(client, "engineer")).json()
    rows = {row["key"]: row for row in view["rows"]}
    assert rows["formula"]["empty"] == "No formula applied."
    for key in ROWS[1:]:
        assert rows[key]["empty"], key
        assert rows[key]["facts"] == [] and rows[key]["entries"] == []
    assert "this one is failed" in rows["certificate"]["empty"]


def test_the_certificate_link_is_verified_and_a_changed_one_fails() -> None:
    task = _stored_run()
    reviewer = _account("reviewer")
    task.conflicts = []
    task.assessment = None
    get_task_service()._persist(task)
    held = get_task_service().get_task(task.id)
    asyncio.run(get_task_service().decide_approval(task.id, reviewer, "approve", None, held.review_digest))
    with TestClient(create_app()) as client:
        headers = _login(client, "engineer")
        view = client.get(f"/api/runs/{task.id}/proof", headers=headers).json()
        certificate = view["rows"][-1]
        assert certificate["tone"] == "ok", certificate
        assert certificate["summary"].startswith("Verified")
        assert {"signature", "trusted key", "audit inclusion"} <= {e["title"] for e in certificate["entries"]}
        approval = view["rows"][-2]
        assert approval["tone"] == "ok" and approval["summary"].startswith("Approved by")

        path = get_config().settings.storage_root / "proofs" / f"{task.id}.json"
        stored = json.loads(path.read_text())
        stored["run"]["answer_sha256"] = "0" * 64
        path.write_text(json.dumps(stored))
        tampered = client.get(f"/api/runs/{task.id}/proof", headers=headers).json()["rows"][-1]
    assert tampered["tone"] == "fail" and "content hash" in tampered["summary"]


def test_provenance_is_shown_only_when_the_certificate_carries_it() -> None:
    from backend.proof.proof_view import _certificate

    base = {"issued_at": "t", "version": 2, "content_sha256": "c", "signature": {"key_id": "k"},
            "audit": {"root": {"merkle_root": "r", "events": 3}}, "run": {}}
    verified = {"valid": True, "checks": [{"name": "signature", "passed": True, "detail": "ok"}]}
    without = _certificate(base, verified, "delivered")
    assert not any(f["label"].startswith("Provenance") for f in without.model_dump()["facts"])
    base["run"]["provenance"] = {"policy_version": 1, "model_digests": {"qwen": "sha256:ab"}}
    labels = {f.label: f.value for f in _certificate(base, verified, "delivered").facts}
    assert labels["Provenance · policy version"] == "1"
    assert "sha256:ab" in labels["Provenance · model digests"]


def test_another_persons_run_is_refused_without_task_read_all() -> None:
    task = _stored_run()
    with TestClient(create_app()) as client:
        assert client.get(f"/api/runs/{task.id}/proof", headers=_login(client, "operator")).status_code == 403
        assert client.get(f"/api/runs/{task.id}/proof", headers=_login(client, "auditor")).status_code == 200
        assert client.get("/api/runs/no-such-run/proof", headers=_login(client, "auditor")).status_code == 404
