"""Export one real, completed run into the landing page's fixture.

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

Beyond the five receipt rows, the fixture now carries the rest of the run the
page renders as working product surfaces rather than as screenshots:

  answer             the answer exactly as the model returned it
  evidence           every passage retrieval returned, in rank order, each
                     flagged with whether the answer actually cites it
  retrieval          how the passages were found, and how long it took
  verification       the verifier's report, check by check, verbatim
  approval           whether release is held, for whom, and why
  policy_events      each policy decision taken during the run
  timeline           where the run's time went, stage by stage, from latencies
                     the backend measured -- and which stages never ran
  audit              the run's record count, and its final three records
                     exactly as stored, so a browser can recompute their hashes
  sandbox_self_test  the most recent sandbox self-test in the audit log

Three transformations are performed, and all three are recorded in the output:

  1. Nothing is redacted. The demo corpus is synthetic (scripts/seed_demo_data.py).
  2. Hashes in the receipt rows are truncated to their first 8 hex characters
     for display, with the full value kept in a sibling `hash_full` field. The
     audit records under `audit.tail` are not truncated or re-serialised at
     all: `line` is the stored line, byte for byte.
  3. Nothing is defaulted. A value the record does not carry is exported as
     null or omitted, never filled in -- a missing similarity score stays
     missing rather than becoming a pleasant number.

Usage
-----
    python scripts/capture_landing_fixture.py                # best run, over the API
    python scripts/capture_landing_fixture.py --task <uuid>  # one run, over the API
    python scripts/capture_landing_fixture.py --db storage/workbench.db --task <uuid>
                            # read the task straight from the workbench database,
                            # opened read-only, with no backend running

    --api       base URL of the running workbench  (default http://127.0.0.1:8000)
    --user      workbench username                 (default engineer)
    --password  workbench password                 (default workbench)
    --db        read the task record from this SQLite file instead of the API
    --audit     path to the audit log      (default storage/logs/audit.jsonl)
    --out       path to write              (default frontend/public/landing/run.json)

The script exits non-zero and writes nothing if no run qualifies. That is
deliberate: the page's fallback is a hero with no receipt card, not a receipt
card with invented rows.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent

# A run is only worth putting above the fold if the pipeline actually reached
# the end of itself. Anything still moving is not a receipt.
# "delivered" is how the task service records an answer released without a
# hold; "completed" is kept for records written before that status existed.
TERMINAL_STATUSES = {"awaiting_approval", "approved", "completed", "delivered", "rejected"}

# The same marker shape backend/agents/verifier.py treats as a citation, so a
# passage counts as cited here exactly when it would count there.
CITATION = re.compile(r"\[([SFVCE]\d+)\]")

# The audit log names model calls by pipeline stage. These are the ones the
# landing page's seven-stage table has a row for; anything else is ignored
# rather than guessed into a row it may not belong to.
INFERENCE_STAGE = {
    "planning": "plan",
    "drafting": "draft",
    "verification": "verify",
    "vision": "read",
}

# Readable names for the verifier's checks, used only in the receipt row.
CHECK_NAME = {
    "source_verification": "source",
    "calculation_verification": "calculation",
    "code_verification": "code",
    "hallucination_check": "hallucination",
}


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


def read_audit_raw(path: Path) -> list[tuple[dict[str, Any], str]]:
    """Every audit record, paired with the exact line it was parsed from.

    The line is kept because the page recomputes record hashes in the browser,
    and a hash has to be recomputed from what was stored, not from a copy that
    has been parsed and written back out. Re-serialising would be a second
    encoder's opinion of the record, and a float or an escape that encoder
    spells differently would make an untouched record look tampered with.
    """
    if not path.exists():
        return []
    records: list[tuple[dict[str, Any], str]] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            stored = line.rstrip("\r\n")
            if stored.strip():
                records.append((json.loads(stored), stored))
    return records


def read_audit(path: Path) -> list[dict[str, Any]]:
    return [record for record, _ in read_audit_raw(path)]


# --------------------------------------------------------------------------- #
# Choosing a run
# --------------------------------------------------------------------------- #


def score(task: dict[str, Any]) -> tuple[int, int, int, str]:
    """Rank finished runs by how much of the pipeline they actually exercised.

    Not by how flattering they are. The ordering is: more evidence retrieved,
    then more verification checks passed, then more supported claims, then most
    recent. A run that retrieved nothing sorts last because it demonstrates the
    least of the chain -- not because its receipt would read badly.

    This ranking cannot tell a right answer from a wrong one, and it is not
    asked to. The page's run is chosen by a person with --task, after reading
    the answer against its passages; this only picks a default.
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


def pick_task_from_db(db: Path, task_id: str | None) -> dict[str, Any]:
    """The same choice, made from the workbench database instead of the API.

    Opened with mode=ro, so this path cannot write to the store it reads even
    by accident, and it needs no running backend: the task payload the API
    serves is the row's `payload` column.
    """
    if not db.exists():
        raise SystemExit(f"No database at {db}. Nothing written.")
    connection = sqlite3.connect(db.resolve().as_uri() + "?mode=ro", uri=True)
    try:
        if task_id:
            row = connection.execute("SELECT payload FROM tasks WHERE id = ?", (task_id,)).fetchone()
            if row is None:
                raise SystemExit(f"No task {task_id} in {db}. Nothing written.")
            return json.loads(row[0])
        statuses = sorted(TERMINAL_STATUSES)
        placeholders = ", ".join("?" for _ in statuses)
        rows = connection.execute(
            f"SELECT payload FROM tasks WHERE status IN ({placeholders})", statuses
        ).fetchall()
    finally:
        connection.close()

    if not rows:
        raise SystemExit(
            "No run has reached a terminal status. Nothing to capture; the hero "
            "ships without its receipt card."
        )
    return max((json.loads(row[0]) for row in rows), key=score)


# --------------------------------------------------------------------------- #
# Deriving the five rows
# --------------------------------------------------------------------------- #


def _plural(count: int, singular: str, plural: str | None = None) -> str:
    return singular if count == 1 else (plural or singular + "s")


def cited_ids(answer: str) -> list[str]:
    """Citation markers in the order the answer first uses them."""
    seen: list[str] = []
    for marker in CITATION.findall(answer):
        if marker not in seen:
            seen.append(marker)
    return seen


def _clause(item: dict[str, Any]) -> str:
    """ "SOP-MNT-022 — Management of ..." + "section: 4. Assessment" -> "SOP-MNT-022 §4".

    The document code is the first token of the title; the rest is prose that
    does not fit a meta column. The section keeps only its number.
    """
    document = str(item.get("source_document") or "").split(" — ")[0].strip()
    location = str(item.get("location") or "")
    match = re.match(r"\s*section:\s*([0-9]+(?:\.[0-9]+)*)", location)
    section = f"§{match.group(1)}" if match else location.replace("section: ", "§").strip()
    return " ".join(part for part in (document, section) if part)


def row_cited(task: dict[str, Any]) -> dict[str, str]:
    evidence = task.get("evidence") or []
    if not evidence:
        return {
            "value": "No local evidence was retrieved",
            "meta": "0 passages",
        }
    documents = {e.get("document_id") or e.get("source_document") for e in evidence}
    markers = cited_ids(str(task.get("answer") or ""))
    by_id = {str(e.get("id")): e for e in evidence}
    cited = [by_id[m] for m in markers if m in by_id]
    retrieved = (
        f"{len(evidence)} {_plural(len(evidence), 'passage')} from "
        f"{len(documents)} {_plural(len(documents), 'document')}"
    )
    if not cited:
        # Retrieval ran and the answer leaned on none of it. That is a finding
        # about the answer, and it is printed as one.
        return {"value": f"{retrieved}, none cited in the answer", "meta": "0 cited"}
    return {
        "value": f"{retrieved}, {len(cited)} cited in the answer",
        "meta": " · ".join(dict.fromkeys(_clause(item) for item in cited)),
    }


def row_checked(task: dict[str, Any]) -> dict[str, str]:
    """The verdict, not the claim count.

    This row used to lead with "N of M material claims traced to evidence".
    On the run this page shows, that read "1 of 1": the claim patterns of the
    day counted one sentence of the answer's three, and the sentence they
    skipped is the wrong one. policies/approval-rules.yaml now calls that "a
    far stronger statement than examining one sentence of three can justify",
    and the verifier's own docstring says its claim trace establishes that a
    claim is ABOUT its passage, not that the passage supports it. The count is
    still exported in full under `verification`; it is not the headline.
    """
    verification = task.get("verification") or {}
    checks = verification.get("checks") or []
    if not checks:
        return {"value": "No verification report was recorded", "meta": "0 checks"}
    passed = sum(1 for check in checks if check.get("passed"))
    failed = [
        CHECK_NAME.get(str(check.get("name")), str(check.get("name")))
        for check in checks
        if not check.get("passed")
    ]
    meta = f"{passed} of {len(checks)} checks passed"
    if verification.get("valid") and not failed:
        return {"value": "Passed verification", "meta": meta}
    if failed:
        meta += f" · {', '.join(failed)} failed"
    return {"value": "Did not pass verification", "meta": meta}


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
    moment = _moment(value)
    if moment is None:
        return str(value or "")
    return moment.strftime("%Y-%m-%d %H:%M UTC")


def _moment(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).replace("Z", "+00:00")
    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)


def _short_date(value: Any) -> str:
    moment = _moment(value)
    if moment is None:
        return str(value or "")
    # "21 Sep 2026" -- strftime("%d") is zero-padded on every platform, and a
    # leading zero in a date beside a hash reads like part of the hash.
    return f"{moment.day} {moment.strftime('%b %Y')}"


# --------------------------------------------------------------------------- #
# The rest of the run
# --------------------------------------------------------------------------- #


def export_evidence(task: dict[str, Any]) -> list[dict[str, Any]]:
    """Every retrieved passage, in the order retrieval ranked it.

    Uncited passages are exported too. "Six retrieved, two cited" is a fact
    about the answer that the page can only state if it has all six.
    """
    cited = set(cited_ids(str(task.get("answer") or "")))
    items: list[dict[str, Any]] = []
    for rank, item in enumerate(task.get("evidence") or [], start=1):
        items.append(
            {
                "id": item.get("id"),
                "rank": rank,
                "cited": item.get("id") in cited,
                "source_document": item.get("source_document"),
                "document_id": item.get("document_id"),
                "location": item.get("location"),
                # null when the backend reported none. Never defaulted.
                "score": item.get("score"),
                "classification": item.get("classification"),
                "version": item.get("version"),
                "excerpt": item.get("excerpt"),
            }
        )
    return items


def export_retrieval(task: dict[str, Any]) -> dict[str, Any] | None:
    calls = [call for call in (task.get("tool_calls") or []) if call.get("tool") == "knowledge_search"]
    if not calls:
        return None
    call = calls[0]
    output = call.get("output") or {}
    return {
        "mode": output.get("mode"),
        "duration_ms": call.get("duration_ms"),
        "summary": call.get("output_summary"),
        "policy_decision": call.get("policy_decision"),
    }


def export_verification(task: dict[str, Any]) -> dict[str, Any] | None:
    verification = task.get("verification")
    if not verification:
        return None
    return {
        "valid": verification.get("valid"),
        "checks": [
            {
                "name": check.get("name"),
                "passed": check.get("passed"),
                "detail": check.get("detail"),
                "warnings": list(check.get("warnings") or []),
            }
            for check in verification.get("checks") or []
        ],
        "material_claims_total": verification.get("material_claims_total"),
        "material_claims_supported": verification.get("material_claims_supported"),
        "completed_at": verification.get("completed_at"),
    }


def export_approval(task: dict[str, Any]) -> dict[str, Any]:
    approval = task.get("approval") or {}
    return {
        "required": bool(approval.get("required")),
        "decision": approval.get("decision"),
        "approver_roles": list(approval.get("approver_roles") or []),
        "reasons": list(approval.get("reasons") or []),
        "reviewer_name": approval.get("reviewer_name"),
        "decided_at": approval.get("decided_at"),
    }


def export_policy_events(task: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "action": event.get("action"),
            "subject": event.get("subject"),
            "decision": event.get("decision"),
            "rule": event.get("rule"),
            "reason": event.get("reason"),
            "at": event.get("at"),
        }
        for event in task.get("policy_events") or []
    ]


def export_timeline(task: dict[str, Any], audit: list[dict[str, Any]]) -> dict[str, Any]:
    """Where the run's time went, one row per pipeline stage.

    Every duration is one the backend measured: a model call's latency_ms from
    the audit log, a tool call's duration_ms from the task record, and for
    classification the gap between the two audit records that bracket it. A
    stage with no record of running is exported with `ran: false` and the
    reason, never with a duration -- the board that painted unrun stages green
    is the failure this row exists to avoid.

    The durations do not sum to the total and are not made to. The remainder
    is time between stages, and the page states it as such.
    """
    records = [record for record in audit if record.get("task_id") == task.get("id")]

    def first(category: str, action: str) -> dict[str, Any] | None:
        return next(
            (r for r in records if r.get("category") == category and r.get("action") == action),
            None,
        )

    inference: dict[str, dict[str, Any]] = {}
    for record in records:
        if record.get("category") != "model":
            continue
        detail = record.get("detail") or {}
        stage = INFERENCE_STAGE.get(str(detail.get("stage")))
        if stage is None:
            continue
        # ms and chars start as None, not 0: a call that started and never
        # completed has no measured latency, and unknown is not zero.
        slot = inference.setdefault(stage, {"ms": None, "model": None, "model_version": None, "chars": None})
        if record.get("action") == "inference_started":
            slot["model"] = detail.get("model") or slot["model"]
            slot["model_version"] = detail.get("model_version") or slot["model_version"]
        elif record.get("action") == "inference_completed":
            if detail.get("latency_ms") is not None:
                slot["ms"] = (slot["ms"] or 0) + int(detail["latency_ms"])
            if detail.get("output_chars") is not None:
                slot["chars"] = (slot["chars"] or 0) + int(detail["output_chars"])
            slot["model"] = slot["model"] or detail.get("model")

    tools = task.get("tool_calls") or []
    searches = [call for call in tools if call.get("tool") == "knowledge_search"]
    scripts = [call for call in tools if call.get("tool") == "python_exec"]
    files = task.get("files") or []
    profile = task.get("profile") or {}
    plan = task.get("plan") or {}
    checks = (task.get("verification") or {}).get("checks") or []

    received = _moment((first("task", "received") or {}).get("at"))
    classified = _moment((first("task", "classified") or {}).get("at"))
    classify_ms = (
        int((classified - received).total_seconds() * 1000) if received and classified else None
    )

    def stage(stage_id: str, ran: bool, ms: int | None, note: str, model: dict[str, Any] | None = None) -> dict[str, Any]:
        return {
            "id": stage_id,
            "ran": ran,
            "ms": ms if ran else None,
            "model": (model or {}).get("model") if ran else None,
            "model_version": (model or {}).get("model_version") if ran else None,
            "note": note,
        }

    evidence_count = len(task.get("evidence") or [])
    passed = sum(1 for check in checks if check.get("passed"))
    steps = len(plan.get("steps") or [])
    drafted = inference.get("draft", {}).get("chars")

    return {
        "total_ms": task.get("duration_ms"),
        "stages": [
            stage(
                "classify",
                bool(profile),
                classify_ms,
                " · ".join(
                    str(part)
                    for part in (profile.get("task_type"), profile.get("sensitivity"))
                    if part
                )
                if profile
                else "no classification was recorded",
            ),
            stage(
                "plan",
                bool(plan),
                inference.get("plan", {}).get("ms"),
                f"{steps} {_plural(steps, 'step')}" if plan else "no plan was made",
                inference.get("plan"),
            ),
            stage(
                "read",
                bool(files) or "read" in inference,
                inference.get("read", {}).get("ms"),
                f"{len(files)} {_plural(len(files), 'file')}" if files else "no file was attached",
                inference.get("read"),
            ),
            stage(
                "retrieve",
                bool(searches),
                int(searches[0].get("duration_ms") or 0) if searches else None,
                (
                    f"{evidence_count} {_plural(evidence_count, 'passage')}, "
                    f"{(searches[0].get('output') or {}).get('mode') or 'unknown'} search"
                )
                if searches
                else "no search was run",
            ),
            stage(
                "sandbox",
                bool(scripts),
                sum(int(call.get("duration_ms") or 0) for call in scripts) if scripts else None,
                f"{len(scripts)} {_plural(len(scripts), 'script')}" if scripts else "no code was generated",
            ),
            stage(
                "draft",
                bool(task.get("answer")),
                inference.get("draft", {}).get("ms"),
                (f"{drafted} characters" if drafted is not None else "answer recorded")
                if task.get("answer")
                else "no answer was drafted",
                inference.get("draft"),
            ),
            stage(
                "verify",
                bool(task.get("verification")),
                inference.get("verify", {}).get("ms"),
                f"{passed} of {len(checks)} {_plural(len(checks), 'check')} passed"
                if task.get("verification")
                else "no verification ran",
                inference.get("verify"),
            ),
        ],
    }


USAGE_FIELDS = (
    "stage",
    "model",
    "display_name",
    "prompt_tokens",
    "output_tokens",
    "tokens_per_second",
    "latency_ms",
    "load_ms",
    "prompt_eval_ms",
    "eval_ms",
    "context_window",
    "cancelled",
)


def export_usage(task: dict[str, Any]) -> list[dict[str, Any]]:
    """Each model call as the runtime reported it, in order.

    Copied field by field; a count the runtime did not report stays null, so
    the page's usage line prints less rather than a smaller total.
    """
    return [{field: call.get(field) for field in USAGE_FIELDS} for call in task.get("usage") or []]


def export_skill(task: dict[str, Any]) -> dict[str, Any] | None:
    """The skill the request went through, if any: its id, name, hash and the typed input."""
    skill = task.get("skill")
    if not isinstance(skill, dict):
        return None
    return {key: skill.get(key) for key in ("id", "name", "sha256", "source", "input")}


def export_audit(task: dict[str, Any], audit_raw: list[tuple[dict[str, Any], str]], path: Path) -> dict[str, Any]:
    """The run's count, and its final record with the two written before it.

    The two are taken from the log, not from the run: three records are only a
    chain if they are consecutive in the file, and another task can write
    between two of this one's. Taking the neighbours by position guarantees
    each record's prev_hash is the hash of the record shown above it.
    """
    positions = [i for i, (record, _) in enumerate(audit_raw) if record.get("task_id") == task.get("id")]
    try:
        shown_path = path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        shown_path = path.as_posix()
    if not positions:
        return {"path": shown_path, "count": 0, "first_sequence": None, "last_sequence": None, "tail": []}
    last = positions[-1]
    window = audit_raw[max(0, last - 2) : last + 1]
    return {
        "path": shown_path,
        "count": len(positions),
        "first_sequence": audit_raw[positions[0]][0].get("sequence"),
        "last_sequence": audit_raw[last][0].get("sequence"),
        "tail": [
            {
                "sequence": record.get("sequence"),
                "at": record.get("at"),
                "category": record.get("category"),
                "action": record.get("action"),
                "prev_hash": record.get("prev_hash"),
                "hash": record.get("hash"),
                "line": stored,
            }
            for record, stored in window
        ],
    }


def export_sandbox_self_test(audit: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The most recent self-test the backend recorded, whatever it said.

    GET /api/sovereignty/sandbox-test writes its result to the audit log, so
    the latest reading is already on disk with a sequence number and a hash.
    Taking it from there means the page quotes a recorded measurement rather
    than a response someone copied out of a browser.
    """
    runs = [record for record in audit if record.get("action") == "sandbox_self_test"]
    if not runs:
        return None
    latest = runs[-1]
    return {
        "sequence": latest.get("sequence"),
        "at": latest.get("at"),
        "hash": latest.get("hash"),
        "detail": latest.get("detail"),
    }


# --------------------------------------------------------------------------- #
# Assembly
# --------------------------------------------------------------------------- #


def build(
    task: dict[str, Any],
    audit_raw: list[tuple[dict[str, Any], str]],
    audit_path: Path,
    source: str,
    selection: str,
) -> dict[str, Any]:
    audit = [record for record, _ in audit_raw]
    decision = row_decision(task)
    models = sorted({str(r.get("selected_model")) for r in (task.get("routing") or []) if r.get("selected_model")})

    return {
        "_comment": (
            "Written by scripts/capture_landing_fixture.py from one real finished run. "
            f"Source: {source}. Run chosen {selection}. Never hand-edited. "
            "Receipt-row hashes are truncated to 8 hex characters for display, with the "
            "full value in hash_full. audit.tail holds the run's final record and the two "
            "written immediately before it, and each `line` is the line exactly as stored "
            "in the audit log, so its hash can be recomputed. Values the record does not "
            "carry are null, never defaulted. Nothing is redacted -- the corpus is "
            "synthetic, seeded by scripts/seed_demo_data.py."
        ),
        "captured_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "captured_from": source,
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
        "answer": str(task.get("answer") or ""),
        "evidence": export_evidence(task),
        "retrieval": export_retrieval(task),
        "verification": export_verification(task),
        "approval": export_approval(task),
        "policy_events": export_policy_events(task),
        "timeline": export_timeline(task, audit),
        "usage": export_usage(task),
        "skill": export_skill(task),
        "audit": export_audit(task, audit_raw, audit_path),
        "sandbox_self_test": export_sandbox_self_test(audit),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", default=None, help="capture this task id instead of the best run")
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--user", default="engineer")
    parser.add_argument("--password", default="workbench")
    parser.add_argument("--db", default=None, help="read the task from this SQLite file, read-only")
    parser.add_argument("--audit", default=str(REPO_ROOT / "storage" / "logs" / "audit.jsonl"))
    parser.add_argument("--out", default=str(REPO_ROOT / "frontend" / "public" / "landing" / "run.json"))
    args = parser.parse_args()

    audit_path = Path(args.audit)
    selection = f"with --task {args.task}" if args.task else "by score(), the most complete finished run"

    if args.db:
        db = Path(args.db)
        task = pick_task_from_db(db, args.task)
        try:
            shown_db = db.resolve().relative_to(REPO_ROOT).as_posix()
        except ValueError:
            shown_db = db.as_posix()
        source = f"{shown_db} opened read-only, and the audit log, on the developer host that ran the task"
    else:
        try:
            token = login(args.api, args.user, args.password)
        except (urllib.error.URLError, OSError) as error:
            print(f"Cannot reach the workbench at {args.api}: {error}", file=sys.stderr)
            print("Nothing written. The hero ships without its receipt card.", file=sys.stderr)
            return 1
        task = pick_task(args.api, token, args.task)
        source = f"developer host, ollama loopback, api {args.api}"

    if task.get("status") not in TERMINAL_STATUSES:
        print(
            f"Task {task.get('id')} is {task.get('status')}, which is not a finished run.",
            file=sys.stderr,
        )
        return 1

    fixture = build(task, read_audit_raw(audit_path), audit_path, source, selection)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fixture, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Captured {fixture['task_id']} ({fixture['status']}) -> {out}")
    for key in ("cited", "checked", "computed", "decision", "recorded"):
        row = fixture[key]
        label = row.get("label", key.upper())
        print(f"  {label:<10} {row['value']}  |  {row['meta']}")
    cited = [item["id"] for item in fixture["evidence"] if item["cited"]]
    print(f"  answer     {len(fixture['answer'])} characters, cites {', '.join(cited) or 'nothing'}")
    print(f"  audit      {fixture['audit']['count']} records, tail seq "
          f"{[r['sequence'] for r in fixture['audit']['tail']]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
