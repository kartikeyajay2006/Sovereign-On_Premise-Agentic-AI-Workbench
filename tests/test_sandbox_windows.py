"""Windows Job Object containment, exercised for real on this host.

These prove the claims the Windows backend makes by trying to break them: a
memory bomb is refused at the cap, a CPU spin is terminated, spawning is capped,
and a write outside the workspace is refused. They run only where the Job Object
backend is actually usable - on POSIX the sandbox uses rlimits and these
mechanisms do not apply, so the module skips rather than pretending.

A skip here is not a pass. It means this host is not the one the test is about.
"""

from __future__ import annotations

import sys

import pytest

from backend.tools import sandbox as sandbox_module
from backend.tools.sandbox import Sandbox

_probe_ok = sys.platform == "win32" and sandbox_module.probe_windows_job_limits()[0]

pytestmark = pytest.mark.skipif(
    not _probe_ok,
    reason=(
        "The Windows Job Object backend is not usable here (not win32, or the "
        "probe found it does not enforce a memory cap). These tests assert "
        "kernel-level containment that only exists on a host where the probe "
        "passes; the POSIX rlimit path is covered by tests/test_security.py."
    ),
)


@pytest.fixture(scope="module")
def sandbox() -> Sandbox:
    return Sandbox()


class TestWindowsStructLayout:
    """A wrong struct silently applies no limit, so the layout is asserted."""

    def test_extended_limit_information_is_the_x64_size(self) -> None:
        import ctypes

        basic = sandbox_module._JOBOBJECT_BASIC_LIMIT_INFORMATION
        extended = sandbox_module._JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        acct = sandbox_module._JOBOBJECT_BASIC_AND_IO_ACCOUNTING_INFORMATION
        # These are the documented 64-bit sizes. If ctypes computes anything
        # else, a field type is wrong and the kernel would read a cap from the
        # wrong offset.
        assert ctypes.sizeof(basic) == 64
        assert ctypes.sizeof(extended) == 144
        assert ctypes.sizeof(acct) == 96


class TestWindowsContainment:
    def test_runs_legitimate_calculation(self, sandbox: Sandbox) -> None:
        result = sandbox.execute(
            "rate = (12.0 - 9.4) / 4.0\n"
            "life = (9.4 - 6.0) / rate\n"
            "print(f'{rate:.4f} {life:.2f}')"
        )
        assert result.ok
        assert result.exit_code == 0
        assert "0.6500" in result.stdout

    def test_memory_bomb_is_refused_at_the_cap(self, sandbox: Sandbox) -> None:
        # Allocate well past the 1 GB configured cap. The per-process committed
        # memory cap refuses the commit, so the process fails rather than the
        # host swapping; peak stays far below the request.
        outcome = sandbox.execute_detailed(
            "b = bytearray(1300 * 1024 * 1024)\n"
            "for i in range(0, len(b), 4096):\n    b[i] = 1\n"
            "print('ALLOCATED')\n"
        )
        assert not outcome.result.ok
        assert "ALLOCATED" not in outcome.result.stdout
        assert outcome.accounting.termination_reason == "memory_limit_exceeded"
        # The measured peak is a real reading, and it is below the cap: the
        # process could not exceed the limit it was given.
        assert outcome.accounting.peak_memory_bytes is not None
        assert outcome.accounting.peak_memory_bytes <= 1024 * 1024 * 1024

    def test_cpu_spin_is_terminated(self, sandbox: Sandbox, tmp_path) -> None:
        # A hard infinite loop under a small CPU cap, driven through the exact
        # runner execute() uses. A small cap (not the 30s config default) keeps
        # the test fast on a shared host while proving the same mechanism: the
        # job terminates the process and the CPU it burned is measured.
        measurement = sandbox_module._win_run(
            "x = 0\nwhile True:\n    x += 1\n",
            memory_bytes=256 * 1024 * 1024,
            cpu_seconds=1,
            active_process_limit=4,
            wall_timeout=20,
            workspace=tmp_path / "cpu",
            env=sandbox._environment(tmp_path / "cpu"),
            max_output_bytes=4096,
            install_guard=False,
        )
        assert measurement.assigned
        assert measurement.exit_code != 0
        # STATUS_QUOTA_EXCEEDED, or a job-terminated process, or the wall
        # backstop - any is a genuine termination, none is a clean exit.
        terminated = (
            measurement.exit_code == sandbox_module.STATUS_QUOTA_EXCEEDED
            or (measurement.terminated_processes or 0) >= 1
            or measurement.timed_out
        )
        assert terminated
        assert measurement.user_time_seconds is not None

    def test_write_outside_workspace_is_refused(self, sandbox: Sandbox) -> None:
        # open() is not on the denied-call list, so this reaches execution; the
        # interpreter guard refuses the out-of-workspace write at runtime.
        result = sandbox.execute(
            "open('../../escape_probe.txt', 'w').write('x')\nprint('WROTE')"
        )
        assert not result.ok
        assert "WROTE" not in result.stdout
        assert "SovereignFilesystemBlocked" in result.stderr

    def test_writing_inside_the_workspace_is_allowed(self, sandbox: Sandbox) -> None:
        result = sandbox.execute(
            "open('note.txt', 'w').write('inside')\nprint('OK')"
        )
        assert result.ok
        assert "note.txt" in result.generated_files

    def test_runtime_layer_blocks_the_raw_socket_primitive(self, sandbox: Sandbox) -> None:
        # The independence of the second layer: with the validator bypassed,
        # both socket.socket and the _socket C primitive it subclasses must
        # raise. If only the Python wrapper were patched, _socket would be a
        # live egress path held shut only by the import allow-list.
        report = sandbox.self_test()
        assert report["runtime_layer_blocks_socket"]
        assert "NETWORK_NOT_BLOCKED" not in report["runtime_output"]
        assert report["runtime_attempts_recorded"] >= 2

    def test_self_test_report_holds_and_is_assessable(self, sandbox: Sandbox) -> None:
        report = sandbox.self_test_report()
        assert report["assessable"] is True
        assert report["backend"] == "windows_job_object"
        # Every listed check must have actually held on this host.
        assert report["all_passed"], [c for c in report["checks"] if not c["passed"]]
        names = {c["name"] for c in report["checks"]}
        assert {
            "Memory limit terminates a bomb",
            "CPU-time limit terminates a spin",
            "Process spawning is capped",
            "Filesystem write confinement",
        } <= names


class TestWindowsTracebacks:
    """What a failing program shows its author, and what it keeps from them."""

    def test_traceback_starts_at_the_program(self, sandbox: Sandbox) -> None:
        # The runner and runpy frames used to lead the traceback, each with the
        # workspace's absolute path: the service's checkout and account name.
        outcome = sandbox.execute_detailed(
            "def check(x):\n    raise ValueError('wall below minimum: ' + str(x))\n\ncheck(5.2)\n"
        )
        stderr = outcome.result.stderr
        assert outcome.result.exit_code == 1
        assert 'File "program.py", line 2, in check' in stderr
        assert "ValueError: wall below minimum: 5.2" in stderr
        assert "_runner.py" not in stderr
        assert "runpy" not in stderr
        assert str(sandbox_module.Path.cwd()) not in stderr
        assert sys.prefix not in stderr
        assert sys.base_prefix not in stderr

    def test_guard_frames_name_the_workspace_not_the_host(self, sandbox: Sandbox) -> None:
        outcome = sandbox.execute_detailed("open('../../escape_probe.txt', 'w').write('x')\n")
        stderr = outcome.result.stderr
        assert "SovereignFilesystemBlocked" in stderr
        assert "<workspace>" in stderr
        assert "storage" not in stderr

    def test_a_syntax_error_still_names_the_line(self, sandbox: Sandbox) -> None:
        # validate=False: the static validator refuses unparseable code before
        # it reaches the runner, and this is about what the runner prints.
        outcome = sandbox.execute_detailed("x = (1,\n", validate=False)
        stderr = outcome.result.stderr
        assert outcome.result.exit_code == 1
        assert "SyntaxError" in stderr
        assert "program.py" in stderr
        assert "_runner.py" not in stderr

    def test_system_exit_keeps_its_code_and_prints_nothing(self, sandbox: Sandbox) -> None:
        outcome = sandbox.execute_detailed("raise SystemExit(3)\n")
        assert outcome.result.exit_code == 3
        assert "Traceback" not in outcome.result.stderr
