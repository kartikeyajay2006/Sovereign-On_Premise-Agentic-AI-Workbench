"""The harness against the real task service, with no model behind it.

The other harness tests use a scripted gateway. This one binds the harness to
an actual TaskService whose worker is never started, so nothing is inferred:
children stay queued, which is exactly the state in which the real contract
can be checked -- that a child is an ordinary task record, classified and
audited by the task service itself, reported with its real queue position,
and cancelled through the service's own path.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from backend.api.task_service import TaskService
from backend.core.audit import get_audit_log
from backend.core.database import Database
from backend.core.events import EventBus
from backend.core.schemas import TaskStatus
from backend.harness.models import HarnessOutcome, HarnessStartRequest, ItemState, RunStatus
from backend.harness.service import HarnessService
from backend.harness.store import HarnessStore
from tests.test_harness_fixtures import make_user

OPERATOR = make_user("operator", role="operator", department="operations")


@pytest.fixture
def real_tasks():
    """A TaskService that is never started, and the orchestrator hook restored.

    Constructing a TaskService points the shared orchestrator's cancel check
    at it; that is put back so no other test inherits this instance.
    """
    from backend.agents.orchestrator import get_orchestrator

    orchestrator = get_orchestrator()
    previous = orchestrator._is_cancelled
    try:
        yield TaskService()
    finally:
        orchestrator._is_cancelled = previous


async def test_children_are_ordinary_governed_tasks(real_tasks: TaskService, tmp_path: Path) -> None:
    store = HarnessStore(Database(path=tmp_path / "integration.sqlite"))
    service = HarnessService(tasks=real_tasks, store=store, events=EventBus(), poll_interval=0.005)
    run = await service.start(
        HarnessStartRequest(
            harness_id="sop-question-sweep",
            inputs={
                "questions": [
                    "What is the external inspection interval for a vessel in corrosive service?",
                    "Who approves a Medium severity finding?",
                ]
            },
        ),
        OPERATOR,
    )

    loop = asyncio.get_running_loop()
    deadline = loop.time() + 5
    while run.items[0].task_id is None:
        assert loop.time() < deadline, "the first child was never submitted"
        await asyncio.sleep(0.005)
    child_id = run.items[0].task_id

    # An ordinary task record, classified by the task service.
    child = real_tasks.get_task(child_id)
    assert child is not None
    assert child.status == TaskStatus.CLASSIFIED
    assert child.user_id == OPERATOR.id
    assert child.profile is not None
    assert child.profile.requires_retrieval
    assert not child.profile.produces_deliverable

    # The task service's own audit records for it, not the harness's.
    own = {event.action for event in get_audit_log().query(task_id=child_id)}
    assert {"received", "classified", "child_submitted"} <= own

    # Reported with the task service's real queue position.
    view = service.view(run, OPERATOR)
    assert view.children[0].outcome == HarnessOutcome.QUEUED
    assert view.children[0].queue_position == 1
    assert view.children[1].outcome == HarnessOutcome.PENDING

    await service.cancel(run.id, OPERATOR)
    runner = service._runners.get(run.id)
    if runner is not None:
        await asyncio.wait_for(runner, timeout=10)

    # Dropped from the queue by the task service's own cancel path.
    cancelled = real_tasks.get_task(child_id)
    assert cancelled is not None and cancelled.status == TaskStatus.CANCELLED
    assert child_id not in real_tasks._waiting
    stored = store.get(run.id)
    assert stored is not None and stored.status == RunStatus.CANCELLED
    assert [item.state for item in stored.items] == [ItemState.SETTLED, ItemState.NOT_SUBMITTED]
    assert "cancelled" in {event.action for event in get_audit_log().query(task_id=child_id)}
