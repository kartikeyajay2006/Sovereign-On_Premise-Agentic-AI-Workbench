"""The red-team suite, run in-process against the application under test.

Every attack must be refused, and each refusal must be one the suite
observed -- a status code, a sandbox's output, a broken chain on a copied
log -- not one it assumed. An inconclusive attack fails this test as surely
as a breach: "could not try" is not "held".
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.core.config import PROJECT_ROOT, get_config
from backend.security.red_team import RedTeam
from backend.security.throttle import reset_login_throttle


@pytest.fixture(scope="module")
def report() -> dict:
    reset_login_throttle()
    config = get_config()
    audit_path = Path(str(config.settings.audit.get("log_file")))
    if not audit_path.is_absolute():
        audit_path = PROJECT_ROOT / audit_path
    with TestClient(create_app()) as client:
        # Something for the tamper test to copy.
        client.post("/api/auth/login", json={"username": "engineer", "password": "workbench"})
        result = RedTeam(client, audit_log_path=audit_path).run()
    reset_login_throttle()
    return result


def test_every_attack_was_carried_out_and_refused(report: dict) -> None:
    failed = [
        f"{r['id']} {r['outcome']}: {r['attack']} -> {r['observed']}"
        for r in report["results"] if r["outcome"] != "held"
    ]
    assert not failed, "\n".join(failed)


def test_the_report_covers_each_class_of_attack(report: dict) -> None:
    categories = {r["category"] for r in report["results"]}
    assert categories == {"ingestion", "sandbox", "egress", "access", "integrity"}
    assert report["summary"]["total"] == len(report["results"]) >= 25


def test_the_report_is_hashed(report: dict) -> None:
    assert len(report["results_sha256"]) == 64
