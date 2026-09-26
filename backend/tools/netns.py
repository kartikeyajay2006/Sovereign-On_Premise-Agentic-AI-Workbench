"""A private network namespace for the subprocess sandbox, on Linux.

Where no container image has been built, generated code runs as a
subprocess, and a subprocess shares the host's network stack: the socket
shim in the workspace is then the only thing between the code and the
host's loopback, where the model runtime and the API listen. A rootless
``unshare --user --net`` gives the child its own network namespace, holding
a single loopback interface that is down. The kernel then refuses every
connection, to the internet or to 127.0.0.1, whatever the code does to the
interpreter. No image, no root and no network are needed to set it up.

As with the container runtime, nothing is taken on trust. It is used only
after a probe, started with exactly the prefix a real run gets and *without*
the shim, shows on this host that the namespace holds only ``lo`` and that
both the host's loopback and an outside address are unreachable.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import threading
from dataclasses import dataclass, field
from typing import Any

# Tried in order. --map-current-user keeps the program's uid its own; older
# util-linux lacks it, and an unmapped uid (nobody) still writes the
# workspace as the host user, so the plain form is the fallback.
_PREFIXES = (
    ("--user", "--map-current-user", "--net", "--"),
    ("--user", "--net", "--"),
)

# The model runtime's port stands for "anything on the host's loopback".
_LOOPBACK_TARGET = ("127.0.0.1", 11434)
# Never contacted when the namespace holds: the connect fails in the kernel.
_EXTERNAL_TARGET = ("1.1.1.1", 53)

_PROBE_PROGRAM = f"""
import json, socket
with open('/proc/net/dev') as handle:
    interfaces = sorted(line.split(':')[0].strip() for line in handle.readlines()[2:] if ':' in line)
def attempt(host, port):
    probe = socket.socket()
    probe.settimeout(1.0)
    try:
        probe.connect((host, port))
        return 'connected'
    except OSError as exc:
        return f'refused by the kernel: errno {{exc.errno}}' if exc.errno else f'refused: {{exc}}'
    finally:
        probe.close()
print(json.dumps({{
    'interfaces': interfaces,
    'loopback': attempt(*{_LOOPBACK_TARGET!r}),
    'external': attempt(*{_EXTERNAL_TARGET!r}),
}}))
"""


@dataclass
class NamespaceProbe:
    """Whether a private network namespace isolates a child here, and why not if not."""

    usable: bool
    prefix: list[str] | None
    interfaces: list[str] = field(default_factory=list)
    loopback: str | None = None
    external: str | None = None
    reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "usable": self.usable,
            "prefix": self.prefix,
            "interfaces": self.interfaces,
            "loopback": {"target": "%s:%d" % _LOOPBACK_TARGET, "result": self.loopback},
            "external": {"target": "%s:%d" % _EXTERNAL_TARGET, "result": self.external},
            "reason": self.reason,
        }

    def summary(self) -> str:
        return (
            f"interfaces {', '.join(self.interfaces) or 'none'}; "
            f"{'%s:%d' % _LOOPBACK_TARGET} {self.loopback}; {'%s:%d' % _EXTERNAL_TARGET} {self.external}"
        )


_cache: NamespaceProbe | None = None
_lock = threading.Lock()


def clear_probe_cache() -> None:
    global _cache
    with _lock:
        _cache = None


def probe_network_namespace(force: bool = False) -> NamespaceProbe:
    """Prove, on this host, that a private network namespace isolates - or say why not."""
    global _cache
    with _lock:
        if _cache is None or force:
            _cache = _probe()
        return _cache


def _probe() -> NamespaceProbe:
    if not sys.platform.startswith("linux"):
        return NamespaceProbe(False, None, reason=f"network namespaces are a Linux facility; this host is {sys.platform}")
    binary = shutil.which("unshare", path="/usr/bin:/bin:/usr/sbin:/sbin")
    if binary is None:
        return NamespaceProbe(False, None, reason="util-linux unshare was not found")

    failures: list[str] = []
    for flags in _PREFIXES:
        prefix = [binary, *flags]
        try:
            completed = subprocess.run(
                [*prefix, sys.executable, "-I", "-c", _PROBE_PROGRAM],
                capture_output=True, text=True, timeout=20, check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            failures.append(f"{' '.join(flags[:-1])}: {exc}")
            continue
        if completed.returncode != 0:
            failures.append(f"{' '.join(flags[:-1])}: {(completed.stderr or '').strip()[:200] or completed.returncode}")
            continue
        try:
            seen = json.loads(completed.stdout.strip().splitlines()[-1])
        except (ValueError, IndexError):
            failures.append(f"{' '.join(flags[:-1])}: unreadable probe output")
            continue
        probe = NamespaceProbe(
            usable=False, prefix=prefix, interfaces=list(seen.get("interfaces") or []),
            loopback=seen.get("loopback"), external=seen.get("external"),
        )
        problems = []
        if probe.interfaces != ["lo"]:
            problems.append(f"interfaces other than lo are visible: {', '.join(probe.interfaces)}")
        if probe.loopback == "connected":
            problems.append("the host's loopback was reachable")
        if probe.external == "connected":
            problems.append("an outside address was reachable")
        if problems:
            probe.reason = "; ".join(problems)
            return probe
        probe.usable = True
        probe.reason = "the namespace holds only lo, and nothing outside it is reachable"
        return probe
    return NamespaceProbe(False, None, reason="unshare was refused: " + " | ".join(failures))
