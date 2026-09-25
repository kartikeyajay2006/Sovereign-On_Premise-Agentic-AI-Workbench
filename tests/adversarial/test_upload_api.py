"""The quarantine is the upload route's, not only a library's."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.core.config import PROJECT_ROOT, get_config
from backend.security.hostile_samples import INJECTION_NOTE, javascript_pdf, plain_pdf


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as test_client:
        token = test_client.post("/api/auth/login", json={"username": "engineer", "password": "workbench"}).json()["token"]
        test_client.headers["Authorization"] = f"Bearer {token}"
        yield test_client


def _audit_tail(action: str) -> dict | None:
    path = Path(str(get_config().settings.audit.get("log_file")))
    path = path if path.is_absolute() else PROJECT_ROOT / path
    for line in reversed(path.read_text().splitlines()):
        record = json.loads(line)
        if record.get("category") == "file" and record.get("action") == action:
            return record
    return None


def test_a_hostile_pdf_is_refused_audited_and_not_stored(client: TestClient) -> None:
    before = {f["id"] for f in client.get("/api/files").json()}
    response = client.post("/api/files", files={"file": ("report.pdf", javascript_pdf(), "application/pdf")})
    assert response.status_code == 400 and "runs JavaScript" in response.json()["detail"]
    assert {f["id"] for f in client.get("/api/files").json()} == before
    record = _audit_tail("quarantined")
    assert record and record["detail"]["filename"] == "report.pdf" and record["detail"]["reasons"]


def test_an_ordinary_pdf_is_accepted(client: TestClient) -> None:
    response = client.post("/api/files", files={"file": ("report.pdf", plain_pdf(), "application/pdf")})
    assert response.status_code == 201 and response.json()["quarantine_passed"] is True


def test_an_instruction_bearing_note_is_stored_and_flagged(client: TestClient) -> None:
    response = client.post("/api/files", files={"file": ("note.md", INJECTION_NOTE.encode(), "text/markdown")})
    assert response.status_code == 201
    assert any("instruction-like" in note for note in response.json()["quarantine_notes"])
