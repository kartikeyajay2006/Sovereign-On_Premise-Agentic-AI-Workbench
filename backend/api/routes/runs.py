"""Read-only views over finished runs: Proof Mode.

Kept apart from routes/tasks.py so its paths (/api/runs/...) never compete
with /api/tasks/{task_id} for a literal segment.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from backend.api.dependencies import CurrentUser
from backend.api.task_service import get_task_service
from backend.core.audit import get_audit_log
from backend.core.config import get_config
from backend.core.schemas import Task, User
from backend.proof.proof_view import ProofView, build_proof_view
from backend.proof.signer import get_signer

router = APIRouter(prefix="/api", tags=["runs"])


def readable_task(task_id: str, user: User) -> Task:
    """The run, if it exists and this person may read it; the same rule as GET /tasks/{id}."""
    task = get_task_service().get_task(task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Task not found: {task_id}")
    if task.user_id != user.id and "task.read.all" not in get_config().role_permissions(user.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You may only read your own tasks")
    return task


@router.get("/runs/{task_id}/proof", response_model=ProofView)
def run_proof(task_id: str, user: CurrentUser) -> ProofView:
    """The run's chain, request to signed certificate, each link as recorded."""
    task = readable_task(task_id, user)
    settings = get_config().settings
    return build_proof_view(
        task,
        storage_root=settings.storage_root,
        trusted_key_b64=get_signer().public_key_b64,
        audit=get_audit_log(),
        deliverables_dir=settings.path("deliverables"),
    )
