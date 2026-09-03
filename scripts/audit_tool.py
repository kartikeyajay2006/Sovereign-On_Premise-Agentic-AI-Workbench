"""Inspect and maintain the activity log.

    python scripts/audit_tool.py verify     report chain integrity
    python scripts/audit_tool.py archive    retire a broken chain and start fresh

A broken chain is evidence, not an inconvenience: it means entries were written
by two processes at once, or edited. `archive` therefore never rewrites or
deletes anything. It moves the existing log aside under a timestamped name,
records why in the new chain's first entry, and leaves the old file in place so
it can still be read and audited.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.core.audit import get_audit_log  # noqa: E402


def verify() -> int:
    log = get_audit_log()
    status = log.verify_chain()

    if status.valid:
        print(f"Chain verifies end to end over {status.events} events.")
        print(f"Head hash: {status.head_hash}")
        return 0

    print(f"Chain BROKEN at event {status.broken_at} (of {status.events} read).")

    # Say what actually happened, so the operator can judge it.
    records = [
        json.loads(line)
        for line in log.path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    at_break = [r for r in records if r.get("sequence") == status.broken_at]
    if len(at_break) > 1:
        print(
            f"\n{len(at_break)} entries share sequence {status.broken_at}. That is a "
            "concurrent write: two processes appended at the same moment, each "
            "believing it held the tail."
        )
        for record in at_break:
            print(
                f"  {record['at']}  {record['category']}/{record['action']}  "
                f"actor={record['actor']}"
            )
        print(
            "\nThis is the signature of a second service instance running against "
            "the same host. Confirm only one is running (./scripts/run.sh --status), "
            "then archive this chain to start a clean one."
        )
    else:
        print(
            "\nOnly one entry carries that sequence, so the content of an existing "
            "entry no longer matches its recorded hash. Treat the log as edited and "
            "investigate before archiving."
        )
    return 1


def archive() -> int:
    log = get_audit_log()
    status = log.verify_chain()
    if not log.path.exists() or log.path.stat().st_size == 0:
        print("Nothing to archive: the log is empty.")
        return 0

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = log.path.with_name(f"{log.path.stem}.{stamp}{log.path.suffix}")
    shutil.copy2(log.path, target)
    log.path.write_text("", encoding="utf-8")

    log.record(
        category="audit",
        action="chain_archived",
        actor="operator",
        detail={
            "archived_to": target.name,
            "previous_events": status.events,
            "previous_chain_valid": status.valid,
            "broken_at": status.broken_at,
            "reason": (
                "preceding chain retained unmodified; a new chain starts here"
            ),
        },
    )
    print(f"Archived {status.events} events to {target.name} (kept, unmodified).")
    print("A new chain starts from this point and its first entry records the archive.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["verify", "archive"])
    arguments = parser.parse_args()
    return verify() if arguments.command == "verify" else archive()


if __name__ == "__main__":
    raise SystemExit(main())
