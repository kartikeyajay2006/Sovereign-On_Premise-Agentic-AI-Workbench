"""Harness endpoints: governed, multi-run workflows.

Registered in backend/api/main.py. A harness composes ordinary tasks, so
starting one needs exactly what starting a task needs -- ``task.create`` --
and every child it submits is authorised, classified and gated by the task
service on its own.

Every handler is ``async def`` on purpose. A running harness is driven on the
event loop and its live record is shared with these handlers; a plain
``def`` handler runs in a worker thread and could read or change that record
while the runner is part-way through updating it.
"""

from __future__ import annotations

from typing import Annotated, Literal, NoReturn

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse

from backend.api.dependencies import CurrentUser, require_permission
from backend.core.schemas import User
from backend.harness.expansion import HarnessInputError
from backend.harness.models import (
    HarnessCatalogView,
    HarnessDefinitionView,
    HarnessPreview,
    HarnessPreviewRequest,
    HarnessRunSummary,
    HarnessRunView,
    HarnessStartRequest,
    ReportDecisionRequest,
)
from backend.harness.service import HarnessError, get_harness_service

router = APIRouter(prefix="/api", tags=["harnesses"])

MEDIA_TYPES = {"md": "text/markdown; charset=utf-8", "json": "application/json"}


def _refuse(exc: HarnessError | HarnessInputError) -> NoReturn:
    code = exc.status_code if isinstance(exc, HarnessError) else status.HTTP_400_BAD_REQUEST
    raise HTTPException(status_code=code, detail=str(exc)) from exc


# --------------------------------------------------------------- definitions
@router.get("/harnesses", response_model=HarnessCatalogView)
async def list_harnesses(user: CurrentUser) -> HarnessCatalogView:
    """Every valid definition, and every file that failed validation."""
    return get_harness_service().catalog_view(user)


@router.get("/harnesses/{harness_id}", response_model=HarnessDefinitionView)
async def get_harness(harness_id: str, user: CurrentUser) -> HarnessDefinitionView:
    service = get_harness_service()
    loaded = service.catalog().get(harness_id)
    if loaded is None:
        raise HTTPException(status_code=404, detail=f"No harness named '{harness_id}' is defined.")
    return service.definition_view(loaded, user)


@router.post("/harnesses/{harness_id}/preview", response_model=HarnessPreview)
async def preview_harness(
    harness_id: str,
    payload: HarnessPreviewRequest,
    user: Annotated[User, Depends(require_permission("task.create"))],
) -> HarnessPreview:
    """Expand the inputs into the exact child prompts a run would submit.

    Creates nothing. The start request then names the keys the person
    approved here.
    """
    try:
        return get_harness_service().preview(harness_id, payload.inputs, user)
    except (HarnessError, HarnessInputError) as exc:
        _refuse(exc)


# ---------------------------------------------------------------------- runs
@router.post("/harness-runs", response_model=HarnessRunView, status_code=status.HTTP_202_ACCEPTED)
async def start_run(
    payload: HarnessStartRequest,
    user: Annotated[User, Depends(require_permission("task.create"))],
) -> HarnessRunView:
    service = get_harness_service()
    try:
        run = await service.start(payload, user)
    except (HarnessError, HarnessInputError) as exc:
        _refuse(exc)
    return service.view(run, user)


@router.get("/harness-runs", response_model=list[HarnessRunSummary])
async def list_runs(
    user: CurrentUser, limit: Annotated[int, Query(ge=1, le=100)] = 30
) -> list[HarnessRunSummary]:
    """Your runs, or every run for a role holding task.read.all."""
    return get_harness_service().summaries(user, limit=limit)


@router.get("/harness-runs/{run_id}", response_model=HarnessRunView)
async def get_run(run_id: str, user: CurrentUser) -> HarnessRunView:
    try:
        return get_harness_service().run_view(run_id, user)
    except HarnessError as exc:
        _refuse(exc)


@router.post("/harness-runs/{run_id}/cancel", response_model=HarnessRunView)
async def cancel_run(run_id: str, user: CurrentUser) -> HarnessRunView:
    """Stop submitting, and stop the child in flight through the task service.

    A queued child is dropped at once; a running one ends at its next stage
    boundary. Children already settled keep their records.
    """
    service = get_harness_service()
    try:
        run = await service.cancel(run_id, user)
    except HarnessError as exc:
        _refuse(exc)
    return service.view(run, user)


@router.post("/harness-runs/{run_id}/report", response_model=HarnessRunView)
async def regenerate_report(run_id: str, user: CurrentUser) -> HarnessRunView:
    """Write a new report version from the child records as they stand now."""
    service = get_harness_service()
    try:
        run = await service.regenerate_report(run_id, user)
    except HarnessError as exc:
        _refuse(exc)
    return service.view(run, user)


@router.post("/harness-runs/{run_id}/report/decision", response_model=HarnessRunView)
async def decide_report(
    run_id: str,
    payload: ReportDecisionRequest,
    user: Annotated[User, Depends(require_permission("approval.decide"))],
) -> HarnessRunView:
    service = get_harness_service()
    try:
        run = await service.decide_report(run_id, user, payload.decision, payload.comment)
    except HarnessError as exc:
        _refuse(exc)
    return service.view(run, user)


@router.get("/harness-runs/{run_id}/report/{fmt}")
async def download_report(
    run_id: str, fmt: Literal["md", "json"], user: CurrentUser
) -> FileResponse:
    """The report file, served only if it still matches its recorded hash."""
    try:
        path, file = get_harness_service().report_file(run_id, fmt, user)
    except HarnessError as exc:
        _refuse(exc)
    return FileResponse(path, filename=file.filename, media_type=MEDIA_TYPES[fmt])
