"""The formula registry over HTTP."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from tests.test_engineering import V2104_TRANSCRIPTION


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(create_app()) as test_client:
        yield test_client


def sign_in(client: TestClient, username: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"username": username, "password": "workbench"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_the_catalogue_lists_versioned_clause_cited_formulas(client: TestClient) -> None:
    body = client.get("/api/engineering/formulas", headers=sign_in(client, "auditor")).json()
    keys = {entry["key"] for entry in body}
    assert {"corrosion.short_term_rate@1", "integrity.remaining_life@1", "severity.vessel_finding@2"} <= keys


def test_a_formula_is_evaluated_with_units_normalised(client: TestClient) -> None:
    body = client.post("/api/engineering/evaluate", headers=sign_in(client, "engineer"), json={
        "formula_id": "design.shell_t_min_ug27",
        "inputs": {
            "design_pressure": {"value": "10.5 bar(g)"},
            "inside_radius": {"value": "600 mm"},
            "allowable_stress": {"value": "138 MPa"},
            "joint_efficiency": {"value": 1.0},
        },
    }).json()
    assert body["status"] == "calculated"
    assert body["outputs"]["t_min"]["value"] == 6.0 and body["outputs"]["t_calculated"]["value"] == 4.59
    assert len(body["result_hash"]) == 64


def test_a_pressure_where_a_thickness_belongs_is_refused(client: TestClient) -> None:
    body = client.post("/api/engineering/evaluate", headers=sign_in(client, "engineer"), json={
        "formula_id": "integrity.remaining_life",
        "inputs": {"t_current": {"value": "9.4 bar"}, "t_min": {"value": "6.0 mm"}, "rate": {"value": "0.55 mm/yr"}},
    }).json()
    assert body["status"] == "refused" and "must be a length" in body["reason"]


def test_a_missing_input_is_reported_not_guessed(client: TestClient) -> None:
    body = client.post("/api/engineering/evaluate", headers=sign_in(client, "engineer"), json={
        "formula_id": "integrity.remaining_life",
        "inputs": {"t_current": {"value": "9.4 mm"}, "rate": {"value": "0.55 mm/yr"}},
    }).json()
    assert body["status"] == "cannot_calculate" and body["missing"] == ["t_min"]


def test_a_report_is_assessed_as_a_run_would(client: TestClient) -> None:
    body = client.post("/api/engineering/assess", headers=sign_in(client, "engineer"),
                       json={"text": V2104_TRANSCRIPTION}).json()
    assessment = body["assessment"]
    assert assessment["governing_location"] == "Shell course 2 (mid)"
    assert assessment["remaining_life_years"] == 6.18 and assessment["severity"] == "medium"


def test_the_auditor_cannot_evaluate(client: TestClient) -> None:
    response = client.post("/api/engineering/evaluate", headers=sign_in(client, "auditor"),
                           json={"formula_id": "integrity.remaining_life", "inputs": {}})
    assert response.status_code == 403
