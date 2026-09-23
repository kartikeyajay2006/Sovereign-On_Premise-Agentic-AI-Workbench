"""The harness API over HTTP: authentication, RBAC and the report gate.

The service behind the routes is given a scripted task gateway, so no model
is invoked and no real task is queued; everything above the gateway -- the
routes, the permission dependencies, the store, the audit chain -- is the
real thing.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.core.database import Database
from backend.core.events import EventBus
from backend.harness import service as harness_service
from backend.harness.service import HarnessService
from backend.harness.store import HarnessStore
from tests.test_harness_fixtures import FakeTasks, delivered, held, running


@pytest.fixture
def fake(tmp_path: Path) -> Iterator[FakeTasks]:
    """Swap the service behind the routes for one on a scripted gateway.

    Its store is a fresh database, so the corpus it counts is empty whatever
    other suites have indexed into the shared test database.
    """
    tasks = FakeTasks()
    previous = harness_service._service
    harness_service._service = HarnessService(
        tasks=tasks,
        store=HarnessStore(Database(path=tmp_path / "harness-api.sqlite")),
        events=EventBus(),
        poll_interval=0.005,
    )
    try:
        yield tasks
    finally:
        harness_service._service = previous


def sign_in(client: TestClient, username: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"username": username, "password": "workbench"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def wait_for(client: TestClient, run_id: str, headers: dict[str, str], *, until: set[str]) -> dict:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        body = client.get(f"/api/harness-runs/{run_id}", headers=headers).json()
        if body["status"] in until:
            return body
        time.sleep(0.01)
    raise AssertionError(f"run {run_id} did not reach {until}")


def start(client: TestClient, headers: dict[str, str], harness_id: str, inputs: dict) -> dict:
    response = client.post(
        "/api/harness-runs", json={"harness_id": harness_id, "inputs": inputs}, headers=headers
    )
    assert response.status_code == 202, response.text
    return response.json()


class TestAuthentication:
    def test_listing_requires_a_session(self) -> None:
        with TestClient(create_app()) as client:
            assert client.get("/api/harnesses").status_code == 401
            assert client.get("/api/harness-runs").status_code == 401

    def test_a_signed_in_user_sees_the_shipped_definitions(self, fake: FakeTasks) -> None:
        with TestClient(create_app()) as client:
            headers = sign_in(client, "operator")
            body = client.get("/api/harnesses", headers=headers).json()
            assert body["errors"] == []
            ids = {harness["id"] for harness in body["harnesses"]}
            assert ids == {"sop-question-sweep", "requirements-register", "obligation-coverage-check"}
            register = next(h for h in body["harnesses"] if h["id"] == "requirements-register")
            department = next(i for i in register["inputs"] if i["id"] == "department")
            # Defaulted to the person asking, options read from policy.
            assert department["default"] == "operations"
            assert {"inspection", "operations"} <= {o["value"] for o in department["options"]}
            assert client.get("/api/harnesses/nope", headers=headers).status_code == 404


class TestRbac:
    def test_starting_and_previewing_need_task_create(self, fake: FakeTasks) -> None:
        with TestClient(create_app()) as client:
            auditor = sign_in(client, "auditor")
            refused = client.post(
                "/api/harness-runs",
                json={"harness_id": "sop-question-sweep", "inputs": {"questions": "Q?"}},
                headers=auditor,
            )
            assert refused.status_code == 403
            preview = client.post(
                "/api/harnesses/sop-question-sweep/preview",
                json={"inputs": {"questions": "Q?"}},
                headers=auditor,
            )
            assert preview.status_code == 403
            assert fake.created == []

    def test_a_run_is_readable_by_its_owner_and_supervisors_only(self, fake: FakeTasks) -> None:
        fake.script = [delivered(), held()]
        with TestClient(create_app()) as client:
            operator = sign_in(client, "operator")
            run = start(client, operator, "sop-question-sweep", {"questions": "First?\nSecond?"})
            body = wait_for(client, run["id"], operator, until={"finished"})
            assert [c["outcome"] for c in body["children"]] == ["supported", "held"]
            assert body["permissions"]["can_download_report"] is True
            # The view states the verifier's limits, not only the report.
            assert any("wrong row" in text for text in body["limitations"])

            engineer = sign_in(client, "engineer")
            assert client.get(f"/api/harness-runs/{run['id']}", headers=engineer).status_code == 403
            assert run["id"] not in {r["id"] for r in client.get("/api/harness-runs", headers=engineer).json()}

            reviewer = sign_in(client, "reviewer")
            assert client.get(f"/api/harness-runs/{run['id']}", headers=reviewer).status_code == 200
            summaries = client.get("/api/harness-runs", headers=operator).json()
            mine = next(summary for summary in summaries if summary["id"] == run["id"])
            assert mine["tally"]["settled"] == 2 and mine["tally"]["counts"]["held"] == 1


class TestInputs:
    def test_bad_inputs_are_refused_with_the_reason(self, fake: FakeTasks) -> None:
        with TestClient(create_app()) as client:
            operator = sign_in(client, "operator")
            response = client.post(
                "/api/harness-runs",
                json={
                    "harness_id": "sop-question-sweep",
                    "inputs": {"questions": [f"Question {n}?" for n in range(26)]},
                },
                headers=operator,
            )
            assert response.status_code == 400
            assert "at most 25" in response.json()["detail"]
            assert fake.created == []

    def test_a_preview_over_an_empty_scope_says_so_before_anything_runs(self, fake: FakeTasks) -> None:
        with TestClient(create_app()) as client:
            engineer = sign_in(client, "engineer")
            preview = client.post(
                "/api/harnesses/requirements-register/preview",
                json={"inputs": {"department": "inspection"}},
                headers=engineer,
            )
            assert preview.status_code == 200, preview.text
            body = preview.json()
            assert body["items"] == []
            assert any("No indexed document" in warning for warning in body["warnings"])
            refused = client.post(
                "/api/harness-runs",
                json={"harness_id": "requirements-register", "inputs": {"department": "inspection"}},
                headers=engineer,
            )
            assert refused.status_code == 400
            assert "Nothing to run" in refused.json()["detail"]


class TestReportOverHttp:
    def test_a_held_report_is_released_only_by_an_approver(self, fake: FakeTasks) -> None:
        fake.script = [delivered()]
        with TestClient(create_app()) as client:
            operator = sign_in(client, "operator")
            run = start(
                client,
                operator,
                "obligation-coverage-check",
                {"obligations": "Records shall be retained for the life of the vessel."},
            )
            body = wait_for(client, run["id"], operator, until={"finished"})
            assert body["report"]["record"]["released"] is False
            assert body["report"]["downloads"] == []
            url = f"/api/harness-runs/{run['id']}/report/md"
            assert client.get(url, headers=operator).status_code == 403

            decision = {"decision": "approve", "comment": "Read against the specification."}
            assert (
                client.post(f"/api/harness-runs/{run['id']}/report/decision", json=decision, headers=operator).status_code
                == 403
            )
            reviewer = sign_in(client, "reviewer")
            approved = client.post(
                f"/api/harness-runs/{run['id']}/report/decision", json=decision, headers=reviewer
            )
            assert approved.status_code == 200, approved.text
            assert approved.json()["report"]["record"]["approval"]["decision"] == "approved"

            download = client.get(url, headers=operator)
            assert download.status_code == 200
            assert download.text.startswith("# Obligation coverage check")
            body = client.get(f"/api/harness-runs/{run['id']}", headers=operator).json()
            assert {d["format"] for d in body["report"]["downloads"]} == {"md", "json"}


class TestCancelOverHttp:
    def test_cancel_stops_the_run(self, fake: FakeTasks) -> None:
        fake.script = [running()]
        with TestClient(create_app()) as client:
            operator = sign_in(client, "operator")
            run = start(client, operator, "sop-question-sweep", {"questions": "One?\nTwo?"})
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline and not fake.created:
                time.sleep(0.01)
            cancelled = client.post(f"/api/harness-runs/{run['id']}/cancel", headers=operator)
            assert cancelled.status_code == 200, cancelled.text
            assert cancelled.json()["status"] in {"cancelling", "cancelled"}
            body = wait_for(client, run["id"], operator, until={"cancelled"})
            assert [c["outcome"] for c in body["children"]] == ["cancelled", "not_submitted"]
            again = client.post(f"/api/harness-runs/{run['id']}/cancel", headers=operator)
            assert again.status_code == 409
