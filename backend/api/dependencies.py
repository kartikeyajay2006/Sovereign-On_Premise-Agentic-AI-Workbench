"""Shared FastAPI dependencies: authentication and permission enforcement."""

from __future__ import annotations

from typing import Annotated, Callable

from fastapi import Cookie, Depends, Header, HTTPException, status

from backend.core.identity import AuthenticationError, get_identity_service
from backend.core.schemas import PolicyDecision, User
from backend.policy.gateway import get_policy_gateway


def get_session_token(
    authorization: Annotated[str | None, Header()] = None,
    x_session_token: Annotated[str | None, Header()] = None,
    session_cookie: Annotated[str | None, Cookie(alias="workbench_session")] = None,
) -> str:
    """Resolve a session token from an API header or the secure browser cookie."""
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif x_session_token:
        token = x_session_token.strip()
    elif session_cookie:
        token = session_cookie.strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token


SessionToken = Annotated[str, Depends(get_session_token)]


def get_current_user(token: SessionToken) -> User:
    """Resolve the authenticated caller from a verified session token."""
    try:
        return get_identity_service().resolve_session(token)
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_permission(permission: str) -> Callable[[User], User]:
    """Dependency factory enforcing a named permission via the policy gateway."""

    def dependency(user: CurrentUser) -> User:
        event = get_policy_gateway().check_permission(user, permission)
        if event.decision != PolicyDecision.ALLOW:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail=event.reason
            )
        return user

    return dependency
