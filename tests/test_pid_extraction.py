"""Reading a P&ID from the drawing image: an untrusted proposal, checked, then queried.

No model is called: the vision model is replaced by a fake ``_generate``
that returns the JSON a vision model would, built from the authored graph and
then damaged in the ways a real reading goes wrong.
"""

from __future__ import annotations

import asyncio
import copy
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from backend.agents.orchestrator import AgentOrchestrator, EvidenceLedger
from backend.core.analyzer import get_task_analyzer
from backend.core.schemas import (
    InputType,
    ModelRole,
    RoutingDecision,
    Sensitivity,
    StoredFile,
    Task,
    TaskStatus,
)
from backend.engineering.pid import Drawing, get_drawing_library
from backend.engineering.pid_extraction import (
    Source,
    answer,
    compare,
    equipment_register,
    provenance_lines,
    review_proposal,
)
from tests.test_engineering_pipeline import ENGINEER

ROOT = Path(__file__).resolve().parents[1]
AUTHORED = ROOT / "sample_data" / "pid" / "PID-2104-01-crude-overhead.json"
IMAGE = ROOT / "sample_data" / "pid" / "PID-2104-01-crude-overhead.png"
ENTRY = "How do we isolate V-2104 for confined space entry?"
SOURCE = Source(file=IMAGE.name, sha256="abc", page=None, model="qwen2.5vl:3b", model_digest="sha256:d1g")


def faithful() -> dict:
    """What a perfect reading of the image would propose."""
    data = json.loads(AUTHORED.read_text())
    elements = []
    for node in data["nodes"]:
        x, y = node["x"] * 1.5, node["y"] * 1.5
        elements.append({"tag": node["id"], "type": node["type"], "label": node.get("label"),
                         "bbox": [x - 20, y - 20, x + 20, y + 20], "confidence": 0.94,
                         "measures": node.get("measures"), "controls": node.get("controls"),
                         "car_sealed": node.get("car_sealed")})
    lines = [{"from": e["from"], "to": e["to"], "line": e["line"], "service": e.get("service"),
              "bbox": [0, 0, 10, 10], "confidence": 0.9} for e in data["edges"]]
    return {"drawing": {"number": "PID-2104-01", "title": data["title"], "revision": "B"},
            "elements": elements, "lines": lines}


def damaged() -> dict:
    proposal = faithful()
    elements = {e["tag"]: e for e in proposal["elements"]}
    # The inlet blind is not seen: the inlet is read as joining V-2104 straight from GV-2104-2.
    del elements["SB-2104-1"]
    proposal["lines"] = [l for l in proposal["lines"] if "SB-2104-1" not in (l["from"], l["to"])]
    proposal["lines"].append({"from": "GV-2104-2", "to": "V-2104", "line": "P-2104-OVHD-02",
                              "bbox": [0, 0, 5, 5], "confidence": 0.91})
    elements["SB-2104-3"]["confidence"] = 0.55                         # faint symbol
    elements["PT-2104"]["measures"] = "V-9999"                         # misread reference
    elements["GV-2104-5"]["type"] = "pump"                             # wrong type for a GV- tag
    proposal["elements"] = list(elements.values()) + [
        {"tag": "GV 2104 X", "type": "gate_valve", "bbox": [0, 0, 1, 1], "confidence": 0.9},   # not a tag
        {"tag": "XV-2104", "type": "gizmo", "bbox": [0, 0, 1, 1], "confidence": 0.9},          # unknown type
        {"tag": "P-2199", "type": "pump", "bbox": [0, 0, 9, 9], "confidence": 0.97},           # not registered
    ]
    proposal["lines"] += [
        {"from": "V-2104", "to": "GHOST-9", "line": "X-1", "confidence": 0.9},                 # dangling
        {"from": "V-2104", "to": "V-2104", "line": "X-2", "confidence": 0.9},                  # self loop
        {"from": "HDR-2106D", "to": "P-2106A", "line": None, "confidence": 0.85},              # unnumbered
    ]
    return proposal


def test_a_faithful_reading_agrees_with_the_authored_graph() -> None:
    extraction = review_proposal([(faithful(), SOURCE)], register=equipment_register())
    assert extraction.drawing is not None and extraction.rejected == [] and extraction.needs_review == []
    node = extraction.drawing.nodes["V-2104"]
    assert node["review"] == "accepted"
    assert node["provenance"]["model_digest"] == "sha256:d1g" and node["provenance"]["confidence"] == 0.94
    assert node["provenance"]["bbox"] and "not a calibrated probability" in node["provenance"]["confidence_basis"]
    assert extraction.drawing.edges[0]["provenance"]["file"] == IMAGE.name

    result = answer(ENTRY, extraction)
    authored = get_drawing_library().drawings["PID-2104-01"]
    # Walked by the same query code as the authored graph.
    assert result["kind"] == "isolation" and "read from" in result["drawing"]
    assert sorted(result["non_compliant"]) == ["P-2104-RV-01", "P-2104-SW-01"]
    comparison = result["extraction"]["authored"]
    assert comparison["authored"] == authored.reference
    assert comparison["matched_by"] == "drawing number in the title block"
    assert comparison["elements"]["agree"] == len(authored.nodes)
    assert comparison["same_answer"] is True and comparison["answer_differences"] == []
    assert any("gives the same answer" in line for line in provenance_lines(result))


def test_a_damaged_reading_is_checked_before_it_is_queried() -> None:
    extraction = review_proposal([(damaged(), SOURCE)], register=equipment_register())
    rejected = {json.dumps(r["item"], sort_keys=True): r["reasons"] for r in extraction.rejected}
    reasons = " | ".join(" ".join(r) for r in rejected.values())
    assert "'GV 2104 X' is not a tag" in reasons
    assert "'gizmo' is not an element type" in reasons
    assert "GHOST-9, which is not an accepted element" in reasons
    assert "joins an element to itself" in reasons
    assert "XV-2104" not in extraction.drawing.nodes and "GHOST-9" not in extraction.drawing.nodes

    review = {entry["id"]: " ".join(entry["reasons"]) for entry in extraction.needs_review}
    assert "below 0.80" in review["SB-2104-3"]
    assert "does not fit the pump pattern" in review["GV-2104-5"]
    assert "not in the equipment register" in review["P-2199"] and "not connected" in review["P-2199"]
    assert "measures V-9999" in review["PT-2104"] and "measures" not in extraction.drawing.nodes["PT-2104"]
    assert "no line number" in review["HDR-2106D->P-2106A"]
    # Kept in the graph, but marked.
    assert extraction.drawing.nodes["SB-2104-3"]["review"] == "needs_review"
    assert extraction.drawing.nodes["V-2104"]["review"] == "accepted"


def test_disagreement_with_the_authored_graph_is_reported_not_resolved() -> None:
    extraction = review_proposal([(damaged(), SOURCE)], register=equipment_register())
    result = answer(ENTRY, extraction)
    report = result["extraction"]
    assert "SB-2104-3" in report["answer_rests_on_unreviewed"]
    comparison = report["authored"]
    assert comparison["elements"]["missing"] == ["SB-2104-1"]
    assert comparison["elements"]["extra"] == ["P-2199"]
    assert comparison["elements"]["type_differs"] == [{"tag": "GV-2104-5", "image": "pump", "authored": "gate_valve"}]
    assert "GV-2104-2->V-2104" in comparison["lines"]["extra"]
    assert "SB-2104-1->V-2104" in comparison["lines"]["missing"]
    # Without the inlet blind the image says the inlet cannot be isolated for entry; the authored graph says it can.
    assert comparison["same_answer"] is False
    fields = {d["field"] for d in comparison["answer_differences"]}
    assert "non_compliant" in fields
    assert "P-2104-OVHD-02" in result["non_compliant"]
    text = " ".join(provenance_lines(result))
    assert "DIFFERENT answer" in text and "NEEDS REVIEW" in text and "sha256:d1g" in text


def test_compare_names_reversed_lines() -> None:
    authored = get_drawing_library().drawings["PID-2104-01"]
    data = json.loads(AUTHORED.read_text())
    flipped = copy.deepcopy(data)
    edge = next(e for e in flipped["edges"] if e["from"] == "V-2104" and e["to"] == "GV-2104-7")
    edge["from"], edge["to"] = edge["to"], edge["from"]
    result = compare(Drawing.from_data(flipped, "flipped"), authored)
    assert result["lines"]["reversed"] == ["GV-2104-7->V-2104"]
    assert result["lines"]["missing"] == [] and result["lines"]["extra"] == []


# ---------------------------------------------------------------- in a run
def _stored(path: Path, *, file_id: str = "file-pid") -> StoredFile:
    return StoredFile(
        id=file_id, filename=path.name, stored_path=str(path), media_type="image/png",
        size_bytes=path.stat().st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        input_type=InputType.IMAGE, classification=Sensitivity.CONFIDENTIAL, owner_id=ENGINEER.id,
        department="operations", uploaded_at=datetime.now(timezone.utc),
    )


def _run(monkeypatch: pytest.MonkeyPatch, stored: StoredFile, reply: str) -> tuple[Task, list[dict]]:
    now = datetime.now(timezone.utc)
    profile = get_task_analyzer().analyze(ENTRY, [], requested_format="answer")
    task = Task(id="t-pid-image", prompt=ENTRY, status=TaskStatus.EXECUTING, user_id=ENGINEER.id,
                created_at=now, updated_at=now, profile=profile, files=[stored])
    agent = AgentOrchestrator()
    agent._persist = None
    calls: list[dict] = []

    async def fake_generate(_task, _user, **kwargs):
        calls.append(kwargs)
        return reply, RoutingDecision(
            requested_role=ModelRole.VISION, required_capabilities=["vision"], selected_model="qwen2.5vl:3b",
            rule="test", reason="test", decided_at=now)

    async def fake_descriptor(_decision):
        return SimpleNamespace(actual_digest="sha256:5e1ec7")

    monkeypatch.setattr(agent, "_generate", fake_generate)
    monkeypatch.setattr(agent.router, "resolve_descriptor", fake_descriptor)
    asyncio.run(agent._topology_stage(task, ENGINEER, EvidenceLedger(task.evidence)))
    return task, calls


def test_a_run_with_the_drawing_attached_answers_from_the_image(monkeypatch: pytest.MonkeyPatch) -> None:
    task, calls = _run(monkeypatch, _stored(IMAGE), json.dumps(damaged()))
    assert len(calls) == 1 and calls[0]["images"] == [IMAGE] and calls[0]["stage"] == "vision_extraction"
    item = task.evidence[0]
    assert item.id == "T1" and item.kind == "topology" and item.extraction_method == "vision_graph"
    assert item.extraction_model == "qwen2.5vl:3b" and item.extraction_data["model_digest"] == "sha256:5e1ec7"
    assert item.source_sha256 == hashlib.sha256(IMAGE.read_bytes()).hexdigest()
    assert item.classification == Sensitivity.CONFIDENTIAL
    assert "Against the authored graph PID-2104-01 rev B" in item.excerpt
    assert task.topology["extraction"]["authored"]["same_answer"] is False


def test_an_unreadable_image_falls_back_to_the_authored_graph_and_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    task, _ = _run(monkeypatch, _stored(IMAGE), "the model rambled instead of returning JSON")
    item = task.evidence[0]
    assert item.extraction_method == "graph" and "PID-2104-01 rev B" in item.source_document


def test_each_pdf_page_is_read_and_recorded(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    fitz = pytest.importorskip("fitz")
    pdf = tmp_path / "PID-2104-01-scan.pdf"
    document = fitz.open()
    page = document.new_page(width=842, height=415)
    page.insert_image(page.rect, filename=str(IMAGE))
    document.save(str(pdf))
    document.close()
    stored = _stored(pdf)
    from backend.core.config import get_config

    # Page images go to a scratch workspace, not the storage tree.
    monkeypatch.setattr(get_config().settings, "path", lambda key: tmp_path / key)
    task, calls = _run(monkeypatch, stored, json.dumps(faithful()))
    assert len(calls) == 1 and calls[0]["images"][0].suffix == ".png"
    item = task.evidence[0]
    assert item.page_number == 1 and item.extraction_method == "vision_graph"
    assert task.topology["extraction"]["authored"]["same_answer"] is True
