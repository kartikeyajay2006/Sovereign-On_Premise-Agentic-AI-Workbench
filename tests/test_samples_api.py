"""The demo's sample files: one click to attach, and nothing else readable.

The starter cards fetch these and upload them through POST /files, so the
only thing this endpoint may do is hand back a named file from
sample_data/. A config entry that points anywhere else, an unknown id, a
disabled demo and an anonymous caller all get nothing.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.core.config import get_config
from backend.core.identity import get_identity_service


def _login(client: TestClient, username: str = "engineer") -> dict[str, str]:
    get_identity_service().ensure_seed_users()
    token = client.post("/api/auth/login", json={"username": username, "password": "workbench"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def demo(monkeypatch):
    section = {
        "enabled": True,
        "samples": {
            "v2104-survey": "sample_data/datasets/V-2104-thickness-survey.csv",
            "v2104-injected-note": "sample_data/attack/V-2104-contractor-note-with-injection.md",
            "escape": "config/app.yaml",
            "missing": "sample_data/nothing-here.pdf",
        },
    }
    monkeypatch.setitem(get_config().settings.raw, "demo", section)
    return section


def test_the_listed_samples_are_the_ones_inside_sample_data(demo) -> None:
    with TestClient(create_app()) as client:
        listed = client.get("/api/samples", headers=_login(client)).json()
    assert {item["id"] for item in listed} == {"v2104-survey", "v2104-injected-note"}


def test_a_sample_is_served_as_it_is_on_disk(demo) -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/samples/v2104-survey", headers=_login(client))
    assert response.status_code == 200
    assert b"Shell course 2 (mid),11.6,9.4" in response.content


@pytest.mark.parametrize("sample_id", ["escape", "missing", "unknown", "..%2Fconfig%2Fapp.yaml"])
def test_anything_else_is_not_found(demo, sample_id: str) -> None:
    with TestClient(create_app()) as client:
        response = client.get(f"/api/samples/{sample_id}", headers=_login(client))
    assert response.status_code == 404


def test_a_disabled_demo_serves_nothing(demo) -> None:
    demo["enabled"] = False
    with TestClient(create_app()) as client:
        headers = _login(client)
        assert client.get("/api/samples", headers=headers).json() == []
        assert client.get("/api/samples/v2104-survey", headers=headers).status_code == 404


def test_samples_need_a_signed_in_uploader(demo) -> None:
    with TestClient(create_app()) as client:
        assert client.get("/api/samples").status_code == 401
        assert client.get("/api/samples/v2104-survey").status_code == 401
        # The auditor reads; it does not upload.
        assert client.get("/api/samples", headers=_login(client, "auditor")).status_code == 403
