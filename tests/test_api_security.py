"""HTTP-level checks for authentication boundaries.

The browser uses a bearer token for ordinary API calls and an HttpOnly cookie
for the live event stream, because ``EventSource`` cannot supply that header.
These tests make sure neither mechanism quietly leaves the stream public.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.core.identity import get_identity_service


class TestBrowserSessionBoundary:
    def test_event_stream_rejects_anonymous_requests(self) -> None:
        client = TestClient(create_app())
        response = client.get("/api/events")
        assert response.status_code == 401

    def test_login_cookie_authenticates_browser_requests_and_logout_clears_it(self) -> None:
        identity = get_identity_service()
        identity.ensure_seed_users()

        with TestClient(create_app()) as client:
            login = client.post(
                "/api/auth/login",
                json={"username": "operator", "password": "workbench"},
            )
            assert login.status_code == 200
            assert "workbench_session" in login.headers.get("set-cookie", "")

            # This request intentionally carries no Authorization header.
            # The HttpOnly same-site cookie is what EventSource also sends.
            authenticated = client.get("/api/auth/me")
            assert authenticated.status_code == 200
            assert authenticated.json()["username"] == "operator"

            logout = client.post("/api/auth/logout")
            assert logout.status_code == 204
            assert "workbench_session=\"\"" in logout.headers.get("set-cookie", "")
            assert client.get("/api/auth/me").status_code == 401

    def test_registration_creates_a_least_privileged_operator_session(self) -> None:
        with TestClient(create_app()) as client:
            response = client.post(
                "/api/auth/register",
                json={
                    "username": "new_operator",
                    "display_name": "New Operator",
                    "password": "local-passphrase",
                },
            )
            assert response.status_code == 201
            assert response.json()["user"]["role"] == "operator"
            assert response.json()["user"]["department"] == "operations"
            assert client.get("/api/auth/me").status_code == 200

            duplicate = client.post(
                "/api/auth/register",
                json={
                    "username": "new_operator",
                    "display_name": "Another Operator",
                    "password": "local-passphrase",
                },
            )
            assert duplicate.status_code == 400

    def test_registration_supports_email_usernames(self) -> None:
        with TestClient(create_app()) as client:
            response = client.post(
                "/api/auth/register",
                json={
                    "username": "kartikeya2806jay@gmail.com",
                    "display_name": "Kartikeya Yadav",
                    "password": "local-passphrase",
                },
            )
            assert response.status_code == 201
            assert response.json()["user"]["username"] == "kartikeya2806jay@gmail.com"
            assert response.json()["user"]["display_name"] == "Kartikeya Yadav"
            assert response.json()["user"]["role"] == "operator"
            assert client.get("/api/auth/me").status_code == 200
