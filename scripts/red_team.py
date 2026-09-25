#!/usr/bin/env python3
"""Attack a running AEGIS installation and write down what happened.

    .venv/bin/python scripts/red_team.py                     # http://127.0.0.1:8000
    .venv/bin/python scripts/red_team.py --base-url http://host:8000

Runs every attack in backend/security/red_team.py against the live API with
the seeded demonstration accounts, prints one line per attack, and writes
the full report -- observations, verdicts and a SHA-256 over the results --
to storage/reports/red-team-<UTC time>.json. The exit code is non-zero if
any attack was not refused or could not be carried out.

Run it on the host itself: the audit-tamper attack edits a *copy* of the
local audit log to show the chain detects it, and never touches the log.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402

from backend.core.config import PROJECT_ROOT, get_config  # noqa: E402
from backend.security.red_team import RedTeam  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--password", default=None, help="seed account password (default: from config)")
    arguments = parser.parse_args()

    config = get_config()
    audit_path = Path(str(config.settings.audit.get("log_file", "storage/logs/audit.jsonl")))
    if not audit_path.is_absolute():
        audit_path = PROJECT_ROOT / audit_path
    password = arguments.password or str(config.settings.security.get("seed_user_password") or "workbench")
    seeded = {str(seed["username"]) for seed in config.access_control.get("seed_users", [])}

    with httpx.Client(base_url=arguments.base_url, timeout=120) as client:
        report = RedTeam(client, password=password, audit_log_path=audit_path, seeded_usernames=seeded).run()
    report["target"] = arguments.base_url

    out_dir = PROJECT_ROOT / "storage" / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = out_dir / f"red-team-{stamp}.json"
    path.write_text(json.dumps(report, indent=2, default=str))

    width = max(len(r["attack"]) for r in report["results"])
    for result in report["results"]:
        mark = {"held": "✓", "BREACHED": "✗", "inconclusive": "?"}[result["outcome"]]
        print(f"  {mark} {result['id']:<15} {result['attack']:<{width}}  {result['outcome']}")
    summary = report["summary"]
    print(f"\n  {summary['held']} of {summary['total']} held · {summary['breached']} breached · "
          f"{summary['inconclusive']} inconclusive")
    print(f"  report  {path.relative_to(PROJECT_ROOT)}")
    print(f"  sha256  {report['results_sha256']}")
    return 0 if summary["held"] == summary["total"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
