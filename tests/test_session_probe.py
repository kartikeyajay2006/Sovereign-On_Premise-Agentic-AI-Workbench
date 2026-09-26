"""The console's session probe answers without an error.

Every page asks who is signed in, because the session can live in an
HttpOnly cookie the page cannot read. Asking /auth/me made a signed-out
visitor's browser log a 401 on every page, the public landing page
included. /auth/session answers the same question with a 200 either way;
/auth/me keeps its 401 for API clients that rely on it.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(create_app()) as test_client:
        yield test_client


def test_nobody_signed_in_is_an_answer_not_an_error(client: TestClient) -> None:
    client.cookies.clear()
    response = client.get("/api/auth/session")
    assert response.status_code == 200
    assert response.json() == {"authenticated": False, "user": None}


def test_a_forged_token_is_not_signed_in(client: TestClient) -> None:
    client.cookies.clear()
    response = client.get("/api/auth/session", headers={"Authorization": "Bearer not-a-real-session"})
    assert response.status_code == 200 and response.json()["authenticated"] is False


def test_a_session_names_its_user(client: TestClient) -> None:
    token = client.post("/api/auth/login", json={"username": "engineer", "password": "workbench"}).json()["token"]
    client.cookies.clear()
    body = client.get("/api/auth/session", headers={"Authorization": f"Bearer {token}"}).json()
    assert body["authenticated"] is True and body["user"]["username"] == "engineer"


def test_the_session_cookie_alone_is_enough(client: TestClient) -> None:
    client.cookies.clear()
    client.post("/api/auth/login", json={"username": "auditor", "password": "workbench"})
    body = client.get("/api/auth/session").json()
    assert body["authenticated"] is True and body["user"]["username"] == "auditor"
    client.cookies.clear()


def test_auth_me_still_refuses_without_a_session(client: TestClient) -> None:
    client.cookies.clear()
    assert client.get("/api/auth/me").status_code == 401
