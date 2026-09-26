"""The measurements dashboard shows only figures an artifact backs.

Each metric is computed from something the backend produced -- usage
records, verification reports, audit events, a red-team report, stored
certificates -- and names it. A metric with nothing behind it is skipped
with a reason and carries no value; these tests hold both halves.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.core.audit import AuditLog
from backend.core.config import get_config
from backend.core.schemas import (
    ClaimVerdict,
    ModelUsage,
    Task,
    TaskStatus,
    VerificationCheck,
    VerificationReport,
)
from backend.proof.measurements import build_measurements
from backend.proof.signer import HostSigner

NOW = datetime.now(timezone.utc)


def _usage(stage: str, model: str, latency: int, tps: float | None = None, load: int | None = None) -> ModelUsage:
    return ModelUsage(stage=stage, model=model, latency_ms=latency, tokens_per_second=tps, load_ms=load, started_at=NOW)


def _task(usage: list[ModelUsage] | None = None, valid: bool | None = None, verdicts: list[str] = ()) -> Task:
    task = Task(id=str(uuid.uuid4()), prompt="p", status=TaskStatus.DELIVERED, user_id="u",
                created_at=NOW, updated_at=NOW, usage=usage or [])
    if valid is not None:
        task.verification = VerificationReport(
            valid=valid, completed_at=NOW,
            checks=[VerificationCheck(name="c", kind="source", passed=valid, detail="d")],
            claims=[ClaimVerdict(id=f"C{i}", text="t", kind="factual", verdict=v, reason="r")
                    for i, v in enumerate(verdicts)],
        )
    return task


def _build(tmp_path: Path, tasks: list[Task], audit: AuditLog | None = None):
    return {
        metric.id: metric
        for metric in build_measurements(
            tasks, scope="all runs", audit=audit or AuditLog(path=tmp_path / "audit.jsonl"),
            storage_root=tmp_path, trusted_key_b64=HostSigner(tmp_path / "keys").public_key_b64,
        ).metrics
    }


def test_nothing_recorded_means_every_metric_is_skipped_with_a_reason(tmp_path: Path) -> None:
    metrics = _build(tmp_path, [])
    for metric in metrics.values():
        assert metric.status == "skipped", metric.id
        assert metric.value is None and metric.display is None
        assert metric.reason
    assert "no evaluator" in metrics["retrieval_top1"].reason


def test_latency_and_speed_come_from_usage_records_and_name_them(tmp_path: Path) -> None:
    tasks = [
        _task([_usage("drafting", "qwen3:8b", 1000, 10.0, 40), _usage("vision_extraction", "qwen2.5vl", 5000)]),
        _task([_usage("drafting", "qwen3:8b", 3000, 20.0, 60)]),
    ]
    metrics = _build(tmp_path, tasks)
    latency = metrics["latency_all"]
    assert latency.status == "measured" and latency.value == 3000 and latency.sample == "3 call(s)"
    assert latency.source.kind == "runs" and set(latency.source.run_ids) == {t.id for t in tasks}
    assert metrics["latency_vision"].value == 5000
    assert metrics["tokens_per_second"].value == 15.0
    assert metrics["load_ms"].value == 50.0
    # Golden accuracy is never inferred from anything else on the host.
    assert metrics["golden_accuracy"].status == "skipped"


def test_verification_figures_count_what_the_verifier_recorded(tmp_path: Path) -> None:
    tasks = [_task(valid=True, verdicts=["SUPPORTED", "CALCULATED"]),
             _task(valid=False, verdicts=["UNSUPPORTED"]), _task()]
    metrics = _build(tmp_path, tasks)
    assert metrics["verification_valid"].display == "1 / 2"
    assert metrics["claims_supported"].display == "2 / 3"
    assert {p.label: p.display for p in metrics["claims_supported"].breakdown}["UNSUPPORTED"] == "1"


def test_egress_and_sandbox_come_from_audit_events(tmp_path: Path) -> None:
    task = _task()
    unwatched = _task()
    log = AuditLog(path=tmp_path / "audit.jsonl")
    log.record(category="task", action="finished:delivered", actor="e", task_id=task.id,
               detail={"egress": {"unapproved_connections_observed": 0, "method": "sampling"}})
    log.record(category="task", action="finished:delivered", actor="e", task_id=unwatched.id,
               detail={"egress": {"unapproved_connections_observed": None, "reason": "not running"}})
    log.record(category="security", action="sandbox_self_test", actor="e",
               detail={"assessable": True, "passed": 9, "total": 9, "backend": "job-object"})
    metrics = _build(tmp_path, [task, unwatched], log)
    egress = metrics["egress_runs"]
    assert egress.value == 0 and egress.verdict == "good" and "1 run(s) were not watched" in egress.reason
    sandbox = metrics["sandbox_self_test"]
    assert sandbox.display == "9 / 9 held" and sandbox.source.name.startswith("audit event #")


def test_an_unassessable_sandbox_is_skipped_not_passed(tmp_path: Path) -> None:
    log = AuditLog(path=tmp_path / "audit.jsonl")
    log.record(category="security", action="sandbox_self_test", actor="e",
               detail={"assessable": False, "reason": "execution disabled on this host"})
    sandbox = _build(tmp_path, [], log)["sandbox_self_test"]
    assert sandbox.status == "skipped" and sandbox.value is None and "disabled" in sandbox.reason


def _report(folder: Path, held: int, total: int) -> Path:
    results = [{"id": f"A{i}", "outcome": "held" if i < held else "BREACHED"} for i in range(total)]
    canonical = json.dumps(results, sort_keys=True, separators=(",", ":"), default=str)
    report = {"summary": {"total": total, "held": held, "breached": total - held, "inconclusive": 0},
              "results": results, "results_sha256": hashlib.sha256(canonical.encode()).hexdigest(),
              "finished_at": NOW.isoformat(), "target": "http://127.0.0.1:8000"}
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "red-team-20260925T101500Z.json"
    path.write_text(json.dumps(report))
    return path


def test_the_red_team_figure_is_the_latest_report_rehashed(tmp_path: Path) -> None:
    path = _report(tmp_path / "reports", 31, 31)
    red = _build(tmp_path, [])["red_team"]
    assert red.display == "31 / 31" and red.verdict == "good"
    assert red.source.name == path.name and red.source.sha256 == hashlib.sha256(path.read_bytes()).hexdigest()
    report = json.loads(path.read_text())
    report["results"][0]["outcome"] = "held (edited)"
    path.write_text(json.dumps(report))
    edited = _build(tmp_path, [])["red_team"]
    assert edited.verdict == "bad" and "edited" in edited.reason


def test_the_api_scopes_runs_and_serves_only_report_files() -> None:
    root = get_config().settings.storage_root
    _report(root / "reports", 30, 31)
    with TestClient(create_app()) as client:
        def login(username):
            token = client.post("/api/auth/login", json={"username": username, "password": "workbench"}).json()["token"]
            return {"Authorization": f"Bearer {token}"}
        auditor = client.get("/api/measurements", headers=login("auditor")).json()
        operator = client.get("/api/measurements", headers=login("operator")).json()
        assert auditor["scope"] == "all runs" and operator["scope"] == "your runs"
        red = next(m for m in auditor["metrics"] if m["id"] == "red_team")
        assert red["display"] == "30 / 31" and red["verdict"] == "bad"
        served = client.get(red["source"]["href"], headers=login("operator"))
        assert served.status_code == 200 and served.json()["summary"]["held"] == 30
        assert client.get("/api/measurements/reports/..%2Fworkbench.db", headers=login("operator")).status_code == 404
        assert client.get("/api/measurements/reports/notes.json", headers=login("operator")).status_code == 404
        client.cookies.clear()
        assert client.get("/api/measurements").status_code == 401
