# 3.8 · Sandbox

<div align="center">
<img src="../../assets/readme/screenshot-sandbox.webp#gh-light-mode-only" alt="The Sandbox screen with a memory bomb contained at the 1024 MB cap" width="860">
<img src="../../assets/readme/screenshot-sandbox-dark.webp#gh-dark-mode-only" alt="The Sandbox screen with a memory bomb contained at the 1024 MB cap" width="860">
</div>

*Run Python under this host's limits and see exactly what it did, through the same gateway, checks and audit trail as an agent's own code.*

## The limits bar

Across the top, what this host actually enforces, read back from the service rather than from the config file:

| Readout | Example | Meaning |
|---|---|---|
| **Limits enforced by** | `POSIX rlimits` | The mechanism probed to work here: POSIX rlimits (Linux), rlimits plus a memory watchdog (macOS), or a Windows Job Object |
| **Memory** | `≤ 1024 MB` | `sandbox.max_memory_mb` |
| **CPU** | `≤ 30 s` | `sandbox.max_cpu_seconds` |
| **Execution** | `enabled` | Whether code may run at all. If the host cannot prove its limits hold, this says *refused* and explains why |

## Payloads

The left column lists ready-made payloads.

**Work** (green): code that should succeed.
- *Arithmetic*: runs to completion, exit 0.
- *Corrosion-rate calculation*: a real remaining-life calculation from thickness readings.

**Attacks it must stop** (red): each with the outcome it should have.

| Payload | Expected |
|---|---|
| Socket connect | Rejected before execution: `socket` is a denied import |
| os.system escape | Rejected before execution: process escape |
| subprocess escape | Rejected before execution: `subprocess` is denied |
| getattr indirection | Rejected before execution: building a name to reach `os.system` uses `getattr`, a denied call |
| Process spawn bomb | Rejected before execution |
| Memory bomb | Runs, then the memory cap refuses the allocation; peak stays below the cap |
| Infinite loop | Runs until the CPU-time cap or the wall timeout kills it |
| Write outside the workspace | Runs, then the write guard refuses the path |

Click one to load it into the editor. The line under the editor states what should happen (*Expected: Runs, then the memory cap refuses the commit; peak stays below the cap*), so you can compare it with what did.

## The editor

`payload.py` is editable: write your own code. Next to the file name, a tag shows whether the loaded payload is `work` or an `attack`.

**Data class** sets the classification the run is checked under. The gateway decides whether your role may invoke `python_exec` on data of that class, exactly as it would for an agent.

**Run**, or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>.

## The result

```text
$ python payload.py  # 5 lines
● Contained · exited non-zero · 34 ms                               12:12:09 AM
  Traceback (most recent call last):
    File ".../storage/workspaces/run-e92a69e0fcf6/program.py", line 4, in <module>
      block = bytearray(1400 * 1024 * 1024)  # 1.4 GB, past the cap
  MemoryError
network attempts blocked  0
Limits applied: posix_rlimit · memory ≤ 1024 MB · CPU ≤ 30 s · wall ≤ 45 s · normal ·
policy allow: role 'engineer' may invoke 'python_exec' on 'normal' data
```

| Part | Meaning |
|---|---|
| Verdict | *Completed* (exit 0), *Contained* (a limit or guard stopped it) or *Refused before it ran* (static validation rejected it), then the exit and time |
| Output | stdout and stderr, as the process wrote them |
| **network attempts blocked** | How many socket operations the runtime shim refused |
| **Limits applied** | The mechanism, every limit, the data class, and the policy decision that allowed the run |

Where the OS reports them, the result also shows **peak memory**, **CPU user and kernel time**, and the **termination reason**.

Every execution is audited as `security / sandbox_execute`, alongside the `policy / tool.invoke` decision that allowed it.

## What the sandbox is, and is not

It is a subprocess of the API under three layers: static validation of the source, OS resource limits, and a runtime shim that makes network calls and writes outside the workspace raise. It is **not** a container or virtual machine.

> [!WARNING]
> Code in the sandbox runs as the same operating-system user as the API. Writes outside the workspace are refused, but **reads are not confined**: sandboxed code can read files the API user can read, including the workbench's own database. Do not treat the sandbox as a boundary against a hostile user until code runs in a container. [9.3 The sandbox](../09-security/03-sandbox.md) sets out exactly what each layer stops.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 3.7 · Assurance](07-assurance.md) | [↑ 03 · Using the workbench](README.md) | [3.9 · Audit →](09-audit.md) |

<!-- nav:end -->
