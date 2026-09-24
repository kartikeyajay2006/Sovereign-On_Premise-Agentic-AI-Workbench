# 3.7 · Assurance

<div align="center">
<img src="../../assets/readme/screenshot-security.webp#gh-light-mode-only" alt="Assurance: egress measured at zero, containment 7 of 7, ten actions no role can take" width="860">
<img src="../../assets/readme/screenshot-security-dark.webp#gh-dark-mode-only" alt="Assurance: egress measured at zero, containment 7 of 7, ten actions no role can take" width="860">
</div>

*What this host can show about its own conduct: what it measured, what it tested, and what it is configured to allow.* The Assurance place has three screens: **Posture** (<kbd>G</kbd> <kbd>P</kbd>), **Sandbox** (<kbd>G</kbd> <kbd>S</kbd>) and **Audit** (<kbd>G</kbd> <kbd>L</kbd>). This page is Posture.

## Three cards, three kinds of claim

Every figure on this screen is labelled with **how the host knows it**. The labels are deliberate: a measurement, a test and a configuration are different kinds of evidence, and treating them as one is how systems overclaim.

| Card | Label | What it means |
|---|---|---|
| **Egress** · `0` | **Measured** | Connections from the workbench that left this machine, counted by sampling since the monitor started |
| **Containment** · `—` or `7/7` | **Tested** | What the sandbox did when real attacks were submitted *just now*. Shows a dash and *No claim is shown until a run makes one* until you run the self-test |
| **Policy** · `10` | **Configured** | Actions no role can take, with no override; plus how many tools are allowed by role, how many rules hold a run for a person, and that no egress destination is allowed |

## Egress, measured

| Readout | Meaning |
|---|---|
| **Monitor** | `sampling` when working. If the host refuses to show its connection table, this says so, and no figure is claimed |
| **Since** | When the monitor started |
| **Last sample** | How long ago the last observation was taken |
| **Apart** | The measured interval between samples (about 2 s) |
| **Loopback now** | How many of the workbench's connections are local at this moment |
| **Stream** | `live` when the page is receiving `sovereignty.status` events |

**What this reading cannot see**, expandable on the screen, is stated honestly: it covers the workbench's own processes, the API and everything it starts, and not other programs on the host. Beneath it, the screen reports how many network interfaces have a non-loopback address, with the note that *this host is attached to a network. The figure above is about the workbench's own connections; it is not a statement that the machine is physically isolated.*

## Containment, tested

Click **Run the self-test**. Seven real payloads are submitted to the sandbox, and the screen reports what the sandbox did with each:

| Check | Payload | Held when |
|---|---|---|
| Static import review | `import socket; socket.socket()` | Refused before running: denied module `socket` |
| Runtime socket denial | `socket.socket()` and `_socket.socket()` with the static check bypassed | Raised `SovereignNetworkBlocked` at run time |
| Process escape review | `os.system('id')` | Refused before running: process escape |
| Filesystem write confinement | `open('../../escape_probe.txt', 'w')` with the static check bypassed | Raised `SovereignFilesystemBlocked` |
| Permitted work still runs | `print(sum(range(1000)))` | Exited 0. A sandbox that refuses everything proves nothing |
| CPU-time limit | An infinite loop | Killed by the CPU limit or the wall timeout |
| Memory limit | Growing past the address-space limit | `MemoryError` |

The card becomes **7/7** with the time it ran, and the button becomes **Run it again**. The result is not cached across sessions: a containment claim is only as fresh as the test behind it.

The self-test is audited as `security / sandbox_self_test`.

## Policy, configured

The ten hard-denied actions, the tools each role may invoke, and the approval rules, read from the policy files. This section says what the policy files *say should happen*. The audit chain records what actually did.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 3.6 · Knowledge](06-knowledge.md) | [↑ 03 · Using the workbench](README.md) | [3.8 · Sandbox →](08-sandbox.md) |

<!-- nav:end -->
