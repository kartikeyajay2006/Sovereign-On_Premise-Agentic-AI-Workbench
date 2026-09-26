"""The host egress firewall reader: kernel figures, or the reason there are none.

The nft sample below follows libnftables-json(5) for `nft -j list table inet
aegis_egress` with infrastructure/firewall/aegis.nft loaded. It was written to
that schema, not captured: no host in this project's development environment
has nftables. A Linux run of the reader against the real table is the check
that remains.
"""

from __future__ import annotations

import json
import subprocess

import pytest

from backend.security import egress_firewall as fw
from backend.security import sovereignty as sovereignty_module
from backend.security.egress_firewall import EgressFirewallReader, parse_table
from backend.security.sovereignty import SovereigntyMonitor


def _sample(*, policy: str = "drop", v4: int = 17, dns: int = 3, model: int = 42) -> dict:
    counters = [
        ("egress_denied_dns", dns, dns * 60),
        ("egress_denied_v4", v4, v4 * 60),
        ("egress_denied_v6", 0, 0),
        ("egress_denied_other", 0, 0),
        ("egress_allowed_model", model, model * 80),
    ]
    items: list[dict] = [
        {"metainfo": {"version": "1.0.6", "release_name": "Lester Gooch #5", "json_schema_version": 1}},
        {"table": {"family": "inet", "name": "aegis_egress", "handle": 7}},
    ]
    for handle, (name, packets, size) in enumerate(counters, start=1):
        items.append({"counter": {"family": "inet", "name": name, "table": "aegis_egress",
                                  "handle": handle, "packets": packets, "bytes": size}})
    items.append({"chain": {"family": "inet", "table": "aegis_egress", "name": "output", "handle": 6,
                            "type": "filter", "hook": "output", "prio": 0, "policy": policy}})
    items.append({"rule": {"family": "inet", "table": "aegis_egress", "chain": "output", "handle": 8,
                           "expr": [{"match": {"op": "==", "left": {"meta": {"key": "oif"}}, "right": "lo"}},
                                    {"accept": None}]}})
    items.append({"rule": {"family": "inet", "table": "aegis_egress", "chain": "output", "handle": 13,
                           "expr": [{"match": {"op": "==", "left": {"meta": {"key": "nfproto"}}, "right": "ipv4"}},
                                    {"counter": "egress_denied_v4"}, {"drop": None}]}})
    # Another table on the host: its counters must not be counted as ours.
    items.append({"counter": {"family": "ip", "name": "egress_denied_v4", "table": "other",
                              "handle": 1, "packets": 999, "bytes": 999}})
    return {"nftables": items}


class TestParsing:
    def test_counters_policy_and_digest_are_read(self) -> None:
        status = parse_table(json.dumps(_sample()), family="inet", table="aegis_egress")
        assert status.state == "enforced"
        assert status.measurable and status.present
        assert status.output_policy == "drop"
        assert status.denied_packets == 20  # 17 IPv4 + 3 DNS; the other table ignored
        assert status.denied_bytes == 1200
        assert status.allowed_packets == 42
        assert status.counters["egress_denied_v4"].packets == 17
        assert len(status.ruleset_sha256 or "") == 64

    def test_the_digest_ignores_counter_values_and_handles(self) -> None:
        a = parse_table(json.dumps(_sample(v4=1)), family="inet", table="aegis_egress")
        b = parse_table(json.dumps(_sample(v4=5000)), family="inet", table="aegis_egress")
        assert a.ruleset_sha256 == b.ruleset_sha256

    def test_the_digest_changes_when_the_rules_do(self) -> None:
        a = parse_table(json.dumps(_sample()), family="inet", table="aegis_egress")
        b = parse_table(json.dumps(_sample(policy="accept")), family="inet", table="aegis_egress")
        assert a.ruleset_sha256 != b.ruleset_sha256

    def test_an_accept_policy_is_not_called_default_deny(self) -> None:
        status = parse_table(json.dumps(_sample(policy="accept")), family="inet", table="aegis_egress")
        assert status.state == "not_default_deny"
        assert "accept" in (status.reason or "")

    def test_a_listing_without_our_table_is_not_present(self) -> None:
        doc = {"nftables": [{"metainfo": {"json_schema_version": 1}}]}
        status = parse_table(json.dumps(doc), family="inet", table="aegis_egress")
        assert status.state == "not_present" and status.present is False
        assert status.denied_packets is None

    def test_unparseable_output_is_not_a_reading(self) -> None:
        status = parse_table("not json", family="inet", table="aegis_egress")
        assert status.state == "not_measurable"
        assert status.denied_packets is None


class TestNotAvailable:
    def test_a_non_linux_host_reports_not_measurable_never_zero(self) -> None:
        status = EgressFirewallReader({}, platform="win32").read()
        assert status.state == "not_measurable"
        assert status.measurable is False and status.present is None
        assert "not present / not measurable on this host" in (status.reason or "")
        assert status.denied_packets is None and status.allowed_packets is None
        assert status.counters == {}

    def test_linux_without_nft_is_not_measurable(self, monkeypatch) -> None:
        monkeypatch.setattr(fw.shutil, "which", lambda name: None)
        status = EgressFirewallReader({}, platform="linux").read()
        assert status.state == "not_measurable"
        assert "not found on PATH" in (status.reason or "")

    def test_a_refusal_is_not_measurable_with_the_reason(self, monkeypatch) -> None:
        monkeypatch.setattr(fw.shutil, "which", lambda name: "/usr/sbin/nft")
        monkeypatch.setattr(fw.subprocess, "run", lambda argv, **k: subprocess.CompletedProcess(
            argv, 1, "", "Error: Could not process rule: Operation not permitted\n"))
        status = EgressFirewallReader({}, platform="linux").read()
        assert status.state == "not_measurable"
        assert "Operation not permitted" in (status.reason or "")
        assert status.denied_packets is None

    def test_an_absent_table_is_a_reading_that_it_is_absent(self, monkeypatch) -> None:
        monkeypatch.setattr(fw.shutil, "which", lambda name: "/usr/sbin/nft")
        monkeypatch.setattr(fw.subprocess, "run", lambda argv, **k: subprocess.CompletedProcess(
            argv, 1, "", "Error: No such file or directory\nlist table inet aegis_egress\n"))
        status = EgressFirewallReader({}, platform="linux").read()
        assert status.state == "not_present" and status.measurable and status.present is False

    def test_the_command_lists_our_table_as_json(self, monkeypatch) -> None:
        seen = {}

        def fake(argv, **kwargs):
            seen["argv"] = argv
            return subprocess.CompletedProcess(argv, 0, json.dumps(_sample()), "")

        monkeypatch.setattr(fw.shutil, "which", lambda name: "/usr/bin/sudo")
        monkeypatch.setattr(fw.subprocess, "run", fake)
        status = EgressFirewallReader({"nft_command": ["sudo", "-n", "/usr/sbin/nft"]}, platform="linux").read()
        assert seen["argv"] == ["sudo", "-n", "/usr/sbin/nft", "-j", "list", "table", "inet", "aegis_egress"]
        assert status.state == "enforced"

    def test_disabled_in_config_is_not_measurable(self) -> None:
        assert EgressFirewallReader({"enabled": False}, platform="linux").read().state == "not_measurable"


class _Reader:
    def __init__(self, statuses):
        self.statuses = list(statuses)

    def read(self):
        return self.statuses.pop(0)

    def _unmeasurable(self, reason):
        return EgressFirewallReader({}, platform="win32")._unmeasurable(reason)


class TestTheMonitorCarriesIt:
    @pytest.fixture
    def monitor(self, monkeypatch) -> SovereigntyMonitor:
        m = SovereigntyMonitor()
        m._running = True
        monkeypatch.setattr(sovereignty_module.psutil, "net_connections", lambda kind: [])
        return m

    def test_this_host_reports_the_firewall_state_in_the_status(self, monitor) -> None:
        status = monitor.sample()
        assert status.firewall is not None
        # Whatever this host is, a figure appears only with a reading behind it.
        if status.firewall.state == "not_measurable":
            assert status.firewall.denied_packets is None

    def test_new_kernel_drops_are_audited(self, monitor, monkeypatch) -> None:
        first = parse_table(json.dumps(_sample(v4=17)), family="inet", table="aegis_egress")
        second = parse_table(json.dumps(_sample(v4=20)), family="inet", table="aegis_egress")
        monitor._firewall_reader = _Reader([first, second])
        recorded = []
        monkeypatch.setattr(monitor.audit, "record", lambda **kw: recorded.append(kw))

        monitor._refresh_firewall(force=True)
        monitor._refresh_firewall(force=True)

        blocked = [r for r in recorded if r["action"] == "egress_blocked_by_firewall"]
        assert len(blocked) == 1 and blocked[0]["detail"]["packets"] == 3
        assert monitor.status().firewall.denied_packets == 23

    def test_the_interval_is_respected(self, monitor) -> None:
        first = parse_table(json.dumps(_sample()), family="inet", table="aegis_egress")
        monitor._firewall_reader = _Reader([first])
        monitor._refresh_firewall(force=True)
        # A second read inside the interval would pop an empty list and fail.
        assert monitor._refresh_firewall() is first

    def test_a_failed_read_replaces_the_old_figures(self, monitor) -> None:
        good = parse_table(json.dumps(_sample()), family="inet", table="aegis_egress")
        bad = EgressFirewallReader({}, platform="win32").read()
        monitor._firewall_reader = _Reader([good, bad])
        monitor._refresh_firewall(force=True)
        monitor._refresh_firewall(force=True)
        assert monitor.status().firewall.state == "not_measurable"
        assert monitor.status().firewall.denied_packets is None
