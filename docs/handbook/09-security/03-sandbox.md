# 9.3 · The sandbox

Code runs. Network doesn't.

`backend/tools/sandbox.py` executes generated Python, and code you type on the Sandbox screen, under three independent layers. Each is meant to hold even if another is bypassed.

```mermaid
flowchart LR
    SRC[Source] --> L1{"Layer 1<br/>Static validation<br/>(AST)"}
    L1 -- violation --> RF([Refused before it ran])
    L1 -- ok --> L2["Layer 2<br/>Child process<br/>scrubbed env · own workspace<br/>OS resource limits"]
    L2 --> L3["Layer 3<br/>sitecustomize shim<br/>sockets raise · writes outside<br/>workspace raise"]
    L3 --> OUT([stdout · stderr · exit<br/>peak memory · CPU<br/>network attempts blocked])
    style L1 fill:#ff6a1a,color:#fff,stroke:#ff6a1a
    style L2 fill:#ff2d6f,color:#fff,stroke:#ff2d6f
    style L3 fill:#7c4dff,color:#fff,stroke:#7c4dff
```

## Layer 1 · Static validation

The source is parsed into an AST and rejected, before anything runs, if it:

| Does | Configured by | Examples refused |
|---|---|---|
| Imports a **denied** module | `sandbox.denied_imports` | `socket`, `requests`, `urllib`, `urllib3`, `httpx`, `aiohttp`, `ftplib`, `smtplib`, `telnetlib`, `subprocess`, `multiprocessing`, `ctypes`, `importlib`, `pickle`, `shutil`, `pty`, `webbrowser`, `xmlrpc`, `http` |
| Imports anything **not allowed** | `sandbox.allowed_imports` | Allowed: `math`, `statistics`, `json`, `csv`, `re`, `datetime`, `decimal`, `fractions`, `itertools`, `functools`, `collections`, `dataclasses`, `typing`, `random`, `string`, `textwrap`, `pathlib`, `os`, `sys`, `time`, `uuid`, `hashlib`, `base64`, `numpy`, `pandas`, `openpyxl`, `matplotlib` |
| Calls a **denied** builtin | `sandbox.denied_calls` | `eval`, `exec`, `compile`, `__import__`, `breakpoint`, `open_host`, `getattr`, `setattr`, `delattr`, `vars`, `globals`, `locals` |
| Reaches **interpreter internals** | `sandbox.denied_attributes` | `__subclasses__`, `__globals__`, `__builtins__`, `__bases__`, `__mro__` |
| Makes a **process escape** | built in | `os.system`, `os.popen`, `os.spawn*`, `os.fork`, `os.kill`, `os.exec*` |

Why `getattr` is denied: without it, `getattr(os, "sys" + "tem")("…")` is a call on the name `getattr`, not an attribute of `os`, and it slipped past the process-escape rule, which only fires on a literal `os.<attr>`. A name built from strings also defeats the attribute deny-list.

## Layer 2 · The child process

| Property | Value |
|---|---|
| Working directory | A fresh `storage/workspaces/run-<id>/` per execution |
| Environment | **Scrubbed**: only `PATH`-like essentials, `PYTHONPATH` = workspace, `PYTHONNOUSERSITE=1`, `HOME`, `TMPDIR`, `TEMP`, `TMP` and `MPLCONFIGDIR` = workspace, BLAS thread counts = 1. No host credentials, proxies or tokens |
| Wall timeout | `sandbox.timeout_seconds` (45 s); the process group is killed |
| Output | Capped at `sandbox.max_output_bytes` (256 KB) |

### Resource limits, by operating system

The mechanism is chosen by **what the host can do**, probed at run time, never by configuration.

| | Linux | macOS | Windows |
|---|---|---|---|
| Mechanism | `setrlimit` in `preexec_fn`, after fork and before exec | `setrlimit` + a resident-memory **watchdog** in the parent | A kernel **Job Object** via `kernel32` |
| CPU | `RLIMIT_CPU` = 30 s | `RLIMIT_CPU` | Per-process user time |
| Memory | `RLIMIT_AS` = 1024 MB | Watchdog kills above 1024 MB resident (`RLIMIT_AS` cannot be set usefully on macOS) | Per-process committed memory |
| File size | `RLIMIT_FSIZE` = 25 MB | Same | Not a job limit; output is capped at 256 KB |
| Processes | `RLIMIT_NPROC` = current + 64 | Same | Active process limit |
| Core dumps | `RLIMIT_CORE` = 0 | Same | n/a |
| On close | Process group killed | Same | Kill-on-job-close |

Two details matter:

- **`RLIMIT_NPROC` is per user**, not per process. An absolute cap would break every fork on a busy workstation, so the cap is the user's current process count plus `sandbox.process_headroom` (64). Runaway forking is still contained.
- **On Windows, the job is assigned before the child runs a line of user code.** The child blocks on a one-byte stdin sentinel, which the parent writes only after `AssignProcessToJobObject` succeeds. If assignment fails, the child is killed rather than released. And before any code may run at all, the host is **probed**: a real child is placed in a job and a real over-cap allocation is confirmed to be refused. A wrong structure layout would otherwise silently apply no limit. If the probe fails, execution is **refused** with the measured reason.

If no limit mechanism works on a host, `execution_allowed` is false and code is refused. Code never runs unbounded while the interface describes a sandbox.

## Layer 3 · The runtime shim

A `sitecustomize.py` is written into each workspace, so the interpreter loads it before user code:

- `socket.socket`, **and** the C primitive `_socket.socket` it is built on, plus `socketpair`, are replaced with functions that raise `SovereignNetworkBlocked`, and each attempt is logged. Patching only `socket.socket` would leave `import _socket; _socket.socket().connect(…)` live.
- `builtins.open` and `os.open` are replaced with guards that raise `SovereignFilesystemBlocked` for any **write** (modes `w`, `a`, `x`, `+`, or write flags) outside the workspace, and for any **read** outside the workspace and its read scope. The read scope is the Python installation (packages import their own files lazily) and, on Linux, the public data files the standard library itself lists: the timezone database (`zoneinfo.TZPATH`, `/etc/localtime`, `/etc/timezone`) and the MIME tables (`mimetypes.knownfiles`). pandas needs the first for timezones, and openpyxl reads the second at import. All of these are read-only.

The result reports **network attempts blocked**, read back from the attempt log.

## What the self-test proves

The Assurance screen's self-test submits real payloads (a static socket import, a runtime socket call with the static check bypassed, `os.system`, a write outside the workspace, permitted work, a CPU spin, a memory bomb) and reports each outcome. On the demonstration host: **7 of 7 held**.

## What the sandbox does not stop

> [!WARNING]
> With `runtime: subprocess` (the default, and the only runtime verified on the Windows development host), this is application-level isolation inside a subprocess: static rules, OS resource limits and an interpreter shim. It is **not** a container, a virtual machine, a namespace or a seccomp filter, and the child runs as the **same operating-system user** as the API.

Concretely, verified on the demonstration host:

| Attempt | Result |
|---|---|
| Write outside the workspace with `open()` or `os.open()` | ✅ Refused |
| Open a socket, even with `_socket` | ✅ Refused |
| `os.system`, `subprocess`, `getattr` tricks | ✅ Refused before running |
| **Read** a host file, e.g. `Path('/etc/hostname').read_text()` | ✅ Refused |
| **Read the workbench's own database**, `storage/workbench.db` | ✅ Refused |
| **List** host directories, e.g. `Path('/home').iterdir()` | ❌ **Allowed**: names only, not contents |

Listing is the remaining leak: generated code can learn file and folder names on the host, though not what they contain. Session tokens are stored hashed, so even a leaked database would not leak live sessions. The shim is still interpreter-level: a native extension making raw syscalls is outside its reach.

## Closing the gap

In order of effort:

1. **Confine listing in the shim** as reads are: refuse `os.listdir`, `os.scandir` and `os.walk` outside the read scope.
2. **Run each execution in a container.** Implemented: set `sandbox.runtime: podman` (or `docker`) on a Linux host with the image built. See [the container runtime](#the-container-runtime) below.

## The container runtime

`backend/tools/container_sandbox.py` runs each execution in a fresh container when `sandbox.runtime` is `podman` or `docker`. The three layers above still apply; the container replaces the same-user child process of layer 2 with OS-enforced isolation. The command is:

```
podman run --name aegis-sbx-<id> --pull never --network none --read-only
  --user <api uid>:<api gid> --userns keep-id --cap-drop ALL
  --security-opt no-new-privileges --memory 1024m --memory-swap 1024m
  --cpus 1 --pids-limit 64 --ulimit cpu=30:30 --ulimit fsize=26214400:26214400
  --ulimit core=0:0 --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m
  --volume <workspace>:/workspace:rw,Z --workdir /workspace --hostname sandbox
  --env … localhost/aegis-sandbox:1 python /workspace/program.py
```

| Control | How |
|---|---|
| No network | `--network none`: the namespace has only `lo` |
| Read-only root | `--read-only`; writable: the workspace and a `noexec` `/tmp` tmpfs |
| Not root | The API's own uid (mapped by `--userns keep-id` under rootless Podman), or `nobody` if the API runs as root |
| No privileges | `--cap-drop ALL`, `no-new-privileges` |
| Limits | cgroup memory with no swap, `--cpus`, `--pids-limit`, CPU-time and file-size ulimits, and the parent's wall timeout (`kill`, then `rm -f`) |
| Mounts | The per-run workspace only. The image is never pulled |
| Memory kill | Read from `State.OOMKilled` after exit, so a cgroup OOM kill is told apart from any other `SIGKILL` |

Peak memory and CPU time are **not measured** on this path and are reported as `null`.

### When it is used

The runtime is used only when **all** of these hold, checked by a probe at API startup and cached:

1. The binary is on `PATH`.
2. The runtime reports itself rootless (`podman info`, or `rootless` in Docker's security options), unless `container_require_rootless: false`.
3. The image is present locally.
4. A probe container, started with exactly the flags above but **without** the interpreter shim, demonstrates: only `lo` exists, a connect to `192.0.2.1` and a DNS lookup fail, writes to `/`, `/etc` and `/usr` fail, a write to the workspace succeeds, uid and euid are not 0, `CapEff` is zero and `NoNewPrivs` is 1.

If any step fails, the reason is recorded in the audit log (`sandbox_runtime_probe`) and shown in `GET /api/sandbox/limits` (`runtime`, `configured_runtime`, `container`) and in the self-test (`runtime`, `container_probe`). Then `sandbox.container_fallback` decides: `subprocess` runs the sandbox above and labels it, for example *subprocess (fallback: podman unavailable: the podman binary was not found on PATH)*; `refuse` refuses to run code. The fallback is never silent.

With a container in use, the self-test re-runs the probe and reports each probe check alongside the CPU and memory payloads.

### Where it has been verified

| Host | Status |
|---|---|
| The Windows 11 development host | **Not verified.** No Podman, Docker or WSL. The command construction, probe verdict and selection are unit-tested with the runtime mocked (`tests/test_container_sandbox.py`); the real-runtime test skips with its reason |
| Linux with rootless Podman | The intended deployment. Build the image with `infrastructure/sandbox/build.sh`, set `sandbox.runtime: podman`, and read the startup probe's verdict before relying on it |

The image is `infrastructure/sandbox/Containerfile`: Python 3.11 slim with `numpy`, `pandas` and `openpyxl` pinned to `requirements.txt`, and no shell, package manager, `curl` or `wget`. `matplotlib` is on the import allow-list but is not installed in either runtime.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 9.2 · The policy gateway](02-policy-gateway.md) | [↑ 09 · Security and governance](README.md) | [9.4 · The sovereignty monitor →](04-sovereignty-monitor.md) |

<!-- nav:end -->
