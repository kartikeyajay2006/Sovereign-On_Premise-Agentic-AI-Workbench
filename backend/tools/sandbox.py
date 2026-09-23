"""Secure code execution sandbox.

Two independent layers, in the order the reference architecture specifies:

1. **Static security validation** - the generated source is parsed to an AST
   and rejected before execution if it imports a denied module, calls a denied
   builtin, or reaches for interpreter internals. Denied and allowed lists live
   in ``config/app.yaml``.
2. **Sandbox admission** - execution happens in a throwaway working directory
   as a child process under enforced resource limits, a wall-clock timeout, a
   scrubbed environment, and no network route.

The resource limits are enforced by one of two backends, chosen by what the
host can actually do, never by configuration:

* **POSIX** - ``resource.setrlimit`` in a ``preexec_fn`` (CPU seconds, address
  space, file size, process count), applied in the child after ``fork`` and
  before ``exec`` so user code never runs unbounded.
* **Windows** - a kernel Job Object created through ``ctypes``/``kernel32``
  (per-process committed-memory cap, per-process user-time cap, active-process
  cap, kill-on-job-close), assigned to the child before it is allowed to run a
  single line of user code. The child blocks on a one-byte stdin sentinel that
  the parent writes only after ``AssignProcessToJobObject`` succeeds, which
  closes the spawn-before-assign race: if assignment fails, the child is killed
  rather than released.

Neither backend is assumed. The Windows backend is *probed* once on this host -
a real child is placed in a job and a real over-cap allocation is confirmed to
be refused - before ``execution_allowed`` may return True, because a wrong
struct layout silently applies no limit and the interface reports a sandbox
posture to the operator. If the probe fails, execution is refused with a
measured reason rather than run outside the limits the sandbox is defined by.

Network denial is enforced twice: statically (no networking module may be
imported) and dynamically (a sitecustomize shim installed into the sandbox
makes ``socket.socket`` *and the ``_socket`` C primitive it is built on* raise,
so the runtime layer holds even with the import allow-list bypassed, and every
attempt is counted and reported). Writes outside the throwaway workspace are
refused by the same shim: this is interpreter-level confinement, not an OS
jail - see docs/RUNTIME-ENVIRONMENT.md for exactly what that does and does not
guarantee.

The sandbox limits blast radius; it does not decide whether code may run at
all. That decision belongs to the policy gateway.
"""

from __future__ import annotations

import ast
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import uuid

from backend.core.config import get_config
from backend.core.schemas import SandboxResult

# --------------------------------------------------------- platform capability
# RLIMIT_CPU, RLIMIT_AS, RLIMIT_FSIZE and RLIMIT_NPROC are POSIX. Windows has
# no equivalent reachable from `subprocess`, and `preexec_fn` does not exist
# there either.
#
# Importing `resource` at module scope previously made this module unloadable
# on Windows, which took the whole backend down with it. Importing it
# conditionally fixes that, but it must not quietly turn the limits into a
# no-op: the difference between "bounded to 30 CPU seconds and 1 GB" and
# "unbounded" is the entire value of this layer, and the interface reports a
# sandbox posture to the operator.
try:
    import resource

    _POSIX_RLIMITS = True
except ModuleNotFoundError:  # pragma: no cover - platform dependent
    resource = None  # type: ignore[assignment]
    _POSIX_RLIMITS = False

_IS_WINDOWS = sys.platform == "win32"


def _load_kernel32() -> Any | None:
    """Load kernel32 with the Job Object entry points, or return None.

    Only the *presence* of the API is checked here. Whether the job actually
    enforces a limit on this host is a separate, stronger question answered by
    :func:`probe_windows_job_limits`, which runs a real child against a real
    cap. Presence is cheap and safe to determine at import; enforcement costs a
    subprocess and is therefore deferred until the sandbox is first used.
    """
    if not _IS_WINDOWS:
        return None
    try:
        import ctypes
        from ctypes import wintypes

        k = ctypes.WinDLL("kernel32", use_last_error=True)
        # Bind signatures so 64-bit HANDLEs are not truncated to 32-bit ints.
        k.CreateJobObjectW.restype = wintypes.HANDLE
        k.CreateJobObjectW.argtypes = [wintypes.LPVOID, wintypes.LPCWSTR]
        k.SetInformationJobObject.restype = wintypes.BOOL
        k.SetInformationJobObject.argtypes = [
            wintypes.HANDLE, ctypes.c_int, wintypes.LPVOID, wintypes.DWORD
        ]
        k.AssignProcessToJobObject.restype = wintypes.BOOL
        k.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        k.QueryInformationJobObject.restype = wintypes.BOOL
        k.QueryInformationJobObject.argtypes = [
            wintypes.HANDLE,
            ctypes.c_int,
            wintypes.LPVOID,
            wintypes.DWORD,
            ctypes.POINTER(wintypes.DWORD),
        ]
        k.TerminateJobObject.restype = wintypes.BOOL
        k.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
        k.CloseHandle.argtypes = [wintypes.HANDLE]
        return k
    except Exception:  # pragma: no cover - only reachable on a broken host
        return None


_KERNEL32 = _load_kernel32()
_WINDOWS_JOB_CAPABLE = _KERNEL32 is not None

# The name other modules and the test suite import as the single "can this host
# apply resource limits at all?" flag. It has always meant exactly that, and
# the answer on Windows is now yes: a Job Object is a resource-limit backend.
# Keeping it as one flag (rather than adding a second the callers do not know
# about) is deliberate - the self-test that refuses to make a containment claim
# when limits are unavailable is driven by monkeypatching this symbol to False,
# and that scenario must remain reachable.
RESOURCE_LIMITS_AVAILABLE = _POSIX_RLIMITS or _WINDOWS_JOB_CAPABLE


# ------------------------------------------------------- Windows Job Objects
# Struct layouts are transcribed from the Windows SDK (winnt.h) for the 64-bit
# ABI. ctypes lays fields out with natural alignment, matching the C compiler,
# so the sizes below come out as the SDK sizes: BASIC_LIMIT is 64 bytes and
# EXTENDED_LIMIT is 144 bytes on x64. A wrong field type (ULONG where the ABI
# wants SIZE_T, most dangerously) shifts every following field and the kernel
# reads a cap from the wrong offset - applying no limit while returning
# success. The probe below is what proves the layout is right on this host.
if _WINDOWS_JOB_CAPABLE:
    import ctypes
    from ctypes import wintypes

    _SIZE_T = ctypes.c_size_t
    _ULONGLONG = ctypes.c_ulonglong
    _LARGE_INTEGER = ctypes.c_longlong

    JobObjectBasicAndIoAccountingInformation = 8
    JobObjectExtendedLimitInformation = 9

    JOB_OBJECT_LIMIT_PROCESS_TIME = 0x00000002
    JOB_OBJECT_LIMIT_ACTIVE_PROCESS = 0x00000008
    JOB_OBJECT_LIMIT_PROCESS_MEMORY = 0x00000100
    JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION = 0x00000400
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000

    # 0xC0000044 == STATUS_QUOTA_EXCEEDED, the exit code Windows gives a process
    # it terminated for exceeding a job time (or other quota) limit. Measured on
    # this host: a 1s CPU cap on an infinite loop exits with exactly this code.
    STATUS_QUOTA_EXCEEDED = 0xC0000044

    class _JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", _LARGE_INTEGER),
            ("PerJobUserTimeLimit", _LARGE_INTEGER),
            ("LimitFlags", wintypes.DWORD),
            ("MinimumWorkingSetSize", _SIZE_T),
            ("MaximumWorkingSetSize", _SIZE_T),
            ("ActiveProcessLimit", wintypes.DWORD),
            ("Affinity", ctypes.c_void_p),  # ULONG_PTR
            ("PriorityClass", wintypes.DWORD),
            ("SchedulingClass", wintypes.DWORD),
        ]

    class _IO_COUNTERS(ctypes.Structure):
        _fields_ = [
            ("ReadOperationCount", _ULONGLONG),
            ("WriteOperationCount", _ULONGLONG),
            ("OtherOperationCount", _ULONGLONG),
            ("ReadTransferCount", _ULONGLONG),
            ("WriteTransferCount", _ULONGLONG),
            ("OtherTransferCount", _ULONGLONG),
        ]

    class _JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", _JOBOBJECT_BASIC_LIMIT_INFORMATION),
            ("IoInfo", _IO_COUNTERS),
            ("ProcessMemoryLimit", _SIZE_T),
            ("JobMemoryLimit", _SIZE_T),
            ("PeakProcessMemoryUsed", _SIZE_T),
            ("PeakJobMemoryUsed", _SIZE_T),
        ]

    class _JOBOBJECT_BASIC_ACCOUNTING_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("TotalUserTime", _LARGE_INTEGER),
            ("TotalKernelTime", _LARGE_INTEGER),
            ("ThisPeriodTotalUserTime", _LARGE_INTEGER),
            ("ThisPeriodTotalKernelTime", _LARGE_INTEGER),
            ("TotalPageFaultCount", wintypes.DWORD),
            ("ActiveProcesses", wintypes.DWORD),
            ("TotalProcesses", wintypes.DWORD),
            ("TotalTerminatedProcesses", wintypes.DWORD),
        ]

    class _JOBOBJECT_BASIC_AND_IO_ACCOUNTING_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("BasicInfo", _JOBOBJECT_BASIC_ACCOUNTING_INFORMATION),
            ("IoInfo", _IO_COUNTERS),
        ]


@dataclass
class _WindowsRunMeasurement:
    """What a Windows Job Object run actually did, read back from the kernel."""

    assigned: bool
    assign_error: int
    exit_code: int | None
    timed_out: bool
    stdout: str
    stderr: str
    output_truncated: bool
    peak_memory_bytes: int | None
    user_time_seconds: float | None
    kernel_time_seconds: float | None
    terminated_processes: int | None


# The script the Windows child starts. An uncaught exception used to print
# the runner's own frames above the program's -- this file and three runpy
# frames -- each with the absolute path of the workspace, which names the
# service's checkout and the account it runs as. That is host layout handed to
# whoever submitted the code, and none of it is theirs. The traceback now
# starts at the first frame in program.py, and the workspace and the
# interpreter's install paths in any later frame (the sitecustomize guard, a
# stdlib module) are written as <workspace> and <python>. The exception and
# its message are unchanged, and the exit code is 1, as for any uncaught
# exception; SystemExit passes through untouched.
_WINDOWS_RUNNER = (
    "import os, sys, runpy, traceback\n"
    "sys.stdin.buffer.read(1)\n"
    "try:\n"
    "    runpy.run_path('program.py', run_name='__main__')\n"
    "except SystemExit:\n"
    "    raise\n"
    "except BaseException as exc:\n"
    "    tb = exc.__traceback__\n"
    "    while tb is not None and tb.tb_frame.f_code.co_filename != 'program.py':\n"
    "        tb = tb.tb_next\n"
    "    text = ''.join(traceback.format_exception(type(exc), exc, tb))\n"
    "    for path, name in ((os.getcwd(), '<workspace>'), (sys.prefix, '<python>'),\n"
    "                       (sys.base_prefix, '<python>')):\n"
    "        text = text.replace(path, name)\n"
    "    sys.stderr.write(text)\n"
    "    sys.stderr.flush()\n"
    "    sys.exit(1)\n"
)


def _win_run(
    code: str,
    *,
    memory_bytes: int,
    cpu_seconds: int,
    active_process_limit: int,
    wall_timeout: float,
    workspace: Path,
    env: dict[str, str],
    max_output_bytes: int,
    install_guard: bool,
) -> _WindowsRunMeasurement:
    """Run ``code`` as a child confined by a fresh Job Object, and measure it.

    The child cannot execute a line of ``code`` until it is inside the job: the
    runner blocks on one sentinel byte from stdin, and the parent writes that
    byte only after :func:`AssignProcessToJobObject` returns success. If
    assignment fails, the child is killed while still blocked - it is never
    released to run uncontained.
    """
    k = _KERNEL32
    assert k is not None

    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / "program.py").write_text(code, encoding="utf-8")
    if install_guard:
        (workspace / "sitecustomize.py").write_text(SITECUSTOMIZE, encoding="utf-8")
    # runpy runs program.py with __name__ == "__main__", so a traceback points
    # at program.py:<line> exactly as a direct `python program.py` would. The
    # sentinel read is the first thing that happens, before any user code.
    (workspace / "_runner.py").write_text(_WINDOWS_RUNNER, encoding="utf-8")

    job = k.CreateJobObjectW(None, None)
    if not job:
        return _WindowsRunMeasurement(
            assigned=False, assign_error=ctypes.get_last_error(), exit_code=None,
            timed_out=False, stdout="", stderr="CreateJobObjectW failed",
            output_truncated=False, peak_memory_bytes=None, user_time_seconds=None,
            kernel_time_seconds=None, terminated_processes=None,
        )

    try:
        info = _JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
        info.BasicLimitInformation.LimitFlags = (
            JOB_OBJECT_LIMIT_PROCESS_MEMORY
            | JOB_OBJECT_LIMIT_PROCESS_TIME
            | JOB_OBJECT_LIMIT_ACTIVE_PROCESS
            | JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION
        )
        info.ProcessMemoryLimit = memory_bytes
        info.BasicLimitInformation.PerProcessUserTimeLimit = cpu_seconds * 10_000_000
        # The parent process is itself inside a job on this host, so the child
        # is a nested job. An ActiveProcessLimit of 1 is refused with
        # ERROR_NOT_ENOUGH_QUOTA at assignment in that configuration (measured),
        # so the floor is 2: enough for the one interpreter, still far below a
        # spawn bomb, which is caught at 2-3 processes.
        info.BasicLimitInformation.ActiveProcessLimit = max(2, active_process_limit)

        if not k.SetInformationJobObject(
            job, JobObjectExtendedLimitInformation, ctypes.byref(info), ctypes.sizeof(info)
        ):
            return _WindowsRunMeasurement(
                assigned=False, assign_error=ctypes.get_last_error(), exit_code=None,
                timed_out=False, stdout="", stderr="SetInformationJobObject failed",
                output_truncated=False, peak_memory_bytes=None, user_time_seconds=None,
                kernel_time_seconds=None, terminated_processes=None,
            )

        proc = subprocess.Popen(
            [sys.executable, "_runner.py"],
            cwd=str(workspace),
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        assigned = bool(k.AssignProcessToJobObject(job, int(proc._handle)))
        assign_error = 0 if assigned else ctypes.get_last_error()
        if not assigned:
            # The child is still blocked on the sentinel. Kill it there; do not
            # release it to run outside the job it could not be placed in.
            proc.kill()
            try:
                proc.communicate(timeout=5)
            except Exception:
                pass
            return _WindowsRunMeasurement(
                assigned=False, assign_error=assign_error, exit_code=None,
                timed_out=False, stdout="",
                stderr=f"AssignProcessToJobObject failed (error {assign_error}); "
                "the child was terminated rather than run uncontained",
                output_truncated=False, peak_memory_bytes=None, user_time_seconds=None,
                kernel_time_seconds=None, terminated_processes=None,
            )

        # Bounded, concurrent drain. Reading in threads stops a child that fills
        # the 64 KB pipe buffer from deadlocking the wait, and the per-stream cap
        # stops a print bomb in the child from ballooning this parent's memory:
        # once the cap is reached the bytes are counted but dropped, and the
        # child eventually blocks on write and is taken by the wall timeout.
        out_buf: list[bytes] = []
        err_buf: list[bytes] = []
        truncated = {"v": False}

        def drain(stream: Any, buf: list[bytes]) -> None:
            total = 0
            try:
                while True:
                    chunk = stream.read(65536)
                    if not chunk:
                        break
                    if total < max_output_bytes:
                        buf.append(chunk[: max_output_bytes - total])
                    else:
                        truncated["v"] = True
                    total += len(chunk)
            except Exception:
                pass

        t_out = threading.Thread(target=drain, args=(proc.stdout, out_buf), daemon=True)
        t_err = threading.Thread(target=drain, args=(proc.stderr, err_buf), daemon=True)
        t_out.start()
        t_err.start()

        try:
            proc.stdin.write(b"\x01")
            proc.stdin.flush()
            proc.stdin.close()
        except Exception:
            pass

        timed_out = False
        try:
            proc.wait(timeout=wall_timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            k.TerminateJobObject(job, 1)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        t_out.join(2)
        t_err.join(2)

        # Peak memory and CPU time persist in the job object after the process
        # exits, until the job handle is closed. Read them now.
        ret = wintypes.DWORD(0)
        ext = _JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
        peak = None
        if k.QueryInformationJobObject(
            job, JobObjectExtendedLimitInformation, ctypes.byref(ext), ctypes.sizeof(ext), ctypes.byref(ret)
        ):
            peak = int(ext.PeakProcessMemoryUsed)
        acct = _JOBOBJECT_BASIC_AND_IO_ACCOUNTING_INFORMATION()
        user_s = kernel_s = None
        terminated = None
        if k.QueryInformationJobObject(
            job, JobObjectBasicAndIoAccountingInformation, ctypes.byref(acct), ctypes.sizeof(acct), ctypes.byref(ret)
        ):
            user_s = acct.BasicInfo.TotalUserTime / 10_000_000
            kernel_s = acct.BasicInfo.TotalKernelTime / 10_000_000
            terminated = int(acct.BasicInfo.TotalTerminatedProcesses)

        return _WindowsRunMeasurement(
            assigned=True,
            assign_error=0,
            exit_code=None if timed_out else proc.returncode,
            timed_out=timed_out,
            stdout=b"".join(out_buf).decode(errors="replace"),
            stderr=b"".join(err_buf).decode(errors="replace"),
            output_truncated=truncated["v"],
            peak_memory_bytes=peak,
            user_time_seconds=user_s,
            kernel_time_seconds=kernel_s,
            terminated_processes=terminated,
        )
    finally:
        # KILL_ON_JOB_CLOSE means closing the handle takes any straggler with
        # it, so a child that outlived the wait cannot outlive the run.
        k.CloseHandle(job)


_windows_probe_cache: tuple[bool, str] | None = None
_windows_probe_lock = threading.Lock()


def probe_windows_job_limits() -> tuple[bool, str]:
    """Confirm a Job Object actually enforces a memory cap on this host.

    Runs two real children in a throwaway directory (independent of the
    configured workspace): a trivial one that must complete inside the job, and
    a bomb that must be refused when it exceeds a small cap. The result is a
    measured fact about *this* host, cached so it is paid once, not on every
    execution.
    """
    global _windows_probe_cache
    if _windows_probe_cache is not None:
        return _windows_probe_cache
    with _windows_probe_lock:
        if _windows_probe_cache is not None:
            return _windows_probe_cache
        if not _WINDOWS_JOB_CAPABLE:
            _windows_probe_cache = (False, "kernel32 Job Object API is not available")
            return _windows_probe_cache

        env = _probe_environment()
        try:
            with tempfile.TemporaryDirectory(prefix="sandbox-probe-") as tmp:
                base = Path(tmp)
                trivial = _win_run(
                    "print('sandbox-probe-ok')",
                    memory_bytes=256 * 1024 * 1024,
                    cpu_seconds=15,
                    active_process_limit=4,
                    wall_timeout=20,
                    workspace=base / "trivial",
                    env=env,
                    max_output_bytes=4096,
                    install_guard=False,
                )
                if not trivial.assigned or trivial.exit_code != 0:
                    _windows_probe_cache = (
                        False,
                        "A trivial child could not be run inside a Job Object on this "
                        f"host (assigned={trivial.assigned}, exit={trivial.exit_code}, "
                        f"error={trivial.assign_error}). Execution is refused rather "
                        "than run uncontained.",
                    )
                    return _windows_probe_cache

                # A 64 MB cap against a 200 MB allocation. Small on purpose:
                # the probe must not itself be a memory event on a shared host,
                # and a per-process committed-memory cap refuses the commit, so
                # the child never actually holds 200 MB - it fails at the cap.
                bomb = _win_run(
                    "b = bytearray(200 * 1024 * 1024)\n"
                    "for i in range(0, len(b), 4096):\n"
                    "    b[i] = 1\n"
                    "print('ALLOCATED', len(b))\n",
                    memory_bytes=64 * 1024 * 1024,
                    cpu_seconds=15,
                    active_process_limit=4,
                    wall_timeout=20,
                    workspace=base / "bomb",
                    env=env,
                    max_output_bytes=4096,
                    install_guard=False,
                )
                contained = (
                    bomb.assigned
                    and bomb.exit_code not in (0, None)
                    and "ALLOCATED" not in bomb.stdout
                )
                peak_ok = bomb.peak_memory_bytes is None or bomb.peak_memory_bytes <= 96 * 1024 * 1024
                if contained and peak_ok:
                    _windows_probe_cache = (
                        True,
                        "Windows Job Object enforces a per-process memory cap on this "
                        "host (a 200 MB allocation was refused under a 64 MB cap).",
                    )
                else:
                    _windows_probe_cache = (
                        False,
                        "A Job Object was created but did not enforce the memory cap on "
                        f"this host (bomb exit={bomb.exit_code}, peak="
                        f"{bomb.peak_memory_bytes}). This usually means the struct "
                        "layout is wrong for this ABI. Execution is refused.",
                    )
                return _windows_probe_cache
        except Exception as exc:  # pragma: no cover - defensive
            _windows_probe_cache = (False, f"Job Object probe raised: {exc!r}")
            return _windows_probe_cache


def _probe_environment() -> dict[str, str]:
    """A minimal, real environment for the probe child (Windows)."""
    system_root = os.environ.get("SystemRoot", r"C:\Windows")
    return {
        "SystemRoot": system_root,
        "PATH": os.path.join(system_root, "System32"),
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONUNBUFFERED": "1",
        "PYTHONNOUSERSITE": "1",
    }


# Written into every sandbox working directory. Neutralises network syscalls
# and out-of-workspace writes from inside the interpreter, and records network
# attempts for the execution report.
SITECUSTOMIZE = '''"""Sandbox runtime guard - installed by the workbench, not by user code.

Neutralises the *capability* to reach the network, and the *capability* to
write outside the throwaway workspace, rather than blocking imports. Trusted
libraries such as pandas import networking modules lazily during normal,
entirely offline work, so refusing the import breaks them while proving
nothing. Refusing the syscall cannot be worked around from Python: every path
to egress runs through these primitives, whoever imported them.

This is interpreter-level confinement. It is not an OS jail: it binds only code
running in this interpreter, and a native extension making raw syscalls is
outside its reach. What user code may import is governed separately, before
execution, by the static validator, which is what keeps ctypes and the raw
socket modules off the table in the first place.
"""
import builtins as _builtins
import io as _io
import os
import socket

_ATTEMPT_LOG = os.environ.get("SOVEREIGN_NETWORK_ATTEMPT_LOG", "network_attempts.log")
_WORKSPACE = os.path.realpath(os.getcwd())
_REAL_OPEN = _builtins.open


def _record(target):
    try:
        with _REAL_OPEN(_ATTEMPT_LOG, "a", encoding="utf-8") as handle:
            handle.write(str(target) + "\\n")
    except OSError:
        pass


class SovereignNetworkBlocked(RuntimeError):
    """Raised whenever sandboxed code attempts any network operation."""


class SovereignFilesystemBlocked(RuntimeError):
    """Raised whenever sandboxed code writes outside its workspace."""


def _blocked(name):
    def _raise(*args, **kwargs):
        _record(name)
        raise SovereignNetworkBlocked(
            "Network access is disabled in the sovereign sandbox: " + name
        )
    return _raise


# Socket construction and name resolution: every outbound path needs one of
# these, so disabling them disables egress regardless of the library used.
socket.socket = _blocked("socket.socket")
socket.create_connection = _blocked("socket.create_connection")
socket.create_server = _blocked("socket.create_server")
socket.getaddrinfo = _blocked("socket.getaddrinfo")
socket.gethostbyname = _blocked("socket.gethostbyname")
socket.gethostbyname_ex = _blocked("socket.gethostbyname_ex")
if hasattr(socket, "socketpair"):
    socket.socketpair = _blocked("socket.socketpair")

# socket.socket is a thin Python subclass of _socket.socket. Patching only the
# Python name leaves `import _socket; _socket.socket().connect(addr)` as a live
# egress path - the runtime layer would then hold only because the import
# allow-list happens to block _socket, i.e. it would not be an independent
# layer at all. Patch the C primitive too so the second layer stands on its own.
try:
    import _socket as _raw_socket

    _raw_socket.socket = _blocked("_socket.socket")
    if hasattr(_raw_socket, "socketpair"):
        _raw_socket.socketpair = _blocked("_socket.socketpair")
except Exception:
    pass


def _within_workspace(path):
    try:
        resolved = os.path.realpath(path)
    except Exception:
        return False
    return resolved == _WORKSPACE or resolved.startswith(_WORKSPACE + os.sep)


def _path_text(path):
    try:
        candidate = os.fspath(path)
    except TypeError:
        return None
    if isinstance(candidate, bytes):
        candidate = candidate.decode("utf-8", "surrogateescape")
    return candidate if isinstance(candidate, str) else None


def _refuse_write(path):
    _record("fs_write:" + str(path))
    raise SovereignFilesystemBlocked(
        "Writing outside the sandbox workspace is disabled: " + str(path)
    )


def _guarded_open(file, mode="r", *args, **kwargs):
    # A write mode reaching outside the workspace is the concrete threat: the
    # audit log lives two directories above the workspace, and os/pathlib are
    # allow-listed, so unguarded `open('../../logs/audit.jsonl', 'w')` would let
    # generated code rewrite the very record that is meant to prove it ran.
    if not isinstance(file, int) and any(c in mode for c in ("w", "a", "x", "+")):
        text = _path_text(file)
        if text is not None and not _within_workspace(text):
            _refuse_write(text)
    return _REAL_OPEN(file, mode, *args, **kwargs)


_builtins.open = _guarded_open
_io.open = _guarded_open

_REAL_OS_OPEN = os.open


def _guarded_os_open(path, flags, *args, **kwargs):
    if flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_TRUNC):
        text = _path_text(path)
        if text is not None and not _within_workspace(text):
            _refuse_write(text)
    return _REAL_OS_OPEN(path, flags, *args, **kwargs)


os.open = _guarded_os_open


def _guard_unary(name):
    original = getattr(os, name, None)
    if original is None:
        return

    def _wrapped(path, *args, **kwargs):
        text = _path_text(path)
        if text is not None and not _within_workspace(text):
            _refuse_write(text)
        return original(path, *args, **kwargs)

    setattr(os, name, _wrapped)


def _guard_rename(name):
    original = getattr(os, name, None)
    if original is None:
        return

    def _wrapped(src, dst, *args, **kwargs):
        for candidate in (src, dst):
            text = _path_text(candidate)
            if text is not None and not _within_workspace(text):
                _refuse_write(text)
        return original(src, dst, *args, **kwargs)

    setattr(os, name, _wrapped)


for _name in ("remove", "unlink", "rmdir", "mkdir", "makedirs"):
    _guard_unary(_name)
for _name in ("rename", "replace"):
    _guard_rename(_name)
'''


@dataclass
class StaticValidation:
    passed: bool
    violations: list[str]
    imports: list[str]


@dataclass
class LimitsApplied:
    """The limits that were actually put in force for one run.

    ``mechanism`` is what enforced them, not what was requested: ``none`` means
    nothing was applied and no execution happened. Every other field is the
    value that the backend was told to enforce; whether it *held* is reported
    separately, from measurement, in :class:`ExecutionAccounting`.
    """

    mechanism: str  # "windows_job_object" | "posix_rlimit" | "none"
    memory_mb: int | None = None
    cpu_seconds: int | None = None
    active_process_limit: int | None = None
    wall_timeout_seconds: float | None = None
    kill_on_close: bool = False
    die_on_unhandled_exception: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "mechanism": self.mechanism,
            "memory_mb": self.memory_mb,
            "cpu_seconds": self.cpu_seconds,
            "active_process_limit": self.active_process_limit,
            "wall_timeout_seconds": self.wall_timeout_seconds,
            "kill_on_close": self.kill_on_close,
            "die_on_unhandled_exception": self.die_on_unhandled_exception,
        }


@dataclass
class ExecutionAccounting:
    """Measured facts about what a run consumed and why it ended.

    Every figure here is read back from the OS after the run, or left ``None``
    where this backend cannot measure it. ``None`` is the absence of a reading,
    never zero: the POSIX backend does not report peak memory here, and saying
    ``0`` would be a claim it never made.
    """

    assessable: bool
    peak_memory_bytes: int | None = None
    cpu_user_seconds: float | None = None
    cpu_kernel_seconds: float | None = None
    termination_reason: str | None = None
    output_truncated: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "assessable": self.assessable,
            "peak_memory_bytes": self.peak_memory_bytes,
            "cpu_user_seconds": self.cpu_user_seconds,
            "cpu_kernel_seconds": self.cpu_kernel_seconds,
            "termination_reason": self.termination_reason,
            "output_truncated": self.output_truncated,
        }


@dataclass
class ExecutionOutcome:
    """A SandboxResult plus the measured accounting the schema does not carry."""

    result: SandboxResult
    limits: LimitsApplied
    accounting: ExecutionAccounting


class StaticValidator:
    """AST-level pre-execution review of generated code."""

    def __init__(self) -> None:
        sandbox = get_config().settings.sandbox
        self.denied_imports = {str(name) for name in sandbox.get("denied_imports", [])}
        self.denied_calls = {str(name) for name in sandbox.get("denied_calls", [])}
        self.denied_attributes = {str(name) for name in sandbox.get("denied_attributes", [])}
        self.allowed_imports = {str(name) for name in sandbox.get("allowed_imports", [])}

    def validate(self, source: str) -> StaticValidation:
        violations: list[str] = []
        imports: list[str] = []

        try:
            tree = ast.parse(source)
        except SyntaxError as exc:
            return StaticValidation(
                passed=False,
                violations=[f"syntax error at line {exc.lineno}: {exc.msg}"],
                imports=[],
            )

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    root = alias.name.split(".")[0]
                    imports.append(alias.name)
                    if root in self.denied_imports:
                        violations.append(
                            f"line {node.lineno}: import of denied module '{alias.name}'"
                        )
                    elif self.allowed_imports and root not in self.allowed_imports:
                        violations.append(
                            f"line {node.lineno}: module '{alias.name}' is not on the "
                            "sandbox allow-list"
                        )
            elif isinstance(node, ast.ImportFrom):
                root = (node.module or "").split(".")[0]
                imports.append(node.module or "")
                if root in self.denied_imports:
                    violations.append(
                        f"line {node.lineno}: import from denied module '{node.module}'"
                    )
                elif root and self.allowed_imports and root not in self.allowed_imports:
                    violations.append(
                        f"line {node.lineno}: module '{node.module}' is not on the "
                        "sandbox allow-list"
                    )
            elif isinstance(node, ast.Call):
                target = node.func
                name = None
                if isinstance(target, ast.Name):
                    name = target.id
                elif isinstance(target, ast.Attribute):
                    name = target.attr
                if name in self.denied_calls:
                    violations.append(f"line {node.lineno}: denied call '{name}()'")
                # os.system / os.popen / os.exec* are process escapes.
                if (
                    isinstance(target, ast.Attribute)
                    and isinstance(target.value, ast.Name)
                    and target.value.id == "os"
                    and (
                        target.attr in {"system", "popen", "spawn", "fork", "kill"}
                        or target.attr.startswith("exec")
                    )
                ):
                    violations.append(
                        f"line {node.lineno}: process escape 'os.{target.attr}()'"
                    )
            elif isinstance(node, ast.Attribute):
                if node.attr in self.denied_attributes:
                    violations.append(
                        f"line {node.lineno}: access to interpreter internal "
                        f"'{node.attr}'"
                    )

        return StaticValidation(
            passed=not violations, violations=violations, imports=sorted(set(imports))
        )


class Sandbox:
    """Resource-limited, network-denied execution of generated Python."""

    def __init__(self) -> None:
        self.config = get_config()
        self.validator = StaticValidator()

    @property
    def _settings(self) -> dict[str, Any]:
        return self.config.settings.sandbox

    def _enforcement_backend(self) -> str | None:
        """Which limit backend is actually usable here, or None.

        ``posix_rlimit`` where the POSIX ``resource`` module is present;
        ``windows_job_object`` where a Job Object has been *probed* to enforce a
        cap on this host; otherwise None, and execution is refused. The probe
        result is cached, so a host is only exercised once.
        """
        if not RESOURCE_LIMITS_AVAILABLE:
            return None
        if _POSIX_RLIMITS:
            return "posix_rlimit"
        if _WINDOWS_JOB_CAPABLE:
            ok, _ = probe_windows_job_limits()
            return "windows_job_object" if ok else None
        return None

    @property
    def runtime(self) -> str:
        """What this host actually does, not what the config file claims.

        `runtime` is reported through /health into the interface, and
        config/app.yaml offers a `docker` value that no code in this package
        reads - nothing here starts a container. Returning the configured
        string unchecked would let the API tell an operator "docker" while
        generated code ran as an ordinary same-user subprocess. The configured
        value is therefore only honoured where it matches what is implemented,
        and the enforcement backend named is the one that was probed to work.
        """
        configured = str(self._settings.get("runtime", "subprocess"))
        if configured != "subprocess":
            return f"subprocess (config requests {configured!r}, not implemented)"
        backend = self._enforcement_backend()
        if backend == "posix_rlimit":
            return "subprocess"
        if backend == "windows_job_object":
            return "subprocess (Windows Job Object)"
        return "subprocess (unlimited: no enforced resource limits on this host)"

    @property
    def execution_allowed(self) -> tuple[bool, str]:
        """Whether generated code may run here at all, and why not if it may not.

        Refusing is the honest failure. Running the code anyway with no CPU,
        memory, file-size or process cap, while the interface continues to
        describe a sandbox, would be the worst outcome available: the operator
        would believe a control existed that did not.
        """
        if not self.enabled:
            return False, "The sandbox is disabled in configuration."
        if not RESOURCE_LIMITS_AVAILABLE:
            return False, (
                "This host cannot apply resource limits to a child process, so "
                "generated code would run unbounded. Execution is refused "
                "rather than run outside the limits the sandbox is supposed to "
                "impose. Run the backend under WSL2/Linux - see "
                "docs/RUNTIME-ENVIRONMENT.md. Every other stage works here."
            )
        if _POSIX_RLIMITS:
            return True, ""
        if _WINDOWS_JOB_CAPABLE:
            ok, reason = probe_windows_job_limits()
            if ok:
                return True, ""
            return False, (
                "This Windows host exposes the Job Object API but it did not "
                "enforce a memory cap when probed, so generated code would run "
                "unbounded. Execution is refused. " + reason
            )
        return False, (
            "No resource-limit backend is usable on this host; execution is "
            "refused rather than run unbounded. See docs/RUNTIME-ENVIRONMENT.md."
        )

    @property
    def enabled(self) -> bool:
        return bool(self._settings.get("enabled", True))

    def _workspace_root(self) -> Path:
        root = self.config.settings.path("workspaces")
        root.mkdir(parents=True, exist_ok=True)
        return root

    def _preexec(self) -> Any:
        """Return a child-process hook applying POSIX resource limits.

        Returns ``None`` where the platform has no POSIX resource limits to
        apply - including Windows, which is confined by a Job Object in the
        parent instead, and where ``preexec_fn`` does not exist. Callers must
        not treat ``None`` as "limits applied".

        RLIMIT_NPROC is counted **per user**, not per process, so a small
        absolute cap makes every fork fail the moment the operator's own
        session already exceeds it. The cap is therefore expressed as headroom
        above the processes the user is currently running: runaway forking is
        still contained, ordinary work is not strangled.
        """
        if not _POSIX_RLIMITS:
            return None

        cpu_seconds = int(self._settings.get("max_cpu_seconds", 30))
        memory_bytes = int(self._settings.get("max_memory_mb", 1024)) * 1024 * 1024
        file_bytes = int(self._settings.get("max_written_file_bytes", 26214400))
        headroom = int(self._settings.get("process_headroom", 64))

        try:
            current = len(os.listdir("/proc")) if os.path.isdir("/proc") else 0
        except OSError:
            current = 0
        soft_cap = max(headroom, current + headroom)

        # Never raise the ceiling the host already imposes.
        try:
            _, hard_nproc = resource.getrlimit(resource.RLIMIT_NPROC)
        except (ValueError, OSError):
            hard_nproc = resource.RLIM_INFINITY
        if hard_nproc != resource.RLIM_INFINITY:
            soft_cap = min(soft_cap, hard_nproc)

        def apply_limits() -> None:  # pragma: no cover - runs in the child
            resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
            resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
            resource.setrlimit(resource.RLIMIT_FSIZE, (file_bytes, file_bytes))
            resource.setrlimit(resource.RLIMIT_NPROC, (soft_cap, soft_cap))
            resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
            os.setsid()

        return apply_limits

    def _environment(self, workspace: Path) -> dict[str, str]:
        """A scrubbed environment: no host credentials, no proxy, no network hints."""
        env = {
            "PYTHONPATH": str(workspace),
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONUNBUFFERED": "1",
            "PYTHONNOUSERSITE": "1",
            "LANG": "C.UTF-8",
            "SOVEREIGN_SANDBOX": "1",
            "SOVEREIGN_NETWORK_ATTEMPT_LOG": str(workspace / "network_attempts.log"),
            # Numerical libraries default to one thread per core, which both
            # starves the local models of CPU and multiplies the process count.
            # Analysis in the sandbox is small; single-threaded is correct here
            # and makes results deterministic.
            "OPENBLAS_NUM_THREADS": "1",
            "OMP_NUM_THREADS": "1",
            "MKL_NUM_THREADS": "1",
            "NUMEXPR_NUM_THREADS": "1",
            "VECLIB_MAXIMUM_THREADS": "1",
            # Keep any library cache (matplotlib, fontconfig) inside the
            # workspace, which is also what the filesystem guard permits.
            "HOME": str(workspace),
            "TMPDIR": str(workspace),
            "TEMP": str(workspace),
            "TMP": str(workspace),
            "MPLCONFIGDIR": str(workspace),
            # Explicitly blank any proxy the host may define.
            "http_proxy": "",
            "https_proxy": "",
            "no_proxy": "*",
        }
        if _IS_WINDOWS:
            # A native Windows child needs System32 on PATH to resolve core DLLs
            # (and numpy ships its own DLLs alongside its package). This is not a
            # path to network tools; it is what lets the interpreter start.
            system_root = os.environ.get("SystemRoot", r"C:\Windows")
            env["SystemRoot"] = system_root
            env["PATH"] = os.path.join(system_root, "System32")
        else:
            env["PATH"] = "/usr/bin:/bin"
        return env

    # -- execution ---------------------------------------------------------
    def execute(
        self,
        code: str,
        *,
        input_files: dict[str, Path] | None = None,
        keep_workspace: bool = True,
    ) -> SandboxResult:
        """Statically validate, then run ``code`` under resource limits."""
        return self.execute_detailed(
            code, input_files=input_files, keep_workspace=keep_workspace
        ).result

    def execute_detailed(
        self,
        code: str,
        *,
        input_files: dict[str, Path] | None = None,
        keep_workspace: bool = True,
        validate: bool = True,
    ) -> ExecutionOutcome:
        """Run ``code`` and return the result plus measured accounting.

        ``execute`` returns only the :class:`SandboxResult`, which is the frozen
        schema every other caller consumes. The interactive endpoint and the
        self-test want the accounting the schema does not carry - peak memory,
        CPU time, the applied limits, the termination reason - so they call
        this and read :class:`ExecutionOutcome`.
        """
        memory_limit = int(self._settings.get("max_memory_mb", 1024))

        allowed, refusal = self.execution_allowed
        if not allowed:
            return ExecutionOutcome(
                result=SandboxResult(
                    ok=False,
                    exit_code=None,
                    stdout="",
                    stderr=refusal,
                    duration_ms=0,
                    memory_limit_mb=memory_limit,
                    static_validation_passed=False,
                    static_violations=["execution refused: " + refusal.split(".")[0]],
                ),
                limits=LimitsApplied(mechanism="none"),
                accounting=ExecutionAccounting(assessable=False),
            )

        if validate:
            validation = self.validator.validate(code)
            if not validation.passed:
                return ExecutionOutcome(
                    result=SandboxResult(
                        ok=False,
                        exit_code=None,
                        stdout="",
                        stderr=(
                            "Static security validation rejected this code before execution:\n"
                            + "\n".join(f"  - {item}" for item in validation.violations)
                        ),
                        duration_ms=0,
                        memory_limit_mb=memory_limit,
                        static_validation_passed=False,
                        static_violations=validation.violations,
                    ),
                    limits=LimitsApplied(mechanism="none"),
                    accounting=ExecutionAccounting(assessable=False),
                )

        workspace = self._workspace_root() / f"run-{uuid.uuid4().hex[:12]}"
        workspace.mkdir(parents=True, exist_ok=True)
        try:
            for name, source in (input_files or {}).items():
                target = workspace / Path(name).name
                if source.exists():
                    shutil.copy2(source, target)

            if _POSIX_RLIMITS:
                return self._run_posix(code, workspace, memory_limit)
            return self._run_windows(code, workspace, memory_limit)
        finally:
            if not keep_workspace:
                shutil.rmtree(workspace, ignore_errors=True)

    def _run_posix(
        self, code: str, workspace: Path, memory_limit: int
    ) -> ExecutionOutcome:
        """The POSIX path, unchanged: rlimits applied in a preexec_fn.

        Kept byte-for-byte behaviourally as it was before the Windows backend
        existed. On this platform the limits are applied in the child between
        fork and exec, so there is no assignment race to close and no sentinel.
        """
        (workspace / "sitecustomize.py").write_text(SITECUSTOMIZE, encoding="utf-8")
        script = workspace / "program.py"
        script.write_text(code, encoding="utf-8")

        before = {path.name for path in workspace.iterdir()}
        timeout = float(self._settings.get("timeout_seconds", 45))
        max_output = int(self._settings.get("max_output_bytes", 262144))

        started = time.perf_counter()
        timed_out = False
        try:
            # No -I/-S: those suppress site.py, which is what loads our
            # sitecustomize runtime guard from the workspace PYTHONPATH.
            # Host environment leakage is prevented by the scrubbed env
            # dict instead, which is stronger than -E for our purposes.
            completed = subprocess.run(
                [sys.executable, str(script)],
                cwd=str(workspace),
                env=self._environment(workspace),
                capture_output=True,
                text=True,
                timeout=timeout,
                preexec_fn=self._preexec(),
                check=False,
            )
            stdout, stderr = completed.stdout, completed.stderr
            exit_code: int | None = completed.returncode
        except subprocess.TimeoutExpired as exc:
            timed_out = True
            stdout = exc.stdout.decode() if isinstance(exc.stdout, bytes) else (exc.stdout or "")
            stderr = (
                (exc.stderr.decode() if isinstance(exc.stderr, bytes) else (exc.stderr or ""))
                + f"\nExecution exceeded the {timeout:g}s sandbox timeout and was terminated."
            )
            exit_code = None

        duration_ms = int((time.perf_counter() - started) * 1000)

        termination_reason: str | None = None
        if timed_out:
            termination_reason = "wall_clock_timeout"
        # A negative return code means the kernel killed the child, which
        # is how a resource limit breach surfaces. Say which one.
        if exit_code is not None and exit_code < 0:
            signal_number = -exit_code
            signal_names = {
                9: "SIGKILL (memory limit)",
                11: "SIGSEGV",
                24: "SIGXCPU (CPU time limit)",
                25: "SIGXFSZ (file size limit)",
            }
            stderr += (
                f"\nSandbox terminated the process with signal {signal_number}: "
                f"{signal_names.get(signal_number, 'resource limit exceeded')}."
            )
            termination_reason = {
                9: "memory_limit_exceeded",
                24: "cpu_time_limit_exceeded",
                25: "file_size_limit_exceeded",
            }.get(signal_number, "terminated_by_signal")
        elif exit_code not in (0, None):
            termination_reason = "nonzero_exit"

        network_attempts = self._count_network_attempts(workspace)
        generated = self._generated_files(workspace, before)

        result = SandboxResult(
            ok=(exit_code == 0 and not timed_out),
            exit_code=exit_code,
            stdout=stdout[:max_output],
            stderr=stderr[:max_output],
            duration_ms=duration_ms,
            timed_out=timed_out,
            memory_limit_mb=memory_limit,
            static_validation_passed=True,
            static_violations=[],
            generated_files=generated,
            network_attempts_blocked=network_attempts,
        )
        limits = LimitsApplied(
            mechanism="posix_rlimit",
            memory_mb=memory_limit,
            cpu_seconds=int(self._settings.get("max_cpu_seconds", 30)),
            wall_timeout_seconds=timeout,
        )
        accounting = ExecutionAccounting(
            assessable=True,
            termination_reason=termination_reason,
        )
        return ExecutionOutcome(result=result, limits=limits, accounting=accounting)

    def _run_windows(
        self, code: str, workspace: Path, memory_limit: int
    ) -> ExecutionOutcome:
        """The Windows path: a Job Object confines the child, measured on exit."""
        cpu_seconds = int(self._settings.get("max_cpu_seconds", 30))
        active_processes = int(self._settings.get("max_active_processes", 8))
        timeout = float(self._settings.get("timeout_seconds", 45))
        max_output = int(self._settings.get("max_output_bytes", 262144))

        before = {path.name for path in workspace.iterdir()}
        started = time.perf_counter()
        measurement = _win_run(
            code,
            memory_bytes=memory_limit * 1024 * 1024,
            cpu_seconds=cpu_seconds,
            active_process_limit=active_processes,
            wall_timeout=timeout,
            workspace=workspace,
            env=self._environment(workspace),
            max_output_bytes=max_output,
            install_guard=True,
        )
        duration_ms = int((time.perf_counter() - started) * 1000)

        stderr = measurement.stderr
        if measurement.timed_out:
            stderr += (
                f"\nExecution exceeded the {timeout:g}s sandbox timeout and the job "
                "was terminated."
            )

        termination_reason = self._classify_windows(measurement, memory_limit, cpu_seconds)
        note = self._windows_termination_note(termination_reason, measurement, memory_limit, cpu_seconds)
        if note:
            stderr += "\n" + note

        network_attempts = self._count_network_attempts(workspace)
        generated = self._generated_files(
            workspace, before | {"program.py", "_runner.py", "sitecustomize.py"}
        )

        result = SandboxResult(
            ok=(measurement.exit_code == 0 and not measurement.timed_out),
            exit_code=measurement.exit_code,
            stdout=measurement.stdout[:max_output],
            stderr=stderr[:max_output],
            duration_ms=duration_ms,
            timed_out=measurement.timed_out,
            memory_limit_mb=memory_limit,
            static_validation_passed=True,
            static_violations=[],
            generated_files=generated,
            network_attempts_blocked=network_attempts,
        )
        limits = LimitsApplied(
            mechanism="windows_job_object",
            memory_mb=memory_limit,
            cpu_seconds=cpu_seconds,
            active_process_limit=max(2, active_processes),
            wall_timeout_seconds=timeout,
            kill_on_close=True,
            die_on_unhandled_exception=True,
        )
        accounting = ExecutionAccounting(
            assessable=measurement.assigned,
            peak_memory_bytes=measurement.peak_memory_bytes,
            cpu_user_seconds=measurement.user_time_seconds,
            cpu_kernel_seconds=measurement.kernel_time_seconds,
            termination_reason=termination_reason,
            output_truncated=measurement.output_truncated,
        )
        return ExecutionOutcome(result=result, limits=limits, accounting=accounting)

    @staticmethod
    def _classify_windows(
        measurement: _WindowsRunMeasurement, memory_limit_mb: int, cpu_seconds: int
    ) -> str | None:
        """Name why a Windows run ended, from measured signals only."""
        if measurement.timed_out:
            return "wall_clock_timeout"
        exit_code = measurement.exit_code
        if exit_code == 0:
            return None
        if exit_code is None:
            return "terminated"
        # STATUS_QUOTA_EXCEEDED, or a job-terminated process with user time at
        # or beyond a meaningful fraction of the cap, is the CPU-time signal.
        if exit_code == STATUS_QUOTA_EXCEEDED or (
            (measurement.terminated_processes or 0) >= 1
            and (measurement.user_time_seconds or 0) >= cpu_seconds * 0.5
        ):
            return "cpu_time_limit_exceeded"
        lowered = measurement.stderr.lower()
        if any(
            token in lowered
            for token in ("memoryerror", "not enough quota", "cannot allocate", "unable to allocate")
        ):
            return "memory_limit_exceeded"
        if "unable to create process" in lowered or "sovereignfilesystemblocked" in lowered:
            # A spawn refused by the active-process cap, or a write refused by
            # the workspace guard, surfaces as an ordinary non-zero exit; the
            # cause is in stderr and is reported there, not as a job kill.
            return "nonzero_exit"
        return "nonzero_exit"

    @staticmethod
    def _windows_termination_note(
        reason: str | None,
        measurement: _WindowsRunMeasurement,
        memory_limit_mb: int,
        cpu_seconds: int,
    ) -> str:
        peak_mb = (
            f"{measurement.peak_memory_bytes / (1024 * 1024):.1f} MB"
            if measurement.peak_memory_bytes is not None
            else "unmeasured"
        )
        user_s = (
            f"{measurement.user_time_seconds:.2f}s"
            if measurement.user_time_seconds is not None
            else "unmeasured"
        )
        if reason == "memory_limit_exceeded":
            return (
                f"Sandbox refused a memory commit beyond the {memory_limit_mb} MB "
                f"per-process cap (peak {peak_mb})."
            )
        if reason == "cpu_time_limit_exceeded":
            return (
                f"Sandbox terminated the process for exceeding the {cpu_seconds}s "
                f"CPU-time limit (CPU used {user_s}). The OS checks the job CPU "
                "limit periodically, so termination follows the limit by a few "
                "seconds rather than instantly."
            )
        return ""

    @staticmethod
    def _count_network_attempts(workspace: Path) -> int:
        attempts_file = workspace / "network_attempts.log"
        if not attempts_file.exists():
            return 0
        try:
            return len(
                [line for line in attempts_file.read_text().splitlines() if line.strip()]
            )
        except OSError:
            return 0

    @staticmethod
    def _generated_files(workspace: Path, before: set[str]) -> list[str]:
        skip = before | {"network_attempts.log"}
        return sorted(
            path.name for path in workspace.iterdir() if path.name not in skip
        )

    def workspace_for(self, run_directory: str) -> Path:
        return self._workspace_root() / run_directory

    # -- self-test ---------------------------------------------------------
    def self_test_report(self) -> dict[str, Any]:
        """Run the containment tests and report each one individually.

        Presented on the Security page, so the result has to be what actually
        happened on this host just now - every line here comes from a payload
        that was really submitted to the sandbox.

        On a host that cannot execute, no payload is submitted and no
        containment claim is made either way. That is the third outcome, and it
        is the true one: a refusal is not a pass.
        """
        started = time.perf_counter()

        allowed, refusal = self.execution_allowed
        if not allowed:
            return {
                "checks": [],
                "passed": 0,
                "total": 0,
                "assessable": False,
                "overall": (
                    "Not assessable on this host. The sandbox refuses to execute, "
                    "so no payload was submitted and no containment claim is made "
                    "either way."
                ),
                "reason": refusal,
                "all_passed": False,
                "backend": "none",
                "duration_ms": int((time.perf_counter() - started) * 1000),
                "ran_at": datetime.now(timezone.utc).isoformat(),
            }

        backend = self._enforcement_backend() or "unknown"
        checks: list[dict[str, Any]] = []
        checks.extend(self._static_and_runtime_checks())
        checks.extend(self._limit_checks())

        passed = sum(1 for check in checks if check["passed"])
        return {
            "checks": checks,
            "passed": passed,
            "total": len(checks),
            "assessable": True,
            "backend": backend,
            "overall": (
                f"{passed} of {len(checks)} containment checks held on this host"
                if passed == len(checks)
                else f"CONTAINMENT FAILURE - {len(checks) - passed} check(s) did not hold"
            ),
            "all_passed": passed == len(checks),
            "duration_ms": int((time.perf_counter() - started) * 1000),
            "ran_at": datetime.now(timezone.utc).isoformat(),
        }

    def _static_and_runtime_checks(self) -> list[dict[str, Any]]:
        checks: list[dict[str, Any]] = []

        # 1. The static validator must refuse networking before execution.
        static_case = self.execute("import socket\nsocket.socket()")
        checks.append(
            {
                "name": "Static import review",
                "target": "import socket; socket.socket()",
                "passed": not static_case.static_validation_passed,
                "detail": (
                    static_case.static_violations[0]
                    if static_case.static_violations
                    else "code was NOT rejected before execution"
                ),
            }
        )

        # 2. With the validator bypassed, the runtime must still refuse - and
        # not only for the Python socket wrapper, but for the _socket C
        # primitive it is built on, or the second layer is not independent.
        runtime_case = self._execute_unvalidated(
            "import socket, _socket\n"
            "for factory in (socket.socket, _socket.socket):\n"
            "    try:\n"
            "        factory()\n"
            "        print('NETWORK_NOT_BLOCKED')\n"
            "    except Exception as exc:\n"
            "        print('BLOCKED:', type(exc).__name__)\n"
        )
        blocked = "NETWORK_NOT_BLOCKED" not in runtime_case.stdout
        checks.append(
            {
                "name": "Runtime socket denial",
                "target": "socket.socket() and _socket.socket() with the static check bypassed",
                "passed": blocked,
                "detail": (
                    runtime_case.stdout.strip().splitlines()[-1]
                    if runtime_case.stdout.strip()
                    else "no output"
                ),
            }
        )

        # 3. Process escapes must be refused before execution.
        escape_case = self.execute("import os\nos.system('id')")
        checks.append(
            {
                "name": "Process escape review",
                "target": "os.system('id')",
                "passed": not escape_case.static_validation_passed,
                "detail": (
                    escape_case.static_violations[0]
                    if escape_case.static_violations
                    else "escape was NOT rejected"
                ),
            }
        )

        # 4. A write outside the workspace must be refused at runtime.
        fs_case = self._execute_unvalidated(
            "try:\n"
            "    open('../../escape_probe.txt', 'w').write('x')\n"
            "    print('WROTE_OUTSIDE')\n"
            "except Exception as exc:\n"
            "    print('BLOCKED:', type(exc).__name__)\n"
        )
        fs_blocked = "WROTE_OUTSIDE" not in fs_case.stdout
        checks.append(
            {
                "name": "Filesystem write confinement",
                "target": "open('../../escape_probe.txt', 'w') with the static check bypassed",
                "passed": fs_blocked,
                "detail": (
                    fs_case.stdout.strip().splitlines()[-1]
                    if fs_case.stdout.strip()
                    else "no output"
                ),
            }
        )

        # 5. Ordinary work must still run, or the sandbox is useless.
        working_case = self.execute("print(sum(range(1000)))")
        checks.append(
            {
                "name": "Permitted work still runs",
                "target": "print(sum(range(1000)))",
                "passed": working_case.ok and working_case.stdout.strip() == "499500",
                "detail": f"exit {working_case.exit_code} in {working_case.duration_ms}ms",
            }
        )
        return checks

    def _limit_checks(self) -> list[dict[str, Any]]:
        """Prove the resource caps actually hold, with small, host-safe payloads.

        These are only meaningful where a limit backend runs the code. On the
        POSIX path the caps are enforced by rlimits set for the whole run, so
        the small per-check caps used on Windows are approximated by the
        configured limits and the wall clock; the check still reports what
        actually happened.
        """
        if _POSIX_RLIMITS:
            return self._limit_checks_posix()
        return self._limit_checks_windows()

    def _limit_checks_windows(self) -> list[dict[str, Any]]:
        checks: list[dict[str, Any]] = []
        env_ws = self._workspace_root()
        max_output = 8192

        # Memory: a 200 MB allocation under a 128 MB cap. Small on purpose so
        # the test cannot itself starve a host shared by other work; the cap
        # refuses the commit, so the child never actually holds 200 MB.
        with tempfile.TemporaryDirectory(dir=str(env_ws), prefix="selftest-mem-") as tmp:
            ws = Path(tmp)
            mem = _win_run(
                "b = bytearray(200 * 1024 * 1024)\n"
                "for i in range(0, len(b), 4096):\n    b[i] = 1\n"
                "print('ALLOCATED')\n",
                memory_bytes=128 * 1024 * 1024,
                cpu_seconds=15,
                active_process_limit=4,
                wall_timeout=20,
                workspace=ws,
                env=self._environment(ws),
                max_output_bytes=max_output,
                install_guard=False,
            )
        peak_mb = mem.peak_memory_bytes / (1024 * 1024) if mem.peak_memory_bytes is not None else None
        mem_held = (
            mem.assigned
            and mem.exit_code not in (0, None)
            and "ALLOCATED" not in mem.stdout
            and (peak_mb is None or peak_mb <= 160)
        )
        checks.append(
            {
                "name": "Memory limit terminates a bomb",
                "target": "allocate 200 MB under a 128 MB Job Object cap",
                "passed": mem_held,
                "detail": (
                    f"commit refused at the cap; exit {mem.exit_code}, peak "
                    f"{peak_mb:.1f} MB"
                    if mem_held and peak_mb is not None
                    else f"exit {mem.exit_code}, peak {peak_mb}"
                ),
            }
        )

        # CPU: an infinite loop under a 1s user-time cap. The OS checks the job
        # CPU limit periodically, so termination follows within a few seconds.
        with tempfile.TemporaryDirectory(dir=str(env_ws), prefix="selftest-cpu-") as tmp:
            ws = Path(tmp)
            cpu = _win_run(
                "x = 0\nwhile True:\n    x += 1\n",
                memory_bytes=256 * 1024 * 1024,
                cpu_seconds=1,
                active_process_limit=4,
                wall_timeout=20,
                workspace=ws,
                env=self._environment(ws),
                max_output_bytes=max_output,
                install_guard=False,
            )
        cpu_held = cpu.assigned and (
            cpu.exit_code == STATUS_QUOTA_EXCEEDED
            or (cpu.terminated_processes or 0) >= 1
            or cpu.timed_out
        )
        checks.append(
            {
                "name": "CPU-time limit terminates a spin",
                "target": "infinite loop under a 1s CPU-time cap",
                "passed": cpu_held,
                "detail": (
                    f"terminated after {cpu.user_time_seconds:.2f}s CPU"
                    if cpu.user_time_seconds is not None
                    else f"exit {cpu.exit_code}, timed_out={cpu.timed_out}"
                ),
            }
        )

        # Processes: try to spawn 10 children under an active-process cap; the
        # cap must refuse most of them. The static validator already blocks
        # subprocess for ordinary runs, so this deliberately bypasses it to
        # exercise the OS cap directly.
        with tempfile.TemporaryDirectory(dir=str(env_ws), prefix="selftest-proc-") as tmp:
            ws = Path(tmp)
            spawn = _win_run(
                "import subprocess, sys\n"
                "spawned = 0\n"
                "kids = []\n"
                "try:\n"
                "    while spawned < 10:\n"
                "        kids.append(subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(1)']))\n"
                "        spawned += 1\n"
                "    print('SPAWNED_ALL', spawned)\n"
                "except Exception as exc:\n"
                "    print('SPAWN_CAPPED_AT', spawned, type(exc).__name__)\n",
                memory_bytes=256 * 1024 * 1024,
                cpu_seconds=15,
                active_process_limit=3,
                wall_timeout=20,
                workspace=ws,
                env=self._environment(ws),
                max_output_bytes=max_output,
                install_guard=False,
            )
        proc_capped = spawn.assigned and "SPAWNED_ALL" not in spawn.stdout
        checks.append(
            {
                "name": "Process spawning is capped",
                "target": "spawn 10 children under a 3-process Job Object cap",
                "passed": proc_capped,
                "detail": (
                    spawn.stdout.strip().splitlines()[-1]
                    if spawn.stdout.strip()
                    else f"exit {spawn.exit_code}"
                ),
            }
        )
        return checks

    def _limit_checks_posix(self) -> list[dict[str, Any]]:
        """CPU / memory / process caps on the POSIX backend, reported as measured."""
        checks: list[dict[str, Any]] = []

        cpu_case = self._execute_unvalidated("x = 0\nwhile True:\n    x += 1\n")
        checks.append(
            {
                "name": "CPU-time limit terminates a spin",
                "target": "infinite loop under the CPU rlimit / wall timeout",
                "passed": (not cpu_case.ok)
                and (cpu_case.timed_out or (cpu_case.exit_code or 0) != 0),
                "detail": f"exit {cpu_case.exit_code}, timed_out={cpu_case.timed_out}",
            }
        )

        mem_case = self._execute_unvalidated(
            "b = bytearray(1)\n"
            "chunk = bytearray(64 * 1024 * 1024)\n"
            "blocks = []\n"
            "try:\n"
            "    for _ in range(64):\n"
            "        blocks.append(bytearray(64 * 1024 * 1024))\n"
            "    print('ALLOCATED')\n"
            "except MemoryError:\n"
            "    print('BLOCKED: MemoryError')\n"
        )
        checks.append(
            {
                "name": "Memory limit terminates a bomb",
                "target": "grow past the address-space rlimit",
                "passed": "ALLOCATED" not in mem_case.stdout,
                "detail": (
                    mem_case.stdout.strip().splitlines()[-1]
                    if mem_case.stdout.strip()
                    else f"exit {mem_case.exit_code}"
                ),
            }
        )
        return checks

    def self_test(self) -> dict[str, Any]:
        """Adversarial check that both isolation layers actually hold.

        Layer 1 is exercised by submitting code the static validator must
        reject. Layer 2 is exercised by bypassing the validator deliberately
        and confirming the in-process runtime guard still blocks the network -
        including the ``_socket`` C primitive, so the check is of a genuinely
        independent second layer. Exposed through the health endpoint so the
        claim is demonstrable rather than asserted.
        """
        static_case = self.execute("import socket\nsocket.socket()")
        runtime_case = self._execute_unvalidated(
            "import socket, _socket\n"
            "for factory in (socket.socket, _socket.socket):\n"
            "    try:\n"
            "        factory()\n"
            "        print('NETWORK_NOT_BLOCKED')\n"
            "    except Exception as exc:\n"
            "        print('BLOCKED:', type(exc).__name__)\n"
        )
        return {
            "static_layer_blocks_network_import": not static_case.static_validation_passed,
            "static_violations": static_case.static_violations,
            "runtime_layer_blocks_socket": "NETWORK_NOT_BLOCKED" not in runtime_case.stdout,
            "runtime_output": (runtime_case.stdout or runtime_case.stderr).strip()[:200],
            "runtime_attempts_recorded": runtime_case.network_attempts_blocked,
        }

    def _execute_unvalidated(self, code: str) -> SandboxResult:
        """Run code skipping static validation, to test the runtime guard only.

        Never reachable from the agent or the API: the tool layer and the
        interactive endpoint always call :meth:`execute`, which validates.
        """
        return self.execute_detailed(code, validate=False).result

    def is_ready(self) -> bool:
        """Confirm the sandbox can actually start a child interpreter.

        Ready means "able to run code under its limits". A host with no
        enforced resource limits is not ready, however well a child process
        starts.
        """
        allowed, _ = self.execution_allowed
        if not allowed:
            return False
        try:
            with tempfile.TemporaryDirectory() as temporary:
                completed = subprocess.run(
                    [sys.executable, "-I", "-S", "-c", "print('ok')"],
                    cwd=temporary,
                    capture_output=True,
                    text=True,
                    timeout=15,
                    check=False,
                )
            return completed.returncode == 0
        except Exception:
            return False


_sandbox: Sandbox | None = None


def get_sandbox() -> Sandbox:
    global _sandbox
    if _sandbox is None:
        _sandbox = Sandbox()
    return _sandbox
