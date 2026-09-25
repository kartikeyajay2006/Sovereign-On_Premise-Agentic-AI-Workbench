"""Sign-in guessing is throttled; the open directory lists only demo accounts."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.core.identity import get_identity_service
from backend.security.throttle import LoginThrottle, reset_login_throttle


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_an_account_is_locked_after_five_failures_and_released_after_the_lockout() -> None:
    clock = Clock()
    throttle = LoginThrottle(max_failures=5, window_seconds=300, lockout_seconds=300, clock=clock)
    for _ in range(4):
        assert throttle.failed("engineer", "10.0.0.5") == 0
    assert throttle.failed("engineer", "10.0.0.5") == 300
    assert throttle.locked_for("ENGINEER", "10.0.0.9") > 0  # the account, from anywhere
    clock.now += 301
    assert throttle.locked_for("engineer", "10.0.0.5") == 0


def test_failures_spread_over_the_window_do_not_lock() -> None:
    clock = Clock()
    throttle = LoginThrottle(max_failures=5, window_seconds=300, clock=clock)
    for _ in range(10):
        throttle.failed("engineer", "10.0.0.5")
        clock.now += 100
    assert throttle.locked_for("engineer", "10.0.0.5") == 0


def test_one_persons_typos_do_not_lock_everyone_behind_the_proxy() -> None:
    throttle = LoginThrottle(max_failures=5, spray_accounts=10, clock=Clock())
    for _ in range(5):
        throttle.failed("engineer", "127.0.0.1")
    assert throttle.locked_for("engineer", "127.0.0.1") > 0
    assert throttle.locked_for("reviewer", "127.0.0.1") == 0


def test_a_client_spraying_one_password_across_accounts_is_locked() -> None:
    throttle = LoginThrottle(max_failures=5, spray_accounts=10, clock=Clock())
    for index in range(10):
        throttle.failed(f"user{index}", "10.0.0.66")
    assert throttle.locked_for("someone-new", "10.0.0.66") > 0
    assert throttle.locked_for("someone-new", "10.0.0.67") == 0


def test_a_success_clears_the_count() -> None:
    throttle = LoginThrottle(max_failures=5, clock=Clock())
    for _ in range(4):
        throttle.failed("engineer", "10.0.0.5")
    throttle.succeeded("engineer", "10.0.0.5")
    for _ in range(4):
        assert throttle.failed("engineer", "10.0.0.5") == 0


@pytest.fixture
def client():
    reset_login_throttle()
    with TestClient(create_app()) as test_client:
        yield test_client
    reset_login_throttle()


def test_the_route_answers_429_with_retry_after(client: TestClient) -> None:
    codes = [client.post("/api/auth/login", json={"username": "ghost", "password": "x"}).status_code
             for _ in range(6)]
    assert codes[:5] == [401] * 5 and codes[5] == 429
    locked = client.post("/api/auth/login", json={"username": "ghost", "password": "x"})
    assert int(locked.headers["Retry-After"]) > 0
    # Another account from the same client still signs in.
    assert client.post("/api/auth/login", json={"username": "engineer", "password": "workbench"}).status_code == 200


def test_the_directory_lists_only_seeded_accounts(client: TestClient) -> None:
    import uuid
    from datetime import datetime, timezone

    identity = get_identity_service()
    if not any(user.username == "private-person" for user in identity.list_users()):
        # A real account, provisioned the way seeding provisions one.
        identity.db.insert_user({
            "id": str(uuid.uuid4()), "username": "private-person", "display_name": "Private Person",
            "role": "operator", "department": "operations", "password_hash": "x", "active": 1,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    listed = {user["username"] for user in client.get("/api/auth/directory").json()}
    assert "private-person" not in listed
    assert {"engineer", "reviewer"} <= listed
