"""Signed audit roots and run certificates."""

from __future__ import annotations

import asyncio
import json
import os
import stat
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.api.task_service import TaskError, get_task_service
from backend.core.audit import GENESIS_HASH, AuditLog
from backend.core.config import get_config
from backend.proof.audit_roots import AuditSeal, SealRefused
from backend.proof.certificate import issue_certificate, review_digest, verify_certificate
from backend.proof.merkle import inclusion_proof, merkle_root, verify_inclusion
from backend.proof.signer import HostSigner
from tests.test_conflicts import _run

HASHES = [f"{n:064x}" for n in range(1, 18)]


# -------------------------------------------------------------------- merkle
@pytest.mark.parametrize("size", [1, 2, 3, 5, 8, 13, 17])
def test_every_leaf_is_proven_under_the_root(size: int) -> None:
    leaves = HASHES[:size]
    root = merkle_root(leaves)
    for index, leaf in enumerate(leaves):
        assert verify_inclusion(leaf, inclusion_proof(leaves, index), root)


def test_a_changed_leaf_is_not_under_the_root() -> None:
    root = merkle_root(HASHES)
    proof = inclusion_proof(HASHES, 4)
    assert not verify_inclusion("f" * 64, proof, root)
    assert merkle_root(HASHES[:8]) != merkle_root(HASHES[:9])


# ------------------------------------------------------------------- signing
def test_the_key_is_created_private_and_signs(tmp_path: Path) -> None:
    signer = HostSigner(tmp_path / "keys")
    signature = signer.sign({"a": 1})
    # Windows has no POSIX mode bits (os.stat reports 0o666); privacy there
    # comes from the storage folder's ACL, so the mode is checked on POSIX only.
    if os.name == "posix":
        assert stat.S_IMODE(os.stat(signer.private_path).st_mode) == 0o600
    assert signer.public_path.read_text().strip() == signature["public_key"]
    # The same key after a restart.
    assert HostSigner(tmp_path / "keys").key_id == signer.key_id


# --------------------------------------------------------------------- seals
def _log(tmp_path: Path, events: int = 12) -> AuditLog:
    log = AuditLog(path=tmp_path / "audit.jsonl")
    for n in range(events):
        log.record(category="test", action=f"event-{n}", actor="tester", task_id="t-1" if n % 3 == 0 else None)
    return log


def test_a_sealed_log_verifies(tmp_path: Path) -> None:
    log = _log(tmp_path)
    seal = AuditSeal(log, HostSigner(tmp_path / "keys"))
    root = seal.seal("test")
    assert root["events"] == 12
    log.record(category="test", action="after the seal", actor="tester")
    result = seal.verify()
    assert result["valid"] and result["roots"] == 1


def test_a_rewritten_and_rechained_history_is_exposed_by_the_seal(tmp_path: Path) -> None:
    log = _log(tmp_path)
    seal = AuditSeal(log, HostSigner(tmp_path / "keys"))
    seal.seal("before the edit")
    records = [json.loads(line) for line in log.path.read_text().splitlines()]
    records[4]["actor"] = "someone-else"
    previous = records[3]["hash"]
    for record in records[4:]:
        record["prev_hash"] = previous
        record["hash"] = log._digest(previous, {k: v for k, v in record.items() if k != "hash"})
        previous = record["hash"]
    log.path.write_text("\n".join(json.dumps(record) for record in records) + "\n")
    assert log.verify_chain().valid  # the chain alone is fooled
    result = seal.verify()
    assert not result["valid"] and "history was rewritten" in result["results"][0]["problem"]


def test_a_broken_chain_is_not_sealed(tmp_path: Path) -> None:
    log = _log(tmp_path)
    lines = log.path.read_text().splitlines()
    record = json.loads(lines[2]); record["actor"] = "x"; lines[2] = json.dumps(record)
    log.path.write_text("\n".join(lines) + "\n")
    with pytest.raises(SealRefused):
        AuditSeal(log, HostSigner(tmp_path / "keys")).seal("test")


def test_a_seal_by_another_key_is_not_trusted(tmp_path: Path) -> None:
    log = _log(tmp_path)
    AuditSeal(log, HostSigner(tmp_path / "other-keys"), path=tmp_path / "roots.jsonl").seal("stranger")
    result = AuditSeal(log, HostSigner(tmp_path / "keys"), path=tmp_path / "roots.jsonl").verify()
    assert not result["valid"] and "does not hold" in result["results"][0]["problem"]


# --------------------------------------------------------------- certificate
def _certified(tmp_path: Path):
    task, orchestrator = _run()
    asyncio.run(orchestrator.resolve_conflict(task, _reviewer(), "K2", candidate=0, value=None,
                                              reason="the plant grid point governs"))
    log = AuditLog(path=tmp_path / "audit.jsonl")
    for n in range(5):
        log.record(category="agent", action=f"step-{n}", actor="engineer", task_id=task.id)
        log.record(category="other", action="noise", actor="someone")
    signer = HostSigner(tmp_path / "keys")
    certificate = issue_certificate(task, log, AuditSeal(log, signer), signer)
    return task, log, signer, certificate


def _reviewer():
    from tests.test_conflicts import REVIEWER
    return REVIEWER


def test_a_certificate_verifies_offline_with_the_public_key(tmp_path: Path) -> None:
    task, _, signer, certificate = _certified(tmp_path)
    result = verify_certificate(certificate, trusted_key_b64=signer.public_key_b64)
    assert result["valid"], result["checks"]
    assert len(certificate["audit"]["events"]) == 5
    run = certificate["run"]
    assert run["review_digest"] == review_digest(task)
    assert {c["formula"] for c in run["calculations"]} >= {"corrosion.short_term_rate@1"}
    assert run["conflicts"][1]["resolution_evidence"] == "H1"


def test_an_edited_certificate_fails(tmp_path: Path) -> None:
    _, _, signer, certificate = _certified(tmp_path)
    certificate["run"]["verification"]["valid"] = True
    certificate["run"]["answer_sha256"] = "0" * 64
    result = verify_certificate(certificate, trusted_key_b64=signer.public_key_b64)
    failed = {c["name"] for c in result["checks"] if not c["passed"]}
    assert {"content hash", "signature"} <= failed


def test_a_certificate_from_another_key_is_not_trusted(tmp_path: Path) -> None:
    _, _, _, certificate = _certified(tmp_path)
    stranger = HostSigner(tmp_path / "stranger").public_key_b64
    result = verify_certificate(certificate, trusted_key_b64=stranger)
    assert not result["valid"] and [c["name"] for c in result["checks"] if not c["passed"]] == ["trusted key"]


def test_online_verification_notices_a_rewritten_log(tmp_path: Path) -> None:
    _, log, signer, certificate = _certified(tmp_path)
    lines = log.path.read_text().splitlines()
    lines[0] = lines[0].replace("step-0", "step-X")
    log.path.write_text("\n".join(lines) + "\n")
    result = verify_certificate(certificate, trusted_key_b64=signer.public_key_b64, audit=log)
    # Content edited, stored hash left alone: the chain sees it.
    assert [c["name"] for c in result["checks"] if not c["passed"]] == ["audit chain intact"]


def test_online_verification_notices_a_rechained_log(tmp_path: Path) -> None:
    _, log, signer, certificate = _certified(tmp_path)
    records = [json.loads(line) for line in log.path.read_text().splitlines()]
    records[0]["action"] = "step-X"
    previous = GENESIS_HASH
    for record in records:
        record["prev_hash"] = previous
        record["hash"] = log._digest(previous, {k: v for k, v in record.items() if k != "hash"})
        previous = record["hash"]
    log.path.write_text("\n".join(json.dumps(record) for record in records) + "\n")
    result = verify_certificate(certificate, trusted_key_b64=signer.public_key_b64, audit=log)
    # Rechained: the chain is fooled, the signed root is not.
    assert [c["name"] for c in result["checks"] if not c["passed"]] == ["log reproduces the root"]


def test_the_review_digest_moves_with_what_a_reviewer_sees() -> None:
    task, _ = _run()
    before = review_digest(task)
    task.answer = (task.answer or "") + " An extra sentence."
    assert review_digest(task) != before


# ------------------------------------------------------------------------ api
class TestApprovalIsBoundToWhatWasReviewed:
    @staticmethod
    def _account(username: str):
        from backend.core.identity import get_identity_service

        identity = get_identity_service()
        identity.ensure_seed_users()
        return identity.authenticate(username, "workbench").user

    def _held(self):
        task, _ = _run()
        task.id = str(uuid.uuid4())
        task.user_id = self._account("engineer").id
        task.conflicts = []
        task.assessment = None
        get_task_service()._persist(task)
        return get_task_service().get_task(task.id)

    def test_a_decision_on_a_changed_run_is_refused(self) -> None:
        task = self._held()
        stale = task.review_digest
        task.answer = "A different answer."
        get_task_service()._persist(task)
        with pytest.raises(TaskError, match="changed since you opened it"):
            asyncio.run(get_task_service().decide_approval(task.id, self._account("reviewer"), "approve", None, stale))

    def test_an_approval_records_the_digest_and_issues_a_certificate(self) -> None:
        task = self._held()
        decided = asyncio.run(get_task_service().decide_approval(
            task.id, self._account("reviewer"), "approve", None, task.review_digest))
        assert decided.approval.bound_digest == task.review_digest
        path = get_config().settings.storage_root / "proofs" / f"{task.id}.json"
        certificate = json.loads(path.read_text())
        assert certificate["run"]["approval"]["bound_digest"] == task.review_digest
        from backend.proof.signer import get_signer
        assert verify_certificate(certificate, trusted_key_b64=get_signer().public_key_b64)["valid"]

    def test_a_revision_request_needs_a_note_and_releases_nothing(self) -> None:
        task = self._held()
        reviewer = self._account("reviewer")
        with pytest.raises(TaskError, match="needs a note"):
            asyncio.run(get_task_service().decide_approval(task.id, reviewer, "request_revision", "  "))
        decided = asyncio.run(get_task_service().decide_approval(
            task.id, reviewer, "request_revision", "Cite the SOP clause for the interval."))
        assert decided.status.value == "revision_requested"
        assert decided.approval.decision == "revision_requested"
        assert not any(d.released for d in decided.deliverables)


def test_the_proof_api(tmp_path: Path) -> None:
    with TestClient(create_app()) as client:
        def login(username):
            token = client.post("/api/auth/login", json={"username": username, "password": "workbench"}).json()["token"]
            return {"Authorization": f"Bearer {token}"}
        auditor = login("auditor")
        key = client.get("/api/proof/key", headers=auditor).json()
        assert key["algorithm"] == "Ed25519" and len(key["key_id"]) == 16
        assert client.post("/api/audit/seal", headers=auditor).status_code == 200
        seals = client.get("/api/audit/seals", headers=auditor).json()
        assert seals["valid"] and seals["roots"] >= 1
        assert client.post("/api/audit/seal", headers=login("operator")).status_code == 403


def test_a_deliverable_changed_on_disk_is_not_served() -> None:
    import hashlib
    from datetime import datetime, timezone

    from backend.core.schemas import Deliverable

    task = TestApprovalIsBoundToWhatWasReviewed()._held()
    folder = get_config().settings.path("deliverables") / task.id
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "note.docx"
    path.write_bytes(b"the approved bytes")
    task.deliverables = [Deliverable(
        id="d1", filename="note.docx", format="docx", size_bytes=18,
        sha256=hashlib.sha256(b"the approved bytes").hexdigest(),
        download_url=f"/api/deliverables/{task.id}/note.docx", created_at=datetime.now(timezone.utc),
    )]
    get_task_service()._persist(task)
    with TestClient(create_app()) as client:
        token = client.post("/api/auth/login", json={"username": "reviewer", "password": "workbench"}).json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        served = client.get(f"/api/deliverables/{task.id}/note.docx", headers=headers)
        assert served.status_code == 200 and served.headers["X-Content-SHA256"] == task.deliverables[0].sha256
        path.write_bytes(b"different bytes")
        refused = client.get(f"/api/deliverables/{task.id}/note.docx", headers=headers)
        assert refused.status_code == 409 and "has changed since it was generated" in refused.json()["detail"]
