# Reference runtime environment

**The AEGIS backend runs on two host families, and enforces its sandbox
resource limits on both — by a mechanism it *probes at runtime*, never one it
reads from configuration:**

| Host | Limit backend | Chosen when |
|---|---|---|
| Linux / WSL2 | POSIX `resource` rlimits in a `preexec_fn` | the `resource` module imports |
| Windows 10/11 (x64) | a kernel **Job Object** via `ctypes`/`kernel32` | the Job Object probe enforces a memory cap on this host |

This is written down because the alternative — discovering the enforcement
story during setup on the day — is how demos are lost. It replaces the earlier
note that "Windows is not a supported host"; that stopped being true once the
two POSIX-only module imports were made portable and the Windows Job Object
backend was added and probed.

## What changed, and why it is safe

Two module-level POSIX imports used to stop the backend before any application
code ran:

| File | Import | Windows fix |
|---|---|---|
| `backend/core/audit.py` | `fcntl` | falls back to `msvcrt.locking`; **both branches take a real cross-process lock**, neither is a no-op |
| `backend/tools/sandbox.py` | `resource` | Windows uses a Job Object instead; `resource` stays the POSIX path, unchanged |

`backend/tools/sandbox.py` also used `preexec_fn` and `os.setsid()`, which do
not exist on Windows. On Windows those are not used at all — the child is
confined by a Job Object created and assigned **in the parent**, before the
child is allowed to run a line of user code.

The practical consequence is the opposite of before: the security test suite
now **runs on this Windows machine**. `RESOURCE_LIMITS_AVAILABLE` means "a
resource-limit backend is available", and on Windows the answer is yes, so the
sandbox-containment tests that used to skip on Windows now execute for real.

## What the Windows Job Object enforces (probed on this host)

Every item below was measured on this machine (Windows 11, Python 3.13 x64) by
`Sandbox.self_test_report()` and `tests/test_sandbox_windows.py`, not asserted:

- **Per-process committed-memory cap** (`JOB_OBJECT_LIMIT_PROCESS_MEMORY`). A
  200 MB allocation under a 64 MB cap is *refused at the commit* — the process
  fails with `MemoryError` and its peak stays below the cap, so a memory bomb
  cannot make the host swap.
- **Per-process user CPU-time cap** (`JOB_OBJECT_LIMIT_PROCESS_TIME`). An
  infinite loop is terminated (exit `STATUS_QUOTA_EXCEEDED`, `0xC0000044`). The
  OS checks the job CPU limit *periodically*, so termination follows the limit
  by a few seconds rather than at the exact instant — the wall-clock timeout is
  the backstop. Reported honestly as such.
- **Active-process cap** (`JOB_OBJECT_LIMIT_ACTIVE_PROCESS`). A spawn bomb is
  contained after 1–2 children. (The parent is itself inside a job on this
  host, so the child is a *nested* job; a cap of 1 is rejected with
  `ERROR_NOT_ENOUGH_QUOTA` in that configuration, so the floor is 2 — enough
  for the one interpreter, far below a bomb.)
- **Kill-on-job-close** (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) and
  **die-on-unhandled-exception** (`JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION`).
  If the parent dies or the run ends, no sandbox child outlives it, and a
  crashing child raises no Windows error dialog that would hang the run.
- **Accounting is read back from the kernel**: peak process memory
  (`PeakProcessMemoryUsed`), total user/kernel CPU time, and terminated-process
  count come from `QueryInformationJobObject`, and are what the execution report
  and the console display.

**The spawn-before-assign race is closed.** A child that ran before it was
placed in the job would run uncontained. So the runner blocks on a one-byte
stdin sentinel, and the parent writes that byte only after
`AssignProcessToJobObject` succeeds. If assignment fails, the child is
terminated while still blocked — it is never released to run outside its job.

The 64-bit struct layouts are transcribed from the Windows SDK and their sizes
are asserted (`JOBOBJECT_EXTENDED_LIMIT_INFORMATION` is 144 bytes on x64). This
matters: a wrong field type shifts every following field and the kernel reads a
cap from the wrong offset, applying **no limit while returning success**. The
runtime probe — a real over-cap allocation that must be refused — is the final
guard against exactly that.

## What POSIX rlimits enforce (unchanged)

On Linux/WSL2 the child gets, in a `preexec_fn` applied between `fork` and
`exec`: `RLIMIT_CPU`, `RLIMIT_AS` (address space), `RLIMIT_FSIZE` (written file
size), `RLIMIT_NPROC` (per-user, expressed as headroom above the user's current
process count), `RLIMIT_CORE` = 0, and `os.setsid()`. Because the limits are set
in the child before user code runs, there is no assignment race and no sentinel.

## What is NOT enforced — say it plainly

The sandbox is a *policy* boundary (no network, no host-filesystem writes,
bounded CPU/memory/processes) enforced by process-level and interpreter-level
controls. It is **not** an OS-level jail. A security reviewer should know:

- **No seccomp / syscall filtering on either platform.** Nothing restricts the
  set of system calls the child may make. That needs a container runtime
  (rootless Podman under WSL2) or gVisor, which are deferred.

- **Network denial is interpreter-level, not a namespace or firewall.** A
  `sitecustomize` shim installed into the sandbox replaces `socket.socket`
  *and* the `_socket` C primitive it is built on (so the runtime layer is
  independent of the import allow-list, not merely a consequence of it), plus
  the resolver and connection helpers; every attempt is counted. This binds
  code running in the interpreter. It does **not** bind a native extension
  making raw syscalls — but the static validator's import allow-list is what
  keeps `ctypes`, `socket`, `_socket`, `subprocess` and friends off the table
  in the first place, so reaching a raw syscall requires first defeating the
  validator. There is no network namespace and no OS packet filter here; on
  Windows there is no `RLIMIT_FSIZE` equivalent either (written-file size is
  bounded on POSIX only, and by the workspace write-guard everywhere).

- **Filesystem confinement is working-directory + validator + interpreter
  write-guard, not a chroot or mount namespace.** The sandboxed process runs as
  the *same OS user* with no chroot and no mount restriction. Two things narrow
  the blast radius:
  1. Each run gets a fresh throwaway workspace directory, and the environment
     (`HOME`, `TMPDIR`/`TEMP`, `MPLCONFIGDIR`) points library caches into it.
  2. The `sitecustomize` shim refuses **writes** outside that workspace —
     `open(...)` in a write mode, `os.open` with write flags, and
     `os.rename/replace/remove/unlink/rmdir/mkdir/makedirs`. This specifically
     closes the path by which model-generated code could open
     `../../logs/audit.jsonl` and rewrite the very record meant to prove it ran.

  **Reads are not confined.** Code that defeats the validator's allow-list could
  still read host files the running user can read. And, like the network shim,
  the write-guard is interpreter-level: a native syscall bypass is outside its
  reach. The OS-level fix for both is the container runtime below.

- **The audit log's integrity guarantee is cryptographic, not access control.**
  The hash chain makes tampering *detectable*; the write-guard makes the file
  hard to reach from inside the sandbox. Neither makes the file physically
  unwritable by the host user.

## Strongest posture: WSL2 + rootless Podman (recommended, not required)

Running the backend under WSL2/Ubuntu with rootless Podman adds the OS-level
controls the process/interpreter approach cannot provide: a real mount and
network namespace (filesystem and egress confinement that binds native code
too), seccomp syscall filtering, and nftables egress rules. This is the
recommended production posture. It is **no longer required to run** — the
backend runs and contains code on Windows today — but it is where the gaps above
are closed at the kernel rather than in the interpreter.

Setup, from an **Administrator** PowerShell (this reboots the machine):

```powershell
wsl --install -d Ubuntu-22.04
```

Then, inside Ubuntu:

```bash
sudo apt update
sudo apt install -y python3.12 python3.12-venv python3-pip podman
podman info --format '{{.Host.Security.Rootless}}'   # must print: true
podman run --rm --network none alpine echo ok        # must print: ok

cd /mnt/c/Users/<you>/dev/aegis      # or clone fresh inside the WSL filesystem
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -q
```

## Current state of this machine

Checked on 2026-09-23:

- OS: Windows 11 Pro (build 26200), Python 3.13 x64 in `.venv`.
- Sandbox backend: **`subprocess (Windows Job Object)`** — the Job Object probe
  passes (`Sandbox.execution_allowed == (True, "")`), and `self_test_report()`
  reports `assessable: true` with all containment checks holding.
- `tests/test_security.py`, `tests/test_sandbox_windows.py`,
  `tests/test_sandbox_api.py` all pass here; the previously Windows-skipped
  `TestSandboxContainment` now runs.
- WSL / Podman / Docker: not installed. Not required for the backend to run; see
  the section above for the stronger posture they add.

## The rule this exists to enforce

`config/app.yaml` advertises a `docker` sandbox runtime that no code reads —
`Sandbox.runtime` reports the backend that was actually *probed to work*, and
setting `runtime: docker` yields `subprocess (config requests 'docker', not
implemented)`, never a false "docker".

**Enforcement level must be probed, never read from configuration, and the
interface must never state an isolation level the host did not demonstrate.**
When no backend can enforce, the honest behaviours are to refuse to execute, or
to execute and say plainly that it is unconfined. `Sandbox.execution_allowed`
refuses with a measured reason when the probe fails, `self_test_report()`
returns `assessable: false` where nothing was submitted, and the execution
report shows measured accounting (peak memory, CPU time, termination reason) —
never a configured limit dressed up as an applied one. Quietly downgrading while
the UI still claims containment is the single worst defect this product could
ship.
