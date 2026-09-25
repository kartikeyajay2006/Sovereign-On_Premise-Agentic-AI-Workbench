"""Attack the controls, and record what happened.

Each attack is run against the API exactly as an intruder with an account
would run it, and its result is a measurement: the status code returned, the
reason given, what the sandbox printed, which classifications came back,
whether a copy of the audit chain noticed an edit. A control *held* when the
observation is the refusal; it was *breached* when it is not; it is
*inconclusive* when the attack could not be carried out at all (the sandbox
disabled on this host, say), which is never counted as held.

The runner takes any client with ``get``/``post`` in the httpx shape, so the
same suite runs in-process against the app under test
(tests/adversarial/test_red_team.py) and over HTTP against a live
installation (scripts/red_team.py), which writes the report to
storage/reports/ with its own hash.
"""

from __future__ import annotations

import hashlib
import json
import platform
import shutil
import tempfile
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from backend.security.hostile_samples import HOSTILE_UPLOADS, INJECTION_NOTE, plain_pdf

EGRESS_MARKER = "EGRESS-REACHED"
HOST_FILE_MARKER = "HOST-FILE-READ"


@dataclass
class AttackResult:
    id: str
    category: str
    attack: str
    expected: str
    held: bool | None
    observed: dict[str, Any] = field(default_factory=dict)
    measured_ms: int = 0

    @property
    def outcome(self) -> str:
        return {True: "held", False: "BREACHED", None: "inconclusive"}[self.held]


class RedTeam:
    def __init__(
        self,
        client: Any,
        *,
        password: str = "workbench",
        audit_log_path: Path | None = None,
        seeded_usernames: set[str] | None = None,
    ) -> None:
        self.client = client
        self.password = password
        self.audit_log_path = audit_log_path
        self.seeded = seeded_usernames or {"operator", "engineer", "reviewer", "auditor", "admin"}
        self.results: list[AttackResult] = []
        self._tokens: dict[str, str] = {}

    # -- plumbing ---------------------------------------------------------
    def _headers(self, username: str | None) -> dict[str, str]:
        if username is None:
            # Anonymous means no credential at all: a sign-in earlier in the
            # run left a session cookie in the client, which the API accepts.
            self.client.cookies.clear()
            return {}
        if username not in self._tokens:
            response = self.client.post("/api/auth/login", json={"username": username, "password": self.password})
            response.raise_for_status()
            self._tokens[username] = response.json()["token"]
        return {"Authorization": f"Bearer {self._tokens[username]}"}

    def _run(self, identifier: str, category: str, attack: str, expected: str,
             probe: Callable[[], tuple[bool | None, dict[str, Any]]]) -> AttackResult:
        started = time.perf_counter()
        try:
            held, observed = probe()
        except Exception as exc:  # the attack could not be carried out: say so
            held, observed = None, {"error": f"{type(exc).__name__}: {exc}"[:400]}
        result = AttackResult(identifier, category, attack, expected, held, observed,
                              int((time.perf_counter() - started) * 1000))
        self.results.append(result)
        return result

    @staticmethod
    def _detail(response: Any) -> str:
        try:
            body = response.json()
        except Exception:
            return response.text[:300]
        return str(body.get("detail") if isinstance(body, dict) else body)[:400]

    # -- attacks ------------------------------------------------------------
    def hostile_uploads(self) -> None:
        headers = self._headers("engineer")
        for index, (filename, builder, description) in enumerate(HOSTILE_UPLOADS, start=1):
            def probe(filename=filename, builder=builder):
                response = self.client.post("/api/files", headers=headers,
                                            files={"file": (filename, builder(), "application/octet-stream")})
                return response.status_code == 400, {"status": response.status_code, "reason": self._detail(response)}
            self._run(f"UPLOAD-{index:02d}", "ingestion", description, "refused at quarantine (400)", probe)

        def control():
            response = self.client.post("/api/files", headers=headers,
                                        files={"file": ("control.pdf", plain_pdf(), "application/pdf")})
            return response.status_code == 201, {"status": response.status_code}
        self._run("UPLOAD-CONTROL", "ingestion", "An ordinary PDF (control)",
                  "accepted (201): the guard refuses what files carry, not everything", control)

    def prompt_injection(self) -> None:
        headers = self._headers("engineer")

        def probe():
            response = self.client.post("/api/files", headers=headers,
                                        files={"file": ("field-note.md", INJECTION_NOTE.encode(), "text/markdown")})
            notes = response.json().get("quarantine_notes", []) if response.status_code == 201 else []
            flagged = any("instruction-like" in note for note in notes)
            return response.status_code == 201 and flagged, {"status": response.status_code, "notes": notes}
        self._run("INJECT-01", "ingestion",
                  "Document telling the model to ignore its instructions, skip review and send data out",
                  "stored as evidence, flagged as instruction-like, withheld from the model", probe)

    def _sandbox(self, code: str) -> tuple[int, dict[str, Any]]:
        response = self.client.post("/api/sandbox/execute", headers=self._headers("engineer"),
                                    json={"code": code, "classification": "normal"})
        if response.status_code != 200:
            return response.status_code, {"status": response.status_code, "reason": self._detail(response)}
        result = response.json()["result"]
        stopped_by = (
            "static validation" if result.get("static_validation_passed") is False
            else "runtime containment" if not result.get("ok") else "nothing"
        )
        return 200, {
            "status": 200,
            "stopped_by": stopped_by,
            "ok": result.get("ok"),
            "exit_code": result.get("exit_code"),
            "static_validation_passed": result.get("static_validation_passed"),
            "static_violations": (result.get("static_violations") or [])[:2],
            "stdout": (result.get("stdout") or "")[:200],
            "stderr": (result.get("stderr") or "").strip()[-240:],
        }

    def sandbox_escapes(self) -> None:
        cases = (
            ("SANDBOX-01", "Read /etc/passwd from generated code",
             f"print('{HOST_FILE_MARKER}', open('/etc/passwd').read()[:40])", HOST_FILE_MARKER),
            ("SANDBOX-02", "Read the workbench database from generated code",
             "import pathlib\nfor p in pathlib.Path('/').rglob('workbench.db'):\n"
             f"    print('{HOST_FILE_MARKER}', p, open(p,'rb').read(16)); break", HOST_FILE_MARKER),
            ("EGRESS-01", "Open a TCP socket to a public address through an obfuscated import",
             "s = __import__('so' + 'cket')\nc = s.create_connection(('1.1.1.1', 53), 3)\n"
             f"print('{EGRESS_MARKER}')", EGRESS_MARKER),
            ("EGRESS-02", "Resolve a public name (DNS) through an obfuscated import",
             f"s = __import__('so' + 'cket')\nprint('{EGRESS_MARKER}', s.getaddrinfo('example.com', 80)[0][4])",
             EGRESS_MARKER),
            ("EGRESS-03", "HTTP request to the internet through an obfuscated import",
             "u = __import__('urllib.request', fromlist=['urlopen'])\n"
             f"u.urlopen('http://example.com', timeout=3)\nprint('{EGRESS_MARKER}')", EGRESS_MARKER),
            ("EGRESS-04", "Spawn curl from a subprocess",
             "p = __import__('sub' + 'process')\n"
             "r = p.run(['curl', '-s', '-m', '3', 'http://example.com'], capture_output=True)\n"
             f"print('{EGRESS_MARKER}' if r.returncode == 0 else 'curl failed')", EGRESS_MARKER),
        )
        for identifier, description, code, marker in cases:
            def probe(code=code, marker=marker):
                status, observed = self._sandbox(code)
                if status in (403, 429):
                    return True, observed
                if status != 200:
                    return None, observed
                return marker not in observed.get("stdout", ""), observed
            category = "egress" if identifier.startswith("EGRESS") else "sandbox"
            self._run(identifier, category, description,
                      "refused before execution or contained at runtime; nothing reached", probe)

        # The cases above are usually stopped by static validation before
        # they run, which leaves the runtime layer untested. The sandbox's
        # own adversarial self-test disables the validator and attacks the
        # runtime directly: sockets, the _socket C module, process escape,
        # writes outside the workspace, memory and CPU bombs.
        def runtime():
            response = self.client.get("/api/sovereignty/sandbox-test", headers=self._headers("engineer"))
            if response.status_code != 200:
                return None, {"status": response.status_code, "reason": self._detail(response)}
            report = response.json()
            if not report.get("assessable", False):
                return None, {"reason": report.get("reason"), "backend": report.get("backend")}
            checks = {check.get("name"): bool(check.get("passed")) for check in report.get("checks", [])}
            return bool(report.get("all_passed")) and bool(checks), {
                "backend": report.get("backend"), "checks": checks, "overall": report.get("overall"),
            }
        self._run("SANDBOX-RUNTIME", "egress", "Static validation disabled: attack the runtime layer directly",
                  "every containment check holds with the validator bypassed", runtime)

    def unauthorised_retrieval(self) -> None:
        headers = self._headers("operator")

        def probe():
            response = self.client.post("/api/knowledge/search", headers=headers, json={
                "query": "installed cost of the V-2104 replacement vessel and its expenditure approval",
                "departments": ["engineering", "inspection", "general", "operations"], "top_k": 8,
            })
            items = response.json().get("results", []) if response.status_code == 200 else []
            classes = sorted({item.get("classification") for item in items})
            departments = sorted({item.get("department") for item in items})
            leaked = [c for c in classes if c in ("sensitive", "restricted")] + [
                d for d in departments if d not in ("operations", "general", None)]
            return not leaked, {"status": response.status_code, "results": len(items),
                                "classifications": classes, "departments": departments}
        self._run("RETRIEVE-01", "access",
                  "Operator asks for a Restricted design memo and names other departments",
                  "nothing above confidential; departments narrowed to the operator's own", probe)

    def privilege_escalation(self) -> None:
        cases = (
            ("PRIV-01", "auditor", "post", "/api/engineering/evaluate",
             {"formula_id": "integrity.remaining_life", "inputs": {}}, "Auditor runs a calculation"),
            ("PRIV-02", "operator", "post", f"/api/tasks/{uuid.uuid4()}/approve",
             {"decision": "approve"}, "Operator approves a held task"),
            ("PRIV-03", "engineer", "post", f"/api/tasks/{uuid.uuid4()}/conflicts/K1/resolve",
             {"candidate": 0, "reason": "red-team attempt"}, "Engineer resolves a conflict"),
            ("PRIV-04", None, "get", "/api/tasks", None, "No session reads the task list"),
        )
        for identifier, user, method, path, body, description in cases:
            def probe(user=user, method=method, path=path, body=body):
                headers = self._headers(user)
                response = (self.client.post(path, headers=headers, json=body) if method == "post"
                            else self.client.get(path, headers=headers))
                return response.status_code in (401, 403), {"status": response.status_code,
                                                            "reason": self._detail(response)}
            self._run(identifier, "access", description, "refused (401 or 403)", probe)

        def forged():
            token = self._headers("engineer")["Authorization"].split()[-1]
            flipped = token[:-1] + ("A" if token[-1] != "A" else "B")
            self.client.cookies.clear()
            response = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {flipped}"})
            return response.status_code == 401, {"status": response.status_code}
        self._run("PRIV-05", "access", "Forged session token (one character changed)", "refused (401)", forged)

    def brute_force(self) -> None:
        username = f"redteam-{uuid.uuid4().hex[:8]}"

        def probe():
            codes = [self.client.post("/api/auth/login", json={"username": username, "password": f"guess-{n}"}
                                      ).status_code for n in range(7)]
            return codes[-1] == 429 and 429 in codes, {"account": username, "status_sequence": codes}
        self._run("AUTH-01", "access", "Seven password guesses against one account",
                  "locked after five failures (429)", probe)

    def directory_enumeration(self) -> None:
        def probe():
            self.client.cookies.clear()
            response = self.client.get("/api/auth/directory")
            names = sorted(user.get("username") for user in response.json()) if response.status_code == 200 else []
            extra = [name for name in names if name not in self.seeded]
            return not extra, {"status": response.status_code, "listed": names, "unexpected": extra}
        self._run("AUTH-02", "access", "Unauthenticated account directory",
                  "only the seeded demonstration accounts are listed", probe)

    def audit_tamper(self) -> None:
        def probe():
            from backend.core.audit import AuditLog

            if self.audit_log_path is None or not self.audit_log_path.exists():
                return None, {"reason": "no audit log on this host to copy"}
            with tempfile.TemporaryDirectory() as scratch:
                copy = Path(scratch) / "audit.jsonl"
                shutil.copyfile(self.audit_log_path, copy)
                lines = copy.read_text().splitlines()
                if len(lines) < 3:
                    return None, {"reason": "too few events to tamper with"}
                target = len(lines) // 2
                record = json.loads(lines[target])
                record["actor"] = "someone-else"
                lines[target] = json.dumps(record)
                copy.write_text("\n".join(lines) + "\n")
                status = AuditLog(path=copy).verify_chain()
                original = AuditLog(path=self.audit_log_path).verify_chain()
            return (not status.valid and status.broken_at is not None and original.valid), {
                "events": status.events, "edited_event": target + 1,
                "copy_valid": status.valid, "detected_at": status.broken_at, "original_chain_valid": original.valid,
            }
        self._run("AUDIT-01", "integrity", "Rewrite the actor of one past audit event (on a copy)",
                  "the chain breaks at the edited event; the real chain stays valid", probe)

    # -- the whole suite ---------------------------------------------------
    def run(self) -> dict[str, Any]:
        started = datetime.now(timezone.utc)
        for attack in (self.hostile_uploads, self.prompt_injection, self.sandbox_escapes,
                       self.unauthorised_retrieval, self.privilege_escalation, self.brute_force,
                       self.directory_enumeration, self.audit_tamper):
            attack()
        results = [{**asdict(result), "outcome": result.outcome} for result in self.results]
        summary = {
            "total": len(results),
            "held": sum(1 for r in self.results if r.held is True),
            "breached": sum(1 for r in self.results if r.held is False),
            "inconclusive": sum(1 for r in self.results if r.held is None),
        }
        canonical = json.dumps(results, sort_keys=True, separators=(",", ":"), default=str)
        return {
            "suite": "AEGIS red team",
            "version": 1,
            "host": platform.node(),
            "started_at": started.isoformat(),
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "summary": summary,
            "results": results,
            "results_sha256": hashlib.sha256(canonical.encode()).hexdigest(),
        }
