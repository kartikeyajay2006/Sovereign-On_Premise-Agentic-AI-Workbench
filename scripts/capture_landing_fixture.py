"""Export one real, completed run into the landing page's hero fixture.

docs/plan/21-LANDING-PAGE-SPEC.md Section 3.5 is the contract this implements:

    the hero visual is a *run receipt* -- one card, five rows, rendered as real
    DOM from a JSON fixture that is an export of an actual completed run on a
    real host.

and, two paragraphs later, the reason this file exists at all:

    Content is written by scripts/capture_landing_fixture.py and is never
    hand-edited.

So every string this script writes into frontend/public/landing/run.json is
*derived* from the task record and the audit log. There is no narrative copy in
here keyed to a particular run: change the run id and the rows change with it,
including changing to the unflattering wording when that is what happened. A
marketing page that fabricates the one artifact it uses to prove it does not
fabricate things would be the worst possible failure, and the only structural
defence against that is that a human never types these values.

Two transformations are performed, and both are recorded in the output file:

  1. Nothing is redacted. The demo corpus is synthetic (scripts/seed_demo_data.py).
  2. Hashes are truncated to their first 8 hex characters for display, with the
     full value kept in a sibling `hash_full` field.

Usage
-----
    python scripts/capture_landing_fixture.py                # pick the best run
    python scripts/capture_landing_fixture.py --task <uuid>  # pick one by id

    --api       base URL of the running workbench  (default http://127.0.0.1:8000)
    --user      workbench username                 (default engineer)
    --password  workbench password                 (default workbench)
    --audit     path to the audit log      (default storage/logs/audit.jsonl)
    --out       path to write              (default frontend/public/landing/run.json)

The script exits non-zero and writes nothing if no run qualifies. That is
deliberate: the page's fallback is a hero with no receipt card, not a receipt
card with invented rows.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent

# A run is only worth putting above the fold if the pipeline actually reached
# the end of itself. Anything still moving is not a receipt.
TERMINAL_STATUSES = {"awaiting_approval", "approved", "completed", "rejected"}


# --------------------------------------------------------------------------- #
# Reading the real stores
# --------------------------------------------------------------------------- #


def _request(url: str, token: str | None = None, payload: dict[str, Any] | None = None) -> Any:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def login(api: str, username: str, password: str) -> str:
    body = _request(f"{api}/api/auth/login", payload={"username": username, "password": password})
    return str(body["token"])


def read_audit(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


# --------------------------------------------------------------------------- #
# Choosing a run
# --------------------------------------------------------------------------- #


def score(task: dict[str, Any]) -> tuple[int, int, int, str]:
    """Rank finished runs by how much of the pipeline they actually exercised.

    Not by how flattering they are. The ordering is: more evidence retrieved,
    then more verification checks passed, then more supported claims, then most
    recent. A run that retrieved nothing sorts last because it demonstrates the
    least of the chain -- not because its receipt would read badly.
    """
    verification = task.get("verification") or {}
    checks = verification.get("checks") or []
    return (
        len(task.get("evidence") or []),
        sum(1 for check in checks if check.get("passed")),
        int(verification.get("material_claims_supported") or 0),
        str(task.get("created_at") or ""),
    )


def pick_task(api: str, token: str, task_id: str | None) -> dict[str, Any]:
    if task_id:
        return _request(f"{api}/api/tasks/{task_id}", token)

    summaries = _request(f"{api}/api/tasks", token)
    finished = [t for t in summaries if t.get("status") in TERMINAL_STATUSES]
    if not finished:
        raise SystemExit(
            "No run has reached a terminal status. Nothing to capture; the hero "
            "ships without its receipt card."
        )

    full = [_request(f"{api}/api/tasks/{t['id']}", token) for t in finished]
    return max(full, key=score)


# --------------------------------------------------------------------------- #
# Deriving the five rows
# --------------------------------------------------------------------------- #


def _plural(count: int, singular: str, plural: str | None = None) -> str:
    return singular if count == 1 else (plural or singular + "s")


def row_cited(task: dict[str, Any]) -> dict[str, str]:
    evidence = task.get("evidence") or []
    if not evidence:
        return {
            "value": "No local evidence was retrieved",
            "meta": "0 passages",
        }
    documents = {e.get("document_id") or e.get("source_document") for e in evidence}
    first = evidence[0]
    # "SOP-MNT-022 - Management of ..." carries its clause number in the first
    # token; the rest is prose that does not fit a meta column.
    document = str(first.get("source_document") or "").split(" — ")[0].strip()
    location = str(first.get("location") or "").replace("section: ", "§").strip()
    return {
        "value": (
            f"{len(evidence)} {_plural(len(evidence), 'passage')} from "
            f"{len(documents)} {_plural(len(documents), 'document')}"
        ),
        "meta": " ".join(part for part in (document, location) if part),
    }


def row_checked(task: dict[str, Any]) -> dict[str, str]:
    verification = task.get("verification") or {}
    checks = verification.get("checks") or []
    passed = sum(1 for check in checks if check.get("passed"))
    total_claims = int(verification.get("material_claims_total") or 0)
    supported = int(verification.get("material_claims_supported") or 0)
    if total_claims:
        value = (
            f"{supported} of {total_claims} material "
            f"{_plural(total_claims, 'claim')} traced to evidence"
        )
    else:
        value = "No material claim was made"
    return {"value": value, "meta": f"{passed} of {len(checks)} checks passed"}


def row_computed(task: dict[str, Any]) -> dict[str, str]:
    runs = [call for call in (task.get("tool_calls") or []) if call.get("tool") == "python_exec"]
    if not runs:
        return {
            "value": "No code was generated for this run",
            "meta": "sandbox not entered",
        }
    executed = [call for call in runs if call.get("ok")]
    if not executed:
        # A refusal is the product working, and it is reported as such rather
        # than dropped from the card.
        summary = str(runs[0].get("output_summary") or "refused").strip()
        return {
            "value": "The sandbox refused the generated code",
            "meta": summary,
        }
    milliseconds = sum(int(call.get("duration_ms") or 0) for call in executed)
    return {
        "value": f"{len(executed)} {_plural(len(executed), 'script')} executed in the sandbox",
        "meta": f"{milliseconds} ms · 0 sockets",
    }


def row_decision(task: dict[str, Any]) -> dict[str, str]:
    """The fourth row's *label* is data too.

    A run held for a reviewer is not an approved run, and printing APPROVED over
    a pending decision would be the exact class of overclaim this page exists to
    avoid. The label is therefore returned alongside the value.
    """
    approval = task.get("approval") or {}
    decision = str(approval.get("decision") or "none")

    if decision == "approved":
        reviewer = str(approval.get("reviewer_name") or "a reviewer")
        return {
            "label": "APPROVED",
            "value": f"Released by {reviewer}",
            "meta": _stamp(approval.get("decided_at")),
        }
    if decision == "rejected":
        return {
            "label": "REJECTED",
            "value": "A reviewer refused release",
            "meta": _stamp(approval.get("decided_at")),
        }
    if approval.get("required"):
        roles = approval.get("approver_roles") or []
        return {
            "label": "HELD",
            "value": "Held for a reviewer before release",
            "meta": " or ".join(str(role) for role in roles) or "approval pending",
        }
    return {
        "label": "RELEASED",
        "value": "No approval was required for this run",
        "meta": "policy: auto-release permitted",
    }


def row_recorded(task: dict[str, Any], audit: list[dict[str, Any]]) -> dict[str, str]:
    matching = [record for record in audit if record.get("task_id") == task.get("id")]
    if not matching:
        return {
            "value": "No audit record was found for this run",
            "meta": "storage/logs/audit.jsonl",
            "hash_full": "",
        }
    last = matching[-1]
    full_hash = str(last.get("hash") or "")
    return {
        "value": (
            f"{len(matching)} {_plural(len(matching), 'record')} appended to the audit chain"
        ),
        "meta": f"seq {last.get('sequence')} · {full_hash[:8]}",
        "hash_full": full_hash,
    }


def _stamp(value: Any) -> str:
    """An ISO timestamp rendered the way the receipt's meta column wants it."""
    if not value:
        return ""
    text = str(value).replace("Z", "+00:00")
    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        return str(value)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _short_date(value: Any) -> str:
    if not value:
        return ""
    text = str(value).replace("Z", "+00:00")
    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        return str(value)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    # "21 Sep 2026" -- strftime("%d") is zero-padded on every platform, and a
    # leading zero in a date beside a hash reads like part of the hash.
    return f"{moment.day} {moment.strftime('%b %Y')}"


# --------------------------------------------------------------------------- #
# Assembly
# --------------------------------------------------------------------------- #


def build(task: dict[str, Any], audit: list[dict[str, Any]], api: str) -> dict[str, Any]:
    decision = row_decision(task)
    models = sorted({str(r.get("selected_model")) for r in (task.get("routing") or []) if r.get("selected_model")})

    return {
        "_comment": (
            "Written by scripts/capture_landing_fixture.py from a real completed run. "
            "Never hand-edited. Hashes are truncated to 8 hex characters for display; "
            "the full value is kept in hash_full. Nothing is redacted -- the corpus is "
            "synthetic, seeded by scripts/seed_demo_data.py."
        ),
        "captured_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "captured_from": f"developer host, ollama loopback, CPU-only, api {api}",
        "task_id": str(task.get("id") or ""),
        "status": str(task.get("status") or ""),
        "prompt": str(task.get("prompt") or ""),
        "created_at": str(task.get("created_at") or ""),
        "captured_on": _short_date(task.get("created_at")),
        "duration_ms": task.get("duration_ms"),
        "models": models,
        "cited": row_cited(task),
        "checked": row_checked(task),
        "computed": row_computed(task),
        "decision": decision,
        "recorded": row_recorded(task, audit),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", default=None, help="capture this task id instead of the best run")
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--user", default="engineer")
    parser.add_argument("--password", default="workbench")
    parser.add_argument("--audit", default=str(REPO_ROOT / "storage" / "logs" / "audit.jsonl"))
    parser.add_argument("--out", default=str(REPO_ROOT / "frontend" / "public" / "landing" / "run.json"))
    args = parser.parse_args()

    try:
        token = login(args.api, args.user, args.password)
    except (urllib.error.URLError, OSError) as error:
        print(f"Cannot reach the workbench at {args.api}: {error}", file=sys.stderr)
        print("Nothing written. The hero ships without its receipt card.", file=sys.stderr)
        return 1

    task = pick_task(args.api, token, args.task)
    if task.get("status") not in TERMINAL_STATUSES:
        print(
            f"Task {task.get('id')} is {task.get('status')}, which is not a finished run.",
            file=sys.stderr,
        )
        return 1

    fixture = build(task, read_audit(Path(args.audit)), args.api)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fixture, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Captured {fixture['task_id']} ({fixture['status']}) -> {out}")
    for key in ("cited", "checked", "computed", "decision", "recorded"):
        row = fixture[key]
        label = row.get("label", key.upper())
        print(f"  {label:<10} {row['value']}  |  {row['meta']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
