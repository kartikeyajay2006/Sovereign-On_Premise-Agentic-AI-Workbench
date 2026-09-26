"""The golden-demo check passes only on what the API returned.

scripts/golden_demo.py is run against a live installation an hour before
judging. These tests never do that: every response comes from a fake API
behind httpx.MockTransport, so what is tested is the script's judgement --
which responses pass, which fail, and that a check it could not carry out is
reported as NOT MEASURED and keeps the final status at NOT READY.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from scripts import golden_demo
from scripts.golden_demo import FAIL, NOT_MEASURED, PASS, GoldenDemo, final_status, report_lines

EXPECTED = {"governing_location": "Shell course 2 (mid)", "governing_rate_mm_yr": 0.55,
            "governing_remaining_life_years": 6.18, "severity": "medium"}


def _record(formula_id: str) -> dict[str, Any]:
    return {"formula_id": formula_id, "status": "calculated", "formula_hash": "f" * 64, "result_hash": "r" * 64}


def _decision(**overrides: Any) -> dict[str, Any]:
    return {"status": "calculated", "governing_location": "Shell course 2 (mid)", "governing_rate_mm_yr": 0.55,
            "remaining_life_years": 6.18, "severity": "medium", "missing": [], "conflicts": [], **overrides}


class FakeAPI:
    """Just enough of the AEGIS API for the three demos, with knobs to break it."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []
        self.asset_assessment = _decision()
        self.asset_status = "awaiting_approval"
        self.conflict_status = "awaiting_approval"
        self.conflict_assessment: dict[str, Any] = {"status": "conflicted", "conflicts": ["K1"]}
        self.self_approval_status = 403
        self.certificate_valid = True
        self.chain_valid = True
        self.stuck = False
        self.uploads = 0
        self.tasks: dict[str, dict[str, Any]] = {}

    def _conflict_task(self, task_id: str) -> dict[str, Any]:
        return {
            "id": task_id, "status": self.conflict_status, "assessment": self.conflict_assessment,
            "calculations": [], "evidence": [{"id": "F1", "kind": "uploaded_file"}, {"id": "F2", "kind": "uploaded_file"}],
            "approval": {"required": True, "reasons": ["unresolved_conflict: sources disagree"],
                         "approver_roles": ["reviewer", "administrator"]},
            "conflicts": [{"id": "K1", "kind": "input", "status": "unresolved", "impact": "high",
                           "label": "Shell course 2 (mid) 2026 reading", "candidates": [
                               {"stated": "9.9 mm", "evidence_id": "F2",
                                "source_document": "V-2104-contractor-field-sheet.md"},
                               {"stated": "9.4 mm", "evidence_id": "F1",
                                "source_document": "V-2104-thickness-survey.csv"}]}],
        }

    def handler(self, request: httpx.Request) -> httpx.Response:
        method, path = request.method, request.url.path
        self.calls.append((method, path))
        if path == "/api/auth/login":
            user = json.loads(request.content)["username"]
            return httpx.Response(200, json={"token": f"token-{user}"})
        if path == "/api/engineering/assess":
            return httpx.Response(200, json={"assessment": _decision(severity="low"),
                                             "calculations": [_record("corrosion.short_term_rate"),
                                                              _record("integrity.remaining_life")]})
        if path.startswith("/api/pid/"):
            return httpx.Response(200, json={"drawing": "PID-2104-01 rev B", "branches": [{"compliant": True}] * 5,
                                             "actions": [{}] * 5})
        if path == "/api/files":
            self.uploads += 1
            return httpx.Response(201, json={"id": f"file-{self.uploads}"})
        if path == "/api/tasks" and method == "POST":
            body = json.loads(request.content)
            kind = "asset" if body["deliverable_format"] == "docx" else "conflict"
            task_id = f"{kind}-task"
            self.tasks[task_id] = {"kind": kind, "file_ids": body["file_ids"]}
            return httpx.Response(202, json={"id": task_id, "status": "received"})
        if path.startswith("/api/tasks/") and method == "GET" and path.count("/") == 3:
            task_id = path.rsplit("/", 1)[-1]
            if self.stuck:
                return httpx.Response(200, json={"id": task_id, "status": "executing"})
            if task_id == "asset-task":
                return httpx.Response(200, json={
                    "id": task_id, "status": self.asset_status, "assessment": self.asset_assessment,
                    "calculations": [_record("integrity.remaining_life")], "conflicts": [], "evidence": [],
                    "approval": {"required": True, "approver_roles": ["reviewer", "administrator"],
                                 "reasons": ["sensitive_classification: x", "released_deliverable: y"]}})
            return httpx.Response(200, json=self._conflict_task(task_id))
        if path.endswith("/approve"):
            return httpx.Response(self.self_approval_status, json={"detail": "role 'engineer' does not grant"})
        if path.endswith("/certificate"):
            return httpx.Response(200, json={"certificate": "signed"})
        if path == "/api/proof/verify":
            return httpx.Response(200, json={"valid": self.certificate_valid, "key_id": "k1", "checks": [
                {"name": "signature", "passed": True}, {"name": "audit_root", "passed": self.certificate_valid}]})
        if path.endswith("/resolve"):
            body = json.loads(request.content)
            task = self._conflict_task(path.split("/")[3])
            chosen = task["conflicts"][0]["candidates"][body["candidate"]]
            task["conflicts"][0].update(status="resolved", resolution={"evidence_id": "H1", "stated": chosen["stated"]})
            task["evidence"].append({"id": "H1", "kind": "human"})
            task["assessment"] = _decision(severity="low") if chosen["stated"] == "9.4 mm" else _decision(
                governing_rate_mm_yr=0.425, remaining_life_years=9.18)
            return httpx.Response(200, json=task)
        if path == "/api/audit/chain":
            return httpx.Response(200, json={"valid": self.chain_valid, "events": 42, "head_hash": "h",
                                             "broken_at": None if self.chain_valid else 7})
        return httpx.Response(404, json={"detail": f"fake API has no {method} {path}"})


def _red_team(outcomes: dict[str, str] | None = None) -> dict[str, Any]:
    ids = ["UPLOAD-01", "UPLOAD-CONTROL", "INJECT-01", "SANDBOX-01", "SANDBOX-02", "EGRESS-01", "EGRESS-02",
           "EGRESS-03", "EGRESS-04", "SANDBOX-RUNTIME", "RETRIEVE-01", "PRIV-01", "AUTH-01", "AUDIT-01", "AUDIT-02"]
    outcomes = outcomes or {}
    results = [{"id": i, "outcome": outcomes.get(i, "held")} for i in ids]
    return {"summary": {"total": len(results), "held": sum(r["outcome"] == "held" for r in results),
                        "breached": sum(r["outcome"] == "BREACHED" for r in results),
                        "inconclusive": sum(r["outcome"] == "inconclusive" for r in results)},
            "results": results, "results_sha256": "s" * 64}


def _run(api: FakeAPI, red_team: Any = _red_team, only: list[str] | None = None) -> dict[str, Any]:
    client = httpx.Client(transport=httpx.MockTransport(api.handler), base_url="http://golden.test")
    ticks = iter(range(0, 10_000, 10))
    demo = GoldenDemo(client, run_timeout=60, poll_seconds=0, red_team=red_team, sleep=lambda _: None,
                      clock=lambda: next(ticks), expected=EXPECTED)
    checks = demo.run(only)
    return {"checks": checks, "by_name": {c.name: c for c in checks}}


def test_every_demo_behaving_reports_ready_in_the_plan_format() -> None:
    result = _run(FakeAPI())
    assert {c.name: c.status for c in result["checks"]} == {name: PASS for name in result["by_name"]}
    lines = report_lines(result["checks"], "http://golden.test")
    text = "\n".join(lines)
    assert lines[0] == "AEGIS GOLDEN DEMO CHECK" and lines[-1] == "FINAL STATUS: READY"
    assert "Formula Engine ...." in text and "Conflict Detection ...." in text
    assert "Prompt Injection" in text and text.count("BLOCKED") == 5
    assert "Invalid Upload" in text and "REJECTED" in text and "DENIED" in text and "DETECTED" in text
    assert "15 / 15 red team checks held" in text


def test_the_resolution_chooses_the_plant_survey_reading() -> None:
    result = _run(FakeAPI(), only=["conflict"])
    resolution = result["by_name"]["Human Resolution"]
    assert resolution.status == PASS
    assert resolution.observed["accepted"] == "9.4 mm" and resolution.observed["evidence_id"] == "H1"


def test_a_registry_figure_that_differs_from_the_expected_answer_fails() -> None:
    api = FakeAPI()
    api.asset_assessment = _decision(remaining_life_years=6.0, severity="high")
    check = _run(api, only=["asset"])["by_name"]["Asset Integrity Run"]
    assert check.status == FAIL
    assert "remaining_life_years 6.0, expected 6.18" in check.detail and "severity 'high'" in check.detail


def test_a_conflicted_run_that_states_a_figure_or_is_delivered_fails() -> None:
    api = FakeAPI()
    api.conflict_assessment = {"status": "conflicted", "remaining_life_years": 6.18}
    assert _run(api, only=["conflict"])["by_name"]["Conflict Detection"].status == FAIL

    api = FakeAPI()
    api.conflict_status = "delivered"
    check = _run(api, only=["conflict"])["by_name"]["Conflict Detection"]
    assert check.status == FAIL and "delivered" in check.detail


def test_a_run_the_model_answered_without_the_conflict_fails() -> None:
    api = FakeAPI()
    api.conflict_assessment = _decision()
    result = _run(api, only=["conflict"])
    assert result["by_name"]["Conflict Detection"].status == FAIL
    # Nothing to resolve is not a failure of resolution: it was not measured.
    assert result["by_name"]["Human Resolution"].status == NOT_MEASURED


def test_self_approval_that_is_not_refused_fails_the_policy_check() -> None:
    api = FakeAPI()
    api.self_approval_status = 200
    assert _run(api, only=["asset"])["by_name"]["Approval Policy"].status == FAIL


def test_an_invalid_certificate_fails() -> None:
    api = FakeAPI()
    api.certificate_valid = False
    check = _run(api, only=["asset"])["by_name"]["Certificate Verification"]
    assert check.status == FAIL and "audit_root" in check.detail


def test_a_run_that_never_finishes_is_not_measured_and_nothing_downstream_passes() -> None:
    api = FakeAPI()
    api.stuck = True
    result = _run(api, only=["asset"])
    by_name = result["by_name"]
    assert by_name["Formula Engine"].status == PASS
    assert by_name["Asset Integrity Run"].status == NOT_MEASURED and "still executing" in by_name["Asset Integrity Run"].detail
    assert by_name["Approval Policy"].status == NOT_MEASURED
    assert by_name["Certificate Verification"].status == NOT_MEASURED
    assert final_status(result["checks"]) == "NOT READY (3 not measured)"
    # No approval was attempted on a run that was never checked.
    assert not any(path.endswith("/approve") for _, path in api.calls)


def test_a_breached_attack_fails_its_group_and_an_inconclusive_one_is_not_measured() -> None:
    report = _red_team({"EGRESS-02": "BREACHED", "AUDIT-01": "inconclusive"})
    by_name = _run(FakeAPI(), red_team=lambda: report, only=["attack"])["by_name"]
    assert by_name["DNS"].status == FAIL and "EGRESS-02" in by_name["DNS"].detail
    assert by_name["Audit Tampering"].status == NOT_MEASURED
    assert by_name["Raw Socket"].status == PASS
    assert by_name["Red Team Total"].status == FAIL and by_name["Red Team Total"].detail == "13 / 15 red team checks held"


def test_an_attack_the_groups_do_not_know_is_still_counted() -> None:
    report = _red_team()
    report["results"].append({"id": "NEW-01", "outcome": "BREACHED"})
    by_name = _run(FakeAPI(), red_team=lambda: report, only=["attack"])["by_name"]
    assert by_name["Other Attacks"].status == FAIL


def test_a_red_team_that_cannot_run_is_not_measured_not_passed() -> None:
    def broken() -> dict[str, Any]:
        raise RuntimeError("no audit log")
    result = _run(FakeAPI(), red_team=broken, only=["attack"])
    assert result["by_name"]["Red Team"].status == NOT_MEASURED
    assert final_status(result["checks"]).startswith("NOT READY")


def test_a_broken_audit_chain_fails() -> None:
    api = FakeAPI()
    api.chain_valid = False
    assert _run(api, only=["attack"])["by_name"]["Audit Chain"].status == FAIL


def test_an_unreachable_api_is_not_measured() -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)
    client = httpx.Client(transport=httpx.MockTransport(refuse), base_url="http://golden.test")
    checks = GoldenDemo(client, red_team=_red_team, expected=EXPECTED, sleep=lambda _: None).run(["asset"])
    assert {c.status for c in checks} == {NOT_MEASURED}


def test_plan_lists_every_check_and_calls_nothing(monkeypatch: pytest.MonkeyPatch, capsys) -> None:
    def no_network(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("--plan must not open a client")
    monkeypatch.setattr(golden_demo.httpx, "Client", no_network)
    assert golden_demo.main(["--plan"]) == 0
    printed = capsys.readouterr().out
    for _, _, checks in golden_demo.DEMOS:
        for name, _ in checks:
            assert name in printed
    assert golden_demo.main(["--dry-run", "--only", "conflict"]) == 0
    printed = capsys.readouterr().out
    assert "Conflict Detection" in printed and "Formula Engine" not in printed


def test_the_model_free_checks_pass_against_the_real_app_and_runs_are_not_measured() -> None:
    """The fake above is only as good as its likeness to the API; this is the API.

    In-process, against the isolated test storage: the formula registry, the
    P&ID graph and the audit chain need no model. With runs switched off no
    task is ever submitted, so nothing here can reach a model runtime.
    """
    from fastapi.testclient import TestClient

    from backend.api.main import create_app

    with TestClient(create_app()) as client:
        demo = GoldenDemo(client, red_team=None, runs=False)
        checks = demo.run()
    by_name = {c.name: c for c in checks}
    for name in ("Formula Engine", "P&ID Isolation", "Audit Chain"):
        assert by_name[name].status == PASS, by_name[name].detail
    assert "Shell course 2 (mid): 0.55 mm/yr, 6.18 years" in by_name["Formula Engine"].detail
    for name in ("Asset Integrity Run", "Approval Policy", "Certificate Verification",
                 "Conflict Detection", "Human Resolution", "Red Team"):
        assert by_name[name].status == NOT_MEASURED, name
    assert final_status(checks).startswith("NOT READY")


def test_the_expected_answers_file_carries_what_the_checks_compare() -> None:
    expected = json.loads(golden_demo.EXPECTED.read_text(encoding="utf-8"))
    for key in EXPECTED:
        assert expected[key] == EXPECTED[key]
    for path in (golden_demo.SCAN, golden_demo.SURVEY_CSV, golden_demo.FIELD_SHEET):
        assert path.exists(), path
