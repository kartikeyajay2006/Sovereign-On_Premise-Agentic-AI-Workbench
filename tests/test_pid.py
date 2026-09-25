"""P&ID topology: isolation plans and flow questions answered from the graph."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.agents.orchestrator import AgentOrchestrator, EvidenceLedger, _topology_block
from backend.api.main import create_app
from backend.core.analyzer import get_task_analyzer
from backend.core.schemas import Task, TaskStatus
from backend.engineering.pid import Drawing, DrawingError, get_drawing_library
from backend.policy.gateway import get_policy_gateway
from tests.test_engineering_pipeline import ENGINEER

ROOT = Path(__file__).resolve().parents[1]
DRAWING = ROOT / "sample_data" / "pid" / "PID-2104-01-crude-overhead.json"


@pytest.fixture(scope="module")
def drawing() -> Drawing:
    return Drawing.load(DRAWING)


def _branch(result: dict, line: str) -> dict:
    return next(b for b in result["branches"] if b["line"] == line)


def test_a_drawing_that_joins_unknown_elements_is_refused(tmp_path: Path) -> None:
    data = json.loads(DRAWING.read_text())
    data["edges"].append({"from": "V-2104", "to": "GHOST-1", "line": "X-1"})
    broken = tmp_path / "broken.json"
    broken.write_text(json.dumps(data))
    with pytest.raises(DrawingError, match="GHOST-1"):
        Drawing.load(broken)


def test_confined_space_entry_needs_a_blind_on_every_branch(drawing: Drawing) -> None:
    result = drawing.isolation("V-2104", "confined_space")
    assert len(result["branches"]) == 5
    assert result["compliant"] is False
    assert sorted(result["non_compliant"]) == ["P-2104-RV-01", "P-2104-SW-01"]
    inlet = _branch(result, "P-2104-OVHD-02")
    assert inlet["method"] == "positive isolation" and inlet["blind"] == ["SB-2104-1"]
    assert "Clause 2.1" in inlet["clause"]
    boot = _branch(result, "P-2104-SW-01")
    assert not boot["compliant"] and "fit a spade" in boot["action"]


def test_maintenance_accepts_double_block_and_bleed_but_never_a_single_valve(drawing: Drawing) -> None:
    result = drawing.isolation("V-2104", "maintenance")
    vapour = _branch(result, "P-2104-VAP-01")
    assert vapour["compliant"] and vapour["clause"] == "SOP-OPS-015 Clause 2.2"
    assert vapour["close"] == ["GV-2104-3", "GV-2104-4"] and vapour["bleeds"] == ["BL-2104-3"]
    boot = _branch(result, "P-2104-SW-01")
    assert boot["method"] == "single valve" and not boot["compliant"]
    assert "single valve GV-2104-7" in boot["action"]
    relief = _branch(result, "P-2104-RV-01")
    assert relief["method"] == "valves without a bleed" and not relief["compliant"]
    assert any("car-sealed open" in note for note in relief["notes"])


def test_control_and_relief_valves_are_never_isolation_points(drawing: Drawing) -> None:
    result = drawing.isolation("V-2104", "maintenance")
    assert not {"PV-2104", "LV-2104B", "PSV-2104A"} & set(result["close_and_lock"])
    assert any("PV-2104 is not an isolation point" in note for note in _branch(result, "P-2104-VAP-01")["notes"])


def test_isolation_names_the_equipment_and_loops_it_cuts(drawing: Drawing) -> None:
    result = drawing.isolation("V-2104", "maintenance")
    assert {"E-2105A", "E-2105B", "P-2106A", "P-2106B", "FL-21"} <= set(result["affected_equipment"])
    assert {i["tag"] for i in result["instruments"]} == {"PT-2104", "LT-2104A", "LT-2104B", "TT-2104"}
    loops = {loop["instrument"]: loop for loop in result["loops"]}
    assert set(loops) == {"LT-2104A", "LT-2104B", "PT-2101"}
    assert "runs through V-2104" in loops["PT-2101"]["effect"]


def test_flow_questions_follow_the_flow(drawing: Drawing) -> None:
    upstream = {r["tag"] for r in drawing.reach("V-2104", "upstream")}
    assert {"C-2101", "E-2105A", "E-2105B"} <= upstream
    route = drawing.path("C-2101", "V-2104")
    assert route[0]["line"] == "P-2104-OVHD-01" and route[-1]["to"] == "V-2104"
    assert "FV-2101" not in {step["to"] for step in route}  # not backwards through the reflux


@pytest.mark.parametrize(
    ("prompt", "kind", "purpose"),
    [
        ("How do we isolate V-2104 for confined space entry?", "isolation", "confined_space"),
        ("Prepare the isolation for hot work on V-2104.", "isolation", "hot_work"),
        ("Lock out V-2104 so the level transmitter can be replaced.", "isolation", "maintenance"),
        ("What is upstream of V-2104?", "upstream", None),
        ("Show the path between C-2101 and V-2104.", "path", None),
    ],
)
def test_a_prompt_is_read_as_the_question_it_asks(prompt, kind, purpose) -> None:
    result = get_drawing_library().question(prompt)
    assert result["kind"] == kind
    if purpose:
        assert result["purpose"] == purpose


def test_a_question_that_is_not_about_the_drawing_is_left_alone() -> None:
    library = get_drawing_library()
    assert library.question("What is the corrosion rate of V-2104?") is None
    assert library.question("How do we isolate X-9999?") is None


def test_the_run_cites_the_graph_and_holds_an_isolation_plan() -> None:
    now = datetime.now(timezone.utc)
    prompt = "How do we isolate V-2104 for confined space entry?"
    profile = get_task_analyzer().analyze(prompt, [], requested_format="answer")
    task = Task(id="t-pid", prompt=prompt, status=TaskStatus.EXECUTING, user_id=ENGINEER.id,
                created_at=now, updated_at=now, profile=profile)
    orchestrator = AgentOrchestrator()
    orchestrator._persist = None
    asyncio.run(orchestrator._topology_stage(task, ENGINEER, EvidenceLedger(task.evidence)))
    item = task.evidence[0]
    assert item.id == "T1" and item.kind == "topology" and "PID-2104-01 rev B" in item.source_document
    assert "GV-2104-7" in item.excerpt
    block = _topology_block(task)
    assert "[T1]" in block and "do not add valves" in block
    required, reasons, _ = get_policy_gateway().approval_requirement(profile, prompt=prompt, isolation_plan=True)
    assert required and any(reason.startswith("isolation_plan") for reason in reasons)


def test_the_drawing_api() -> None:
    with TestClient(create_app()) as client:
        token = client.post("/api/auth/login", json={"username": "operator", "password": "workbench"}).json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        listed = client.get("/api/pid", headers=headers).json()
        assert [d["id"] for d in listed] == ["PID-2104-01"]
        graph = client.get("/api/pid/PID-2104-01", headers=headers).json()
        assert len(graph["nodes"]) == 49
        answer = client.post("/api/pid/PID-2104-01/query", headers=headers,
                             json={"kind": "isolation", "tag": "V-2104", "purpose": "confined_space"}).json()
        assert answer["compliant"] is False and answer["lines"]
        missing = client.post("/api/pid/PID-2104-01/query", headers=headers, json={"kind": "upstream", "tag": "X-1"})
        assert missing.status_code == 400


# The live model, asked how to isolate V-2104 for entry, returned the first
# branch alone -- dropping the two branches that cannot be isolated as drawn,
# the part a reader most needed -- and every check passed on what was there.
LIVE_ANSWER = (
    "OK P-2104-VAP-01 towards FG-01 (Off-gas to fuel gas KO): turn SB-2104-2 to its blind side after closing "
    "and locking GV-2104-3, GV-2104-4 and venting at BL-2104-3 (positive isolation) [SOP-OPS-015 Clause 2.1]."
)


def _isolation_task():
    now = datetime.now(timezone.utc)
    prompt = "How do we isolate V-2104 for confined space entry?"
    profile = get_task_analyzer().analyze(prompt, [], requested_format="answer")
    task = Task(id="t-pid-2", prompt=prompt, status=TaskStatus.EXECUTING, user_id=ENGINEER.id,
                created_at=now, updated_at=now, profile=profile)
    orchestrator = AgentOrchestrator()
    orchestrator._persist = None
    asyncio.run(orchestrator._topology_stage(task, ENGINEER, EvidenceLedger(task.evidence)))
    return task


def test_an_answer_that_drops_branches_fails_topology_verification() -> None:
    from backend.agents.verifier import get_verification_engine

    task = _isolation_task()
    check = get_verification_engine().check_topology(LIVE_ANSWER, task.topology)
    assert check.passed is False
    assert "P-2104-SW-01" in check.detail and "P-2104-RV-01" in check.detail


def test_the_omitted_branches_are_restored_from_the_graph() -> None:
    from backend.agents.orchestrator import _complete_topology
    from backend.agents.verifier import get_verification_engine

    task = _isolation_task()
    completed, omitted = _complete_topology(LIVE_ANSWER, task.topology)
    assert omitted == 4
    for line in ("P-2104-RV-01", "P-2104-SW-01", "P-2104-HC-01", "P-2104-OVHD-02"):
        assert line in completed
    assert "[T1]" in completed and "not stated in the answer above" in completed
    assert get_verification_engine().check_topology(completed, task.topology).passed
    # A complete answer is left as it was.
    assert _complete_topology(completed, task.topology) == (completed, 0)
