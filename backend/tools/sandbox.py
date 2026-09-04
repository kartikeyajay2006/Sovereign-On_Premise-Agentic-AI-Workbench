"""Secure code execution sandbox.

Two independent layers, in the order the reference architecture specifies:

1. **Static security validation** - the generated source is parsed to an AST
   and rejected before execution if it imports a denied module, calls a denied
   builtin, or reaches for interpreter internals. Denied and allowed lists live
   in ``config/app.yaml``.
2. **Sandbox admission** - execution happens in a throwaway working directory
   as a child process with POSIX resource limits (CPU seconds, address space,
   file size, process count), a wall-clock timeout, a scrubbed environment, and
   no network route.

Network denial is enforced twice: statically (no networking module may be
imported) and dynamically (a sitecustomize shim installed into the sandbox
makes ``socket.socket`` raise, and every attempt is counted and reported).

The sandbox limits blast radius; it does not decide whether code may run at
all. That decision belongs to the policy gateway.
"""

from __future__ import annotations

import ast
import os
import resource
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from backend.core.config import get_config
from backend.core.schemas import SandboxResult

# Written into every sandbox working directory. Neutralises network syscalls
# from inside the interpreter and records attempts for the execution report.
SITECUSTOMIZE = '''"""Sandbox runtime guard - installed by the workbench, not by user code.

Neutralises the *capability* to reach the network rather than blocking
imports. Trusted libraries such as pandas import networking modules lazily
during normal, entirely offline work, so refusing the import breaks them while
proving nothing. Refusing the syscall cannot be worked around: every path to
egress runs through these primitives, whoever imported them.

What user code may import is governed separately, before execution, by the
static validator.
"""
import os
import socket

_ATTEMPT_LOG = os.environ.get("SOVEREIGN_NETWORK_ATTEMPT_LOG", "network_attempts.log")


def _record(target):
    try:
        with open(_ATTEMPT_LOG, "a", encoding="utf-8") as handle:
            handle.write(str(target) + "\\n")
    except OSError:
        pass


class SovereignNetworkBlocked(RuntimeError):
    """Raised whenever sandboxed code attempts any network operation."""


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
'''


@dataclass
class StaticValidation:
    passed: bool
    violations: list[str]
    imports: list[str]


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

    @property
    def runtime(self) -> str:
        return str(self._settings.get("runtime", "subprocess"))

    @property
    def enabled(self) -> bool:
        return bool(self._settings.get("enabled", True))

    def _workspace_root(self) -> Path:
        root = self.config.settings.path("workspaces")
        root.mkdir(parents=True, exist_ok=True)
        return root

    def _preexec(self) -> Any:
        """Return a child-process hook applying POSIX resource limits.

        RLIMIT_NPROC is counted **per user**, not per process, so a small
        absolute cap makes every fork fail the moment the operator's own
        session already exceeds it. The cap is therefore expressed as headroom
        above the processes the user is currently running: runaway forking is
        still contained, ordinary work is not strangled.
        """
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
        return {
            "PATH": "/usr/bin:/bin",
            "HOME": str(workspace),
            "TMPDIR": str(workspace),
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
            # Explicitly blank any proxy the host may define.
            "http_proxy": "",
            "https_proxy": "",
            "no_proxy": "*",
        }

    def execute(
        self,
        code: str,
        *,
        input_files: dict[str, Path] | None = None,
        keep_workspace: bool = True,
    ) -> SandboxResult:
        """Statically validate, then run ``code`` under resource limits."""
        memory_limit = int(self._settings.get("max_memory_mb", 1024))

        if not self.enabled:
            return SandboxResult(
                ok=False,
                exit_code=None,
                stdout="",
                stderr="Sandbox is disabled by configuration; execution refused.",
                duration_ms=0,
                memory_limit_mb=memory_limit,
                static_validation_passed=False,
                static_violations=["sandbox disabled"],
            )

        validation = self.validator.validate(code)
        if not validation.passed:
            return SandboxResult(
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
            )

        workspace = self._workspace_root() / f"run-{uuid.uuid4().hex[:12]}"
        workspace.mkdir(parents=True, exist_ok=True)
        try:
            (workspace / "sitecustomize.py").write_text(SITECUSTOMIZE, encoding="utf-8")
            script = workspace / "program.py"
            script.write_text(code, encoding="utf-8")

            for name, source in (input_files or {}).items():
                target = workspace / Path(name).name
                if source.exists():
                    shutil.copy2(source, target)

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

            attempts_file = workspace / "network_attempts.log"
            network_attempts = 0
            if attempts_file.exists():
                network_attempts = len(
                    [line for line in attempts_file.read_text().splitlines() if line.strip()]
                )

            generated = sorted(
                path.name
                for path in workspace.iterdir()
                if path.name not in before and path.name != "network_attempts.log"
            )

            return SandboxResult(
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
        finally:
            if not keep_workspace:
                shutil.rmtree(workspace, ignore_errors=True)

    def workspace_for(self, run_directory: str) -> Path:
        return self._workspace_root() / run_directory

    def self_test_report(self) -> dict[str, Any]:
        """Run the containment tests and report each one individually.

        Presented on the Security page, so the result has to be what actually
        happened on this host just now — every line here comes from a payload
        that was really submitted to the sandbox.
        """
        started = time.perf_counter()
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

        # 2. With the validator bypassed, the runtime must still refuse.
        runtime_case = self._execute_unvalidated(
            "import socket\n"
            "try:\n"
            "    socket.socket()\n"
            "    print('NETWORK_NOT_BLOCKED')\n"
            "except Exception as exc:\n"
            "    print('BLOCKED:', type(exc).__name__)\n"
        )
        blocked = "NETWORK_NOT_BLOCKED" not in runtime_case.stdout
        checks.append(
            {
                "name": "Runtime socket denial",
                "target": "socket.socket() with the static check bypassed",
                "passed": blocked,
                "detail": (
                    runtime_case.stdout.strip().splitlines()[-1]
                    if runtime_case.stdout.strip()
                    else "no output"
                ),
            }
        )

        # 3. Process escapes must be refused.
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

        # 4. Ordinary work must still run, or the sandbox is useless.
        working_case = self.execute("print(sum(range(1000)))")
        checks.append(
            {
                "name": "Permitted work still runs",
                "target": "print(sum(range(1000)))",
                "passed": working_case.ok and working_case.stdout.strip() == "499500",
                "detail": (
                    f"exit {working_case.exit_code} in {working_case.duration_ms}ms"
                ),
            }
        )

        passed = sum(1 for check in checks if check["passed"])
        return {
            "checks": checks,
            "passed": passed,
            "total": len(checks),
            "overall": (
                f"{passed} of {len(checks)} containment checks held on this host"
                if passed == len(checks)
                else f"CONTAINMENT FAILURE — {len(checks) - passed} check(s) did not hold"
            ),
            "all_passed": passed == len(checks),
            "duration_ms": int((time.perf_counter() - started) * 1000),
            "ran_at": datetime.now(timezone.utc).isoformat(),
        }

    def self_test(self) -> dict[str, Any]:
        """Adversarial check that both isolation layers actually hold.

        Layer 1 is exercised by submitting code the static validator must
        reject. Layer 2 is exercised by bypassing the validator deliberately
        and confirming the in-process runtime guard still blocks the network.
        Exposed through the health endpoint so the claim is demonstrable
        rather than asserted.
        """
        static_case = self.execute("import socket\nsocket.socket()")
        runtime_case = self._execute_unvalidated(
            "import socket\n"
            "try:\n"
            "    socket.socket()\n"
            "    print('NETWORK_NOT_BLOCKED')\n"
            "except Exception as exc:\n"
            "    print('BLOCKED:', type(exc).__name__)\n"
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

        Never reachable from the agent or the API: the tool layer always calls
        :meth:`execute`.
        """
        original = self.validator.validate
        try:
            self.validator.validate = lambda source: StaticValidation(  # type: ignore[assignment]
                passed=True, violations=[], imports=[]
            )
            return self.execute(code)
        finally:
            self.validator.validate = original  # type: ignore[assignment]

    def is_ready(self) -> bool:
        """Confirm the sandbox can actually start a child interpreter."""
        if not self.enabled:
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
