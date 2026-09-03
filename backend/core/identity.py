"""Identity, authentication and session management.

Roles, permissions, departments and seed identities all come from
``policies/access-control.yaml``. Passwords are salted and hashed with PBKDF2
(standard library only — no external crypto dependency to vendor into an
air-gapped deployment).
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from backend.core.audit import get_audit_log
from backend.core.config import get_config
from backend.core.database import get_database
from backend.core.schemas import Sensitivity, Session, User

PBKDF2_ALGORITHM = "sha256"
SALT_BYTES = 16


class AuthenticationError(RuntimeError):
    """Raised when credentials are rejected or a session is invalid."""


def hash_password(password: str, *, rounds: int | None = None) -> str:
    config = get_config()
    iterations = int(rounds or config.settings.security.get("password_hash_rounds", 12)) * 10_000
    salt = os.urandom(SALT_BYTES)
    derived = hashlib.pbkdf2_hmac(PBKDF2_ALGORITHM, password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_{PBKDF2_ALGORITHM}${iterations}${salt.hex()}${derived.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, iterations_raw, salt_hex, digest_hex = encoded.split("$")
        if not scheme.startswith("pbkdf2_"):
            return False
        algorithm = scheme.split("_", 1)[1]
        derived = hashlib.pbkdf2_hmac(
            algorithm,
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations_raw),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(derived.hex(), digest_hex)


class IdentityService:
    """User store plus session issuance, backed by config-declared roles."""

    def __init__(self) -> None:
        self.config = get_config()
        self.db = get_database()
        self.audit = get_audit_log()

    # -- provisioning ------------------------------------------------------
    def ensure_seed_users(self) -> list[str]:
        """Create the identities declared in access-control.yaml, once."""
        if self.db.count_users() > 0:
            return []
        password = str(self.config.settings.security.get("seed_user_password") or "")
        if not password:
            password = secrets.token_urlsafe(12)
        created: list[str] = []
        for seed in self.config.access_control.get("seed_users", []):
            record = {
                "id": str(uuid.uuid4()),
                "username": seed["username"],
                "display_name": seed["display_name"],
                "role": seed["role"],
                "department": seed["department"],
                "password_hash": hash_password(password),
                "active": 1,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            self.db.insert_user(record)
            created.append(seed["username"])
        if created:
            self.audit.record(
                category="identity",
                action="seed_users_created",
                actor="system",
                detail={"usernames": created, "source": "policies/access-control.yaml"},
            )
        return created

    # -- lookups -----------------------------------------------------------
    def _to_user(self, record: dict) -> User:
        role = record["role"]
        return User(
            id=record["id"],
            username=record["username"],
            display_name=record["display_name"],
            role=role,
            department=record["department"],
            active=bool(record["active"]),
            permissions=sorted(self.config.role_permissions(role)),
            max_data_classification=Sensitivity(self.config.role_max_classification(role)),
        )

    def get_user(self, user_id: str) -> User | None:
        record = self.db.get_user(user_id)
        return self._to_user(record) if record else None

    def list_users(self) -> list[User]:
        return [self._to_user(record) for record in self.db.list_users()]

    # -- authentication ----------------------------------------------------
    def authenticate(self, username: str, password: str) -> Session:
        record = self.db.get_user_by_username(username)
        if record is None or not bool(record["active"]):
            self.audit.record(
                category="security",
                action="login_failed",
                actor=username,
                detail={"reason": "unknown_or_inactive_user"},
            )
            raise AuthenticationError("Invalid username or password")
        if not verify_password(password, record["password_hash"]):
            self.audit.record(
                category="security",
                action="login_failed",
                actor=username,
                actor_role=record["role"],
                detail={"reason": "bad_password"},
            )
            raise AuthenticationError("Invalid username or password")

        ttl_minutes = int(self.config.settings.security.get("session_ttl_minutes", 720))
        issued_at = datetime.now(timezone.utc)
        expires_at = issued_at + timedelta(minutes=ttl_minutes)
        token = secrets.token_urlsafe(32)
        self.db.create_session(token, record["id"], issued_at.isoformat(), expires_at.isoformat())
        user = self._to_user(record)
        self.audit.record(
            category="security",
            action="login_succeeded",
            actor=user.username,
            actor_role=user.role,
            detail={"department": user.department},
        )
        return Session(token=token, user=user, issued_at=issued_at, expires_at=expires_at)

    def resolve_session(self, token: str) -> User:
        record = self.db.get_session(token)
        if record is None:
            raise AuthenticationError("Session not found")
        expires_at = datetime.fromisoformat(record["expires_at"])
        if expires_at < datetime.now(timezone.utc):
            self.db.delete_session(token)
            raise AuthenticationError("Session expired")
        user_record = self.db.get_user(record["user_id"])
        if user_record is None or not bool(user_record["active"]):
            raise AuthenticationError("User is no longer active")
        return self._to_user(user_record)

    def logout(self, token: str, user: User | None = None) -> None:
        self.db.delete_session(token)
        if user is not None:
            self.audit.record(
                category="security",
                action="logout",
                actor=user.username,
                actor_role=user.role,
            )


_identity: IdentityService | None = None


def get_identity_service() -> IdentityService:
    global _identity
    if _identity is None:
        _identity = IdentityService()
    return _identity
