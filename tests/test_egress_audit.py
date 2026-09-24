"""The egress figure in a run's audit record must be an observation.

It was a constant: every finished run recorded "network_activity": "none --
all processing local" whatever happened, in the tamper-evident log where it
reads as a measurement. These pin what replaced it.
"""

from __future__ import annotations

from backend.api.task_service import _egress_over_run


def _reading(total: int, active: bool = True) -> dict:
    return {"unapproved_total": total, "active": active}


class TestEgressOverRun:
    def test_a_clean_watched_run_records_zero_observed(self):
        record = _egress_over_run(_reading(3), _reading(3))
        assert record["unapproved_connections_observed"] == 0
        # How it was observed travels with the number, including its blind spot.
        assert "between samples is not observed" in record["method"]

    def test_connections_seen_during_the_run_are_counted(self):
        record = _egress_over_run(_reading(3), _reading(5))
        assert record["unapproved_connections_observed"] == 2

    def test_an_unwatched_window_is_not_reported_as_clean(self):
        """A monitor that was not running saw nothing -- which is not zero."""
        record = _egress_over_run(_reading(0, active=False), _reading(0, active=True))
        assert record["unapproved_connections_observed"] is None
        assert "not running" in record["reason"]

    def test_an_unreadable_monitor_is_not_reported_as_clean(self):
        record = _egress_over_run(None, _reading(0))
        assert record["unapproved_connections_observed"] is None
        assert "could not be read" in record["reason"]

    def test_the_constant_is_gone(self):
        record = _egress_over_run(_reading(0), _reading(0))
        assert "network_activity" not in record
        assert "all processing local" not in str(record)
