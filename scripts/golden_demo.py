#!/usr/bin/env python3
"""Check, against a running AEGIS API, that the three golden demos still behave.

    .venv/bin/python scripts/golden_demo.py --plan                 # list the checks; calls nothing
    .venv/bin/python scripts/golden_demo.py                        # http://127.0.0.1:8000
    .venv/bin/python scripts/golden_demo.py --base-url http://host:8000 --only asset conflict
    .venv/bin/python scripts/golden_demo.py --no-runs              # only the checks that need no model

Run it about an hour before judging, on the demo host, with the models
warm. It drives the demos the way a person at the keyboard would, through the
API with the seeded accounts, and passes a check only on what the API
returned:

1. Can this asset continue operating? The formula registry computes the
   V-2104 decision; the P&ID graph answers isolation; a run over the scanned
   report states the registry's figures, is held for approval, and its signed
   certificate verifies.
2. The AI refuses to guess. Two records that disagree about one reading
   withhold every figure until a reviewer chooses, and the choice recomputes
   the decision.
3. Attack the system. Every attack in backend/security/red_team.py is
   refused, and the audit chain verifies.

A check that could not be carried out is NOT MEASURED, never PASS, and the
final status is READY only when every selected check passed. The runs it
creates are real runs on the target: never point it at an instance whose
task list must stay as it is. The report, with every observation, is written
to storage/reports/golden-demo-<UTC time>.json. Exit code 0 only when READY.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "http://127.0.0.1:8000"

PASS, FAIL, NOT_MEASURED = "PASS", "FAIL", "NOT MEASURED"
TERMINAL = {"delivered", "awaiting_approval", "failed", "blocked", "rejected", "cancelled", "revision_requested"}

SCAN = ROOT / "sample_data" / "inspection" / "scanned-inspection-report-V-2104.pdf"
SURVEY_CSV = ROOT / "sample_data" / "datasets" / "V-2104-thickness-survey.csv"
FIELD_SHEET = ROOT / "sample_data" / "conflict" / "V-2104-contractor-field-sheet.md"
EXPECTED = ROOT / "sample_data" / "expected-answers.json"
DRAWING, ISOLATE = "PID-2104-01", "V-2104"

# The Scenario 6 prompt in docs/DEMO.md: the approval note the judges see.
ASSET_PROMPT = (
    "Read the attached scanned inspection report for vessel V-2104 and prepare an approval note based on our "
    "approved SOPs. State the governing location, the corrosion rate and remaining life with the inputs used, "
    "the severity and the clause it rests on, and who must approve it."
)
CONFLICT_PROMPT = "Calculate the corrosion rate and remaining life of V-2104 and state the severity."
RESOLUTION_REASON = "Golden demo check: the plant survey record governs; the contractor re-check was off-grid."

# What each golden demo is checked for. --plan prints this and nothing else.
DEMOS: list[tuple[str, str, list[tuple[str, str]]]] = [
    ("asset", "DEMO 1 - Can this asset continue operating?", [
        ("Formula Engine", "POST /api/engineering/assess with the V-2104 survey: the registry computes the "
                           "governing location, rate and remaining life in sample_data/expected-answers.json, "
                           "every figure with a formula version and result hash (no model call)"),
        ("P&ID Isolation", f"POST /api/pid/{DRAWING}/query: the drawing graph returns the isolation branches "
                           f"and actions for {ISOLATE}"),
        ("Asset Integrity Run", "upload the scanned V-2104 report and ask for the approval note (DEMO.md "
                                "Scenario 6): the run's assessment is calculated by the registry and matches "
                                "the expected location, rate, life and severity"),
        ("Approval Policy", "that run is held for approval with named approver roles, and its submitter's "
                            "own approval is refused"),
        ("Certificate Verification", "GET /api/tasks/{id}/certificate, then POST /api/proof/verify: valid, "
                                     "every check passed"),
    ]),
    ("conflict", "DEMO 2 - The AI refuses to guess", [
        ("Conflict Detection", "upload the V-2104 survey and the contractor field sheet (9.4 mm vs 9.9 mm) and "
                               "ask for the remaining life: the assessment is conflicted, no figure is stated, "
                               "an unresolved conflict names both sources, and the run is not delivered"),
        ("Human Resolution", "as reviewer, choose the plant reading: the conflict is resolved by an H evidence "
                             "item and the registry recomputes the expected remaining life"),
    ]),
    ("attack", "DEMO 3 - Attack the system", [
        ("Red Team", "every attack in backend/security/red_team.py against the API; each group below must "
                     "be refused (an attack that could not be carried out is NOT MEASURED)"),
        ("Audit Chain", "GET /api/audit/chain: the hash chain verifies"),
    ]),
]

# How red-team results are grouped on screen, by result-id prefix, and the
# word shown when every attack in the group held. The order is the plan's.
RED_TEAM_GROUPS: list[tuple[str, str, tuple[str, ...]]] = [
    ("Prompt Injection", "BLOCKED", ("INJECT-",)),
    ("Host File Read", "BLOCKED", ("SANDBOX-01", "SANDBOX-02")),
    ("HTTP Egress", "BLOCKED", ("EGRESS-03", "EGRESS-04")),
    ("DNS", "BLOCKED", ("EGRESS-02",)),
    ("Raw Socket", "BLOCKED", ("EGRESS-01",)),
    ("Sandbox Runtime", "CONTAINED", ("SANDBOX-RUNTIME",)),
    ("Invalid Upload", "REJECTED", ("UPLOAD-",)),
    ("Unauthorized Access", "DENIED", ("RETRIEVE-", "PRIV-", "AUTH-")),
    ("Audit Tampering", "DETECTED", ("AUDIT-",)),
]


@dataclass
class Check:
    demo: str
    name: str
    status: str
    detail: str = ""
    # The word printed on a pass: PASS, or BLOCKED/DENIED/... for an attack group.
    verdict: str = PASS
    observed: dict[str, Any] = field(default_factory=dict)

    @property
    def shown(self) -> str:
        return self.verdict if self.status == PASS else self.status


class Unmeasured(Exception):
    """The check could not be carried out; it is reported, never passed."""


class GoldenDemo:
    """The checks, over any httpx-shaped client (a live API, or a fake in tests)."""

    def __init__(
        self,
        client: Any,
        *,
        password: str = "workbench",
        run_timeout: float = 1800,
        poll_seconds: float = 3,
        red_team: Callable[[], dict[str, Any]] | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
        expected: dict[str, Any] | None = None,
        runs: bool = True,
    ) -> None:
        self.client = client
        # False: skip every check that needs a model run. Those are reported
        # NOT MEASURED, so the final status cannot be READY without them.
        self.runs = runs
        self.password = password
        self.run_timeout = run_timeout
        self.poll_seconds = poll_seconds
        self.red_team = red_team
        self.sleep = sleep
        self.clock = clock
        self.expected = expected if expected is not None else json.loads(EXPECTED.read_text(encoding="utf-8"))
        self.checks: list[Check] = []
        self._tokens: dict[str, str] = {}

    # -- plumbing ---------------------------------------------------------
    def _headers(self, username: str) -> dict[str, str]:
        if username not in self._tokens:
            response = self.client.post("/api/auth/login", json={"username": username, "password": self.password})
            if response.status_code != 200:
                raise Unmeasured(f"cannot sign in as {username}: HTTP {response.status_code}")
            self._tokens[username] = response.json()["token"]
        return {"Authorization": f"Bearer {self._tokens[username]}"}

    def _json(self, method: str, path: str, user: str, *, expect: int = 200, **kwargs: Any) -> Any:
        response = self.client.request(method, path, headers=self._headers(user), **kwargs)
        if response.status_code != expect:
            raise AssertionError(f"{method} {path} returned HTTP {response.status_code}: {response.text[:300]}")
        return response.json()

    def _upload(self, path: Path, user: str = "engineer") -> dict[str, Any]:
        with path.open("rb") as handle:
            return self._json("POST", "/api/files", user, expect=201,
                              files={"file": (path.name, handle.read())}, data={"classification": "confidential"})

    def _run_task(self, prompt: str, files: list[Path], deliverable_format: str | None = None) -> dict[str, Any]:
        """Submit a run as the engineer and wait for it to stop moving."""
        if not self.runs:
            raise Unmeasured("not run: --no-runs skips every check that needs a model run")
        file_ids = [self._upload(path)["id"] for path in files]
        task = self._json("POST", "/api/tasks", "engineer", expect=202,
                          json={"prompt": prompt, "file_ids": file_ids, "deliverable_format": deliverable_format})
        deadline = self.clock() + self.run_timeout
        while task["status"] not in TERMINAL:
            if self.clock() > deadline:
                raise Unmeasured(f"run {task['id']} was still {task['status']} after {self.run_timeout:.0f} s")
            self.sleep(self.poll_seconds)
            task = self._json("GET", f"/api/tasks/{task['id']}", "engineer")
        return task

    def _check(self, demo: str, name: str, probe: Callable[[], tuple[str, dict[str, Any]]]) -> Check:
        """Run one probe. It returns (detail, observed) on a pass and raises otherwise."""
        try:
            detail, observed = probe()
            check = Check(demo, name, PASS, detail, observed=observed)
        except Unmeasured as exc:
            check = Check(demo, name, NOT_MEASURED, str(exc))
        except httpx.TransportError as exc:
            check = Check(demo, name, NOT_MEASURED, f"the API could not be reached: {type(exc).__name__}: {exc}")
        except AssertionError as exc:
            check = Check(demo, name, FAIL, str(exc))
        except Exception as exc:  # a malformed response is a failed check, not a crash
            check = Check(demo, name, FAIL, f"{type(exc).__name__}: {exc}"[:400])
        self.checks.append(check)
        return check

    def _figures_match(self, assessment: dict[str, Any], *, severity: bool) -> str:
        """Assert the registry's decision equals the expected answer; describe it."""
        want = self.expected
        problems = []
        if assessment.get("governing_location") != want["governing_location"]:
            problems.append(f"governing location {assessment.get('governing_location')!r}, "
                            f"expected {want['governing_location']!r}")
        for key, expected_key in (("governing_rate_mm_yr", "governing_rate_mm_yr"),
                                  ("remaining_life_years", "governing_remaining_life_years")):
            got = assessment.get(key)
            if got is None or abs(float(got) - float(want[expected_key])) > 0.005:
                problems.append(f"{key} {got}, expected {want[expected_key]}")
        if severity and str(assessment.get("severity") or "").lower() != str(want["severity"]).lower():
            problems.append(f"severity {assessment.get('severity')!r}, expected {want['severity']!r}")
        assert not problems, "; ".join(problems)
        return (f"{assessment['governing_location']}: {assessment['governing_rate_mm_yr']} mm/yr, "
                f"{assessment['remaining_life_years']} years"
                + (f", severity {assessment.get('severity')}" if severity else ""))

    # -- demo 1 -------------------------------------------------------------
    def demo_asset(self) -> None:
        def formula_engine():
            body = self._json("POST", "/api/engineering/assess", "engineer",
                              json={"text": SURVEY_CSV.read_text(encoding="utf-8"), "source": SURVEY_CSV.name})
            assessment = body.get("assessment")
            assert assessment is not None, "the registry found no inspection record in the survey"
            assert assessment["status"] == "calculated", (
                f"assessment is {assessment['status']}, missing {assessment.get('missing')}")
            calculated = [r for r in body["calculations"] if r["status"] == "calculated"]
            unhashed = [r["formula_id"] for r in calculated if not (r.get("result_hash") and r.get("formula_hash"))]
            assert calculated, "no formula was evaluated"
            assert not unhashed, f"figures without a result or formula hash: {unhashed}"
            described = self._figures_match(assessment, severity=False)
            return f"{described} ({len(calculated)} formula evaluations, each hashed)", {
                "assessment": assessment, "calculated": len(calculated)}
        self._check("asset", "Formula Engine", formula_engine)

        def isolation():
            result = self._json("POST", f"/api/pid/{DRAWING}/query", "engineer",
                                json={"kind": "isolation", "tag": ISOLATE, "purpose": "maintenance"})
            branches, actions = result.get("branches") or [], result.get("actions") or []
            assert branches, f"the graph returned no isolation branch for {ISOLATE}"
            assert actions, "the graph returned branches but no isolation action"
            flagged = sum(1 for b in branches if isinstance(b, dict) and b.get("compliant") is False)
            return (f"{len(branches)} branches, {len(actions)} actions from {result.get('drawing')}"
                    + (f"; {flagged} branch(es) flagged non-compliant for the work" if flagged else "")), {
                "drawing": result.get("drawing"), "branches": len(branches), "actions": len(actions)}
        self._check("asset", "P&ID Isolation", isolation)

        run: dict[str, Any] = {}

        def asset_run():
            task = self._run_task(ASSET_PROMPT, [SCAN], deliverable_format="docx")
            run["task"] = task
            assert task["status"] not in ("failed", "blocked", "cancelled"), (
                f"run {task['id']} ended {task['status']}: {task.get('error') or 'no error recorded'}")
            assessment = task.get("assessment")
            assert assessment, f"run {task['id']} carries no registry assessment"
            assert assessment["status"] == "calculated", (
                f"run {task['id']} assessment is {assessment['status']} "
                f"(missing {assessment.get('missing')}, conflicts {assessment.get('conflicts')})")
            calculated = [r for r in task.get("calculations", []) if r["status"] == "calculated"]
            assert calculated, f"run {task['id']} has an assessment but no calculated formula record"
            described = self._figures_match(assessment, severity=True)
            return f"run {task['id'][:8]} - {described} - {len(calculated)} registry figures", {
                "task_id": task["id"], "status": task["status"], "assessment": assessment}
        self._check("asset", "Asset Integrity Run", asset_run)

        def needs_run() -> dict[str, Any]:
            task = run.get("task")
            if task is None or task["status"] in ("failed", "blocked", "cancelled"):
                raise Unmeasured("the asset-integrity run did not finish, so there is nothing to check")
            return task

        def approval_policy():
            task = needs_run()
            approval = task.get("approval") or {}
            assert task["status"] == "awaiting_approval" and approval.get("required"), (
                f"run {task['id']} is {task['status']}, not held for approval")
            assert approval.get("approver_roles"), "held, but no approving role is named"
            refused = self.client.post(f"/api/tasks/{task['id']}/approve", headers=self._headers("engineer"),
                                       json={"decision": "approve", "comment": "golden demo: must be refused"})
            assert refused.status_code in (400, 403), (
                f"the submitter's own approval returned HTTP {refused.status_code}, not a refusal")
            reasons = [reason.split(":")[0] for reason in approval.get("reasons", [])]
            return (f"held for {' or '.join(approval['approver_roles'])} ({', '.join(reasons) or 'no reason given'}); "
                    f"submitter's approval refused (HTTP {refused.status_code})"), {
                "reasons": approval.get("reasons"), "approver_roles": approval.get("approver_roles"),
                "self_approval_status": refused.status_code}
        self._check("asset", "Approval Policy", approval_policy)

        def certificate():
            task = needs_run()
            issued = self._json("GET", f"/api/tasks/{task['id']}/certificate", "engineer")
            result = self._json("POST", "/api/proof/verify", "engineer", json=issued)
            failed = [c["name"] for c in result.get("checks", []) if not c.get("passed")]
            assert result.get("valid") and not failed, f"certificate not valid; failed checks: {failed}"
            return f"{len(result['checks'])} of {len(result['checks'])} certificate checks passed", {
                "key_id": result.get("key_id"), "checks": [c["name"] for c in result["checks"]]}
        self._check("asset", "Certificate Verification", certificate)

    # -- demo 2 -------------------------------------------------------------
    def demo_conflict(self) -> None:
        run: dict[str, Any] = {}

        def detection():
            task = self._run_task(CONFLICT_PROMPT, [SURVEY_CSV, FIELD_SHEET])
            run["task"] = task
            assessment = task.get("assessment") or {}
            assert assessment.get("status") == "conflicted", (
                f"run {task['id']} assessment is {assessment.get('status')!r}, not conflicted")
            stated = {key: assessment.get(key) for key in ("remaining_life_years", "governing_rate_mm_yr", "severity")
                      if assessment.get(key) is not None}
            assert not stated, f"a conflicted assessment still states {stated}"
            open_conflicts = [c for c in task.get("conflicts", [])
                              if c["kind"] == "input" and c["status"] == "unresolved" and c["impact"] == "high"]
            assert open_conflicts, "no unresolved high-impact conflict on the run"
            conflict = open_conflicts[0]
            sources = [c.get("evidence_id") for c in conflict["candidates"]]
            assert len(sources) >= 2 and all(sources), f"{conflict['id']} does not name two sources: {sources}"
            assert task["status"] != "delivered", "a run with an open conflict was delivered"
            reasons = (task.get("approval") or {}).get("reasons", [])
            assert any(reason.startswith("unresolved_conflict") for reason in reasons), (
                f"run is {task['status']} but not held for the conflict (reasons: {reasons})")
            values = " vs ".join(f"{c.get('stated')} [{c.get('evidence_id')}]" for c in conflict["candidates"])
            return f"CONFLICT {conflict['id']} {conflict['label']}: {values}; no figure stated; run held", {
                "task_id": task["id"], "conflict": conflict}
        detected = self._check("conflict", "Conflict Detection", detection)

        def resolution():
            # Resolving a run the detection check did not accept would test
            # the resolution against a run that is not the demo.
            task = run.get("task") if detected.status == PASS else None
            conflict = next((c for c in (task or {}).get("conflicts", [])
                             if c["kind"] == "input" and c["status"] == "unresolved"), None)
            if task is None or conflict is None:
                raise Unmeasured("no open conflict to resolve: the detection check did not pass")
            # The plant survey record, not the contractor sheet: the reading
            # docs/DEMO.md's expected answer is computed from.
            choice = next((index for index, c in enumerate(conflict["candidates"])
                           if SURVEY_CSV.name in str(c.get("source_document") or "")), 0)
            resolved = self._json("POST", f"/api/tasks/{task['id']}/conflicts/{conflict['id']}/resolve", "reviewer",
                                  json={"candidate": choice, "reason": RESOLUTION_REASON})
            record = next(c for c in resolved["conflicts"] if c["id"] == conflict["id"])
            assert record["status"] == "resolved" and record.get("resolution"), f"{conflict['id']} is {record['status']}"
            evidence_id = record["resolution"]["evidence_id"]
            human = next((e for e in resolved.get("evidence", []) if e["id"] == evidence_id), None)
            assert human is not None and human.get("kind") == "human", (
                f"the resolution's evidence {evidence_id} is not a human evidence item on the run")
            assessment = resolved.get("assessment") or {}
            assert assessment.get("status") == "calculated", (
                f"after resolution the assessment is {assessment.get('status')!r}")
            described = self._figures_match(assessment, severity=False)
            return f"{conflict['id']} resolved by reviewer as {evidence_id}; recomputed {described}", {
                "evidence_id": evidence_id, "accepted": record["resolution"].get("stated"), "assessment": assessment}
        self._check("conflict", "Human Resolution", resolution)

    # -- demo 3 -------------------------------------------------------------
    def demo_attack(self) -> None:
        if self.red_team is None:
            self.checks.append(Check("attack", "Red Team", NOT_MEASURED, "no red-team runner was given"))
        else:
            try:
                report = self.red_team()
            except Exception as exc:
                self.checks.append(Check("attack", "Red Team", NOT_MEASURED,
                                         f"the red team could not run: {type(exc).__name__}: {exc}"[:400]))
            else:
                self.checks.extend(red_team_checks(report))

        def audit_chain():
            chain = self._json("GET", "/api/audit/chain", "auditor")
            assert chain.get("valid"), f"the audit chain is broken at event {chain.get('broken_at')}"
            return f"hash chain valid over {chain.get('events')} events", {
                "events": chain.get("events"), "head_hash": chain.get("head_hash")}
        self._check("attack", "Audit Chain", audit_chain)

    # -- all of it --------------------------------------------------------
    def run(self, only: list[str] | None = None) -> list[Check]:
        for key, method in (("asset", self.demo_asset), ("conflict", self.demo_conflict),
                            ("attack", self.demo_attack)):
            if not only or key in only:
                method()
        return self.checks


def red_team_checks(report: dict[str, Any]) -> list[Check]:
    """One check per attack group, plus the suite's own total as measured."""
    results = report.get("results", [])
    checks: list[Check] = []
    claimed: set[str] = set()
    groups = list(RED_TEAM_GROUPS)
    for label, word, prefixes in groups:
        members = [r for r in results if r["id"].startswith(prefixes)]
        claimed.update(r["id"] for r in members)
        checks.append(_group_check(label, word, members))
    # An attack added to the suite later is still counted, never dropped.
    rest = [r for r in results if r["id"] not in claimed]
    if rest:
        checks.append(_group_check("Other Attacks", "HELD", rest))
    summary = report.get("summary") or {}
    total, held = summary.get("total", len(results)), summary.get("held", 0)
    status = PASS if total and held == total else (FAIL if summary.get("breached") else NOT_MEASURED)
    checks.append(Check("attack", "Red Team Total", status,
                        f"{held} / {total} red team checks held", verdict=f"{held} / {total}",
                        observed={"summary": summary, "results_sha256": report.get("results_sha256")}))
    return checks


def _group_check(label: str, word: str, members: list[dict[str, Any]]) -> Check:
    ids = [r["id"] for r in members]
    if not members:
        return Check("attack", label, NOT_MEASURED, "the red-team suite ran no attack in this group")
    breached = [r["id"] for r in members if r["outcome"] == "BREACHED"]
    inconclusive = [r["id"] for r in members if r["outcome"] == "inconclusive"]
    if breached:
        return Check("attack", label, FAIL, f"breached: {', '.join(breached)}", observed={"ids": ids})
    if inconclusive:
        return Check("attack", label, NOT_MEASURED, f"could not be carried out: {', '.join(inconclusive)}",
                     observed={"ids": ids})
    return Check("attack", label, PASS, f"{len(members)} of {len(members)} held ({', '.join(ids)})",
                 verdict=word, observed={"ids": ids})


# ------------------------------------------------------------------ output
def plan_lines(only: list[str] | None = None) -> list[str]:
    lines = ["AEGIS GOLDEN DEMO CHECK - plan (nothing is called)", ""]
    for key, title, checks in DEMOS:
        if only and key not in only:
            continue
        lines.append(f"{title}   [--only {key}]")
        for name, what in checks:
            lines.append(f"  {name}: {what}")
        if key == "attack":
            lines.append("  Red-team groups: " + ", ".join(label for label, _, _ in RED_TEAM_GROUPS))
        lines.append("")
    return lines


def report_lines(checks: list[Check], target: str) -> list[str]:
    lines = ["AEGIS GOLDEN DEMO CHECK", f"target {target}", ""]
    titles = {key: title for key, title, _ in DEMOS}
    width = max([len(c.name) for c in checks] + [24]) + 4
    for key, title in titles.items():
        members = [c for c in checks if c.demo == key]
        if not members:
            continue
        lines.append(title)
        for check in members:
            lines.append(f"  {check.name} {'.' * (width - len(check.name))} {check.shown}")
            if check.detail:
                lines.append(f"      {check.detail}")
        lines.append("")
    lines.append(f"FINAL STATUS: {final_status(checks)}")
    return lines


def final_status(checks: list[Check]) -> str:
    failed = sum(1 for c in checks if c.status == FAIL)
    unmeasured = sum(1 for c in checks if c.status == NOT_MEASURED)
    if checks and not failed and not unmeasured:
        return "READY"
    parts = [f"{failed} failed" if failed else "", f"{unmeasured} not measured" if unmeasured else ""]
    return "NOT READY (" + (", ".join(p for p in parts if p) or "no checks ran") + ")"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--base-url", default=BASE_URL)
    parser.add_argument("--plan", "--dry-run", dest="plan", action="store_true",
                        help="list the checks and exit without calling anything")
    parser.add_argument("--only", nargs="+", choices=[key for key, _, _ in DEMOS], help="run only these demos")
    parser.add_argument("--password", default=None, help="seed account password (default: from config)")
    parser.add_argument("--no-runs", action="store_true",
                        help="skip the checks that need a model run (fast; the status cannot be READY)")
    parser.add_argument("--run-timeout", type=float, default=1800, help="seconds to wait for each run")
    parser.add_argument("--report", type=Path, default=None, help="where to write the JSON report")
    arguments = parser.parse_args(argv)

    if arguments.plan:
        print("\n".join(plan_lines(arguments.only)))
        return 0

    from backend.core.config import PROJECT_ROOT, get_config
    from backend.security.red_team import RedTeam

    config = get_config()
    password = arguments.password or str(config.settings.security.get("seed_user_password") or "workbench")
    audit_path = Path(str(config.settings.audit.get("log_file", "storage/logs/audit.jsonl")))
    if not audit_path.is_absolute():
        audit_path = PROJECT_ROOT / audit_path
    seeded = {str(seed["username"]) for seed in config.access_control.get("seed_users", [])}

    def red_team() -> dict[str, Any]:
        # Its own client: the suite clears cookies and signs in as it goes.
        with httpx.Client(base_url=arguments.base_url, timeout=120) as attack_client:
            return RedTeam(attack_client, password=password, audit_log_path=audit_path,
                           seeded_usernames=seeded).run()

    started = datetime.now(timezone.utc)
    with httpx.Client(base_url=arguments.base_url, timeout=120) as client:
        demo = GoldenDemo(client, password=password, run_timeout=arguments.run_timeout,
                          red_team=red_team, runs=not arguments.no_runs)
        checks = demo.run(arguments.only)

    print("\n".join(report_lines(checks, arguments.base_url)))
    path = arguments.report
    if path is None:
        out_dir = PROJECT_ROOT / "storage" / "reports"
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"golden-demo-{started.strftime('%Y%m%dT%H%M%SZ')}.json"
    path.write_text(json.dumps({
        "suite": "AEGIS golden demo check",
        "target": arguments.base_url,
        "started_at": started.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "final_status": final_status(checks),
        "checks": [asdict(check) for check in checks],
    }, indent=2, default=str), encoding="utf-8")
    print(f"\nreport  {path}")
    return 0 if final_status(checks) == "READY" else 1


if __name__ == "__main__":
    raise SystemExit(main())
