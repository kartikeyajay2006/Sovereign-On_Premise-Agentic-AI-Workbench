"""Queue position reporting.

A task that has not started must say so, and say how many are in front of it.
Reporting "none ahead" while another task holds the single worker is the exact
silence that makes the application look hung — the screen shows "working" for
a task that has not begun.
"""

from __future__ import annotations

from backend.api.task_service import TaskService


def service_with(waiting: list[str], running: str | None = None) -> TaskService:
    """A service with its queue posed, without starting a worker."""
    service = TaskService.__new__(TaskService)
    service._waiting = list(waiting)  # type: ignore[attr-defined]
    service._running = running  # type: ignore[attr-defined]
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
