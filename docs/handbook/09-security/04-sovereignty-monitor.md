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

For a deployment that must be provably air-gapped, put an operating-system control underneath: a host firewall (for example nftables) that permits only loopback for the workbench's user, or a machine with no route out. The monitor is then a second, independent witness.

## Settings declared but not used

`sovereignty.known_local_ports` and `sovereignty.violation_action` are in `config/app.yaml` but not read. Every violation is recorded and alerted in the same way.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 9.3 · The sandbox](03-sandbox.md) | [↑ 09 · Security and governance](README.md) | [9.5 · The audit log →](05-audit-log.md) |

<!-- nav:end -->
