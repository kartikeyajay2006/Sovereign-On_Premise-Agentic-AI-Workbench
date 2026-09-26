"""Account provisioning routes: owner setup, invitations, access requests, users.

Two kinds of route live here, and the split is the security boundary:

* **Unauthenticated doors** -- ``/setup/*``, ``/invites/accept``,
  ``/password-resets/accept`` and ``/access-requests``. Each one redeems
  something an administrator issued, or asks an administrator for something;
  none of them can grant access on its own. They are throttled like sign-in
  (``security/throttle.py``), on counters of their own so guessing at one
  door cannot close another.
* **Administration** -- ``/admin/*``, every route gated on ``users.manage``
  through the policy gateway exactly as the rest of the API is gated.

The logic, and every audit record, is in ``backend/core/accounts.py``; this
module only maps HTTP onto it.
"""

from __future__ import annotations

import hashlib
import math
from typing import Annotated, Callable, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from backend.api.dependencies import require_permission
from backend.api.routes.system import _set_session_cookie
from backend.core.accounts import INVITE_ACCEPT_PATH, AccountError, get_account_service
from backend.core.audit import get_audit_log
from backend.core.directory import directory_status
from backend.core.schemas import (
    AccessRequestApproval,
    AccessRequestCreate,
    AccessRequestRecord,
    AccessRequestRejection,
    AccessRequestStatus,
    AccountRecord,
    DirectoryStatus,
    InviteAcceptRequest,
    InviteCreateRequest,
    InviteIssued,
    InviteRecord,
    OwnerSetupRequest,
    PasswordResetAccept,
    PasswordResetIssued,
    PasswordResetRequest,
    Session,
    SetupStatus,
    User,
)
from backend.security.throttle import get_throttle

router = APIRouter(prefix="/api", tags=["accounts"])

Administrator = Annotated[User, Depends(require_permission("users.manage"))]

T = TypeVar("T")


def _client(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _refused(exc: AccountError) -> HTTPException:
    return HTTPException(status_code=exc.status, detail=str(exc))


def _guarded(purpose: str, key: str, request: Request, action: Callable[[], T]) -> T:
    """Run an unauthenticated action behind its throttle.

    A locked client is refused before the action runs. A refusal the action
    marks as a guess (a wrong or spent code) counts against the client, and a
    lockout it imposes is audited, as a sign-in lockout is.
    """
    throttle = get_throttle(purpose)
    client = _client(request)
    wait = throttle.locked_for(key, client)
    if wait > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many attempts from this address. Try again in {math.ceil(wait)} seconds.",
            headers={"Retry-After": str(math.ceil(wait))},
        )
    try:
        result = action()
    except AccountError as exc:
        if exc.guess:
            imposed = throttle.failed(key, client)
            if imposed:
                get_audit_log().record(
                    category="security",
                    action=f"{purpose}_throttled",
                    actor="anonymous",
                    detail={"client": client, "lockout_seconds": imposed},
                )
        raise _refused(exc) from exc
    return result


def _code_key(code: str) -> str:
    # Each distinct wrong code is its own key, so only the per-client spray
    # rule applies: ten different wrong codes lock the client, and no one
    # can lock a real code by typing it wrong five times.
    return "code:" + hashlib.sha256(code.strip().upper().encode("utf-8")).hexdigest()[:16]


# --------------------------------------------------------------- owner setup
@router.get("/setup/status", response_model=SetupStatus)
def setup_status() -> SetupStatus:
    """Whether this host still needs its first administrator. Nothing else.

    Public, because the sign-in screen has to know whether to send someone to
    /setup before anyone can sign in. It says only yes or no: not how many
    accounts exist, and not where the token is.
    """
    return SetupStatus(needs_setup=get_account_service().needs_setup())


@router.post("/setup/owner", response_model=Session, status_code=status.HTTP_201_CREATED)
def setup_owner(payload: OwnerSetupRequest, request: Request, response: Response) -> Session:
    session = _guarded(
        "codes",
        _code_key(payload.token),
        request,
        lambda: get_account_service().create_owner(
            token=payload.token,
            username=payload.username,
            display_name=payload.display_name,
            password=payload.password,
        ),
    )
    _set_session_cookie(response, session)
    return session


# --------------------------------------------------------------- invitations
@router.post("/admin/invites", response_model=InviteIssued, status_code=status.HTTP_201_CREATED)
def create_invite(payload: InviteCreateRequest, user: Administrator) -> InviteIssued:
    """Issue a one-time invitation. The code is in this response and nowhere else."""
    try:
        invite, code = get_account_service().create_invite(
            user,
            role=payload.role,
            department=payload.department,
            display_name=payload.display_name,
            expires_hours=payload.expires_hours,
        )
    except AccountError as exc:
        raise _refused(exc) from exc
    return InviteIssued(invite=invite, code=code, accept_path=INVITE_ACCEPT_PATH.format(code=code))


@router.get("/admin/invites", response_model=list[InviteRecord])
def list_invites(user: Administrator) -> list[InviteRecord]:
    return get_account_service().list_invites()


@router.delete("/admin/invites/{invite_id}", response_model=InviteRecord)
def revoke_invite(invite_id: str, user: Administrator) -> InviteRecord:
    try:
        return get_account_service().revoke_invite(user, invite_id)
    except AccountError as exc:
        raise _refused(exc) from exc


@router.post("/invites/accept", response_model=Session, status_code=status.HTTP_201_CREATED)
def accept_invite(payload: InviteAcceptRequest, request: Request, response: Response) -> Session:
    session = _guarded(
        "codes",
        _code_key(payload.code),
        request,
        lambda: get_account_service().accept_invite(
            code=payload.code,
            username=payload.username,
            password=payload.password,
            display_name=payload.display_name,
        ),
    )
    _set_session_cookie(response, session)
    return session


@router.post("/password-resets/accept", response_model=Session)
def accept_password_reset(payload: PasswordResetAccept, request: Request, response: Response) -> Session:
    session = _guarded(
        "codes",
        _code_key(payload.code),
        request,
        lambda: get_account_service().accept_password_reset(code=payload.code, password=payload.password),
    )
    _set_session_cookie(response, session)
    return session


# ----------------------------------------------------------- access requests
@router.post("/access-requests", response_model=AccessRequestStatus, status_code=status.HTTP_201_CREATED)
def request_access(payload: AccessRequestCreate, request: Request) -> AccessRequestStatus:
    """Ask for an account. It exists from now on, inactive, until an administrator decides.

    Every submission counts against the client's window, accepted or not:
    this is an unauthenticated write into an administrator's queue.
    """
    throttle = get_throttle("requests")
    client = _client(request)
    key = payload.username.strip().lower()[:64]
    wait = throttle.locked_for(key, client)
    if wait > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many requests from this address. Try again in {math.ceil(wait)} seconds.",
            headers={"Retry-After": str(math.ceil(wait))},
        )
    imposed = throttle.failed(key, client)
    if imposed:
        get_audit_log().record(
            category="security",
            action="requests_throttled",
            actor="anonymous",
            detail={"client": client, "lockout_seconds": imposed},
        )
    service = get_account_service()
    try:
        record = service.request_access(
            username=payload.username,
            display_name=payload.display_name,
            requested_role=payload.requested_role,
            reason=payload.reason,
            password=payload.password,
        )
    except AccountError as exc:
        raise _refused(exc) from exc
    return service.request_status(record.id)


@router.get("/access-requests/{request_id}/status", response_model=AccessRequestStatus)
def access_request_status(request_id: str) -> AccessRequestStatus:
    """The requester's view: pending, approved, or rejected with the reason.

    Keyed by the request's random id, which only the requester was given; it
    names no role, department or administrator.
    """
    try:
        return get_account_service().request_status(request_id)
    except AccountError as exc:
        raise _refused(exc) from exc


@router.get("/admin/access-requests", response_model=list[AccessRequestRecord])
def list_access_requests(user: Administrator) -> list[AccessRequestRecord]:
    return get_account_service().list_requests()


@router.post("/admin/access-requests/{request_id}/approve", response_model=AccessRequestRecord)
def approve_access_request(
    request_id: str, payload: AccessRequestApproval, user: Administrator
) -> AccessRequestRecord:
    try:
        return get_account_service().approve_request(
            user, request_id, role=payload.role, department=payload.department
        )
    except AccountError as exc:
        raise _refused(exc) from exc


@router.post("/admin/access-requests/{request_id}/reject", response_model=AccessRequestRecord)
def reject_access_request(
    request_id: str, payload: AccessRequestRejection, user: Administrator
) -> AccessRequestRecord:
    try:
        return get_account_service().reject_request(user, request_id, reason=payload.reason)
    except AccountError as exc:
        raise _refused(exc) from exc


# --------------------------------------------------------------------- users
@router.get("/admin/users", response_model=list[AccountRecord])
def list_accounts(user: Administrator) -> list[AccountRecord]:
    return get_account_service().list_accounts()


@router.post("/admin/users/{user_id}/deactivate", response_model=AccountRecord)
def deactivate_account(user_id: str, user: Administrator) -> AccountRecord:
    try:
        return get_account_service().set_active(user, user_id, False)
    except AccountError as exc:
        raise _refused(exc) from exc


@router.post("/admin/users/{user_id}/activate", response_model=AccountRecord)
def activate_account(user_id: str, user: Administrator) -> AccountRecord:
    try:
        return get_account_service().set_active(user, user_id, True)
    except AccountError as exc:
        raise _refused(exc) from exc


@router.post("/admin/users/{user_id}/reset-password", response_model=PasswordResetIssued)
def reset_password(
    user_id: str, user: Administrator, payload: PasswordResetRequest | None = None
) -> PasswordResetIssued:
    """Issue a one-time reset code for someone else. Shown once, like an invitation."""
    try:
        return get_account_service().issue_password_reset(
            user, user_id, expires_hours=(payload or PasswordResetRequest()).expires_hours
        )
    except AccountError as exc:
        raise _refused(exc) from exc


@router.get("/admin/directory", response_model=DirectoryStatus)
def directory(user: Administrator) -> DirectoryStatus:
    """The AD/LDAP declaration and what this build does with it: nothing yet, said plainly."""
    return directory_status()
