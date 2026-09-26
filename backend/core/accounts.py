"""Account provisioning: the first administrator, invitations, access requests
and administrator-issued password resets.

The rule this module exists to keep: on a production host no account exists
without an administrator's act, and every decision about who gets in is on
the audit chain. There are exactly four doors, and each one is recorded:

* **Owner setup.** A host with no administrator (and no demo) issues a
  one-time setup token at startup. It is written to ``storage/setup-token``
  and printed to the console -- both readable only by whoever holds the
  machine -- and it creates one administrator, once.
* **Invitation.** An administrator fixes the role and department, and hands
  over a one-time code. Whoever redeems it gets exactly that.
* **Access request.** Anyone who can reach the host may ask. The account is
  created inactive and stays unusable until an administrator approves it,
  choosing the role and department themselves: the requested role is a note
  to the administrator, never a grant.
* **Demo seed.** Only while ``demo.enabled`` is true (``identity.py``).

Codes are drawn from ``secrets`` and only their SHA-256 is stored, for the
reason session tokens are (``identity.hash_session_token``): a copy of the
database is not a way in. A fast hash is enough because a code carries 60
bits, expires within days, and the routes that redeem one are throttled.

The directory (AD/LDAP), which is the preferred path for a plant that has
one, is declared in ``identity.directory`` and described in ``directory.py``;
this build has no directory client and says so rather than pretending.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from backend.core.audit import get_audit_log
from backend.core.config import get_config
from backend.core.database import get_database
from backend.core.identity import (
    USERNAME_PATTERN,
    get_identity_service,
    hash_password,
)
from backend.core.schemas import (
    AccessRequestRecord,
    AccessRequestStatus,
    AccountRecord,
    InviteRecord,
    PasswordResetIssued,
    Session,
    User,
)

# Crockford-style: no 0/O or 1/I, which are misread when a code is read out
# over a radio or copied from a screen onto paper.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_GROUPS = 3
CODE_GROUP_LENGTH = 4
INVITE_PREFIX = "AEGIS"
RESET_PREFIX = "RESET"

SETUP_TOKEN_TTL = timedelta(hours=24)
MIN_PASSWORD_LENGTH = 8
MAX_REASON_LENGTH = 1000

# Where the one-time codes are redeemed. The code travels in the fragment,
# which a browser never sends to a server, so it cannot land in the console
# server's request log or a proxy's.
INVITE_ACCEPT_PATH = "/invite#code={code}"
RESET_ACCEPT_PATH = "/reset#code={code}"


class AccountError(RuntimeError):
    """A provisioning request refused, with the HTTP status that fits it.

    ``guess`` marks a refusal caused by a wrong or spent code, which the
    route counts against the client (``security/throttle.py``).
    """

    def __init__(self, message: str, *, status: int = 400, guess: bool = False) -> None:
        super().__init__(message)
        self.status = status
        self.guess = guess


# One sentence for every wrong, spent, expired or revoked code. Saying which
# would tell a guesser that a code once existed; the audit record says which.
CODE_REFUSED = "That code is not valid. It may have been used, revoked or expired; ask your administrator for a new one."
TOKEN_REFUSED = "That setup token is not valid or has expired. Restart the service to issue a new one."


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def generate_code(prefix: str) -> str:
    """``AEGIS-XXXX-XXXX-XXXX``: 12 symbols of 32, so 60 bits from ``secrets``."""
    groups = [
        "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_GROUP_LENGTH))
        for _ in range(CODE_GROUPS)
    ]
    return "-".join([prefix, *groups])


def normalize_code(raw: str, prefix: str) -> str | None:
    """The canonical form of a typed code, or None if it cannot be one.

    Forgiving about what people do to codes -- lower case, spaces, missing or
    extra dashes, a dropped prefix -- and strict about what is left.
    """
    compact = re.sub(r"[^A-Z0-9]", "", (raw or "").upper())
    if compact.startswith(prefix):
        compact = compact[len(prefix):]
    if len(compact) != CODE_GROUPS * CODE_GROUP_LENGTH:
        return None
    if any(symbol not in CODE_ALPHABET for symbol in compact):
        return None
    groups = [compact[i:i + CODE_GROUP_LENGTH] for i in range(0, len(compact), CODE_GROUP_LENGTH)]
    return "-".join([prefix, *groups])


def hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _code_status(record: dict) -> str:
    if record.get("revoked_at"):
        return "revoked"
    if record.get("used_at"):
        return "used"
    if datetime.fromisoformat(record["expires_at"]) <= _now():
        return "expired"
    return "open"


def _invite(record: dict) -> InviteRecord:
    return InviteRecord(
        id=record["id"],
        role=record["role"],
        department=record["department"],
        display_name=record.get("display_name"),
        status=_code_status(record),  # type: ignore[arg-type]
        created_by=record["created_by"],
        created_at=_parse(record["created_at"]),  # type: ignore[arg-type]
        expires_at=_parse(record["expires_at"]),  # type: ignore[arg-type]
        used_at=_parse(record.get("used_at")),
        used_by=record.get("used_by"),
        revoked_at=_parse(record.get("revoked_at")),
        revoked_by=record.get("revoked_by"),
    )


def _access_request(record: dict) -> AccessRequestRecord:
    return AccessRequestRecord(
        id=record["id"],
        username=record["username"],
        display_name=record["display_name"],
        requested_role=record["requested_role"],
        reason=record["reason"],
        status=record["status"],
        created_at=_parse(record["created_at"]),  # type: ignore[arg-type]
        decided_at=_parse(record.get("decided_at")),
        decided_by=record.get("decided_by"),
        granted_role=record.get("granted_role"),
        granted_department=record.get("granted_department"),
        decision_reason=record.get("decision_reason"),
    )


class AccountService:
    """Provisioning on top of the identity store, every decision audited."""

    def __init__(self) -> None:
        self.config = get_config()
        self.db = get_database()
        self.audit = get_audit_log()
        self.identity = get_identity_service()

    # -- policy ------------------------------------------------------------
    def demo_enabled(self) -> bool:
        demo = self.config.settings.raw.get("demo") or {}
        return bool(demo.get("enabled", False))

    def administers(self, role: str) -> bool:
        """Can this role provision accounts? Read from policy, not the role's name."""
        try:
            return "users.manage" in self.config.role_permissions(role)
        except Exception:  # an unknown role on an old row grants nothing
            return False

    def owner_role(self) -> str:
        role = str(self.config.settings.get("identity.owner_role", "administrator"))
        if not self.administers(role):
            raise AccountError(
                f"identity.owner_role '{role}' does not grant users.manage in policies/access-control.yaml",
                status=500,
            )
        return role

    def has_administrator(self) -> bool:
        return any(
            bool(record["active"]) and self.administers(record["role"])
            for record in self.db.list_users()
        )

    def needs_setup(self) -> bool:
        """True only where the owner setup is the way in: no demo, no administrator."""
        return not self.demo_enabled() and not self.has_administrator()

    def _roles(self) -> set[str]:
        return set(self.config.access_control.get("roles", {}))

    def _departments(self) -> set[str]:
        return {
            str(item.get("id"))
            for item in self.config.access_control.get("departments", [])
            if isinstance(item, dict) and item.get("id")
        }

    def _check_role(self, role: str) -> str:
        if role not in self._roles():
            raise AccountError(f"'{role}' is not a role in policies/access-control.yaml")
        return role

    def _check_department(self, department: str) -> str:
        normalized = department.strip().lower()
        if normalized not in self._departments():
            raise AccountError(f"'{department}' is not a department in policies/access-control.yaml")
        return normalized

    def _check_new_account(self, username: str, display_name: str, password: str) -> tuple[str, str]:
        """The same rules for every door: a lowercase name, a real display name, 8+ characters."""
        normalized_username = username.strip().lower()
        normalized_display_name = " ".join(display_name.split())
        if not USERNAME_PATTERN.fullmatch(normalized_username):
            raise AccountError(
                "Username must be a valid email address or 3–64 characters "
                "(lowercase letters, numbers, hyphens, dots or underscores)"
            )
        if not (2 <= len(normalized_display_name) <= 80):
            raise AccountError("Display name must be between 2 and 80 characters")
        if len(password) < MIN_PASSWORD_LENGTH:
            raise AccountError(f"Password must contain at least {MIN_PASSWORD_LENGTH} characters")
        if self.db.get_user_by_username(normalized_username) is not None:
            raise AccountError("That username is already in use", status=409)
        return normalized_username, normalized_display_name

    def _insert_user(self, **record: object) -> str:
        user_id = str(uuid.uuid4())
        try:
            self.db.insert_user({"id": user_id, "created_at": _now().isoformat(), **record})
        except sqlite3.IntegrityError as exc:
            raise AccountError("That username is already in use", status=409) from exc
        return user_id

    # -- owner setup -------------------------------------------------------
    def setup_token_path(self) -> Path:
        return self.config.settings.storage_root / "setup-token"

    def issue_setup_token(self) -> str | None:
        """At startup: a fresh one-time token if this host needs its owner, else none.

        Each start issues a new token and retires the last, so a token that
        lapsed after 24 hours is replaced by restarting the service -- an act
        only whoever runs the host can perform.
        """
        path = self.setup_token_path()
        if not self.needs_setup():
            # Settled since the token was issued (or never needed): leave nothing behind.
            self.db.delete_setup_tokens()
            path.unlink(missing_ok=True)
            return None
        token = secrets.token_urlsafe(24)
        issued = _now()
        expires = issued + SETUP_TOKEN_TTL
        self.db.replace_setup_token(
            {
                "id": str(uuid.uuid4()),
                "token_hash": hash_code(token),
                "created_at": issued.isoformat(),
                "expires_at": expires.isoformat(),
            }
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        path.unlink(missing_ok=True)
        # Created owner-read/write from the first byte where the OS honours
        # the mode (POSIX). On Windows the file inherits the storage folder's
        # ACL, which is the service account's; there is no chmod equivalent.
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(token + "\n")
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
        self.audit.record(
            category="identity",
            action="setup_token_issued",
            actor="system",
            # Where it is and when it lapses; never the token.
            detail={"path": str(path), "expires_at": expires.isoformat()},
        )
        return token

    def _refuse_token(self, reason: str) -> AccountError:
        self.audit.record(
            category="security", action="setup_token_refused", actor="anonymous",
            detail={"reason": reason},
        )
        return AccountError(TOKEN_REFUSED, guess=True)

    def create_owner(self, *, token: str, username: str, display_name: str, password: str) -> Session:
        if not self.needs_setup():
            self.audit.record(
                category="security", action="owner_setup_refused", actor=username.strip().lower()[:64],
                detail={"reason": "host_already_has_administrator" if self.has_administrator() else "demo_mode"},
            )
            raise AccountError("This host is already set up. Sign in instead.", status=409)
        record = self.db.get_setup_token()
        if record is None:
            raise self._refuse_token("no_token_issued")
        if not hmac.compare_digest(hash_code(token.strip()), record["token_hash"]):
            raise self._refuse_token("token_mismatch")
        if datetime.fromisoformat(record["expires_at"]) <= _now():
            raise self._refuse_token("token_expired")

        name, display = self._check_new_account(username, display_name, password)
        role = self.owner_role()
        self._insert_user(
            username=name, display_name=display, role=role, department="general",
            password_hash=hash_password(password), active=1,
            origin="owner", provisioned_by="setup-token",
        )
        # Spent: the row and the file go together, so the token cannot be used twice.
        self.db.delete_setup_tokens()
        self.setup_token_path().unlink(missing_ok=True)
        self.audit.record(
            category="identity", action="owner_created", actor=name, actor_role=role,
            detail={"role": role, "department": "general", "via": "setup_token"},
        )
        return self.identity.authenticate(name, password)

    # -- invitations -------------------------------------------------------
    def create_invite(
        self, actor: User, *, role: str, department: str,
        display_name: str | None = None, expires_hours: int = 72,
    ) -> tuple[InviteRecord, str]:
        role = self._check_role(role)
        department = self._check_department(department)
        display = " ".join((display_name or "").split()) or None
        if display is not None and not (2 <= len(display) <= 80):
            raise AccountError("Display name must be between 2 and 80 characters")
        code = generate_code(INVITE_PREFIX)
        issued = _now()
        record = {
            "id": str(uuid.uuid4()),
            "code_hash": hash_code(code),
            "role": role,
            "department": department,
            "display_name": display,
            "created_by": actor.username,
            "created_at": issued.isoformat(),
            "expires_at": (issued + timedelta(hours=expires_hours)).isoformat(),
        }
        self.db.insert_invite(record)
        self.audit.record(
            category="identity", action="invite_created", actor=actor.username, actor_role=actor.role,
            detail={
                "invite_id": record["id"], "role": role, "department": department,
                "display_name": display, "expires_at": record["expires_at"],
            },
        )
        return _invite(record), code

    def list_invites(self) -> list[InviteRecord]:
        return [_invite(record) for record in self.db.list_invites()]

    def revoke_invite(self, actor: User, invite_id: str) -> InviteRecord:
        record = self.db.get_invite(invite_id)
        if record is None:
            raise AccountError("Invitation not found", status=404)
        if not self.db.revoke_invite(invite_id, actor.username, _now().isoformat()):
            raise AccountError(f"This invitation is already {_code_status(record)}", status=409)
        self.audit.record(
            category="identity", action="invite_revoked", actor=actor.username, actor_role=actor.role,
            detail={"invite_id": invite_id, "role": record["role"], "department": record["department"]},
        )
        return _invite(self.db.get_invite(invite_id) or record)

    def _refuse_code(self, action: str, reason: str, **detail: object) -> AccountError:
        self.audit.record(
            category="security", action=action, actor="anonymous",
            detail={"reason": reason, **detail},
        )
        return AccountError(CODE_REFUSED, guess=True)

    def accept_invite(
        self, *, code: str, username: str, password: str, display_name: str | None = None,
    ) -> Session:
        canonical = normalize_code(code, INVITE_PREFIX)
        record = self.db.get_invite_by_hash(hash_code(canonical)) if canonical else None
        if record is None:
            raise self._refuse_code("invite_refused", "unknown_code")
        state = _code_status(record)
        if state != "open":
            raise self._refuse_code("invite_refused", state, invite_id=record["id"])

        name, display = self._check_new_account(
            username, display_name or record.get("display_name") or "", password
        )
        # Claim first, conditionally: of two people racing one code, one wins.
        if not self.db.claim_invite(record["id"], name, _now().isoformat()):
            raise self._refuse_code("invite_refused", "claimed_concurrently", invite_id=record["id"])
        try:
            self._insert_user(
                username=name, display_name=display, role=record["role"],
                department=record["department"], password_hash=hash_password(password),
                active=1, origin="invite", provisioned_by=record["created_by"],
            )
        except AccountError:
            # The name was taken between the check and the insert: give the
            # code back rather than burn it on a collision.
            with self.db.connect() as connection:
                connection.execute(
                    "UPDATE invites SET used_at = NULL, used_by = NULL WHERE id = ?", (record["id"],)
                )
            raise
        self.audit.record(
            category="identity", action="invite_accepted", actor=name, actor_role=record["role"],
            detail={
                "invite_id": record["id"],
                "invited_by": record["created_by"],
                "username": name,
                "role": record["role"],
                "department": record["department"],
            },
        )
        return self.identity.authenticate(name, password)

    # -- access requests ---------------------------------------------------
    def request_access(
        self, *, username: str, display_name: str, requested_role: str, reason: str, password: str,
    ) -> AccessRequestRecord:
        requested_role = self._check_role(requested_role)
        reason = " ".join(reason.split())
        if not (3 <= len(reason) <= MAX_REASON_LENGTH):
            raise AccountError(f"Say in 3 to {MAX_REASON_LENGTH} characters why you need access")
        name, display = self._check_new_account(username, display_name, password)
        # Inactive, least-privileged and in no department's documents until an
        # administrator decides. The requested role is never written here.
        placeholder_role = str(
            self.config.settings.security.get("self_registration_default_role", "operator")
        )
        user_id = self._insert_user(
            username=name, display_name=display, role=placeholder_role, department="general",
            password_hash=hash_password(password), active=0, origin="request",
        )
        record = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "username": name,
            "display_name": display,
            "requested_role": requested_role,
            "reason": reason,
            "status": "pending",
            "created_at": _now().isoformat(),
        }
        self.db.insert_access_request(record)
        self.audit.record(
            category="identity", action="access_requested", actor=name,
            detail={"request_id": record["id"], "requested_role": requested_role},
        )
        return _access_request(record)

    def request_status(self, request_id: str) -> AccessRequestStatus:
        record = self.db.get_access_request(request_id)
        if record is None:
            raise AccountError("Request not found", status=404)
        return AccessRequestStatus(
            id=record["id"],
            status=record["status"],
            created_at=_parse(record["created_at"]),  # type: ignore[arg-type]
            decided_at=_parse(record.get("decided_at")),
            reason=record.get("decision_reason") if record["status"] == "rejected" else None,
        )

    def list_requests(self) -> list[AccessRequestRecord]:
        return [_access_request(record) for record in self.db.list_access_requests()]

    def _pending(self, request_id: str) -> dict:
        record = self.db.get_access_request(request_id)
        if record is None:
            raise AccountError("Request not found", status=404)
        if record["status"] != "pending":
            raise AccountError(f"This request was already {record['status']}", status=409)
        return record

    def approve_request(self, actor: User, request_id: str, *, role: str, department: str) -> AccessRequestRecord:
        record = self._pending(request_id)
        role = self._check_role(role)
        department = self._check_department(department)
        if not record.get("user_id") or self.db.get_user(record["user_id"]) is None:
            raise AccountError("The account this request created no longer exists", status=409)
        now = _now().isoformat()
        if not self.db.decide_access_request(
            request_id, status="approved", decided_at=now, decided_by=actor.username,
            granted_role=role, granted_department=department,
        ):
            raise AccountError("This request was decided a moment ago", status=409)
        self.db.update_user(
            record["user_id"], role=role, department=department, active=1,
            provisioned_by=actor.username,
        )
        self.audit.record(
            category="identity", action="access_request_approved", actor=actor.username, actor_role=actor.role,
            detail={
                "request_id": request_id, "username": record["username"],
                "requested_role": record["requested_role"], "role": role, "department": department,
            },
        )
        return _access_request(self.db.get_access_request(request_id) or record)

    def reject_request(self, actor: User, request_id: str, *, reason: str) -> AccessRequestRecord:
        record = self._pending(request_id)
        reason = " ".join(reason.split())
        if not (3 <= len(reason) <= MAX_REASON_LENGTH):
            raise AccountError(f"Give the requester a reason of 3 to {MAX_REASON_LENGTH} characters")
        if not self.db.decide_access_request(
            request_id, status="rejected", decided_at=_now().isoformat(),
            decided_by=actor.username, decision_reason=reason, user_id=None,
        ):
            raise AccountError("This request was decided a moment ago", status=409)
        # The inactive account and its password hash go: a rejected request
        # leaves no credential behind, and the name can be asked for again.
        if record.get("user_id"):
            user = self.db.get_user(record["user_id"])
            if user is not None and not bool(user["active"]):
                self.db.delete_user(record["user_id"])
        self.audit.record(
            category="identity", action="access_request_rejected", actor=actor.username, actor_role=actor.role,
            detail={
                "request_id": request_id, "username": record["username"],
                "requested_role": record["requested_role"], "reason": reason,
            },
        )
        return _access_request(self.db.get_access_request(request_id) or record)

    # -- users ---------------------------------------------------------------
    def list_accounts(self) -> list[AccountRecord]:
        pending = {
            request["user_id"]
            for request in self.db.list_access_requests(limit=10_000)
            if request["status"] == "pending" and request.get("user_id")
        }
        return [
            AccountRecord(
                id=record["id"],
                username=record["username"],
                display_name=record["display_name"],
                role=record["role"],
                department=record["department"],
                active=bool(record["active"]),
                created_at=_parse(record["created_at"]),  # type: ignore[arg-type]
                origin=record.get("origin"),
                provisioned_by=record.get("provisioned_by"),
                pending_request=record["id"] in pending,
            )
            for record in self.db.list_users()
        ]

    def _account(self, user_id: str) -> dict:
        record = self.db.get_user(user_id)
        if record is None:
            raise AccountError("Account not found", status=404)
        if self.db.pending_request_for_user(user_id) is not None:
            raise AccountError(
                "This account is waiting on an access request. Approve or reject the request instead.",
                status=409,
            )
        return record

    def set_active(self, actor: User, user_id: str, active: bool) -> AccountRecord:
        record = self._account(user_id)
        if not active:
            if record["id"] == actor.id:
                raise AccountError("You cannot deactivate your own account", status=409)
            if self.administers(record["role"]) and bool(record["active"]):
                others = [
                    other for other in self.db.list_users()
                    if other["id"] != user_id and bool(other["active"]) and self.administers(other["role"])
                ]
                if not others:
                    raise AccountError("This is the last active administrator on this host", status=409)
        self.db.update_user(user_id, active=int(active))
        ended = self.db.delete_user_sessions(user_id) if not active else 0
        self.audit.record(
            category="identity",
            action="user_activated" if active else "user_deactivated",
            actor=actor.username, actor_role=actor.role,
            detail={"user_id": user_id, "username": record["username"], "role": record["role"],
                    **({} if active else {"sessions_ended": ended})},
        )
        return next(account for account in self.list_accounts() if account.id == user_id)

    def issue_password_reset(self, actor: User, user_id: str, *, expires_hours: int = 24) -> PasswordResetIssued:
        record = self._account(user_id)
        if not bool(record["active"]):
            raise AccountError("Activate this account before resetting its password", status=409)
        code = generate_code(RESET_PREFIX)
        issued = _now()
        expires = issued + timedelta(hours=expires_hours)
        reset_id = str(uuid.uuid4())
        self.db.insert_password_reset(
            {
                "id": reset_id,
                "user_id": user_id,
                "code_hash": hash_code(code),
                "created_by": actor.username,
                "created_at": issued.isoformat(),
                "expires_at": expires.isoformat(),
            }
        )
        self.audit.record(
            category="identity", action="password_reset_issued", actor=actor.username, actor_role=actor.role,
            detail={"reset_id": reset_id, "user_id": user_id, "username": record["username"],
                    "expires_at": expires.isoformat()},
        )
        return PasswordResetIssued(
            user_id=user_id, username=record["username"], code=code,
            accept_path=RESET_ACCEPT_PATH.format(code=code), expires_at=expires,
        )

    def accept_password_reset(self, *, code: str, password: str) -> Session:
        canonical = normalize_code(code, RESET_PREFIX)
        record = self.db.get_password_reset_by_hash(hash_code(canonical)) if canonical else None
        if record is None:
            raise self._refuse_code("password_reset_refused", "unknown_code")
        state = _code_status(record)
        if state != "open":
            raise self._refuse_code("password_reset_refused", state, reset_id=record["id"])
        if len(password) < MIN_PASSWORD_LENGTH:
            raise AccountError(f"Password must contain at least {MIN_PASSWORD_LENGTH} characters")
        user = self.db.get_user(record["user_id"])
        if user is None or not bool(user["active"]):
            raise self._refuse_code("password_reset_refused", "account_inactive", reset_id=record["id"])
        if not self.db.claim_password_reset(record["id"], _now().isoformat()):
            raise self._refuse_code("password_reset_refused", "claimed_concurrently", reset_id=record["id"])
        self.db.update_user(user["id"], password_hash=hash_password(password))
        # Whoever held the old password is signed out everywhere.
        ended = self.db.delete_user_sessions(user["id"])
        self.audit.record(
            category="identity", action="password_reset_completed", actor=user["username"], actor_role=user["role"],
            detail={"reset_id": record["id"], "issued_by": record["created_by"], "sessions_ended": ended},
        )
        return self.identity.authenticate(user["username"], password)


_accounts: AccountService | None = None


def get_account_service() -> AccountService:
    global _accounts
    if _accounts is None:
        _accounts = AccountService()
    return _accounts
