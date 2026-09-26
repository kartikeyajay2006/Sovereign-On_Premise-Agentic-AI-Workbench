"""The container runtime: what it runs, when it is chosen, and what it reports.

Most of these mock the binary lookup and the subprocess calls, because the
point is the command the sandbox builds and the decision it makes - both of
which must be right on hosts that have no container runtime at all. The last
class runs a real container and skips, with the reason, where none exists.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from backend.core.config import get_config
from backend.tools import container_sandbox as cs
from backend.tools.sandbox import Sandbox


def _settings(**overrides) -> cs.ContainerSettings:
    base = dict(
        image="localhost/aegis-sandbox:1", memory_mb=512, cpus=1.0, pids_limit=64,
        cpu_seconds=30, file_bytes=1000, tmpfs_mb=64, timeout_seconds=45,
        probe_timeout_seconds=90, require_rootless=True, fallback="subprocess",
    )
    base.update(overrides)
    return cs.ContainerSettings(**base)


def _pairs(command: list[str]) -> set[tuple[str, str]]:
    return set(zip(command, command[1:]))


@pytest.fixture(autouse=True)
def _fresh_probe_cache():
    cs.clear_probe_cache()
    yield
    cs.clear_probe_cache()


# --------------------------------------------------------- command building
class TestTheRunCommand:
    def _command(self, runtime: str = "podman", user: str = "1000:1000") -> list[str]:
        return cs.build_run_command(
            f"/usr/bin/{runtime}", runtime, name="aegis-sbx-test",
            workspace=Path("/srv/aegis/storage/workspaces/run-1"),
            settings=_settings(), argv=["python", "/workspace/program.py"], user=user,
        )

    def test_every_isolation_flag_is_present(self) -> None:
        command = self._command()
        pairs = _pairs(command)
        assert ("--network", "none") in pairs
        assert "--read-only" in command
        assert ("--cap-drop", "ALL") in pairs
        assert ("--security-opt", "no-new-privileges") in pairs
        assert ("--user", "1000:1000") in pairs
        assert ("--pull", "never") in pairs

    def test_resource_limits_are_present(self) -> None:
        pairs = _pairs(self._command())
        assert ("--memory", "512m") in pairs
        # Equal to --memory, so there is no swap to spill into.
        assert ("--memory-swap", "512m") in pairs
        assert ("--cpus", "1") in pairs
        assert ("--pids-limit", "64") in pairs
        assert ("--ulimit", "cpu=30:30") in pairs
        assert ("--ulimit", "fsize=1000:1000") in pairs
        assert ("--ulimit", "core=0:0") in pairs

    def test_only_the_workspace_is_mounted(self) -> None:
        command = self._command()
        volumes = [command[i + 1] for i, arg in enumerate(command) if arg in ("--volume", "-v", "--mount")]
        assert len(volumes) == 1
        assert volumes[0].endswith(":/workspace:rw,Z")
        tmpfs = [command[i + 1] for i, arg in enumerate(command) if arg == "--tmpfs"]
        assert tmpfs == ["/tmp:rw,noexec,nosuid,nodev,size=64m"]

    def test_the_image_and_program_come_last(self) -> None:
        command = self._command()
        assert command[-3:] == ["localhost/aegis-sandbox:1", "python", "/workspace/program.py"]

    def test_the_container_is_kept_to_read_oom_state(self) -> None:
        # Not --rm: State.OOMKilled is read after exit, then it is removed.
        assert "--rm" not in self._command()

    def test_podman_maps_the_invoking_user_with_keep_id(self) -> None:
        assert ("--userns", "keep-id") in _pairs(self._command("podman"))

    def test_docker_has_no_podman_only_flags(self) -> None:
        command = self._command("docker")
        assert "--userns" not in command
        assert command[:2] == ["/usr/bin/docker", "run"]

    def test_nobody_is_not_given_keep_id(self) -> None:
        assert "--userns" not in self._command("podman", user="65534:65534")

    def test_the_environment_is_scrubbed(self) -> None:
        envs = [value for flag, value in _pairs(self._command()) if flag == "--env"]
        keys = {entry.split("=", 1)[0] for entry in envs}
        assert "PYTHONPATH=/workspace" in envs
        assert not keys & {"PATH", "http_proxy", "HTTPS_PROXY", "AWS_ACCESS_KEY_ID"}

    def test_the_container_user_is_never_root(self, monkeypatch) -> None:
        monkeypatch.setattr(cs.os, "getuid", lambda: 0, raising=False)
        monkeypatch.setattr(cs.os, "getgid", lambda: 0, raising=False)
        assert cs.container_user() == "65534:65534"
        monkeypatch.setattr(cs.os, "getuid", lambda: 1001, raising=False)
        monkeypatch.setattr(cs.os, "getgid", lambda: 1001, raising=False)
        assert cs.container_user() == "1001:1001"


# ------------------------------------------------------------ probe verdict
def _good_report(**overrides) -> dict:
    report = {
        "interfaces": ["lo"],
        "connect": "ENETUNREACH",
        "dns": "gaierror",
        "write_outside": {"/aegis-probe": "EROFS", "/etc/aegis-probe": "EROFS", "/usr/aegis-probe": "EROFS"},
        "write_workspace": "written",
        "uid": 1000,
        "euid": 1000,
        "proc_status": {"CapEff": "0000000000000000", "NoNewPrivs": "1"},
    }
    report.update(overrides)
    return report


def _measurement(report: dict | None, exit_code: int = 0, **kw) -> cs.ContainerRunMeasurement:
    stdout = ("AEGIS_PROBE_RESULT " + json.dumps(report)) if report is not None else ""
    return cs.ContainerRunMeasurement(
        exit_code=exit_code, timed_out=kw.get("timed_out", False), stdout=stdout,
        stderr=kw.get("stderr", ""), oom_killed=False, runtime_error=kw.get("runtime_error", False),
    )


class TestTheProbeVerdict:
    def _evaluate(self, report, **kw) -> cs.ContainerProbe:
        return cs.evaluate_probe("podman", "/usr/bin/podman", "img", True, _measurement(report, **kw))

    def test_isolation_that_holds_is_usable(self) -> None:
        probe = self._evaluate(_good_report())
        assert probe.usable, probe.reason
        assert len(probe.checks) == 6 and all(c["passed"] for c in probe.checks)

    @pytest.mark.parametrize(
        "override, failed",
        [
            ({"interfaces": ["eth0", "lo"]}, "No network"),
            ({"connect": "connected"}, "No network"),
            ({"dns": "resolved"}, "No network"),
            ({"write_outside": {"/aegis-probe": "written"}}, "Read-only root filesystem"),
            ({"write_workspace": "EACCES"}, "Workspace is writable"),
            ({"uid": 0, "euid": 0}, "Not root"),
            ({"proc_status": {"CapEff": "00000000a80425fb", "NoNewPrivs": "1"}}, "No capabilities"),
            ({"proc_status": {"CapEff": "0", "NoNewPrivs": "0"}}, "no-new-privileges"),
        ],
    )
    def test_any_failed_check_makes_it_unusable_and_says_which(self, override, failed) -> None:
        probe = self._evaluate(_good_report(**override))
        assert not probe.usable
        assert failed in probe.reason

    def test_a_probe_that_did_not_complete_is_not_a_pass(self) -> None:
        probe = self._evaluate(None, exit_code=125, runtime_error=True, stderr="Error: image not known")
        assert not probe.usable
        assert "image not known" in probe.reason

    def test_no_report_is_not_a_pass(self) -> None:
        assert not self._evaluate(None).usable


# ---------------------------------------------------------------- selection
class _FakeRun:
    """Stands in for subprocess.run: answers info/image/inspect/rm, records run."""

    def __init__(self, *, rootless="true", image_present=True, probe_report=None):
        self.rootless = rootless
        self.image_present = image_present
        self.probe_report = probe_report if probe_report is not None else _good_report()
        self.calls: list[list[str]] = []

    def __call__(self, argv, **kwargs):
        self.calls.append(list(argv))
        verb = argv[1]
        if verb == "info":
            return subprocess.CompletedProcess(argv, 0, self.rootless + "\n", "")
        if verb == "image":
            return subprocess.CompletedProcess(argv, 0 if self.image_present else 1, "", "")
        if verb == "inspect":
            return subprocess.CompletedProcess(argv, 0, "false\n", "")
        if verb == "run":
            out = "AEGIS_PROBE_RESULT " + json.dumps(self.probe_report)
            return subprocess.CompletedProcess(argv, 0, out + "\n", "")
        return subprocess.CompletedProcess(argv, 0, "", "")


@pytest.fixture
def podman_configured(monkeypatch):
    sandbox = get_config().settings.sandbox
    monkeypatch.setitem(sandbox, "runtime", "podman")
    monkeypatch.setitem(sandbox, "container_fallback", "subprocess")
    monkeypatch.setitem(sandbox, "container_require_rootless", True)
    return sandbox


class TestSelection:
    def test_subprocess_config_never_probes(self, monkeypatch) -> None:
        monkeypatch.setitem(get_config().settings.sandbox, "runtime", "subprocess")
        monkeypatch.setattr(cs.shutil, "which", lambda name: pytest.fail("probed"))
        assert Sandbox()._container_selection() == ("subprocess", None)
        assert Sandbox().container_probe() is None

    def test_a_missing_binary_falls_back_and_says_so(self, podman_configured, monkeypatch) -> None:
        monkeypatch.setattr(cs.shutil, "which", lambda name: None)
        sandbox = Sandbox()
        selection, probe = sandbox._container_selection()
        assert selection == "fallback"
        assert "not found on PATH" in probe.reason
        assert "fallback: podman unavailable" in sandbox.runtime
        assert "binary was not found" in sandbox.runtime
        assert not sandbox._enforcement_backend() or "container" not in sandbox._enforcement_backend()

    def test_a_missing_binary_with_refuse_refuses_execution(self, podman_configured, monkeypatch) -> None:
        monkeypatch.setitem(podman_configured, "container_fallback", "refuse")
        monkeypatch.setattr(cs.shutil, "which", lambda name: None)
        sandbox = Sandbox()
        allowed, reason = sandbox.execution_allowed
        assert not allowed
        assert "not found on PATH" in reason
        assert sandbox.runtime.startswith("none (podman unavailable")
        outcome = sandbox.execute_detailed("print(1)")
        assert outcome.limits.mechanism == "none"
        assert not outcome.result.ok

    def test_an_unknown_fallback_value_refuses(self) -> None:
        assert cs.ContainerSettings.from_config({"container_fallback": "yolo"}).fallback == "refuse"

    def test_rootful_podman_is_refused_when_rootless_is_required(self, podman_configured, monkeypatch) -> None:
        monkeypatch.setattr(cs.shutil, "which", lambda name: "/usr/bin/podman")
        monkeypatch.setattr(cs.subprocess, "run", _FakeRun(rootless="false"))
        _, probe = Sandbox()._container_selection()
        assert not probe.usable and "is not rootless" in probe.reason

    def test_a_missing_image_is_reported_not_pulled(self, podman_configured, monkeypatch) -> None:
        fake = _FakeRun(image_present=False)
        monkeypatch.setattr(cs.shutil, "which", lambda name: "/usr/bin/podman")
        monkeypatch.setattr(cs.subprocess, "run", fake)
        _, probe = Sandbox()._container_selection()
        assert not probe.usable and "not present locally" in probe.reason
        assert not any(call[1] in ("pull", "run") for call in fake.calls)

    def test_a_probe_that_holds_selects_the_container(self, podman_configured, monkeypatch) -> None:
        fake = _FakeRun()
        monkeypatch.setattr(cs.shutil, "which", lambda name: "/usr/bin/podman")
        monkeypatch.setattr(cs.subprocess, "run", fake)
        sandbox = Sandbox()
        assert sandbox._container_selection()[0] == "container"
        assert sandbox._enforcement_backend() == "podman_container"
        assert sandbox.runtime.startswith("podman (rootless container")
        assert sandbox.execution_allowed == (True, "")
        run = next(call for call in fake.calls if call[1] == "run")
        assert ("--network", "none") in _pairs(run)
        # The probe runs without the interpreter shim, so it proves the container.
        assert sandbox.container_probe()["usable"] is True

    def test_a_probe_that_fails_isolation_falls_back(self, podman_configured, monkeypatch) -> None:
        monkeypatch.setattr(cs.shutil, "which", lambda name: "/usr/bin/podman")
        monkeypatch.setattr(cs.subprocess, "run", _FakeRun(probe_report=_good_report(interfaces=["eth0", "lo"])))
        sandbox = Sandbox()
        assert sandbox._container_selection()[0] == "fallback"
        assert "No network" in sandbox.runtime

    def test_the_probe_is_cached(self, podman_configured, monkeypatch) -> None:
        fake = _FakeRun()
        monkeypatch.setattr(cs.shutil, "which", lambda name: "/usr/bin/podman")
        monkeypatch.setattr(cs.subprocess, "run", fake)
        sandbox = Sandbox()
        sandbox._container_selection()
        sandbox._container_selection()
        assert sum(1 for call in fake.calls if call[1] == "run") == 1


class TestContainerExecution:
    def test_a_run_goes_through_the_container_with_the_same_result_shape(
        self, podman_configured, monkeypatch
    ) -> None:
        monkeypatch.setattr(cs.shutil, "which", lambda name: "/usr/bin/podman")
        monkeypatch.setattr(cs.subprocess, "run", _FakeRun())
        sandbox = Sandbox()
        sandbox._container_selection()  # the probe runs, and is cached, first
        seen = {}

        def fake_run_in_container(binary, runtime, *, code, workspace, settings, guard_source, timeout=None):
            seen.update(binary=binary, runtime=runtime, code=code, guard=guard_source)
            (workspace / "out.csv").write_text("a\n")
            return cs.ContainerRunMeasurement(0, False, "499500\n", "", False, False)

        monkeypatch.setattr(cs, "run_in_container", fake_run_in_container)
        outcome = sandbox.execute_detailed("print(sum(range(1000)))")
        assert outcome.result.ok and outcome.result.stdout.strip() == "499500"
        assert outcome.result.generated_files == ["out.csv"]
        assert outcome.limits.mechanism == "podman_container"
        assert outcome.limits.active_process_limit == 64
        # The container cannot report these after exit; they stay unmeasured.
        assert outcome.accounting.peak_memory_bytes is None
        assert outcome.accounting.cpu_user_seconds is None
        # The shim is still installed for real runs, to count attempts.
        assert seen["guard"] and "SovereignNetworkBlocked" in seen["guard"]

    def test_static_validation_still_runs_first(self, podman_configured, monkeypatch) -> None:
        monkeypatch.setattr(cs.shutil, "which", lambda name: "/usr/bin/podman")
        monkeypatch.setattr(cs.subprocess, "run", _FakeRun())
        sandbox = Sandbox()
        sandbox._container_selection()
        monkeypatch.setattr(cs, "run_in_container", lambda *a, **k: pytest.fail("ran"))
        result = sandbox.execute("import socket")
        assert not result.static_validation_passed

    @pytest.mark.parametrize(
        "measurement, reason",
        [
            (cs.ContainerRunMeasurement(None, True, "", "", None, False), "wall_clock_timeout"),
            (cs.ContainerRunMeasurement(125, False, "", "", None, True), "container_runtime_error"),
            (cs.ContainerRunMeasurement(137, False, "", "", True, False), "memory_limit_exceeded"),
            (cs.ContainerRunMeasurement(137, False, "", "", False, False), "terminated_by_signal"),
            (cs.ContainerRunMeasurement(152, False, "", "", False, False), "cpu_time_limit_exceeded"),
            (cs.ContainerRunMeasurement(153, False, "", "", False, False), "file_size_limit_exceeded"),
            (cs.ContainerRunMeasurement(1, False, "", "", False, False), "nonzero_exit"),
            (cs.ContainerRunMeasurement(0, False, "", "", False, False), None),
        ],
    )
    def test_termination_is_classified_from_measured_signals(self, measurement, reason) -> None:
        assert cs.classify_container_exit(measurement) == reason

    def test_a_timeout_kills_and_removes_the_container(self, monkeypatch, tmp_path) -> None:
        calls: list[list[str]] = []

        def fake(argv, **kwargs):
            calls.append(list(argv))
            if argv[1] == "run":
                raise subprocess.TimeoutExpired(argv, kwargs.get("timeout"))
            return subprocess.CompletedProcess(argv, 0, "", "")

        monkeypatch.setattr(cs.subprocess, "run", fake)
        m = cs.run_in_container("podman", "podman", code="while True: pass", workspace=tmp_path,
                                settings=_settings(timeout_seconds=1), guard_source=None)
        assert m.timed_out and m.exit_code is None
        verbs = [call[1] for call in calls]
        assert "kill" in verbs and verbs[-1] == "rm"


class TestTheSurfaces:
    def test_self_test_reports_runtime_and_probe_when_refused(self, podman_configured, monkeypatch) -> None:
        monkeypatch.setitem(podman_configured, "container_fallback", "refuse")
        monkeypatch.setattr(cs.shutil, "which", lambda name: None)
        report = Sandbox().self_test_report()
        assert report["assessable"] is False
        assert report["container_probe"]["usable"] is False
        assert report["container_probe"]["fallback"] == "refuse"
        assert "not found on PATH" in report["runtime"]


# ---------------------------------------------------- a real container runtime
def _real_runtime() -> str | None:
    for runtime in cs.CONTAINER_RUNTIMES:
        if shutil.which(runtime):
            return runtime
    return None


_REAL = _real_runtime()


@pytest.mark.skipif(
    _REAL is None,
    reason=(
        "No podman or docker binary on this host, so container isolation cannot "
        "be exercised here. The command construction and selection logic above "
        "are covered with the runtime mocked; this class needs a real one."
    ),
)
class TestARealContainerRuntime:
    def test_the_probe_verdict_is_explained_either_way(self) -> None:
        settings = cs.ContainerSettings.from_config(get_config().settings.sandbox)
        probe = cs.probe_container_runtime(_REAL, settings, force=True)
        # On a host with the image built and a rootless runtime this is a pass;
        # anywhere else it must be a failure with a reason, never a silent one.
        assert probe.reason
        if probe.usable:
            assert all(check["passed"] for check in probe.checks)
