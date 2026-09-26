# 9.4 · The sovereignty monitor

A sovereignty claim without observable proof is worth nothing. `backend/security/sovereignty.py` produces the proof: it measures, continuously, whether anything the workbench runs is talking to anything off the host.

## How it samples

Every `sovereignty.poll_interval_seconds` (2 s), in the background:

1. Collect the process IDs of **the API process and all its descendants**, which includes every sandbox child.
2. Read the OS connection table (`psutil.net_connections(kind="inet")`).
3. Keep only connections owned by those processes.
4. For each, look at the **remote** address:
   - none (a listening socket) → not egress;
   - inside `sovereignty.allowed_cidrs` (`127.0.0.0/8`, `::1/128`) → **local**;
   - anything else → a **violation**, with the local and remote address, status, PID, process name, and the reason *remote address … is outside the permitted loopback ranges*.
5. Count remote port 53 as a DNS attempt.

## What it does with a violation

- Adds it to the running total and to the recent list.
- Writes it to the audit log.
- Publishes `sovereignty.status` over the event stream, which turns the sidebar pill and the Egress card from `0`.

With no violations, it still publishes a status on each sample, so a page can show **when** it last looked.

## When it cannot look

If the operating system refuses the connection table (`AccessDenied`), the monitor **does not report zero**. It marks itself as not monitoring, keeps the time of the last real reading, publishes `sovereignty.error`, and the Assurance screen says why. A host that could not be observed is not described as clean.

## Reading the status

`GET /api/sovereignty` returns:

| Field | Meaning |
|---|---|
| `sovereign` | True when no violation has been observed |
| `external_calls` / violation total | Connections observed leaving loopback since start |
| `local_connections` | Local connections at the last sample |
| `dns_requests` | Port-53 connections at the last sample |
| `violations` | The recent violations, in detail |
| `monitor_active`, `monitored_since`, `last_checked` | Whether and since when it has been looking |

The unauthenticated `GET /` reports the headline: `{"sovereign": true, "external_calls": 0, "monitor_active": true, …}`.

## The limits of the measurement

| Covered | Not covered |
|---|---|
| The API process and everything it spawns: sandbox runs, model calls it makes, retrieval, document rendering | The **Ollama** runtime, a separate program |
| | The **Next.js** server, a separate program |
| | Other software on the host |
| | Connections that open and close between two samples (2 s apart) |

The screen states this beside the figure, and adds how many network interfaces have a non-loopback address. *"The figure above is about the workbench's own connections; it is not a statement that the machine is physically isolated."*

For a deployment that must be provably air-gapped, put an operating-system control underneath: the nftables table below, or a machine with no route out. The monitor is then a second, independent witness.

## The host firewall underneath

`infrastructure/firewall/aegis.nft` is a default-deny egress table for Linux. Its `output` chain has `policy drop` and accepts only:

- loopback (the API, the console, a local Ollama);
- replies on connections accepted inbound (a browser on the plant LAN), since a connection this host tries to open is never established;
- IPv6 neighbour discovery, link-local only;
- new TCP connections to the model server, when it is on another host (`AEGIS_MODEL_SERVER`, `AEGIS_MODEL_PORT`).

Everything else is counted in a named counter and dropped: `egress_denied_dns`, `egress_denied_v4`, `egress_denied_v6`, `egress_denied_other`. `egress_allowed_model` counts the one permitted destination. The table is host-wide, so it also covers Ollama, Next.js and every other program the monitor cannot see. It also drops DHCP, NTP and updates; use a static address.

```bash
sudo infrastructure/firewall/apply.sh      # syntax-checks, loads, prints policy, hash, counters
sudo infrastructure/firewall/remove.sh     # prints the final counters, deletes the table
```

Applying again restarts the counters from zero. Neither script makes the table persistent across reboot.

### What the monitor reads

Every `sovereignty.firewall.poll_interval_seconds` (10 s), `backend/security/egress_firewall.py` runs `nft -j list table inet aegis_egress` and puts the result in `GET /api/sovereignty` as `firewall`:

| `firewall.state` | Meaning | Figures |
|---|---|---|
| `enforced` | The table is loaded and its output chain's policy is `drop` | `denied_packets`, `denied_bytes`, `allowed_packets`, each counter, `ruleset_sha256` |
| `not_default_deny` | Loaded, but the policy is not `drop` | As above, with the reason |
| `not_present` | `nft` answered and the table is not loaded | None |
| `not_measurable` | Not Linux, no `nft`, or `nft` refused (reading needs CAP_NET_ADMIN) | None, with the reason |

A host that could not be read reports no counters, **never zero**. `ruleset_sha256` is a digest of the loaded rules with counter values and handles removed, so it stays the same while the rules do. New drops since the last reading are written to the audit log as `egress_blocked_by_firewall`; state changes as `egress_firewall_state`; a reload as `egress_firewall_counters_reset`. Blocked packets do not change `sovereign`: a dropped packet did not leave.

The API normally runs unprivileged, and `nft` refuses to list a table without CAP_NET_ADMIN. `infrastructure/firewall/aegis-nft-read.sudoers` allows the service account exactly one command, `nft -j list table inet aegis_egress`; set `sovereignty.firewall.nft_command` to `[sudo, -n, /usr/sbin/nft]`.

### What is enforced, and where

| Host | Enforced | Reported |
|---|---|---|
| Linux, table applied | Kernel default-deny for every process on the host | `enforced`, with counters |
| Linux, table not applied | Nothing below the monitor | `not_present` |
| Linux, API cannot read `nft` | Whatever is loaded; the API cannot tell | `not_measurable`, with nft's refusal |
| Windows or macOS (including the development host) | Nothing: nftables does not exist there | `not_measurable`: *firewall not present / not measurable on this host* |

Not verified on a live host: no machine in this project's development environment has nftables. The parser is tested against a sample written to the `libnftables-json` schema, and the unavailable paths are tested directly (`tests/test_egress_firewall.py`). Run `apply.sh` on the target and compare `GET /api/sovereignty` with `nft list counters` before relying on the figures.

## Settings declared but not used

`sovereignty.known_local_ports` and `sovereignty.violation_action` are in `config/app.yaml` but not read. Every violation is recorded and alerted in the same way.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 9.3 · The sandbox](03-sandbox.md) | [↑ 09 · Security and governance](README.md) | [9.5 · The audit log →](05-audit-log.md) |

<!-- nav:end -->
