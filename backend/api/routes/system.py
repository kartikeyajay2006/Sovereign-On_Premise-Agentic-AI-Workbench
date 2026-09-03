"""Auth, models, knowledge base, audit, sovereignty and event-stream routes."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any, AsyncIterator

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import PlainTextResponse, StreamingResponse

from backend.api.dependencies import CurrentUser, SessionToken, require_permission
from backend.api.task_service import get_task_service
from backend.core.audit import get_audit_log
from backend.core.config import get_config
from backend.core.events import get_event_bus
from backend.core.identity import (
    AuthenticationError,
    RegistrationError,
    get_identity_service,
)
from backend.core.schemas import (
    AuditChainStatus,
    AuditEvent,
    KnowledgeDocument,
    KnowledgeSearchRequest,
    KnowledgeSearchResponse,
    LoginRequest,
    ModelDescriptor,
    RegistrationRequest,
    Sensitivity,
    Session,
    SovereigntyStatus,
    SystemHealth,
    User,
)
from backend.models_layer.manager import get_model_manager
from backend.models_layer.registry import get_model_registry
from backend.rag.knowledge_base import get_knowledge_base
from backend.security.sovereignty import get_sovereignty_monitor
from backend.tools.sandbox import get_sandbox

router = APIRouter(prefix="/api", tags=["system"])

BOOT_TIME = datetime.now(timezone.utc)


# ------------------------------------------------------------------ identity
def _set_session_cookie(response: Response, session: Session) -> None:
    """Attach the browser session used by the EventSource connection."""
    response.set_cookie(
        key="workbench_session",
        value=session.token,
        max_age=int(get_config().settings.security.get("session_ttl_minutes", 720)) * 60,
        httponly=True,
        samesite="strict",
        secure=False,  # Local HTTP is the supported on-premise default.
        path="/",
    )


@router.post("/auth/login", response_model=Session)
def login(payload: LoginRequest, response: Response) -> Session:
    try:
        session = get_identity_service().authenticate(payload.username, payload.password)
        # EventSource cannot attach an Authorization header. Keep the browser
        # session in an HttpOnly same-site cookie as well, so the SSE endpoint
        # receives the same authenticated identity as the rest of the UI.
        _set_session_cookie(response, session)
        return session
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc


@router.post("/auth/register", response_model=Session, status_code=status.HTTP_201_CREATED)
def register(payload: RegistrationRequest, response: Response) -> Session:
    try:
        session = get_identity_service().register(
            username=payload.username,
            display_name=payload.display_name,
            password=payload.password,
            department=payload.department,
        )
        _set_session_cookie(response, session)
        return session
    except RegistrationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout(
    user: CurrentUser,
    token: SessionToken,
) -> Response:
    get_identity_service().logout(token, user)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie("workbench_session", path="/")
    return response


@router.get("/auth/me", response_model=User)
def current_user(user: CurrentUser) -> User:
    return user


@router.get("/auth/directory", response_model=list[User])
def directory() -> list[User]:
    """Seeded demo identities, so a reviewer can see which roles exist."""
    return get_identity_service().list_users()


# -------------------------------------------------------------------- models
@router.get("/models", response_model=list[ModelDescriptor])
async def list_models(user: CurrentUser) -> list[ModelDescriptor]:
    snapshot = await get_model_registry().refresh(force=True)
    return snapshot.models


@router.get("/models/status")
async def models_status(user: CurrentUser) -> dict[str, Any]:
    registry = get_model_registry()
    snapshot = await registry.refresh(force=True)
    return {
        "provider": get_config().settings.inference.get("provider"),
        "base_url": get_config().settings.inference.get("base_url"),
        "reachable": snapshot.provider_reachable,
        "registered": len(snapshot.models),
        "available": len(snapshot.available()),
        "unregistered_installed": snapshot.unregistered,
        "residency": get_model_manager().status(),
        "resident_in_runtime": await get_model_manager().resident_models(),
        "roles": {
            role: [
                model.id
                for model in snapshot.models
                if model.role.value == role and model.available
            ]
            for role in {model.role.value for model in snapshot.models}
        },
    }


@router.get("/routing/rules")
def routing_rules(user: CurrentUser) -> dict[str, Any]:
    """The live routing policy, so the UI can explain decisions truthfully."""
    config = get_config()
    return {
        "rules": config.routing.get("rules", []),
        "scoring": config.routing.get("scoring", {}),
        "stage_roles": config.routing.get("stage_roles", {}),
    }


@router.get("/policies")
def policies(user: CurrentUser) -> dict[str, Any]:
    config = get_config()
    return {
        "roles": config.access_control.get("roles", {}),
        "tools": config.tool_permissions.get("tools", {}),
        "hard_denied_actions": config.tool_permissions.get("hard_denied_actions", []),
        "classification_levels": config.data_classification.get("levels", []),
        "approval_rules": config.approval_rules.get("approval_required_when", []),
        "egress": config.data_classification.get("egress", {}),
    }


# ----------------------------------------------------------------- knowledge
@router.get("/knowledge/documents", response_model=list[KnowledgeDocument])
def knowledge_documents(user: CurrentUser) -> list[KnowledgeDocument]:
    return get_knowledge_base().list_documents()


@router.post("/knowledge/search", response_model=KnowledgeSearchResponse)
async def knowledge_search(
    payload: KnowledgeSearchRequest,
    user: Annotated[User, Depends(require_permission("knowledge.search"))],
) -> KnowledgeSearchResponse:
    knowledge_base = get_knowledge_base()
    departments = payload.departments
    overrides = get_config().access_control.get("file_access", {}).get("override_roles", [])
    if departments is None and user.role not in overrides:
        departments = [user.department, "general"]

    results, mode, took_ms = await knowledge_base.search(
        payload.query, top_k=payload.top_k, departments=departments
    )
    return KnowledgeSearchResponse(
        query=payload.query, retrieval_mode=mode, results=results, took_ms=took_ms
    )


@router.post("/knowledge/documents", response_model=KnowledgeDocument, status_code=201)
async def ingest_document(
    user: Annotated[User, Depends(require_permission("knowledge.ingest"))],
    file: UploadFile = File(...),
    department: str = Form(default="general"),
    classification: str = Form(default="confidential"),
    version: str = Form(default="1.0"),
) -> KnowledgeDocument:
    settings = get_config().settings
    staging = settings.path("index") / "staging"
    staging.mkdir(parents=True, exist_ok=True)
    target = staging / Path(file.filename or "document").name
    target.write_bytes(await file.read())

    try:
        document = await get_knowledge_base().ingest_file(
            target,
            department=department,
            classification=Sensitivity(classification),
            version=version,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    get_audit_log().record(
        category="knowledge",
        action="document_ingested",
        actor=user.username,
        actor_role=user.role,
        detail={
            "document_id": document.id,
            "title": document.title,
            "chunks": document.chunk_count,
            "classification": document.classification.value,
            "department": document.department,
            "sha256": document.sha256,
        },
    )
    return document


@router.delete("/knowledge/documents/{document_id}", status_code=204, response_class=Response)
def delete_document(
    document_id: str,
    user: Annotated[User, Depends(require_permission("knowledge.manage"))],
) -> Response:
    if not get_knowledge_base().delete_document(document_id):
        raise HTTPException(status_code=404, detail="Document not found")
    get_audit_log().record(
        category="knowledge",
        action="document_deleted",
        actor=user.username,
        actor_role=user.role,
        detail={"document_id": document_id},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------- audit
@router.get("/audit", response_model=list[AuditEvent])
def audit_events(
    user: CurrentUser,
    task_id: str | None = None,
    category: str | None = None,
    search: str | None = None,
    limit: int = 300,
) -> list[AuditEvent]:
    permissions = get_config().role_permissions(user.role)
    audit = get_audit_log()
    if "audit.read.all" in permissions:
        return audit.query(task_id=task_id, category=category, search=search, limit=limit)
    if "audit.read.own" in permissions:
        return audit.query(
            task_id=task_id, category=category, search=search, actor=user.username, limit=limit
        )
    raise HTTPException(status_code=403, detail="This role cannot read the audit trail")


@router.get("/audit/chain", response_model=AuditChainStatus)
def audit_chain(user: CurrentUser) -> AuditChainStatus:
    return get_audit_log().verify_chain()


@router.get("/audit/export", response_class=PlainTextResponse)
def audit_export(
    user: Annotated[User, Depends(require_permission("audit.read.all"))],
) -> PlainTextResponse:
    get_audit_log().record(
        category="audit",
        action="exported",
        actor=user.username,
        actor_role=user.role,
        detail={"format": "jsonl"},
    )
    return PlainTextResponse(
        get_audit_log().export(),
        headers={"Content-Disposition": "attachment; filename=audit-trail.jsonl"},
    )


# --------------------------------------------------------------- sovereignty
@router.get("/sovereignty", response_model=SovereigntyStatus)
def sovereignty_status(user: CurrentUser) -> SovereigntyStatus:
    return get_sovereignty_monitor().sample()


@router.get("/sovereignty/sandbox-test")
def sandbox_self_test(user: CurrentUser) -> dict[str, Any]:
    """Prove both sandbox isolation layers actually block the network."""
    result = get_sandbox().self_test()
    get_audit_log().record(
        category="security",
        action="sandbox_self_test",
        actor=user.username,
        actor_role=user.role,
        detail=result,
    )
    return result


# --------------------------------------------------------------------- health
@router.get("/health", response_model=SystemHealth)
async def health(user: CurrentUser) -> SystemHealth:
    registry = get_model_registry()
    snapshot = await registry.refresh(force=True)
    knowledge_base = get_knowledge_base()
    stats = knowledge_base.stats()
    monitor = get_sovereignty_monitor()
    return SystemHealth(
        inference_provider=str(get_config().settings.inference.get("provider", "ollama")),
        inference_reachable=snapshot.provider_reachable,
        models_registered=len(snapshot.models),
        models_available=len(snapshot.available()),
        knowledge_documents=stats["documents"],
        knowledge_chunks=stats["chunks"],
        retrieval_mode=await knowledge_base.retrieval_mode(),
        sandbox_runtime=get_sandbox().runtime,
        sandbox_ready=get_sandbox().is_ready(),
        audit_chain_valid=get_audit_log().verify_chain().valid,
        sovereignty_ok=monitor.status().sovereign,
        uptime_seconds=(datetime.now(timezone.utc) - BOOT_TIME).total_seconds(),
        checked_at=datetime.now(timezone.utc),
    )


@router.get("/tools")
def tools_catalogue(user: CurrentUser) -> list[dict[str, Any]]:
    from backend.tools.registry import get_tool_registry

    return get_tool_registry().describe()


# -------------------------------------------------------------- event stream
@router.get("/events")
async def event_stream(user: CurrentUser, task_id: str | None = None) -> StreamingResponse:
    """Server-Sent Events: agent timeline plus live sovereignty counters.

    EventSource receives the HttpOnly same-site session cookie issued at login.
    Task events are scoped to the owner unless the caller has ``task.read.all``.
    Platform-level sovereignty heartbeats carry no task content and remain
    visible to every authenticated user.
    """
    bus = get_event_bus()
    service = get_task_service()
    can_read_all = "task.read.all" in get_config().role_permissions(user.role)

    if task_id:
        requested_task = service.get_task(task_id)
        if requested_task is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        if not can_read_all and requested_task.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You may only subscribe to your own task events",
            )

    def visible(event_task_id: str | None) -> bool:
        if event_task_id is None or can_read_all:
            return True
        task = service.get_task(event_task_id)
        return task is not None and task.user_id == user.id

    async def generator() -> AsyncIterator[str]:
        yield ": stream open\n\n"
        for event in bus.replay(task_id=task_id, limit=50):
            if visible(event.task_id):
                yield _sse(event.model_dump(mode="json"))
        async with bus.subscribe() as queue:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=20.0)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                if task_id and event.task_id and event.task_id != task_id:
                    continue
                if not visible(event.task_id):
                    continue
                yield _sse(event.model_dump(mode="json"))

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


def _sse(payload: dict[str, Any]) -> str:
    return f"event: {payload.get('event', 'message')}\ndata: {json.dumps(payload, default=str)}\n\n"
