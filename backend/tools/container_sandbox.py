"""Container runtime for the sandbox: rootless Podman, or Docker.

The subprocess sandbox in :mod:`backend.tools.sandbox` confines generated code
with OS resource limits and an interpreter shim, but the child is the same
operating-system user as the API, and it shares the host's network stack and
filesystem. A container turns that application-level containment into
OS-enforced isolation:

* ``--network none`` - the container's network namespace holds only ``lo``;
* ``--read-only`` - the root filesystem is immutable, and only the run's own
  workspace (plus a small ``noexec`` tmpfs) is writable;
* a non-root user, ``--cap-drop ALL`` and ``no-new-privileges``;
* cgroup memory (no swap), CPU and PID limits, a CPU-time ulimit, a file-size
  ulimit, and a wall-clock timeout enforced by the parent;
* only the workspace is mounted, and the image is never pulled.

None of that is taken on trust. A runtime is used only when its binary exists
**and** a probe container, started with exactly the flags a real run gets,
demonstrates on this host that it has no network, cannot write outside the
workspace, is not root, holds no capabilities and has no-new-privileges set.
Anything less is reported with the exact reason, and the caller falls back or
refuses per ``sandbox.container_fallback`` - never silently.

The interpreter shim (``sitecustomize``) is still installed into the workspace
for real runs. It is no longer what stops egress, but it is what counts and
reports attempts, and it keeps the three layers independent. The probe runs
*without* it, so a passing probe is a statement about the container alone.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CONTAINER_RUNTIMES = ("podman", "docker")

# Inside the container. The workspace is the only host path mounted.
CONTAINER_WORKSPACE = "/workspace"

# Exit codes a container runtime uses for its *own* failures, before or instead
# of running the program: 125 the runtime itself failed (bad flag, missing
# image, cgroup refused), 126 the command could not be invoked, 127 it was not
# found. They are reported as a runtime error, never as the program's exit.
_RUNTIME_ERROR_EXITS = {125, 126, 127}

_PROBE_MARKER = "AEGIS_PROBE_RESULT "

# The probe program. It runs inside a container started with the production
# flags, without the interpreter shim, and reports what it could and could not
# do. Every check is an attempt, not an inspection of configuration.
_PROBE_PROGRAM = r'''
import errno, json, os, socket

report = {}

try:
    report["interfaces"] = sorted(os.listdir("/sys/class/net"))
except OSError as exc:
    report["interfaces"] = None
    report["interfaces_error"] = type(exc).__name__

# TEST-NET-1 (RFC 5737): never routed anywhere, so a connect that *succeeds*
# is impossible and one that times out means a route existed. With no network
# namespace route the kernel refuses immediately with ENETUNREACH.
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(3)
    s.connect(("192.0.2.1", 80))
    report["connect"] = "connected"
except OSError as exc:
    report["connect"] = errno.errorcode.get(exc.errno, type(exc).__name__)

try:
    socket.getaddrinfo("example.com", 80)
    report["dns"] = "resolved"
except OSError as exc:
    report["dns"] = type(exc).__name__

outside = {}
for target in ("/aegis-probe", "/etc/aegis-probe", "/usr/aegis-probe"):
    try:
        with open(target, "w") as handle:
            handle.write("x")
        outside[target] = "written"
    except OSError as exc:
        outside[target] = errno.errorcode.get(exc.errno, type(exc).__name__)
report["write_outside"] = outside

try:
    with open("/workspace/probe-write.txt", "w") as handle:
        handle.write("ok")
    report["write_workspace"] = "written"
except OSError as exc:
    report["write_workspace"] = errno.errorcode.get(exc.errno, type(exc).__name__)

report["uid"] = os.getuid()
report["euid"] = os.geteuid()

status = {}
try:
    with open("/proc/self/status") as handle:
        for line in handle:
            key, _, value = line.partition(":")
            if key in ("CapEff", "CapPrm", "CapBnd", "NoNewPrivs"):
                status[key] = value.strip()
except OSError:
    pass
report["proc_status"] = status

print("AEGIS_PROBE_RESULT " + json.dumps(report, sort_keys=True))
'''


@dataclass
class ContainerSettings:
    """The container options a run and the probe both use, read from config."""

    image: str
    memory_mb: int
    cpus: float
    pids_limit: int
    cpu_seconds: int
    file_bytes: int
    tmpfs_mb: int
    timeout_seconds: float
    probe_timeout_seconds: float
    require_rootless: bool
    fallback: str  # "subprocess" | "refuse"

    @classmethod
    def from_config(cls, sandbox: dict[str, Any]) -> "ContainerSettings":
        fallback = str(sandbox.get("container_fallback", "subprocess")).lower()
        return cls(
            image=str(sandbox.get("container_image", "localhost/aegis-sandbox:1")),
            memory_mb=int(sandbox.get("max_memory_mb", 1024)),
            cpus=float(sandbox.get("container_cpus", 1.0)),
            pids_limit=int(sandbox.get("container_pids_limit", 64)),
            cpu_seconds=int(sandbox.get("max_cpu_seconds", 30)),
            file_bytes=int(sandbox.get("max_written_file_bytes", 26214400)),
            tmpfs_mb=int(sandbox.get("container_tmpfs_mb", 64)),
            timeout_seconds=float(sandbox.get("timeout_seconds", 45)),
            probe_timeout_seconds=float(sandbox.get("container_probe_timeout_seconds", 90)),
            require_rootless=bool(sandbox.get("container_require_rootless", True)),
            # Anything but an explicit "subprocess" is treated as refuse: an
            # unrecognised value must not widen what is allowed to run.
            fallback="subprocess" if fallback == "subprocess" else "refuse",
        )


def container_user() -> str:
    """The non-root identity the program runs as inside the container.

    On a POSIX host this is the API's own uid:gid, so the bind-mounted
    workspace (created by the API) is writable without loosening its mode.
    With rootless Podman and ``--userns keep-id`` that uid maps to the same
    unprivileged host user, never to host root. If the API itself runs as root
    (uid 0), ``nobody`` is used instead; the workspace is then opened up for
    that one run (see :func:`prepare_workspace`). Windows has no uid, and a
    Podman/Docker machine VM owns the mapping there, so ``nobody`` again.
    """
    getuid = getattr(os, "getuid", None)
    getgid = getattr(os, "getgid", None)
    if getuid is None or getgid is None:
        return "65534:65534"
    uid, gid = getuid(), getgid()
    if uid == 0:
        return "65534:65534"
    return f"{uid}:{gid}"


def container_environment() -> dict[str, str]:
    """The scrubbed environment inside the container.

    Mirrors the subprocess sandbox's: no host credentials or proxies, one
    thread per numerical library, every cache inside the workspace. TMPDIR is
    the workspace rather than /tmp because the interpreter shim refuses writes
    outside the workspace, and a library honouring TMPDIR must not trip it.
    """
    return {
        "PYTHONPATH": CONTAINER_WORKSPACE,
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONUNBUFFERED": "1",
        "PYTHONNOUSERSITE": "1",
        "LANG": "C.UTF-8",
        "SOVEREIGN_SANDBOX": "1",
        "SOVEREIGN_NETWORK_ATTEMPT_LOG": f"{CONTAINER_WORKSPACE}/network_attempts.log",
        "OPENBLAS_NUM_THREADS": "1",
        "OMP_NUM_THREADS": "1",
        "MKL_NUM_THREADS": "1",
        "NUMEXPR_NUM_THREADS": "1",
        "HOME": CONTAINER_WORKSPACE,
        "TMPDIR": CONTAINER_WORKSPACE,
        "MPLCONFIGDIR": CONTAINER_WORKSPACE,
    }


def build_run_command(
    binary: str,
    runtime: str,
    *,
    name: str,
    workspace: Path,
    settings: ContainerSettings,
    argv: list[str],
    user: str | None = None,
    env: dict[str, str] | None = None,
) -> list[str]:
    """The exact ``run`` invocation for one sandboxed program.

    Every flag is a control the documentation claims; tests pin each one. The
    container is deliberately *not* ``--rm``: the parent reads
    ``State.OOMKilled`` after it exits, which is how a memory-cap kill is told
    apart from any other SIGKILL, and then removes it itself.
    """
    user = user or container_user()
    memory = f"{settings.memory_mb}m"
    command = [
        binary,
        "run",
        "--name", name,
        "--pull", "never",
        "--network", "none",
        "--read-only",
        "--user", user,
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        "--memory", memory,
        # Equal to --memory: no swap, so the memory cap is a hard wall.
        "--memory-swap", memory,
        "--cpus", f"{settings.cpus:g}",
        "--pids-limit", str(settings.pids_limit),
        "--ulimit", f"cpu={settings.cpu_seconds}:{settings.cpu_seconds}",
        "--ulimit", f"fsize={settings.file_bytes}:{settings.file_bytes}",
        "--ulimit", "core=0:0",
        "--tmpfs", f"/tmp:rw,noexec,nosuid,nodev,size={settings.tmpfs_mb}m",
        "--volume", f"{workspace}:{CONTAINER_WORKSPACE}:rw,Z",
        "--workdir", CONTAINER_WORKSPACE,
        "--hostname", "sandbox",
    ]
    if runtime == "podman":
        # Rootless Podman: the container user is the invoking host user, so
        # the workspace is writable and nothing maps to host root.
        if user != "65534:65534":
            command += ["--userns", "keep-id"]
    for key, value in sorted((env if env is not None else container_environment()).items()):
        command += ["--env", f"{key}={value}"]
    command.append(settings.image)
    command += argv
    return command


def prepare_workspace(workspace: Path, user: str) -> None:
    """Make the workspace writable by the container user when it is ``nobody``.

    Only reached when the API runs as root or on Windows. The directory is a
    fresh per-run folder under storage/workspaces and is removed after the run.
    """
    if user == "65534:65534" and hasattr(os, "chmod"):
        try:
            os.chmod(workspace, 0o777)
        except OSError:
            pass


@dataclass
class ContainerRunMeasurement:
    """What one container run did, as read back from the runtime."""

    exit_code: int | None
    timed_out: bool
    stdout: str
    stderr: str
    oom_killed: bool | None  # None: the runtime could not be asked
    runtime_error: bool


def _run(argv: list[str], timeout: float) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        argv, capture_output=True, text=True, timeout=timeout, check=False
    )


def run_in_container(
    binary: str,
    runtime: str,
    *,
    code: str,
    workspace: Path,
    settings: ContainerSettings,
    guard_source: str | None,
    timeout: float | None = None,
) -> ContainerRunMeasurement:
    """Run ``code`` as ``program.py`` in a fresh container, and measure it."""
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / "program.py").write_text(code, encoding="utf-8")
    if guard_source is not None:
        (workspace / "sitecustomize.py").write_text(guard_source, encoding="utf-8")

    user = container_user()
    prepare_workspace(workspace, user)
    name = f"aegis-sbx-{uuid.uuid4().hex[:12]}"
    wall = settings.timeout_seconds if timeout is None else timeout
    command = build_run_command(
        binary,
        runtime,
        name=name,
        workspace=workspace.resolve(),
        settings=settings,
        argv=["python", f"{CONTAINER_WORKSPACE}/program.py"],
        user=user,
    )

    timed_out = False
    stdout = stderr = ""
    exit_code: int | None = None
    try:
        try:
            completed = _run(command, wall)
            stdout, stderr, exit_code = completed.stdout, completed.stderr, completed.returncode
        except subprocess.TimeoutExpired as exc:
            timed_out = True
            stdout = _text(exc.stdout)
            stderr = _text(exc.stderr) + (
                f"\nExecution exceeded the {wall:g}s sandbox timeout and the "
                "container was killed."
            )
            _quiet([binary, "kill", name])
        except OSError as exc:
            return ContainerRunMeasurement(
                exit_code=None, timed_out=False, stdout="",
                stderr=f"The {runtime} binary could not be started: {exc}",
                oom_killed=None, runtime_error=True,
            )

        oom: bool | None = None
        try:
            inspected = _run([binary, "inspect", "--format", "{{.State.OOMKilled}}", name], 30)
            value = inspected.stdout.strip().lower()
            if inspected.returncode == 0 and value in {"true", "false"}:
                oom = value == "true"
        except (subprocess.TimeoutExpired, OSError):
            pass
    finally:
        _quiet([binary, "rm", "-f", name])

    return ContainerRunMeasurement(
        exit_code=None if timed_out else exit_code,
        timed_out=timed_out,
        stdout=stdout,
        stderr=stderr,
        oom_killed=oom,
        runtime_error=(not timed_out) and exit_code in _RUNTIME_ERROR_EXITS,
    )


def classify_container_exit(measurement: ContainerRunMeasurement) -> str | None:
    """Name why a container run ended, from measured signals only."""
    if measurement.timed_out:
        return "wall_clock_timeout"
    if measurement.runtime_error:
        return "container_runtime_error"
    if measurement.oom_killed:
        return "memory_limit_exceeded"
    code = measurement.exit_code
    if code in (0, None):
        return None if code == 0 else "terminated"
    # A program killed by a signal exits the container with 128 + signal.
    return {
        128 + 24: "cpu_time_limit_exceeded",   # SIGXCPU
        128 + 25: "file_size_limit_exceeded",  # SIGXFSZ
        128 + 9: "terminated_by_signal",       # SIGKILL, not an OOM kill
    }.get(code, "nonzero_exit")


def _text(value: Any) -> str:
    if isinstance(value, bytes):
        return value.decode(errors="replace")
    return value or ""


def _quiet(argv: list[str]) -> None:
    try:
        _run(argv, 30)
    except (subprocess.TimeoutExpired, OSError):
        pass


# ------------------------------------------------------------------- probe
@dataclass
class ContainerProbe:
    """Whether a container runtime isolates on this host, and why not if not.

    ``usable`` is True only when every check passed. ``checks`` holds each
    attempt and what happened, so the self-test and the limits endpoint can
    show the evidence rather than a verdict.
    """

    runtime: str
    binary: str | None
    image: str
    usable: bool
    reason: str
    rootless: bool | None = None
    checks: list[dict[str, Any]] = field(default_factory=list)
    probed_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return {
            "runtime": self.runtime,
            "binary": self.binary,
            "image": self.image,
            "usable": self.usable,
            "reason": self.reason,
            "rootless": self.rootless,
            "checks": list(self.checks),
            "probed_at": self.probed_at,
        }


_probe_cache: dict[tuple[str, str], ContainerProbe] = {}
_probe_lock = threading.Lock()


def clear_probe_cache() -> None:
    with _probe_lock:
        _probe_cache.clear()


def probe_container_runtime(
    runtime: str, settings: ContainerSettings, *, force: bool = False
) -> ContainerProbe:
    """Prove, on this host, that ``runtime`` isolates a program - or say why not.

    Cached per (runtime, image): it starts a container, which is paid once at
    startup, not on every run. ``force`` re-probes, which the self-test does
    so its report is about now.
    """
    key = (runtime, settings.image)
    if not force and key in _probe_cache:
        return _probe_cache[key]
    with _probe_lock:
        if not force and key in _probe_cache:
            return _probe_cache[key]
        probe = _probe(runtime, settings)
        _probe_cache[key] = probe
        return probe


def _probe(runtime: str, settings: ContainerSettings) -> ContainerProbe:
    image = settings.image
    if runtime not in CONTAINER_RUNTIMES:
        return ContainerProbe(runtime, None, image, False, f"{runtime!r} is not a container runtime this sandbox supports")
    binary = shutil.which(runtime)
    if binary is None:
        return ContainerProbe(runtime, None, image, False, f"the {runtime} binary was not found on PATH")

    rootless = _rootless(binary, runtime)
    if settings.require_rootless and rootless is not True:
        state = "could not be determined" if rootless is None else "is not rootless"
        return ContainerProbe(
            runtime, binary, image, False,
            f"{runtime} {state} on this host and sandbox.container_require_rootless is true",
            rootless=rootless,
        )

    if not _image_present(binary, runtime, image):
        return ContainerProbe(
            runtime, binary, image, False,
            f"the sandbox image {image} is not present locally, and the sandbox never "
            "pulls; build it with infrastructure/sandbox/build.sh",
            rootless=rootless,
        )

    import tempfile

    try:
        with tempfile.TemporaryDirectory(prefix="aegis-container-probe-") as tmp:
            measurement = run_in_container(
                binary, runtime,
                code=_PROBE_PROGRAM,
                workspace=Path(tmp),
                settings=settings,
                guard_source=None,
                timeout=settings.probe_timeout_seconds,
            )
    except Exception as exc:  # pragma: no cover - defensive
        return ContainerProbe(runtime, binary, image, False, f"the probe container raised {exc!r}", rootless=rootless)

    return evaluate_probe(runtime, binary, image, rootless, measurement)


def evaluate_probe(
    runtime: str,
    binary: str,
    image: str,
    rootless: bool | None,
    measurement: ContainerRunMeasurement,
) -> ContainerProbe:
    """Turn the probe container's report into checks and a verdict."""
    if measurement.timed_out or measurement.runtime_error or measurement.exit_code != 0:
        detail = (measurement.stderr or measurement.stdout).strip().splitlines()
        return ContainerProbe(
            runtime, binary, image, False,
            "the probe container did not complete (exit "
            f"{measurement.exit_code}, timed_out={measurement.timed_out}): "
            + (detail[-1] if detail else "no output"),
            rootless=rootless,
        )
    report = parse_probe_output(measurement.stdout)
    if report is None:
        return ContainerProbe(runtime, binary, image, False, "the probe container produced no readable report", rootless=rootless)

    checks: list[dict[str, Any]] = []

    interfaces = report.get("interfaces")
    connect = report.get("connect")
    checks.append({
        "name": "No network",
        "target": "connect to 192.0.2.1:80 and resolve example.com with no shim",
        "passed": interfaces == ["lo"] and connect != "connected" and report.get("dns") != "resolved",
        "detail": f"interfaces={interfaces}, connect={connect}, dns={report.get('dns')}",
    })

    outside = report.get("write_outside") or {}
    checks.append({
        "name": "Read-only root filesystem",
        "target": "write /aegis-probe, /etc/aegis-probe, /usr/aegis-probe",
        "passed": bool(outside) and all(result != "written" for result in outside.values()),
        "detail": ", ".join(f"{path}: {result}" for path, result in sorted(outside.items())) or "no result",
    })

    checks.append({
        "name": "Workspace is writable",
        "target": "write /workspace/probe-write.txt",
        "passed": report.get("write_workspace") == "written",
        "detail": str(report.get("write_workspace")),
    })

    uid, euid = report.get("uid"), report.get("euid")
    checks.append({
        "name": "Not root",
        "target": "uid and euid inside the container",
        "passed": isinstance(uid, int) and isinstance(euid, int) and uid != 0 and euid != 0,
        "detail": f"uid={uid}, euid={euid}",
    })

    status = report.get("proc_status") or {}
    cap_eff = status.get("CapEff")
    checks.append({
        "name": "No capabilities",
        "target": "CapEff in /proc/self/status",
        "passed": cap_eff is not None and _hex_is_zero(cap_eff),
        "detail": f"CapEff={cap_eff}",
    })
    checks.append({
        "name": "no-new-privileges",
        "target": "NoNewPrivs in /proc/self/status",
        "passed": status.get("NoNewPrivs") == "1",
        "detail": f"NoNewPrivs={status.get('NoNewPrivs')}",
    })

    failed = [check["name"] for check in checks if not check["passed"]]
    if failed:
        return ContainerProbe(
            runtime, binary, image, False,
            "the probe container ran but isolation did not hold: " + ", ".join(failed),
            rootless=rootless, checks=checks,
        )
    return ContainerProbe(
        runtime, binary, image, True,
        f"{runtime} isolation held on this host: {len(checks)} of {len(checks)} probe checks passed",
        rootless=rootless, checks=checks,
    )


def parse_probe_output(stdout: str) -> dict[str, Any] | None:
    for line in reversed(stdout.splitlines()):
        if line.startswith(_PROBE_MARKER):
            try:
                value = json.loads(line[len(_PROBE_MARKER):])
            except ValueError:
                return None
            return value if isinstance(value, dict) else None
    return None


def _hex_is_zero(value: str) -> bool:
    try:
        return int(value, 16) == 0
    except ValueError:
        return False


def _rootless(binary: str, runtime: str) -> bool | None:
    """Ask the runtime whether it runs rootless. None when it cannot say."""
    if runtime == "podman":
        argv = [binary, "info", "--format", "{{.Host.Security.Rootless}}"]
    else:
        argv = [binary, "info", "--format", "{{json .SecurityOptions}}"]
    try:
        completed = _run(argv, 30)
    except (subprocess.TimeoutExpired, OSError):
        return None
    if completed.returncode != 0:
        return None
    out = completed.stdout.strip().lower()
    if runtime == "podman":
        return {"true": True, "false": False}.get(out)
    return "rootless" in out


def _image_present(binary: str, runtime: str, image: str) -> bool:
    argv = (
        [binary, "image", "exists", image]
        if runtime == "podman"
        else [binary, "image", "inspect", image]
    )
    try:
        return _run(argv, 30).returncode == 0
    except (subprocess.TimeoutExpired, OSError):
        return False
