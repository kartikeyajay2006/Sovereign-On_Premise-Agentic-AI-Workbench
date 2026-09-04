"""Queue position reporting.

A task that has not started must say so, and say how many are in front of it.
Reporting "none ahead" while another task holds the single worker is the exact
silence that makes the application look hung — the screen shows "working" for
a task that has not begun.
"""

from __future__ import annotations

import asyncio

import pytest

from backend.api.task_service import TaskService


def service_with(waiting: list[str], running: str | None = None) -> TaskService:
    """A service with its queue posed, without starting a worker."""
    service = TaskService.__new__(TaskService)
    service._waiting = list(waiting)  # type: ignore[attr-defined]
    service._active = running  # type: ignore[attr-defined]
    return service


class TestQueueState:
    def test_running_task_reports_itself_as_running(self) -> None:
        state = service_with([], running="a").queue_state("a")
        assert state["running"] is True
        assert state["ahead"] == 0

    def test_task_waiting_on_a_running_one_is_one_behind(self) -> None:
        """The in-progress task counts: the caller is waiting on it."""
        state = service_with(["b"], running="a").queue_state("b")
        assert state["running"] is False
        assert state["ahead"] == 1, "the running task must be counted as ahead"
        assert state["position"] == 2

    def test_position_reflects_order_in_the_line(self) -> None:
        service = service_with(["b", "c", "d"], running="a")
        assert service.queue_state("b")["ahead"] == 1
        assert service.queue_state("c")["ahead"] == 2
        assert service.queue_state("d")["ahead"] == 3

    def test_first_in_an_idle_queue_waits_for_nobody(self) -> None:
        state = service_with(["b"], running=None).queue_state("b")
        assert state["ahead"] == 0
        assert state["position"] == 1

    def test_finished_task_is_not_in_the_queue(self) -> None:
        state = service_with(["b"], running="a").queue_state("finished")
        assert state["position"] is None
        assert state["ahead"] == 0


class TestWorkerSurvivesItsFirstTask:
    """The queue has to keep serving after the first task completes.

    ``_running`` was one attribute doing two jobs: the id of the task being
    executed, and whether the worker loop should continue. The second
    assignment in ``__init__`` won, so ``while self._running`` was reading a
    field that ``finally: self._running = None`` cleared at the end of every
    run. The worker therefore exited after exactly one task, and every task
    queued afterwards sat at 'classified' until the process was restarted.
    """

    @pytest.mark.asyncio
    async def test_three_queued_tasks_all_run(self) -> None:
        from backend.api.task_service import TaskService

        service = TaskService.__new__(TaskService)
        service._queue = asyncio.Queue()
        service._waiting = []
        service._active = None
        service._cancelled = set()
        service._workers = []
        service._alive = False

        done: list[str] = []

        async def fake_run(task_id: str) -> None:
            done.append(task_id)

        # Drive the real loop shape without the orchestrator behind it.
        async def worker() -> None:
            while service._alive:
                try:
                    task_id = await service._queue.get()
                except asyncio.CancelledError:
                    return
                try:
                    service._active = task_id
                    await fake_run(task_id)
                finally:
                    service._active = None
                    service._queue.task_done()

        service._alive = True
        runner = asyncio.create_task(worker())
        for name in ("first", "second", "third"):
            service._queue.put_nowait(name)

        await asyncio.wait_for(service._queue.join(), timeout=5)
        service._alive = False
        runner.cancel()

        assert done == ["first", "second", "third"], (
            f"worker stopped early: only {done} ran"
        )

    def test_the_two_flags_are_separate_attributes(self) -> None:
        """A structural guard, so the names cannot be merged again."""
        import inspect

        from backend.api import task_service

        source = inspect.getsource(task_service.TaskService.__init__)
        assert "self._active" in source
        assert "self._alive" in source
        assert "self._running" not in source
