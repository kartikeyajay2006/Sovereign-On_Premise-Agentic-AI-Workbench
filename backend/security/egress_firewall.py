"""Reads the host egress firewall back from the kernel.

The sovereignty monitor *observes* connections; it cannot stop one, and it
cannot see programs outside the workbench's process tree. The enforcing layer
underneath it is ``infrastructure/firewall/aegis.nft``: a default-deny nftables
output chain with named counters on every drop. This module reads that table
back - its policy, its counters, and a digest of the rules actually loaded -
so the Assurance screen can show the kernel's own figures.

What it never does is report a number it did not read. On a host without
Linux, without ``nft``, or where ``nft`` refuses the unprivileged API, the
state is ``not_measurable`` with the reason, and every counter is None. A host
where ``nft`` answered and the table is absent is ``not_present``: that is a
reading, and it says the firewall is not there.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any

from backend.core.schemas import EgressFirewallStatus, FirewallCounter

DENY_PREFIX = "egress_denied_"
ALLOW_PREFIX = "egress_allowed_"

# nft's messages when the table is not loaded, across versions.
_ABSENT_MARKERS = ("no such file or directory", "does not exist")


class EgressFirewallReader:
    """One read of the egress table, as an :class:`EgressFirewallStatus`."""

    def __init__(self, settings: dict[str, Any] | None = None, *, platform: str | None = None) -> None:
        settings = settings or {}
        self.enabled = bool(settings.get("enabled", True))
        self.family = str(settings.get("family", "inet"))
        self.table = str(settings.get("table", "aegis_egress"))
        command = settings.get("nft_command", ["nft"])
        self.nft_command = [str(part) for part in (command if isinstance(command, list) else [command])]
        self.timeout = float(settings.get("timeout_seconds", 5))
        self.platform = platform or sys.platform

    @property
    def table_label(self) -> str:
        return f"{self.family} {self.table}"

    def _unmeasurable(self, reason: str) -> EgressFirewallStatus:
        return EgressFirewallStatus(
            state="not_measurable",
            measurable=False,
            present=None,
            reason=reason,
            table=self.table_label,
            read_at=datetime.now(timezone.utc),
        )

    def argv(self) -> list[str]:
        # `list table` rather than `list counters`: the counters, the chain's
        # policy and the rules come from one kernel snapshot, so the figures
        # and the digest describe the same ruleset.
        return [*self.nft_command, "-j", "list", "table", self.family, self.table]

    def read(self) -> EgressFirewallStatus:
        if not self.enabled:
            return self._unmeasurable("reading the host firewall is disabled in configuration")
        if not self.platform.startswith("linux"):
            return self._unmeasurable(
                f"firewall not present / not measurable on this host: nftables is "
                f"Linux-only and this host is {self.platform}"
            )
        if not self.nft_command or shutil.which(self.nft_command[0]) is None:
            return self._unmeasurable(
                f"firewall not measurable on this host: {self.nft_command[0] if self.nft_command else 'nft'} "
                "was not found on PATH"
            )
        try:
            completed = subprocess.run(
                self.argv(), capture_output=True, text=True, timeout=self.timeout, check=False
            )
        except subprocess.TimeoutExpired:
            return self._unmeasurable(f"nft did not answer within {self.timeout:g}s")
        except OSError as exc:
            return self._unmeasurable(f"nft could not be started: {exc}")

        if completed.returncode != 0:
            message = (completed.stderr or completed.stdout).strip()
            first = message.splitlines()[0] if message else f"exit {completed.returncode}"
            if any(marker in message.lower() for marker in _ABSENT_MARKERS):
                return EgressFirewallStatus(
                    state="not_present",
                    measurable=True,
                    present=False,
                    reason=f"table {self.table_label} is not loaded on this host",
                    table=self.table_label,
                    read_at=datetime.now(timezone.utc),
                )
            return self._unmeasurable(
                "firewall not measurable: nft refused to list the table "
                f"({first}). Reading needs CAP_NET_ADMIN; see "
                "infrastructure/firewall/aegis-nft-read.sudoers"
            )
        return parse_table(completed.stdout, family=self.family, table=self.table)


def parse_table(text: str, *, family: str, table: str) -> EgressFirewallStatus:
    """Turn ``nft -j list table <family> <table>`` output into a status."""
    label = f"{family} {table}"
    now = datetime.now(timezone.utc)
    try:
        document = json.loads(text)
        items = document["nftables"]
        if not isinstance(items, list):
            raise TypeError("nftables is not a list")
    except (ValueError, KeyError, TypeError) as exc:
        return EgressFirewallStatus(
            state="not_measurable", measurable=False, present=None,
            reason=f"nft output could not be parsed ({type(exc).__name__})",
            table=label, read_at=now,
        )

    def ours(body: dict[str, Any], table_key: str = "table") -> bool:
        return body.get("family") == family and body.get(table_key) == table

    present = any(ours(item["table"], "name") for item in items if isinstance(item, dict) and "table" in item)
    counters: dict[str, FirewallCounter] = {}
    policy: str | None = None
    hook: str | None = None
    for item in items:
        if not isinstance(item, dict):
            continue
        if "counter" in item and ours(item["counter"]):
            body = item["counter"]
            counters[str(body["name"])] = FirewallCounter(
                packets=int(body.get("packets", 0)), bytes=int(body.get("bytes", 0))
            )
        elif "chain" in item and ours(item["chain"]) and item["chain"].get("hook") == "output":
            policy = item["chain"].get("policy")
            hook = item["chain"].get("hook")

    if not present:
        return EgressFirewallStatus(
            state="not_present", measurable=True, present=False,
            reason=f"table {label} is not loaded on this host", table=label, read_at=now,
        )

    denied = {name: c for name, c in counters.items() if name.startswith(DENY_PREFIX)}
    allowed = {name: c for name, c in counters.items() if name.startswith(ALLOW_PREFIX)}
    enforced = hook == "output" and policy == "drop"
    return EgressFirewallStatus(
        state="enforced" if enforced else "not_default_deny",
        measurable=True,
        present=True,
        reason=None if enforced else (
            f"table {label} is loaded but its output chain policy is {policy or 'absent'}, not drop"
        ),
        table=label,
        output_policy=policy,
        denied_packets=sum(c.packets for c in denied.values()) if denied else None,
        denied_bytes=sum(c.bytes for c in denied.values()) if denied else None,
        allowed_packets=sum(c.packets for c in allowed.values()) if allowed else None,
        counters=counters,
        ruleset_sha256=ruleset_digest(items, family=family, table=table),
        read_at=now,
    )


def ruleset_digest(items: list[Any], *, family: str, table: str) -> str:
    """SHA-256 of the loaded rules, stable while the rules are unchanged.

    Counter values, handles and nft's metainfo are removed first: they change
    on every packet or on every reload, and the digest is meant to identify
    *which rules* are loaded, so it can be compared with the shipped file.
    """

    def strip(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: strip(inner)
                for key, inner in value.items()
                if key not in {"handle", "packets", "bytes"}
            }
        if isinstance(value, list):
            return [strip(inner) for inner in value]
        return value

    kept = [
        strip(item)
        for item in items
        if isinstance(item, dict) and "metainfo" not in item
    ]
    canonical = json.dumps(kept, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
