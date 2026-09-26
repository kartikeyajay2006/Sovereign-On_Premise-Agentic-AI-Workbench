"""The run certificate carries the run's provenance, recorded while it ran.

Model digests, the config and policy the run started under, the egress
monitor's reading and the sandbox's measurements come from the audit log and
the run's own records -- never from the host at certificate time -- and sit
under the certificate's signature, so editing any of them is detected.
"""

from __future__ import annotations

import asyncio
import copy
import dataclasses
import hashlib
from datetime import datetime, timezone
from pathlib import Path

from backend.core.audit import AuditLog
from backend.core.schemas import ToolCall
from backend.proof.audit_roots import AuditSeal
from backend.proof.certificate import CERTIFICATE_VERSION, issue_certificate, verify_certificate
from backend.proof.provenance import CONFIG_SNAPSHOT_ACTION, config_snapshot
from backend.proof.signer import HostSigner, canonical
from tests.test_conflicts import REVIEWER, _run

DIGEST = "a" * 64


def _python_exec_call() -> ToolCall:
    return ToolCall(
        id="call-1", tool="python_exec", ok=True, output_summary="sandbox exit 0 in 40ms",
        started_at=datetime.now(timezone.utc), duration_ms=40,
        output={
            "result": {"ok": True, "exit_code": 0, "stdout": "1", "stderr": "", "duration_ms": 40,
                       "timed_out": False, "memory_limit_mb": 1024, "static_validation_passed": True,
                       "static_violations": [], "generated_files": [], "network_attempts_blocked": 2},
            "limits": {"mechanism": "windows_job_object", "memory_mb": 1024, "cpu_seconds": 30,
                       "active_process_limit": 4, "wall_timeout_seconds": 45.0, "kill_on_close": True,
                       "die_on_unhandled_exception": True},
        },
    )


def _certified(tmp_path: Path, *, snapshot: bool = True):
    task, orchestrator = _run()
    # Settled, so the run computes its figures and has formulas to certify.
    asyncio.run(orchestrator.resolve_conflict(task, REVIEWER, "K2", candidate=0, value=None,
                                              reason="the plant grid point governs"))
    task.tool_calls.append(_python_exec_call())
    log = AuditLog(path=tmp_path / "audit.jsonl")
    if snapshot:
        log.record(category="proof", action=CONFIG_SNAPSHOT_ACTION, actor="engineer", task_id=task.id,
                   detail=config_snapshot())
    log.record(category="model", action="inference_started", actor="engineer", task_id=task.id,
               detail={"stage": "vision_extraction", "model": "qwen2.5vl:3b", "model_digest": DIGEST,
                       "integrity": "verified"})
    log.record(category="model", action="inference_started", actor="engineer", task_id=task.id,
               detail={"stage": "reasoning", "model": "qwen2.5:3b", "model_version": "Q4_K_M"})
    log.record(category="other", action="noise", actor="someone", task_id="another-run",
               detail={"model": "someone-else"})
    log.record(category="task", action="finished:awaiting_approval", actor="engineer", task_id=task.id,
               detail={"egress": {"unapproved_connections_observed": 0, "method": "sampling"}})
    signer = HostSigner(tmp_path / "keys")
    return task, log, signer, issue_certificate(task, log, AuditSeal(log, signer), signer)


def test_the_certificate_states_what_the_run_ran_on(tmp_path: Path) -> None:
    _, log, signer, certificate = _certified(tmp_path)
    assert certificate["version"] == CERTIFICATE_VERSION == 2
    provenance = certificate["run"]["provenance"]

    models = {entry["model"]: entry for entry in provenance["models"]}
    assert set(models) == {"qwen2.5vl:3b", "qwen2.5:3b"}, "only this run's inferences"
    assert models["qwen2.5vl:3b"]["digests"] == [DIGEST]
    assert models["qwen2.5vl:3b"]["integrity"] == "verified"
    # No digest recorded when it ran: said so, not filled in from the registry.
    assert models["qwen2.5:3b"]["digests"] == []
    assert "no digest" in models["qwen2.5:3b"]["digest_note"]

    config = provenance["config"]
    assert config["recorded"] == "when the run started"
    policy = Path(__file__).resolve().parents[1] / "policies" / "access-control.yaml"
    assert config["files"]["policies/access-control.yaml"] == hashlib.sha256(policy.read_bytes()).hexdigest()
    assert "config/app.yaml" in config["files"]
    assert provenance["policy_versions"]["policies/access-control.yaml"] == 1
    # The version the prompt file declares, whatever it is now.
    prompts = Path(__file__).resolve().parents[1] / "config" / "prompts" / "prompts.yaml"
    declared = next(line for line in prompts.read_text(encoding="utf-8").splitlines() if line.startswith("prompts_version:"))
    assert provenance["prompt_library"]["version"] == int(declared.split(":", 1)[1])
    assert provenance["prompt_library"]["file"] == "config/prompts/prompts.yaml"

    assert provenance["egress"]["monitor"]["unapproved_connections_observed"] == 0
    assert provenance["egress"]["sandbox_network_attempts_blocked"] == 2
    execution = provenance["sandbox"]["executions"][0]
    assert execution["ran"] is True and execution["limits"]["mechanism"] == "windows_job_object"
    assert {f"{f['formula']}@{f['version']}" for f in provenance["formulas"]} >= {"corrosion.short_term_rate@1"}
    assert all(len(f["source_sha256"]) == 64 for f in provenance["formulas"])

    result = verify_certificate(certificate, trusted_key_b64=signer.public_key_b64, audit=log)
    assert result["valid"], result["checks"]
    names = {check["name"] for check in result["checks"]}
    assert {"provenance present", "provenance matches the log", "formula sources"} <= names


def test_an_edited_digest_breaks_the_signature(tmp_path: Path) -> None:
    _, _, signer, certificate = _certified(tmp_path)
    certificate["run"]["provenance"]["models"][1]["digests"] = ["b" * 64]
    result = verify_certificate(certificate, trusted_key_b64=signer.public_key_b64)
    failed = {c["name"] for c in result["checks"] if not c["passed"]}
    assert {"content hash", "signature"} <= failed


def test_a_re_signed_certificate_that_disagrees_with_the_log_fails_online(tmp_path: Path) -> None:
    """Even the key holder cannot certify a digest the log never recorded."""
    _, log, signer, certificate = _certified(tmp_path)
    forged = copy.deepcopy(certificate)
    forged.pop("signature")
    forged.pop("content_sha256")
    forged["run"]["provenance"]["config"]["files"]["config/app.yaml"] = "0" * 64
    content_sha256 = hashlib.sha256(canonical(forged)).hexdigest()
    forged = {**forged, "content_sha256": content_sha256}
    forged["signature"] = signer.sign(forged)
    result = verify_certificate(forged, trusted_key_b64=signer.public_key_b64, audit=log)
    assert [c["name"] for c in result["checks"] if not c["passed"]] == ["provenance matches the log"]


def test_a_run_without_a_snapshot_says_so(tmp_path: Path) -> None:
    _, log, signer, certificate = _certified(tmp_path, snapshot=False)
    config = certificate["run"]["provenance"]["config"]
    assert config["recorded"] is None and "no configuration snapshot" in config["reason"]
    assert certificate["run"]["provenance"]["policy_versions"] is None
    assert verify_certificate(certificate, trusted_key_b64=signer.public_key_b64, audit=log)["valid"]


def test_a_version_one_certificate_still_verifies(tmp_path: Path) -> None:
    _, log, signer, certificate = _certified(tmp_path)
    legacy = {key: value for key, value in copy.deepcopy(certificate).items()
              if key not in ("signature", "content_sha256")}
    legacy["version"] = 1
    legacy["run"].pop("provenance")
    legacy = {**legacy, "content_sha256": hashlib.sha256(canonical(legacy)).hexdigest()}
    legacy["signature"] = signer.sign(legacy)
    result = verify_certificate(legacy, trusted_key_b64=signer.public_key_b64, audit=log)
    assert result["valid"], result["checks"]
    assert not any(c["name"].startswith("provenance") for c in result["checks"])


def test_a_version_two_certificate_without_provenance_fails(tmp_path: Path) -> None:
    _, _, signer, certificate = _certified(tmp_path)
    stripped = {key: value for key, value in copy.deepcopy(certificate).items()
                if key not in ("signature", "content_sha256")}
    stripped["run"].pop("provenance")
    stripped = {**stripped, "content_sha256": hashlib.sha256(canonical(stripped)).hexdigest()}
    stripped["signature"] = signer.sign(stripped)
    result = verify_certificate(stripped, trusted_key_b64=signer.public_key_b64)
    assert [c["name"] for c in result["checks"] if not c["passed"]] == ["provenance present"]


def test_a_formula_edited_without_a_version_bump_is_named(tmp_path: Path, monkeypatch) -> None:
    from backend.engineering import formulas

    _, _, signer, certificate = _certified(tmp_path)
    formula = formulas.FORMULAS["corrosion.short_term_rate"]
    # The same id and version, with different source.
    edited = dataclasses.replace(formula, expression=formula.expression + " (edited)")
    monkeypatch.setitem(formulas.FORMULAS, "corrosion.short_term_rate", edited)
    result = verify_certificate(certificate, trusted_key_b64=signer.public_key_b64)
    failed = [c for c in result["checks"] if not c["passed"]]
    assert [c["name"] for c in failed] == ["formula sources"]
    assert "corrosion.short_term_rate@1" in failed[0]["detail"]


def test_the_worker_snapshots_config_into_the_certified_log() -> None:
    """Through the service: the snapshot is audited, and the certificate reports it."""
    import uuid

    from backend.api.task_service import get_task_service
    from tests.test_proof import TestApprovalIsBoundToWhatWasReviewed as Approval

    service = get_task_service()
    task = Approval()._held()
    task.id = str(uuid.uuid4())
    service._persist(task)
    engineer = Approval._account("engineer")
    service._snapshot_config(task, engineer)
    certificate = service._certify(task, engineer)
    assert certificate is not None
    assert certificate["run"]["provenance"]["config"]["recorded"] == "when the run started"
    assert certificate["run"]["provenance"]["config"]["files"] == config_snapshot()["files"]
