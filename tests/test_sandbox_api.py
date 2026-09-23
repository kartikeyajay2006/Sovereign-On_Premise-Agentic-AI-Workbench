"""Interactive sandbox endpoint: governance and honest reporting.

These are host-agnostic. They assert the things that must hold wherever the
backend runs - authentication, RBAC, the size and concurrency brakes, and that
the response describes what the sandbox actually did - and adapt their
execution assertions to whether this host can execute at all, rather than
assuming it can.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.core.identity import get_identity_service


def _login(client: TestClient, username: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/login", json={"username": username, "password": "workbench"}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


class TestSandboxEndpointGovernance:
    def setup_method(self) -> None:
        get_identity_service().ensure_seed_users()

    def test_execute_requires_authentication(self) -> None:
        with TestClient(create_app()) as client:
            response = client.post("/api/sandbox/execute", json={"code": "print(1)"})
            assert response.status_code == 401

    def test_limits_endpoint_reports_the_backend_and_caps(self) -> None:
        with TestClient(create_app()) as client:
            headers = _login(client, "engineer")
            response = client.get("/api/sandbox/limits", headers=headers)
            assert response.status_code == 200, response.text
            body = response.json()
            # Whatever the host, these are described, not guessed.
            assert body["memory_mb"] > 0
            assert body["cpu_seconds"] > 0
            assert body["max_code_bytes"] > 0
            assert body["network_allowed"] is False
            assert isinstance(body["execution_allowed"], bool)
            # execution_allowed and reason are consistent: allowed => no reason.
            if body["execution_allowed"]:
                assert body["reason"] == ""
            else:
                assert body["reason"]

    def test_auditor_cannot_execute(self) -> None:
        """python_exec is not granted to the auditor role; the console honours that."""
        with TestClient(create_app()) as client:
            headers = _login(client, "auditor")
            response = client.post(
                "/api/sandbox/execute", json={"code": "print(1)"}, headers=headers
            )
            assert response.status_code == 403

    def test_oversized_code_is_rejected_before_execution(self) -> None:
        with TestClient(create_app()) as client:
            headers = _login(client, "engineer")
            huge = "x = 1\n" * 20000  # ~120 KB, past the 64 KB console cap
            response = client.post(
                "/api/sandbox/execute", json={"code": huge}, headers=headers
            )
            assert response.status_code == 413

    def test_static_validator_is_not_bypassable_from_the_endpoint(self) -> None:
        """A denied import is rejected before execution, reported as such."""
        with TestClient(create_app()) as client:
            headers = _login(client, "engineer")
            response = client.post(
                "/api/sandbox/execute",
                json={"code": "import socket\nsocket.socket()"},
                headers=headers,
            )
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["result"]["static_validation_passed"] is False
            assert body["result"]["ok"] is False
            assert any("socket" in v for v in body["result"]["static_violations"])

    def test_benign_run_reports_measured_facts_when_the_host_can_execute(self) -> None:
        with TestClient(create_app()) as client:
            headers = _login(client, "engineer")
            limits = client.get("/api/sandbox/limits", headers=headers).json()
            response = client.post(
                "/api/sandbox/execute",
                json={"code": "print(sum(range(1000)))"},
                headers=headers,
            )
            assert response.status_code == 200, response.text
            body = response.json()
            if limits["execution_allowed"]:
                assert body["result"]["ok"] is True
                assert body["result"]["stdout"].strip() == "499500"
                assert body["result"]["exit_code"] == 0
                assert body["limits"]["mechanism"] in {"windows_job_object", "posix_rlimit"}
                assert body["accounting"]["assessable"] is True
            else:
                # Honest refusal: no execution, no fabricated accounting.
                assert body["result"]["ok"] is False
                assert body["limits"]["mechanism"] == "none"
                assert body["accounting"]["assessable"] is False

    def test_execution_is_recorded_on_the_audit_trail(self) -> None:
        from backend.core.audit import get_audit_log

        with TestClient(create_app()) as client:
            headers = _login(client, "engineer")
            client.post(
                "/api/sandbox/execute",
                json={"code": "print('audit-me')"},
                headers=headers,
            )
        events = get_audit_log().query(category="security", limit=50)
        assert any(e.action == "sandbox_execute" for e in events), (
            "an execution must leave an audit record"
        )

    def test_self_test_endpoint_returns_a_report(self) -> None:
        with TestClient(create_app()) as client:
            headers = _login(client, "engineer")
            response = client.post("/api/sandbox/self-test", headers=headers)
            assert response.status_code == 200, response.text
            body = response.json()
            assert "assessable" in body
            assert "checks" in body
            # A refusal is never scored as a pass: not assessable => no checks.
            if body["assessable"] is False:
                assert body["checks"] == []
                assert body["all_passed"] is False
