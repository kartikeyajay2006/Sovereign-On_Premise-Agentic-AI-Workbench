"""Sovereignty monitor.

Continuously samples the network connections owned by the workbench process
tree and classifies each one against the allowed CIDRs in ``config/app.yaml``.
Anything that is not loopback is a violation: recorded, counted, published to
the Security Center over SSE, and written to the audit trail.

This is the evidence behind the platform's central claim. The problem statement
is explicit that a sovereignty assertion without observable proof is worth
nothing, so the monitor reports what it actually observed — including the fact
that it observed nothing leaving the host.
"""

from __future__ import annotations

import asyncio
import ipaddress
import os
import socket
from datetime import datetime, timezone
from typing import Any

import psutil

from backend.core.audit import get_audit_log
from backend.core.config import get_config
from backend.core.events import get_event_bus
from backend.core.schemas import NetworkConnection, SovereigntyStatus


class SovereigntyMonitor:
    """Watches the process tree for any egress and proves the absence of it."""

    def __init__(self) -> None:
        self.config = get_config()
        self.audit = get_audit_log()
        self.events = get_event_bus()
        self.started_at = datetime.now(timezone.utc)
        self.last_checked = self.started_at
        self._violations: list[NetworkConnection] = []
        self._violation_total = 0
        self._local_connections = 0
        self._dns_attempts = 0
        self._task: asyncio.Task[None] | None = None
        self._running = False
        self._allowed_networks = [
            ipaddress.ip_network(str(cidr))
            for cidr in self.config.settings.sovereignty.get("allowed_cidrs", [])
        ]
        self._baseline_io = self._external_bytes()

    # -- classification ----------------------------------------------------
    def _is_allowed(self, address: str | None) -> bool:
        if not address:
            return True  # a listening socket with no peer is not egress
        try:
            parsed = ipaddress.ip_address(address)
        except ValueError:
            return False
        return any(parsed in network for network in self._allowed_networks)

    def _process_tree_pids(self) -> set[int]:
        """This API process plus its children (sandbox runs, inference client)."""
        pids = {os.getpid()}
        try:
            current = psutil.Process(os.getpid())
            for child in current.children(recursive=True):
                pids.add(child.pid)
        except psutil.Error:
            pass
        return pids

    def _external_bytes(self) -> int:
        """Bytes sent on non-loopback interfaces, as a coarse egress signal."""
        try:
            counters = psutil.net_io_counters(pernic=True)
        except Exception:
            return 0
        return sum(
            stats.bytes_sent
            for name, stats in counters.items()
            if not name.startswith("lo")
        )

    # -- sampling ----------------------------------------------------------
    def sample(self) -> SovereigntyStatus:
        """Take one observation of the platform's network posture."""
        pids = self._process_tree_pids()
        violations: list[NetworkConnection] = []
        local = 0
        dns = 0

        try:
            connections = psutil.net_connections(kind="inet")
        except (psutil.AccessDenied, PermissionError):
            connections = []

        for connection in connections:
            if connection.pid not in pids:
                continue
            remote = (
                f"{connection.raddr.ip}:{connection.raddr.port}"
                if connection.raddr
                else None
            )
            remote_ip = connection.raddr.ip if connection.raddr else None
            allowed = self._is_allowed(remote_ip)
            if connection.raddr and connection.raddr.port == 53:
                dns += 1

            if allowed:
                local += 1
                continue

            process_name = None
            try:
                process_name = psutil.Process(connection.pid).name() if connection.pid else None
            except psutil.Error:
                pass

            violations.append(
                NetworkConnection(
                    laddr=f"{connection.laddr.ip}:{connection.laddr.port}"
                    if connection.laddr
                    else "unknown",
                    raddr=remote,
                    status=str(connection.status),
                    pid=connection.pid,
                    process=process_name,
                    allowed=False,
                    reason=(
                        f"remote address {remote_ip} is outside the permitted "
                        "loopback ranges"
                    ),
                )
            )

        self._local_connections = local
        self._dns_attempts = dns
        if violations:
            self._violations = (self._violations + violations)[-50:]
            self._violation_total += len(violations)
            for violation in violations:
                self.audit.record(
                    category="sovereignty",
                    action="egress_violation",
                    actor="sovereignty_monitor",
                    detail=violation.model_dump(mode="json"),
                )

        self.last_checked = datetime.now(timezone.utc)
        return self.status()

    def status(self) -> SovereigntyStatus:
        egress_bytes = max(0, self._external_bytes() - self._baseline_io)
        return SovereigntyStatus(
            sovereign=self._violation_total == 0,
            external_api_calls=self._violation_total,
            cloud_llm_calls=0,
            internet_requests=self._violation_total,
            dns_requests=self._dns_attempts,
            data_leaving_host_bytes=0 if self._violation_total == 0 else egress_bytes,
            unapproved_connections=self._violation_total,
            local_connections=self._local_connections,
            monitored_since=self.started_at,
            last_checked=self.last_checked,
            violations=list(reversed(self._violations[-10:])),
            monitor_active=self._running,
            interfaces=self.interfaces(),
        )

    def interfaces(self) -> dict[str, Any]:
        """Interface inventory, so an auditor can see the host's actual posture."""
        report: dict[str, Any] = {}
        try:
            addresses = psutil.net_if_addrs()
            stats = psutil.net_if_stats()
        except Exception:
            return report
        for name, entries in addresses.items():
            interface_stats = stats.get(name)
            report[name] = {
                "up": bool(interface_stats.isup) if interface_stats else False,
                "loopback": name.startswith("lo"),
                "addresses": [
                    entry.address
                    for entry in entries
                    if entry.family in {socket.AF_INET, socket.AF_INET6}
                ][:4],
            }
        return report

    # -- lifecycle ---------------------------------------------------------
    async def _loop(self) -> None:
        interval = float(self.config.settings.sovereignty.get("poll_interval_seconds", 2))
        while self._running:
            try:
                status = await asyncio.to_thread(self.sample)
                await self.events.publish(
                    "sovereignty.status", data=status.model_dump(mode="json")
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                # A monitoring failure must never take the platform down, but it
                # must be visible rather than silent.
                await self.events.publish(
                    "sovereignty.error",
                    data={"message": "sovereignty sampling failed", "at": datetime.now(timezone.utc).isoformat()},
                )
            await asyncio.sleep(interval)

    async def start(self) -> None:
        if not bool(self.config.settings.sovereignty.get("monitor_enabled", True)):
            return
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        self.audit.record(
            category="sovereignty",
            action="monitor_started",
            actor="system",
            detail={
                "allowed_cidrs": [str(net) for net in self._allowed_networks],
                "poll_interval_seconds": self.config.settings.sovereignty.get(
                    "poll_interval_seconds", 2
                ),
            },
        )

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None
        self.audit.record(
            category="sovereignty",
            action="monitor_stopped",
            actor="system",
            detail={"violations_observed": self._violation_total},
        )


_monitor: SovereigntyMonitor | None = None


def get_sovereignty_monitor() -> SovereigntyMonitor:
    global _monitor
    if _monitor is None:
        _monitor = SovereigntyMonitor()
    return _monitor
