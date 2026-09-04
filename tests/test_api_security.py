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


class TestDeliverableDownload:
    """The download endpoint has to be honest about why it is refusing.

    The console used to seed its result panel with a placeholder deliverable
    called ``APPROVAL_NOTE.docx``, carrying an invented hash and size. It drew
    a working download button for a file that had never been written, and the
    click asked for a filename no task record contained. The user got a tab of
    raw JSON reading "Deliverable not found" with nothing to act on.

    These check the two refusals a real client can hit, and that they are
    distinguishable: a name that belongs to no deliverable, and a deliverable
    whose file has gone from storage.
    """

    @staticmethod
    def _sign_in(client: TestClient) -> dict[str, str]:
        response = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "workbench"},
        )
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['token']}"}

    @staticmethod
    def _task_with_deliverable(username: str) -> tuple[str, str]:
        """Record a delivered task holding one deliverable, and write its file."""
        import uuid
        from datetime import datetime, timezone

        from backend.api.task_service import get_task_service
        from backend.core.config import get_config
        from backend.core.identity import get_identity_service
        from backend.core.schemas import Deliverable, Task, TaskStatus

        user = next(u for u in get_identity_service().list_users() if u.username == username)
        service = get_task_service()

        task_id = str(uuid.uuid4())
        filename = "Download_Check.md"
        directory = get_config().settings.path("deliverables") / task_id
        directory.mkdir(parents=True, exist_ok=True)
        body = "# recorded\n"
        (directory / filename).write_text(body, encoding="utf-8")

        now = datetime.now(timezone.utc)
        task = Task(
            id=task_id,
            prompt="Deliverable download check",
            status=TaskStatus.DELIVERED,
            user_id=user.id,
            user_display_name=user.display_name,
            department=user.department,
            created_at=now,
            updated_at=now,
            deliverables=[
                Deliverable(
                    id=str(uuid.uuid4()),
                    created_at=now,
                    filename=filename,
                    format="md",
                    size_bytes=len(body),
                    sha256="0" * 64,
                    download_url=f"/api/deliverables/{task_id}/{filename}",
                    released=True,
                )
            ],
        )
        service._persist(task)
        return task_id, filename

    def test_a_recorded_deliverable_downloads(self) -> None:
        with TestClient(create_app()) as client:
            headers = self._sign_in(client)
            task_id, filename = self._task_with_deliverable("admin")
            response = client.get(f"/api/deliverables/{task_id}/{filename}", headers=headers)
            assert response.status_code == 200, response.text
            assert b"recorded" in response.content

    def test_a_name_no_deliverable_carries_is_a_plain_404(self) -> None:
        with TestClient(create_app()) as client:
            headers = self._sign_in(client)
            task_id, _ = self._task_with_deliverable("admin")
            response = client.get(
                f"/api/deliverables/{task_id}/APPROVAL_NOTE.docx", headers=headers
            )
            assert response.status_code == 404
            assert response.json()["detail"] == "Deliverable not found"

    def test_a_recorded_file_missing_from_storage_says_so(self) -> None:
        from backend.core.config import get_config

        with TestClient(create_app()) as client:
            headers = self._sign_in(client)
            task_id, filename = self._task_with_deliverable("admin")
            (get_config().settings.path("deliverables") / task_id / filename).unlink()

            response = client.get(f"/api/deliverables/{task_id}/{filename}", headers=headers)
            # 410, not 404: the record is real, the bytes are gone. The message
            # has to name the file and say what to do about it.
            assert response.status_code == 410
            detail = response.json()["detail"]
            assert filename in detail
            assert "no longer in deliverable storage" in detail
