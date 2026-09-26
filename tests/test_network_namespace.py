"""The subprocess sandbox in a private network namespace.

The container runtime is used only where its image has been built and a
probe proves it isolates; everywhere else generated code runs as a
subprocess on the host's network stack, where only the interpreter shim
stands between it and the host's loopback: Ollama, the API. On Linux a
rootless ``unshare --user --net`` gives the child a namespace holding only a
down ``lo``, so the kernel refuses a connection even if the shim is bypassed.

The probe runs without the shim, like the container probe, so a passing
probe is a statement about the kernel alone.
"""

from __future__ import annotations

import shutil
import sys

import pytest

from backend.core.config import get_config
from backend.tools import netns
from backend.tools.sandbox import Sandbox

linux_with_unshare = pytest.mark.skipif(
    not sys.platform.startswith("linux") or shutil.which("unshare") is None,
    reason="network namespaces need Linux and util-linux unshare",
)
linux_only = pytest.mark.skipif(not sys.platform.startswith("linux"), reason="network namespaces are Linux-only")


@pytest.fixture(autouse=True)
def _fresh_probe():
    netns.clear_probe_cache()
    yield
    netns.clear_probe_cache()


@pytest.fixture
def subprocess_runtime(monkeypatch):
    sandbox = get_config().settings.sandbox
    monkeypatch.setitem(sandbox, "runtime", "subprocess")
    return sandbox


def _unusable(reason: str = "unshare was refused: Operation not permitted") -> netns.NamespaceProbe:
    return netns.NamespaceProbe(usable=False, prefix=None, interfaces=[], loopback=None,
                                external=None, reason=reason)


@linux_with_unshare
class TestTheProbe:
    def test_the_namespace_holds_only_loopback_and_reaches_nothing(self) -> None:
        probe = netns.probe_network_namespace()
        assert probe.usable, probe.reason
        assert probe.interfaces == ["lo"]
        # The host's own loopback is a different namespace's: unreachable.
        assert probe.loopback != "connected" and probe.external != "connected"
        assert probe.prefix[0].endswith("unshare") and "--net" in probe.prefix

    def test_the_probe_is_cached_until_forced(self, monkeypatch) -> None:
        first = netns.probe_network_namespace()
        monkeypatch.setattr(netns, "_probe", lambda: pytest.fail("probed again"))
        assert netns.probe_network_namespace() is first


class TestTheSandbox:
    @linux_with_unshare
    def test_generated_code_runs_in_the_namespace_and_still_works(self, subprocess_runtime) -> None:
        outcome = Sandbox().execute_detailed(
            "with open('out.txt', 'w') as handle:\n    handle.write('ok')\nprint(sum(range(10)))\n"
        )
        assert outcome.result.ok, outcome.result.stderr
        assert outcome.result.stdout.strip() == "45"
        assert "out.txt" in outcome.result.generated_files
        assert outcome.limits.network_namespace is True
        assert outcome.limits.to_dict()["network_namespace"] is True

    @linux_with_unshare
    def test_the_runtime_says_so(self, subprocess_runtime) -> None:
        assert Sandbox().runtime == "subprocess (private network namespace)"

    @linux_with_unshare
    def test_off_runs_on_the_host_network_and_says_nothing_more(self, subprocess_runtime, monkeypatch) -> None:
        monkeypatch.setitem(subprocess_runtime, "network_namespace", "off")
        sandbox = Sandbox()
        assert sandbox.runtime == "subprocess"
        outcome = sandbox.execute_detailed("print(1)")
        assert outcome.result.ok and outcome.limits.network_namespace is False

    @linux_only
    def test_auto_without_a_namespace_runs_and_labels_it(self, subprocess_runtime, monkeypatch) -> None:
        monkeypatch.setattr(netns, "probe_network_namespace", lambda force=False: _unusable())
        sandbox = Sandbox()
        assert sandbox.execution_allowed[0]
        assert "no network namespace" in sandbox.runtime
        assert "Operation not permitted" in sandbox.runtime

    @linux_only
    def test_require_without_a_namespace_refuses_to_run(self, subprocess_runtime, monkeypatch) -> None:
        monkeypatch.setitem(subprocess_runtime, "network_namespace", "require")
        monkeypatch.setattr(netns, "probe_network_namespace", lambda force=False: _unusable())
        sandbox = Sandbox()
        allowed, reason = sandbox.execution_allowed
        assert not allowed and "network namespace" in reason
        outcome = sandbox.execute_detailed("print(1)")
        assert not outcome.result.ok and outcome.limits.mechanism == "none"

    @linux_with_unshare
    def test_the_self_test_measures_the_kernel_layer(self, subprocess_runtime) -> None:
        report = Sandbox().self_test_report()
        check = next(c for c in report["checks"] if c["name"] == "Kernel network namespace")
        assert check["passed"], check["detail"]
        assert "lo" in check["detail"]
        assert report["network_namespace"]["usable"] is True


@linux_with_unshare
def test_the_api_reports_the_namespace_for_the_host_and_for_each_run(subprocess_runtime) -> None:
    from fastapi.testclient import TestClient

    from backend.api.main import create_app

    with TestClient(create_app()) as client:
        token = client.post("/api/auth/login", json={"username": "engineer", "password": "workbench"}).json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        limits = client.get("/api/sandbox/limits", headers=headers).json()
        assert limits["network_namespace"]["usable"] is True
        assert limits["network_namespace"]["interfaces"] == ["lo"]
        run = client.post("/api/sandbox/execute", headers=headers, json={"code": "print(2 + 2)"}).json()
        assert run["result"]["stdout"].strip() == "4"
        assert run["limits"]["network_namespace"] is True
