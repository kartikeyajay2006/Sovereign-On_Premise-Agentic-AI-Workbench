"""A host that was a demo does not keep the shared demo password in production.

Seed accounts are created only while demo.enabled is true, all with one
published password (security.seed_user_password, "workbench"). Turning the
demo off left them active: after a restart in production mode, admin /
workbench still signed in, no setup token was issued, and nothing said so.
The threat model listed it as a High risk with a manual step. Now startup in
production mode deactivates every declared demo account that still accepts
the shared password, ends its sessions and audits it; with no administrator
left, the one-time owner setup takes over, as on any production host.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.core import accounts as accounts_module
from backend.core import database as database_module
from backend.core import identity as identity_module
from backend.core.audit import get_audit_log
from backend.core.config import get_config
from backend.core.database import get_database
from backend.core.identity import get_identity_service, hash_password
from backend.security.throttle import reset_login_throttle


@pytest.fixture
def former_demo_host(tmp_path, monkeypatch):
    """A host seeded while in demo mode, with its own database."""
    reset_login_throttle()
    monkeypatch.setattr(database_module, "_database", database_module.Database(tmp_path / "host.db"))
    monkeypatch.setattr(identity_module, "_identity", None)
    monkeypatch.setattr(accounts_module, "_accounts", None)
    monkeypatch.setitem(get_config().settings.raw, "demo", {"enabled": True, "samples": {}})
    get_identity_service().ensure_seed_users()
    yield monkeypatch
    accounts_module.get_account_service().setup_token_path().unlink(missing_ok=True)
    reset_login_throttle()


def _demo_off(monkeypatch) -> None:
    monkeypatch.setitem(get_config().settings.raw, "demo", {"enabled": False, "samples": {}})


def _login(client: TestClient, username: str, password: str = "workbench") -> int:
    return client.post("/api/auth/login", json={"username": username, "password": password}).status_code


def test_switching_the_demo_off_retires_the_shared_password(former_demo_host) -> None:
    _demo_off(former_demo_host)
    with TestClient(create_app()) as client:
        assert _login(client, "admin") == 401
        assert _login(client, "engineer") == 401
        # No administrator is left, so the host is claimed like any other.
        assert client.get("/api/setup/status").json() == {"needs_setup": True}
    assert accounts_module.get_account_service().setup_token_path().exists()
    retired = [e for e in get_audit_log().query(category="security", limit=100) if e.action == "demo_accounts_retired"]
    assert retired and "admin" in retired[0].detail["usernames"]


def test_a_demo_account_with_its_own_password_is_left_alone(former_demo_host) -> None:
    engineer = get_database().get_user_by_username("engineer")
    get_database().update_user(engineer["id"], password_hash=hash_password("a-real-password-9"))
    _demo_off(former_demo_host)
    with TestClient(create_app()) as client:
        assert _login(client, "engineer", "a-real-password-9") == 200
        assert _login(client, "admin") == 401


def test_a_demo_host_retires_nothing(former_demo_host) -> None:
    with TestClient(create_app()) as client:
        assert _login(client, "admin") == 200
        assert client.get("/api/setup/status").json() == {"needs_setup": False}


def test_turning_the_demo_back_on_restores_what_was_retired(former_demo_host) -> None:
    _demo_off(former_demo_host)
    with TestClient(create_app()) as client:
        assert _login(client, "engineer") == 401
    former_demo_host.setitem(get_config().settings.raw, "demo", {"enabled": True, "samples": {}})
    with TestClient(create_app()) as client:
        assert _login(client, "engineer") == 200
        assert _login(client, "admin") == 200
