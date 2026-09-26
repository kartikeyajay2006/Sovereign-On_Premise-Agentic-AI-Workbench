"""Account provisioning: every account traces to an administrator's act.

The four doors -- owner setup, invitation, access request, and the demo seed
-- each tested for what it grants, what it refuses, and what it writes to the
audit chain. Setup tests run against a fresh database of their own, because
"no administrator yet" cannot be arranged on the shared one other tests seed.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.core import accounts as accounts_module
from backend.core import database as database_module
from backend.core import identity as identity_module
from backend.core.accounts import normalize_code
from backend.core.audit import get_audit_log
from backend.core.config import get_config
from backend.core.database import get_database
from backend.core.identity import get_identity_service
from backend.security.throttle import reset_login_throttle


# ------------------------------------------------------------------ helpers
def _name(prefix: str = "user") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _audited(action: str, marker: str) -> list[dict]:
    """Audit events with this action whose record mentions ``marker``."""
    return [
        event.model_dump()
        for event in get_audit_log().query(search=marker, limit=500)
        if event.action == action
    ]


def _login(client: TestClient, username: str, password: str = "workbench"):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def _bearer(client: TestClient, username: str, password: str = "workbench") -> dict[str, str]:
    response = _login(client, username, password)
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


@pytest.fixture(autouse=True)
def _clear_throttles():
    reset_login_throttle()
    yield
    reset_login_throttle()


@pytest.fixture
def demo_off(monkeypatch):
    monkeypatch.setitem(get_config().settings.raw, "demo", {"enabled": False, "samples": {}})


@pytest.fixture
def fresh_host(tmp_path, monkeypatch, demo_off):
    """A production host that has never been set up: its own empty database."""
    monkeypatch.setattr(database_module, "_database", database_module.Database(tmp_path / "fresh.db"))
    monkeypatch.setattr(identity_module, "_identity", None)
    monkeypatch.setattr(accounts_module, "_accounts", None)
    yield
    accounts_module.get_account_service().setup_token_path().unlink(missing_ok=True)


@pytest.fixture
def admin_client():
    """A client signed in as the seeded demo administrator."""
    get_identity_service().ensure_seed_users()
    client = TestClient(create_app())
    client.headers.update(_bearer(client, "admin"))
    return client


# --------------------------------------------------------------- owner setup
class TestOwnerSetup:
    def test_a_demo_host_needs_no_setup_and_issues_no_token(self) -> None:
        get_identity_service().ensure_seed_users()
        service = accounts_module.get_account_service()
        assert service.demo_enabled()
        assert TestClient(create_app()).get("/api/setup/status").json() == {"needs_setup": False}
        assert service.issue_setup_token() is None
        assert not service.setup_token_path().exists()

    def test_production_startup_seeds_nobody_and_writes_a_token(self, fresh_host) -> None:
        with TestClient(create_app()) as client:
            status = client.get("/api/setup/status")
            assert status.status_code == 200
            # Nothing else: not a count, not a path.
            assert status.json() == {"needs_setup": True}
            # No demo accounts, and the sign-in screen is offered none.
            assert get_database().count_users() == 0
            assert client.get("/api/auth/directory").json() == []
        path = accounts_module.get_account_service().setup_token_path()
        token = path.read_text(encoding="utf-8").strip()
        assert len(token) >= 32
        record = get_database().get_setup_token()
        assert record is not None and token not in record.values()
        issued = [event for event in get_audit_log().query(category="identity", limit=50)
                  if event.action == "setup_token_issued"]
        assert issued and token not in str(issued[0].detail)

    def test_the_token_creates_one_administrator_once(self, fresh_host) -> None:
        service = accounts_module.get_account_service()
        token = service.issue_setup_token()
        owner = _name("owner")
        client = TestClient(create_app())

        wrong = client.post("/api/setup/owner", json={
            "token": "not-the-token", "username": owner, "display_name": "Plant Owner", "password": "a-long-passphrase",
        })
        assert wrong.status_code == 400
        assert any(e.action == "setup_token_refused" for e in get_audit_log().query(category="security", limit=20))

        created = client.post("/api/setup/owner", json={
            "token": token, "username": owner, "display_name": "Plant Owner", "password": "a-long-passphrase",
        })
        assert created.status_code == 201, created.text
        user = created.json()["user"]
        assert user["role"] == "administrator" and "users.manage" in user["permissions"]
        assert not service.setup_token_path().exists()
        assert get_database().get_setup_token() is None
        assert client.get("/api/setup/status").json() == {"needs_setup": False}
        assert _audited("owner_created", owner)

        again = client.post("/api/setup/owner", json={
            "token": token, "username": _name("second"), "display_name": "Second Owner", "password": "a-long-passphrase",
        })
        assert again.status_code == 409
        # A restart no longer issues a token either.
        assert service.issue_setup_token() is None

    def test_an_expired_token_is_refused(self, fresh_host) -> None:
        token = accounts_module.get_account_service().issue_setup_token()
        past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        with get_database().connect() as connection:
            connection.execute("UPDATE setup_tokens SET expires_at = ?", (past,))
        response = TestClient(create_app()).post("/api/setup/owner", json={
            "token": token, "username": _name("late"), "display_name": "Late Owner", "password": "a-long-passphrase",
        })
        assert response.status_code == 400
        assert get_database().count_users() == 0
        refusals = [e for e in get_audit_log().query(category="security", limit=20) if e.action == "setup_token_refused"]
        assert refusals[0].detail["reason"] == "token_expired"

    def test_a_restart_retires_the_previous_token(self, fresh_host) -> None:
        service = accounts_module.get_account_service()
        first = service.issue_setup_token()
        second = service.issue_setup_token()
        assert first != second
        response = TestClient(create_app()).post("/api/setup/owner", json={
            "token": first, "username": _name("owner"), "display_name": "Plant Owner", "password": "a-long-passphrase",
        })
        assert response.status_code == 400


# --------------------------------------------------------------- invitations
class TestInvitations:
    def _invite(self, client: TestClient, **body) -> dict:
        response = client.post("/api/admin/invites", json={"role": "engineer", "department": "inspection", **body})
        assert response.status_code == 201, response.text
        return response.json()

    def test_an_invite_applies_its_role_and_is_stored_only_as_a_hash(self, admin_client) -> None:
        issued = self._invite(admin_client, display_name="Asha Rao")
        code = issued["code"]
        assert re.fullmatch(r"AEGIS-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}", code)
        assert issued["accept_path"] == f"/invite#code={code}"
        with get_database().connect() as connection:
            row = dict(connection.execute("SELECT * FROM invites WHERE id = ?", (issued["invite"]["id"],)).fetchone())
        assert code not in row.values()
        assert all(code not in str(value) for value in row.values())

        username = _name("asha")
        client = TestClient(create_app())
        # Typed sloppily: lower case, spaces for dashes.
        accepted = client.post("/api/invites/accept", json={
            "code": code.lower().replace("-", " "), "username": username, "password": "a-long-passphrase",
        })
        assert accepted.status_code == 201, accepted.text
        user = accepted.json()["user"]
        assert (user["role"], user["department"], user["display_name"]) == ("engineer", "inspection", "Asha Rao")
        assert _login(client, username, "a-long-passphrase").status_code == 200

        listed = {item["id"]: item for item in admin_client.get("/api/admin/invites").json()}
        assert listed[issued["invite"]["id"]]["status"] == "used"
        assert listed[issued["invite"]["id"]]["used_by"] == username

        events = _audited("invite_accepted", username)
        assert events and events[0]["detail"]["invited_by"] == "admin"
        assert events[0]["detail"]["role"] == "engineer"

        # Single use.
        reuse = client.post("/api/invites/accept", json={
            "code": code, "username": _name("again"), "password": "a-long-passphrase", "display_name": "Someone Else",
        })
        assert reuse.status_code == 400

    def test_an_expired_invite_is_refused(self, admin_client) -> None:
        issued = self._invite(admin_client)
        past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        with get_database().connect() as connection:
            connection.execute("UPDATE invites SET expires_at = ? WHERE id = ?", (past, issued["invite"]["id"]))
        username = _name("late")
        response = TestClient(create_app()).post("/api/invites/accept", json={
            "code": issued["code"], "username": username, "password": "a-long-passphrase", "display_name": "Late Person",
        })
        assert response.status_code == 400
        assert get_database().get_user_by_username(username) is None
        listed = {item["id"]: item for item in admin_client.get("/api/admin/invites").json()}
        assert listed[issued["invite"]["id"]]["status"] == "expired"
        assert _audited("invite_refused", issued["invite"]["id"])[0]["detail"]["reason"] == "expired"

    def test_a_revoked_invite_is_refused(self, admin_client) -> None:
        issued = self._invite(admin_client)
        revoked = admin_client.delete(f"/api/admin/invites/{issued['invite']['id']}")
        assert revoked.status_code == 200 and revoked.json()["status"] == "revoked"
        assert _audited("invite_revoked", issued["invite"]["id"])
        response = TestClient(create_app()).post("/api/invites/accept", json={
            "code": issued["code"], "username": _name("gone"), "password": "a-long-passphrase", "display_name": "Gone Person",
        })
        assert response.status_code == 400
        assert admin_client.delete(f"/api/admin/invites/{issued['invite']['id']}").status_code == 409

    def test_an_unknown_role_or_department_is_refused(self, admin_client) -> None:
        assert admin_client.post("/api/admin/invites", json={"role": "overlord", "department": "inspection"}).status_code == 400
        assert admin_client.post("/api/admin/invites", json={"role": "engineer", "department": "moon"}).status_code == 400

    def test_guessing_codes_locks_the_client(self, admin_client) -> None:
        client = TestClient(create_app())
        statuses = [
            client.post("/api/invites/accept", json={
                "code": f"AEGIS-AAAA-AAAA-AA{index:02d}"[:20], "username": _name("guess"),
                "password": "a-long-passphrase", "display_name": "Guesser",
            }).status_code
            for index in range(12)
        ]
        assert statuses[0] == 400
        assert 429 in statuses


def test_codes_are_normalised_forgivingly_and_strictly() -> None:
    assert normalize_code("aegis-abcd-efgh-jkmn", "AEGIS") == "AEGIS-ABCD-EFGH-JKMN"
    assert normalize_code(" ABCD EFGH JKMN ", "AEGIS") == "AEGIS-ABCD-EFGH-JKMN"
    assert normalize_code("AEGIS-ABCD-EFGH", "AEGIS") is None
    # 0, 1, O and I are not in the alphabet.
    assert normalize_code("AEGIS-ABCD-EFGH-JKM0", "AEGIS") is None


# ----------------------------------------------------------- access requests
class TestAccessRequests:
    def _request(self, client: TestClient, username: str, role: str = "engineer") -> dict:
        response = client.post("/api/access-requests", json={
            "username": username, "display_name": "New Starter", "requested_role": role,
            "reason": "Joining the inspection team on shift B", "password": "a-long-passphrase",
        })
        assert response.status_code == 201, response.text
        return response.json()

    def test_request_then_approve_then_sign_in(self, admin_client) -> None:
        client = TestClient(create_app())
        username = _name("starter")
        request = self._request(client, username, role="reviewer")
        assert request["status"] == "pending"
        assert _audited("access_requested", username)

        # Inactive until decided, whatever was asked for.
        assert _login(client, username, "a-long-passphrase").status_code == 401
        assert client.get(f"/api/access-requests/{request['id']}/status").json()["status"] == "pending"
        # An administrator cannot switch it on around the request.
        account = next(a for a in admin_client.get("/api/admin/users").json() if a["username"] == username)
        assert account["pending_request"] and not account["active"]
        assert admin_client.post(f"/api/admin/users/{account['id']}/activate").status_code == 409

        queue = admin_client.get("/api/admin/access-requests").json()
        assert any(item["id"] == request["id"] and item["status"] == "pending" for item in queue)

        approved = admin_client.post(
            f"/api/admin/access-requests/{request['id']}/approve",
            json={"role": "engineer", "department": "inspection"},
        )
        assert approved.status_code == 200, approved.text
        assert approved.json()["granted_role"] == "engineer"
        assert client.get(f"/api/access-requests/{request['id']}/status").json()["status"] == "approved"

        signed_in = _login(client, username, "a-long-passphrase")
        assert signed_in.status_code == 200
        # The administrator's choice, not the request's.
        assert signed_in.json()["user"]["role"] == "engineer"
        assert signed_in.json()["user"]["department"] == "inspection"

        event = _audited("access_request_approved", username)[0]
        assert event["actor"] == "admin"
        assert event["detail"]["requested_role"] == "reviewer" and event["detail"]["role"] == "engineer"

        # Decided once.
        assert admin_client.post(
            f"/api/admin/access-requests/{request['id']}/reject", json={"reason": "changed my mind"}
        ).status_code == 409

    def test_reject_leaves_no_credential_and_tells_the_requester_why(self, admin_client) -> None:
        client = TestClient(create_app())
        username = _name("stranger")
        request = self._request(client, username)
        rejected = admin_client.post(
            f"/api/admin/access-requests/{request['id']}/reject",
            json={"reason": "Not on the shift roster"},
        )
        assert rejected.status_code == 200
        status = client.get(f"/api/access-requests/{request['id']}/status").json()
        assert status["status"] == "rejected" and status["reason"] == "Not on the shift roster"
        assert _login(client, username, "a-long-passphrase").status_code == 401
        assert get_database().get_user_by_username(username) is None
        assert _audited("access_request_rejected", username)
        # The name can be asked for again.
        self._request(client, username)

    def test_an_unknown_request_is_not_found(self) -> None:
        assert TestClient(create_app()).get(f"/api/access-requests/{uuid.uuid4()}/status").status_code == 404


# ---------------------------------------------------------------- users
class TestUserManagement:
    def _invited(self, admin_client: TestClient, role: str = "operator") -> tuple[str, str]:
        code = admin_client.post("/api/admin/invites", json={"role": role, "department": "operations"}).json()["code"]
        username = _name("worker")
        response = TestClient(create_app()).post("/api/invites/accept", json={
            "code": code, "username": username, "password": "a-long-passphrase", "display_name": "Shift Worker",
        })
        assert response.status_code == 201
        return response.json()["user"]["id"], username

    def test_deactivate_ends_sessions_and_activate_restores(self, admin_client) -> None:
        user_id, username = self._invited(admin_client)
        client = TestClient(create_app())
        headers = _bearer(client, username, "a-long-passphrase")
        assert client.get("/api/auth/me", headers=headers).status_code == 200

        off = admin_client.post(f"/api/admin/users/{user_id}/deactivate")
        assert off.status_code == 200 and off.json()["active"] is False
        assert client.get("/api/auth/me", headers=headers).status_code == 401
        assert _login(client, username, "a-long-passphrase").status_code == 401
        assert _audited("user_deactivated", username)

        on = admin_client.post(f"/api/admin/users/{user_id}/activate")
        assert on.status_code == 200 and on.json()["active"] is True
        assert _login(client, username, "a-long-passphrase").status_code == 200
        assert _audited("user_activated", username)

    def test_an_administrator_cannot_lock_themselves_out(self, admin_client) -> None:
        me = admin_client.get("/api/auth/me").json()
        assert admin_client.post(f"/api/admin/users/{me['id']}/deactivate").status_code == 409

    def test_reset_code_sets_a_new_password_once(self, admin_client) -> None:
        user_id, username = self._invited(admin_client)
        issued = admin_client.post(f"/api/admin/users/{user_id}/reset-password")
        assert issued.status_code == 200, issued.text
        code = issued.json()["code"]
        assert code.startswith("RESET-") and issued.json()["accept_path"] == f"/reset#code={code}"
        assert _audited("password_reset_issued", username)

        client = TestClient(create_app())
        assert client.post("/api/password-resets/accept", json={"code": code, "password": "short"}).status_code == 400
        done = client.post("/api/password-resets/accept", json={"code": code, "password": "a-brand-new-passphrase"})
        assert done.status_code == 200, done.text
        assert _login(client, username, "a-long-passphrase").status_code == 401
        assert _login(client, username, "a-brand-new-passphrase").status_code == 200
        assert client.post("/api/password-resets/accept", json={"code": code, "password": "yet-another-one"}).status_code == 400
        assert _audited("password_reset_completed", username)[0]["detail"]["issued_by"] == "admin"

    def test_directory_is_reported_as_not_configured(self, admin_client) -> None:
        status = admin_client.get("/api/admin/directory").json()
        assert status["configured"] is False
        assert "not configured" in status["detail"].lower()


# ------------------------------------------------------------ authorisation
ADMIN_ROUTES = [
    ("get", "/api/admin/users", None),
    ("get", "/api/admin/invites", None),
    ("post", "/api/admin/invites", {"role": "operator", "department": "operations"}),
    ("delete", "/api/admin/invites/some-id", None),
    ("get", "/api/admin/access-requests", None),
    ("post", "/api/admin/access-requests/some-id/approve", {"role": "operator", "department": "operations"}),
    ("post", "/api/admin/access-requests/some-id/reject", {"reason": "no thanks"}),
    ("post", "/api/admin/users/some-id/deactivate", None),
    ("post", "/api/admin/users/some-id/activate", None),
    ("post", "/api/admin/users/some-id/reset-password", None),
    ("get", "/api/admin/directory", None),
]


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ROUTES)
def test_administration_is_refused_to_other_roles(method: str, path: str, body) -> None:
    get_identity_service().ensure_seed_users()
    client = TestClient(create_app())
    assert getattr(client, method)(path, **({"json": body} if body else {})).status_code == 401
    # A reviewer holds nearly everything else; not this.
    headers = _bearer(client, "reviewer")
    response = getattr(client, method)(path, headers=headers, **({"json": body} if body else {}))
    assert response.status_code == 403
    denials = [e for e in get_audit_log().query(category="policy", actor="reviewer", limit=5)
               if e.action == "permission.users.manage:deny"]
    assert denials


def test_the_demo_directory_is_empty_outside_demo_mode(demo_off) -> None:
    get_identity_service().ensure_seed_users()
    assert TestClient(create_app()).get("/api/auth/directory").json() == []


def test_demo_mode_still_lists_and_signs_in_the_seeded_accounts() -> None:
    get_identity_service().ensure_seed_users()
    client = TestClient(create_app())
    listed = {user["username"] for user in client.get("/api/auth/directory").json()}
    assert {"operator", "engineer", "reviewer", "admin"} <= listed
    assert _login(client, "engineer").status_code == 200
