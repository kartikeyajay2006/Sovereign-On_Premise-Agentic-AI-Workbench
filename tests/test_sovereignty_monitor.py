"""The monitor reports what it observed, and says when it observed nothing.

A host that refused the connection table used to produce an empty list, which
the monitor reported as zero violations and sovereign -- a reading it never
took. Two fields were not readings at all: cloud_llm_calls was the constant 0,
and data_leaving_host_bytes was 0 whenever no violation had been classified.
"""

from __future__ import annotations

import psutil
import pytest

from backend.security import sovereignty as sovereignty_module
from backend.security.sovereignty import SovereigntyMonitor


@pytest.fixture
def monitor() -> SovereigntyMonitor:
    m = SovereigntyMonitor()
    # As start() leaves it, without the polling loop.
    m._running = True
    return m


def _refuse(*_args, **_kwargs):
    raise psutil.AccessDenied()


class TestAnUnreadableTableIsNotAReading:
    def test_the_monitor_says_it_is_not_monitoring_and_why(self, monitor, monkeypatch) -> None:
        before = monitor.last_checked
        monkeypatch.setattr(sovereignty_module.psutil, "net_connections", _refuse)

        status = monitor.sample()

        assert status.monitor_active is False
        assert status.monitor_error and "connection table" in status.monitor_error
        # The time of the last reading is not moved by a sample that took none.
        assert status.last_checked == before

    def test_a_good_sample_afterwards_restores_the_reading(self, monitor, monkeypatch) -> None:
        monkeypatch.setattr(sovereignty_module.psutil, "net_connections", _refuse)
        monitor.sample()
        monkeypatch.setattr(sovereignty_module.psutil, "net_connections", lambda kind: [])

        status = monitor.sample()

        assert status.monitor_active is True
        assert status.monitor_error is None
        assert status.last_checked > monitor.started_at

    def test_a_stopped_monitor_is_not_active(self) -> None:
        status = SovereigntyMonitor().status()
        assert status.monitor_active is False


class TestOnlyReadingsAreReported:
    def test_the_constant_and_the_derived_zero_are_gone(self, monitor) -> None:
        fields = monitor.status().model_dump()
        assert "cloud_llm_calls" not in fields
        assert "data_leaving_host_bytes" not in fields
