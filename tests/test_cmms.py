"""The read-only CMMS connector, the cmms_read tool, and the approval note's sentence.

A run that assesses a tag asks the CMMS which work orders and notifications
are open against it. The answer is W evidence, and the note states whether a
repair is already raised, cited to that item. The sentence is written from
the lookup, never by the model, and a CMMS that cannot be asked is never
reported as "no work order".
"""

from __future__ import annotations

import asyncio
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any

import pytest

from backend.agents.orchestrator import AgentOrchestrator, EvidenceLedger
from backend.connectors import (
    CMMSConnector,
    ConnectorUnavailable,
    ReadOnlyMaintenanceSource,
    UnknownTag,
    get_cmms,
)
from backend.connectors.base import OPEN_STATUSES
from backend.connectors.cmms import (
    SIMULATED_ITEMS,
    build_simulated_cmms,
    endpoint_is_local,
    repair_status_sentence,
)
from backend.core.schemas import EvidenceItem, PolicyDecision, Sensitivity
from backend.tools.deliverables import get_deliverable_engine
from backend.tools.registry import ToolContext, ToolRegistry
from tests.test_engineering_pipeline import ENGINEER, _run
from tests.test_relief_assessment import RECORD

V2104_PROMPT = "Read the attached inspection report for V-2104 and prepare an approval note."


@pytest.fixture
def cmms(tmp_path: Path) -> CMMSConnector:
    return CMMSConnector(path=build_simulated_cmms(tmp_path / "cmms.db"))


@pytest.fixture
def seeded(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = build_simulated_cmms(tmp_path / "cmms.db")
    monkeypatch.setattr("backend.connectors.cmms_path", lambda: path)
    return path


# ---------------------------------------------------------------- the adapter
def test_the_simulator_serves_the_open_items_for_a_tag(cmms: CMMSConnector) -> None:
    assert isinstance(cmms, ReadOnlyMaintenanceSource)
    assert cmms.simulated and cmms.name == "cmms:simulator"
    description = cmms.describe()
    assert description["available"] and description["read_only"] and description["simulated"]
    assert description["as_of"] == "2026-09-20"

    items = cmms.open_items("v-2104")
    assert [(i.id, i.kind) for i in items] == [("WO-4000321", "work_order"), ("NOTIF-10402117", "notification")]
    order = items[0]
    assert order.work_type == "repair" and order.status == "awaiting_shutdown" and order.is_open
    assert order.reference == "NOTIF-10402117" and order.source == "cmms:simulator"
    assert items[1].reference == "INS-2026-0417"


def test_closed_items_are_not_open(cmms: CMMSConnector) -> None:
    # PSV-2104A's bench-test order closed on 2026-03-12: known, nothing open.
    assert cmms.open_items("PSV-2104A") == []
    closed = [row for row in SIMULATED_ITEMS if row[2] == "PSV-2104A"]
    assert closed and all(row[5] not in OPEN_STATUSES for row in closed)


def test_an_unknown_tag_and_a_missing_database_are_errors_not_empty_results(
    cmms: CMMSConnector, tmp_path: Path
) -> None:
    with pytest.raises(UnknownTag):
        cmms.open_items("XX-9999")
    absent = CMMSConnector(path=tmp_path / "nowhere.db")
    assert absent.describe()["available"] is False
    with pytest.raises(ConnectorUnavailable, match="seed_cmms"):
        absent.open_items("V-2104")


def test_the_cmms_cannot_be_written_through(cmms: CMMSConnector) -> None:
    # The interface has no write method at all...
    assert not any(hasattr(cmms, name) for name in ("create", "update", "release", "close", "write"))
    # ...and the connection it reads through refuses writes in the driver.
    with closing(cmms._connect()) as connection:
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            connection.execute("UPDATE items SET status = 'closed'")


def test_live_mode_is_declared_but_reads_nothing(tmp_path: Path) -> None:
    live = CMMSConnector(mode="live", endpoint="http://127.0.0.1:8443")
    assert not live.simulated
    assert "not implemented" in live.describe()["unavailable_reason"]
    with pytest.raises(ConnectorUnavailable, match="not implemented"):
        live.open_items("V-2104")
    # Outside the sovereignty ranges, or a name that would need DNS: refused.
    remote = CMMSConnector(mode="live", endpoint="https://sap.example.com/pm")
    assert "allowed_cidrs" in remote.describe()["unavailable_reason"]
    assert endpoint_is_local("http://127.0.0.1:8443", ["127.0.0.0/8"])
    assert not endpoint_is_local("http://10.4.2.19:8000", ["127.0.0.0/8"])
    assert not endpoint_is_local("https://sap.example.com", ["127.0.0.0/8"])
    with pytest.raises(ValueError):
        CMMSConnector(mode="sap")


def test_the_configured_connector_is_the_simulator(seeded: Path) -> None:
    connector = get_cmms()
    assert connector is not None and connector.mode == "simulator" and connector.path == seeded


# ------------------------------------------------------------------- the tool
def _context(tmp_path: Path) -> ToolContext:
    return ToolContext(user=ENGINEER, task_id="t-cmms", sensitivity=Sensitivity.CONFIDENTIAL, files=[],
                       workspace=tmp_path)


def test_cmms_read_is_registered_read_only_and_policy_gated(tmp_path: Path, seeded: Path) -> None:
    registry = ToolRegistry()
    entry = next(e for e in registry.describe() if e["name"] == "cmms_read")
    assert entry["registered_in_policy"] and entry["side_effects"] == "read_only"
    assert "cmms_read" in registry.available_for(ENGINEER, Sensitivity.CONFIDENTIAL)

    declared = registry.config.tool_permissions["tools"]["cmms_read"]
    original = declared["max_data_classification"]
    declared["max_data_classification"] = "normal"
    try:
        call = asyncio.run(registry.invoke("cmms_read", {"tag": "V-2104"}, _context(tmp_path)))
    finally:
        declared["max_data_classification"] = original
    assert not call.ok and call.policy_decision == PolicyDecision.DENY
    assert "cmms_read" in call.error


def test_cmms_read_returns_one_citable_item(tmp_path: Path, seeded: Path) -> None:
    call = asyncio.run(ToolRegistry().invoke("cmms_read", {"tag": "V-2104"}, _context(tmp_path)))
    assert call.ok and call.policy_decision == PolicyDecision.ALLOW
    assert call.output_summary == ("1 open work order(s) and 1 open notification(s) for V-2104 in "
                                   "cmms:simulator (simulated)")
    [item] = [EvidenceItem(**raw) for raw in call.output["evidence"]]
    assert item.kind == "cmms" and item.extraction_method == "cmms_read"
    assert item.source_document == "Simulated cmms:simulator · open work orders and notifications for V-2104"
    assert item.location == "V-2104 · open items as of 2026-09-20"
    data = item.extraction_data
    assert data["simulated"] is True and data["work_order_raised"] is True
    assert [i["id"] for i in data["open_items"]] == ["WO-4000321", "NOTIF-10402117"]
    assert "WO-4000321" in item.excerpt and "INS-2026-0417" in item.excerpt


def test_cmms_read_failures_are_reported(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    registry = ToolRegistry()
    monkeypatch.setattr("backend.connectors.cmms_path", lambda: tmp_path / "absent.db")
    missing = asyncio.run(registry.invoke("cmms_read", {"tag": "V-2104"}, _context(tmp_path)))
    assert not missing.ok and "seed_cmms" in missing.error and "evidence" not in missing.output
    empty = asyncio.run(registry.invoke("cmms_read", {}, _context(tmp_path)))
    assert not empty.ok and "tag is required" in empty.error


# ----------------------------------------------------------- the run's stage
def _stage(task, orchestrator: AgentOrchestrator, tmp_path: Path, limitations: list[str] | None = None):
    audited: list[dict[str, Any]] = []
    orchestrator.audit.record = lambda **entry: audited.append(entry)  # type: ignore[method-assign]
    context = ToolContext(user=ENGINEER, task_id=task.id, sensitivity=task.profile.sensitivity,
                          files=task.files, workspace=tmp_path)
    sentence = asyncio.run(orchestrator._maintenance_stage(
        task, context, EvidenceLedger(task.evidence), limitations if limitations is not None else []))
    return sentence, audited


def _orchestrator() -> AgentOrchestrator:
    orchestrator = AgentOrchestrator()
    orchestrator._persist = None
    emitted: list[tuple[str, dict]] = []

    async def capture(_task, event, data=None):
        emitted.append((event, data or {}))

    orchestrator._emit = capture  # type: ignore[method-assign]
    orchestrator.emitted = emitted  # type: ignore[attr-defined]
    return orchestrator


def test_a_vessel_run_records_the_open_repair_and_says_it_is_raised(tmp_path: Path, seeded: Path) -> None:
    task, _ = _run(V2104_PROMPT)
    assert task.assessment.subject == "V-2104"
    orchestrator = _orchestrator()
    sentence, audited = _stage(task, orchestrator, tmp_path)

    [item] = [e for e in task.evidence if e.kind == "cmms"]
    assert item.id == "W1"
    assert sentence == (
        "A work order is already raised for V-2104 in CMMS (simulator): WO-4000321 (repair, awaiting shutdown, "
        "planned start 2026-11-09): Repair cladding and insulation on shell course 2 (SOP-MNT-022). "
        "Open notification: NOTIF-10402117 (repair, in progress): Corrosion under insulation on shell "
        "course 2: cladding damaged over about 35%, insulation waterlogged [W1]."
    )
    # Policy-checked and audited like every tool call, and kept on the run.
    [call] = [c for c in task.tool_calls if c.tool == "cmms_read"]
    assert call.ok and call.policy_decision == PolicyDecision.ALLOW
    assert any(e["category"] == "tool" and e["action"] == "cmms_read:ok" for e in audited)
    assert [data["mode"] for event, data in orchestrator.emitted if event == "task.evidence"] == ["cmms"]


def test_a_relief_run_with_nothing_open_says_so_and_invents_nothing(tmp_path: Path, seeded: Path) -> None:
    task, _ = _run("May V-2104 stay in service? Prepare an approval note.", text=RECORD)
    assert task.assessment.kind == "relief" and task.assessment.subject == "PSV-2104A"
    sentence, _ = _stage(task, _orchestrator(), tmp_path)

    [item] = [e for e in task.evidence if e.kind == "cmms"]
    assert item.extraction_data["open_items"] == [] and item.extraction_data["work_order_raised"] is False
    assert sentence == f"No open work order found in CMMS (simulator) for PSV-2104A [{item.id}]."
    assert "No open work order or notification for PSV-2104A" in item.excerpt


def test_a_cmms_that_cannot_be_asked_is_not_reported_as_no_work_order(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("backend.connectors.cmms_path", lambda: tmp_path / "absent.db")
    task, _ = _run(V2104_PROMPT)
    limitations: list[str] = []
    sentence, audited = _stage(task, _orchestrator(), tmp_path, limitations)

    assert not [e for e in task.evidence if e.kind == "cmms"]
    assert sentence.startswith("CMMS (simulator) could not be read for V-2104 (")
    assert sentence.endswith("so whether a repair is already raised is not known.")
    assert "No open work order" not in sentence
    assert limitations and "seed_cmms" in limitations[0]
    assert any(e["action"] == "cmms_read:failed" for e in audited)


def test_no_lookup_without_an_assessed_tag(tmp_path: Path, seeded: Path) -> None:
    task, _ = _run(V2104_PROMPT)
    task.assessment = task.assessment.model_copy(update={"subject": "stated values"})
    sentence, _ = _stage(task, _orchestrator(), tmp_path)
    assert sentence is None and not task.tool_calls


# ------------------------------------------------------------------ the note
def test_the_sentence_names_notifications_without_a_work_order() -> None:
    notification = {"id": "NOTIF-1", "kind": "notification", "work_type": "repair", "status": "open",
                    "title": "Leak at flange"}
    assert repair_status_sentence("V-2118", [notification], evidence_id="W2", label="CMMS (simulator)") == (
        "No open work order found in CMMS (simulator) for V-2118. "
        "Open notification: NOTIF-1 (repair, open): Leak at flange [W2]."
    )


def test_the_approval_note_carries_the_sentence(tmp_path: Path) -> None:
    sentence = "No open work order found in CMMS (simulator) for PSV-2104A [W1]."
    engine = get_deliverable_engine()
    deliverable = engine.render(
        "md", task_id="t-cmms-note",
        content={"title": "Approval note", "sections": [{"heading": "Finding", "body": "PSV failed [F1]."}],
                 "recommendation": "Withdraw V-2104.", "maintenance": sentence},
        evidence=[EvidenceItem(id="W1", source_document="Simulated cmms:simulator · PSV-2104A",
                               excerpt="No open work order or notification for PSV-2104A.", kind="cmms")],
        routing=[], verification=None, author="Integrity Engineer",
    )
    text = (engine.output_root / "t-cmms-note" / deliverable.filename).read_text(encoding="utf-8")
    assert f"## Maintenance status (CMMS)\n\n{sentence}" in text
    assert "**[W1]** Simulated cmms:simulator" in text
