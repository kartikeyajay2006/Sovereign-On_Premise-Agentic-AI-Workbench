"""Task, file, approval and deliverable endpoints."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from backend.api.dependencies import CurrentUser, require_permission
from backend.api.task_service import TaskError, get_task_service
from backend.core.config import get_config
from backend.core.schemas import (
    ApprovalDecisionRequest,
    PolicyDecision,
    StoredFile,
    Task,
    TaskCreateRequest,
    TaskSummary,
    User,
)
from backend.policy.gateway import get_policy_gateway

router = APIRouter(prefix="/api", tags=["tasks"])


@router.post("/files", response_model=StoredFile, status_code=status.HTTP_201_CREATED)
async def upload_file(
    user: Annotated[User, Depends(require_permission("file.upload"))],
    file: UploadFile = File(...),
    classification: str | None = Form(default=None),
) -> StoredFile:
    from backend.core.schemas import Sensitivity

    service = get_task_service()
    payload = await file.read()
    try:
        return service.store_upload(
            user,
            file.filename or "upload",
            payload,
            Sensitivity(classification) if classification else None,
        )
    except TaskError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/files", response_model=list[StoredFile])
def list_files(user: CurrentUser) -> list[StoredFile]:
    return get_task_service().list_files(user)


@router.get("/files/{file_id}/download")
def download_file(file_id: str, user: CurrentUser) -> FileResponse:
    service = get_task_service()
    stored = service.get_file(file_id)
    if stored is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    decision = get_policy_gateway().check_file_access(user, stored)
    if decision.decision != PolicyDecision.ALLOW:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=decision.reason)
    path = Path(stored.stored_path)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="File is no longer on disk")
    return FileResponse(path, filename=stored.filename, media_type=stored.media_type)


@router.post("/tasks", response_model=Task, status_code=status.HTTP_202_ACCEPTED)
async def create_task(
    payload: TaskCreateRequest,
    user: Annotated[User, Depends(require_permission("task.create"))],
) -> Task:
    try:
        return await get_task_service().create_task(
            user, payload.prompt, payload.file_ids, payload.deliverable_format
        )
    except TaskError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/tasks", response_model=list[TaskSummary])
def list_tasks(user: CurrentUser, limit: int = 50) -> list[TaskSummary]:
    return get_task_service().list_tasks(user, limit=limit)


@router.get("/tasks/{task_id}", response_model=Task)
def get_task(task_id: str, user: CurrentUser) -> Task:
    service = get_task_service()
    task = service.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    # A task that has not started should say it is waiting, and for how many.
    queue = service.queue_state(task_id)
    task.queue_position = queue.get("position")
    task.queue_ahead = int(queue.get("ahead") or 0)
    permissions = get_config().role_permissions(user.role)
    if task.user_id != user.id and "task.read.all" not in permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You may only read your own tasks",
        )
    return task


@router.get("/approvals", response_model=list[Task])
def pending_approvals(
    user: Annotated[User, Depends(require_permission("approval.read"))],
) -> list[Task]:
    return get_task_service().pending_approvals(user)


@router.post("/tasks/{task_id}/approve", response_model=Task)
async def decide_approval(
    task_id: str,
    payload: ApprovalDecisionRequest,
    user: Annotated[User, Depends(require_permission("approval.decide"))],
) -> Task:
    try:
        return await get_task_service().decide_approval(
            task_id, user, payload.decision, payload.comment
        )
    except TaskError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/deliverables/{task_id}/{filename}")
def download_deliverable(task_id: str, filename: str, user: CurrentUser) -> FileResponse:
    service = get_task_service()
    task = service.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    permissions = get_config().role_permissions(user.role)
    if task.user_id != user.id and "deliverable.download.all" not in permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not entitled to this deliverable",
        )

    deliverable = next((item for item in task.deliverables if item.filename == filename), None)
    if deliverable is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deliverable not found")
    if not deliverable.released and "approval.decide" not in permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This deliverable is held pending human approval and has not been "
                "released."
            ),
        )

    path = get_config().settings.path("deliverables") / task_id / filename
    confinement = get_policy_gateway().check_path_confinement(path, user=user)
    if confinement.decision != PolicyDecision.ALLOW or not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not available")

    from backend.core.audit import get_audit_log

    get_audit_log().record(
        category="deliverable",
        action="downloaded",
        actor=user.username,
        actor_role=user.role,
        task_id=task_id,
        detail={"filename": filename, "sha256": deliverable.sha256},
    )
    return FileResponse(path, filename=filename)
