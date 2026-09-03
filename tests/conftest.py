"""Test isolation.

Tests must not write to the deployed host's audit trail, database or storage.
Every module-level singleton that touches disk is redirected into a temporary
tree for the duration of the session, and the caches that hold them are
cleared so the redirect actually takes effect.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest


@pytest.fixture(scope="session", autouse=True)
def isolated_storage() -> Path:
    """Point every storage path at a throwaway tree before anything loads."""
    root = Path(tempfile.mkdtemp(prefix="workbench-tests-"))
    for name in ("uploads", "deliverables", "index", "logs", "workspaces"):
        (root / name).mkdir(parents=True, exist_ok=True)

    # Settings read these before the first singleton is constructed.
    os.environ["SOVEREIGN_STORAGE__ROOT"] = str(root)
    os.environ["SOVEREIGN_STORAGE__UPLOADS"] = str(root / "uploads")
    os.environ["SOVEREIGN_STORAGE__DELIVERABLES"] = str(root / "deliverables")
    os.environ["SOVEREIGN_STORAGE__INDEX"] = str(root / "index")
    os.environ["SOVEREIGN_STORAGE__LOGS"] = str(root / "logs")
    os.environ["SOVEREIGN_STORAGE__WORKSPACES"] = str(root / "workspaces")
    os.environ["SOVEREIGN_STORAGE__DATABASE"] = str(root / "workbench.db")
    os.environ["SOVEREIGN_AUDIT__LOG_FILE"] = str(root / "logs" / "audit.jsonl")

    # Drop any cached configuration and singletons built before this ran.
    from backend.core import audit, config, database

    config.get_config.cache_clear()
    audit._audit_log = None
    database._database = None

    yield root

    for key in list(os.environ):
        if key.startswith("SOVEREIGN_STORAGE__") or key == "SOVEREIGN_AUDIT__LOG_FILE":
            del os.environ[key]


@pytest.fixture(autouse=True)
def reset_policy_singletons():
    """Give each test a gateway bound to the isolated audit log."""
    from backend.policy import gateway

    gateway._gateway = None
    yield
    gateway._gateway = None
