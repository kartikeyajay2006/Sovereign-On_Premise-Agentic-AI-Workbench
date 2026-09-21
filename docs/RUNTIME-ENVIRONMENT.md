# Reference runtime environment

**Decision: the AEGIS backend targets WSL2 / Ubuntu 22.04. Windows is not a
supported host for the backend, and the demo machine runs the backend inside
WSL2.**

This is written down because the alternative — discovering it during setup on
the day — is how demos are lost.

## Why

The backend does not import on Windows. Two module-level POSIX imports stop it
before any application code runs:

| File | Line | Import | Available on Windows |
|---|---|---|---|
| `backend/core/audit.py` | 14 | `fcntl` | no |
| `backend/tools/sandbox.py` | 26 | `resource` | no |

`backend/core/audit.py` is imported by the policy gateway, the sovereignty
monitor, identity and the orchestrator, so nothing starts:

```
>>> import backend.core.audit
ModuleNotFoundError: No module named 'fcntl'
```

`backend/tools/sandbox.py` additionally uses `preexec_fn` (`:342`) and
`os.setsid()` (`:242`), neither of which exists on Windows.

The practical consequence is worse than "the app will not start": **the
security test suite has never run on a Windows machine.** Six of the eight test
modules fail at collection, including all of `tests/test_security.py`. There
are no `skipif` markers, so this failure is silent — the suite simply reports
fewer tests rather than announcing that sandbox, audit and policy coverage was
skipped entirely.

WSL2 also resolves, in the same action, the requirements of roadmap item 5
(rootless Podman for the container sandbox) and item 6 (nftables egress rules).
Neither has a Windows equivalent, so making the Python Windows-compatible would
only move the wall a few weeks further out.

## Setting it up

Run from an **Administrator** PowerShell. This reboots the machine.

```powershell
wsl --install -d Ubuntu-22.04
```

Then, inside Ubuntu:

```bash
sudo apt update
sudo apt install -y python3.12 python3.12-venv python3-pip podman

# Verify rootless podman works as your normal user, not as root.
podman info --format '{{.Host.Security.Rootless}}'   # must print: true
podman run --rm --network none alpine echo ok        # must print: ok
```

Then the project:

```bash
cd /mnt/c/Users/<you>/dev/aegis      # or clone fresh inside the WSL filesystem
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -q                             # all modules must now collect
```

> Cloning inside the WSL filesystem (`~/aegis`) rather than working across
> `/mnt/c` is significantly faster and avoids file-permission surprises. The
> Windows-side checkout is fine for editing; pick one and be consistent.

The frontend can stay on Windows — it is Node and has no POSIX dependency. It
talks to the backend over `127.0.0.1:8000`, which WSL2 forwards to the Windows
host automatically.

## Current state of this machine

Checked on 2026-09-21:

- WSL: **not installed** (`wsl --status` → "The Windows Subsystem for Linux is
  not installed")
- `podman`: not on PATH
- `docker`: not on PATH
- `frontend/node_modules`: absent
- Python 3.13 present on Windows, but see above — it cannot import the backend

So nothing in the backend has been executed or verified on this box. Any
backend change made here is unverified until it runs under WSL2.

## The rule this exists to enforce

`config/app.yaml` advertises a `docker` sandbox runtime that no code reads —
`grep -rn "docker\|podman\|container" backend/ --include=*.py` returns nothing.
`Sandbox.runtime` is nevertheless reported through `/health` and rendered in
the interface. Setting `runtime: docker` today would make the API tell the UI
"docker" while generated code ran as an unconfined subprocess under the same
user account.

**Enforcement level must be probed at startup, never read from configuration,
and the interface must never state an isolation level the host did not
demonstrate.** When the container runtime is missing, the honest behaviours are
to refuse to execute code, or to execute it and say plainly that it is
unconfined. Quietly downgrading while the UI still claims containment is the
single worst defect this product could ship.
