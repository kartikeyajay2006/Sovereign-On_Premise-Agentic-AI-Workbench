"""Views over runs: Proof Mode, re-run and compare, and the measurements dashboard.

Everything here reads, except POST /runs/{id}/rerun, which submits through
the task service exactly as POST /tasks does.

Kept apart from routes/tasks.py so its paths (/api/runs/...) never compete
with /api/tasks/{task_id} for a literal segment.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from backend.api.dependencies import CurrentUser, require_permission
from backend.api.task_service import TaskError, get_task_service
from backend.core.audit import get_audit_log
from backend.core.config import get_config
from backend.core.database import get_database
from backend.core.schemas import Task, User
from backend.proof.compare import RunComparison, compare_runs
from backend.proof.measurements import REPORT_NAME, Measurements, build_measurements
from backend.proof.proof_view import ProofView, build_proof_view, stored_certificate
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


# ---------------------------------------------------------- re-run, compare
@router.post("/runs/{task_id}/rerun", response_model=Task, status_code=status.HTTP_202_ACCEPTED)
async def rerun(
    task_id: str,
    user: Annotated[User, Depends(require_permission("task.create"))],
) -> Task:
    """Submit a finished run's request again, as a new run whose parent is this one."""
    original = readable_task(task_id, user)
    try:
        return await get_task_service().rerun(original, user)
    except TaskError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/runs/compare", response_model=RunComparison)
def compare(a: str, b: str, user: CurrentUser) -> RunComparison:
    """Two runs side by side, every material difference named."""
    first, second = readable_task(a, user), readable_task(b, user)
    root = get_config().settings.storage_root
    return compare_runs(
        first, second,
        certificate_a=stored_certificate(first.id, root),
        certificate_b=stored_certificate(second.id, root),
    )


# -------------------------------------------------------------- measurements
@router.get("/measurements", response_model=Measurements)
def measurements(user: CurrentUser) -> Measurements:
    """Every figure the workbench can show about itself, each with the artifact it came from.

    Computed over the runs this person may read: all of them with
    task.read.all, their own otherwise. Host-level artifacts (the red-team
    report, the sandbox self-test) are the same for everyone.
    """
    can_see_all = "task.read.all" in get_config().role_permissions(user.role)
    records = get_database().list_tasks(None if can_see_all else user.id, limit=1000)
    tasks = [Task(**record["payload"]) for record in records]
    return build_measurements(
        tasks,
        scope="all runs" if can_see_all else "your runs",
        audit=get_audit_log(),
        storage_root=get_config().settings.storage_root,
        trusted_key_b64=get_signer().public_key_b64,
    )


@router.get("/measurements/reports/{name}")
def measurement_report(name: str, user: CurrentUser) -> FileResponse:
    """A red-team report, as written, so a figure on the dashboard can be checked against it."""
    if not REPORT_NAME.match(name):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such report")
    path = get_config().settings.storage_root / "reports" / name
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such report")
    return FileResponse(path, media_type="application/json", filename=name)
