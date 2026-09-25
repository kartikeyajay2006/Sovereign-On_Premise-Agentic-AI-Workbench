"""Reading a P&ID from the drawing image, as a graph that is checked before it is used.

``pid.py`` answers topology questions from a hand-authored graph. This module
builds that graph from the drawing itself: the local vision model is shown
the image (each page of a PDF) and proposes the elements it sees -- tag,
type, label, bounding box, its own confidence -- and the lines between them.

The proposal is untrusted. Before anything is queried:

* a tag must look like a tag, and its type must be one the graph knows;
  an element that fails either is **rejected**;
* a tag whose prefix does not fit its type (``GV-`` drawn as a pump), a tag
  on no authored drawing and not in the equipment register
  (``sample_data/datasets/inspection-history.csv``), no readable position,
  or a confidence below :data:`REVIEW_THRESHOLD` (or none at all) is kept but
  marked **needs review**;
* a line must join two accepted elements: a dangling end, a line from an
  element to itself or a repeated line is **rejected**; a line without a
  number is kept and marked for review;
* an instrument that measures or controls an element that is not there
  loses that reference, and is marked for review.

What survives becomes a :class:`~backend.engineering.pid.Drawing`, so it is
walked by exactly the same query code as an authored one. Every element and
line records where it came from: the file and its SHA-256, the page, the
bounding box, the model and its runtime digest, and the confidence -- which
is the model's own statement, not a calibrated probability, and is labelled
so.

Where an authored graph exists for the same drawing, the two are compared
element by element and line by line, and the same question is put to both:
the answer reports agreement, what is missing and what is extra, rather than
quietly preferring either.
"""

from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

from backend.engineering.pid import (
    EQUIPMENT,
    INLINE,
    Drawing,
    DrawingError,
    DrawingLibrary,
    _INTENT,
    get_drawing_library,
    summary_lines,
)

if TYPE_CHECKING:  # pragma: no cover
    from backend.core.schemas import StoredFile, Task, User

REVIEW_THRESHOLD = 0.8
CONFIDENCE_BASIS = "stated by the vision model; not a calibrated probability"
TYPES = sorted(EQUIPMENT | INLINE | {"tee", "boundary", "instrument"})
TAG = re.compile(r"^[A-Z]{1,4}-[A-Z0-9]+(?:-[A-Z0-9]+)*$")
# The tag prefix each element type is drawn with on this site's drawings.
TYPE_PREFIX: dict[str, re.Pattern[str]] = {
    "gate_valve": re.compile(r"^GV-"),
    "check_valve": re.compile(r"^CV-"),
    "control_valve": re.compile(r"^[PFLT]V-"),
    "psv": re.compile(r"^PSV-"),
    "spectacle_blind": re.compile(r"^SB-"),
    "bleed": re.compile(r"^BL-"),
    "drum": re.compile(r"^V-"),
    "column": re.compile(r"^C-"),
    "exchanger": re.compile(r"^E-"),
    "pump": re.compile(r"^P-"),
    "tank": re.compile(r"^TK?-"),
    "instrument": re.compile(r"^[PTLFA][TIC]{1,2}-"),
}
DRAWING_NAME = re.compile(r"p\s*&\s*id|\bpid\b|pid[-_ ]|drawing|diagram", re.IGNORECASE)
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif", ".gif"}


@dataclass
class Source:
    """Where one page's proposal came from."""

    file: str
    sha256: str | None
    page: int | None
    model: str | None
    model_digest: str | None


@dataclass
class Extraction:
    """The reviewed graph, and everything held back or flagged on the way."""

    drawing: Drawing | None
    stated_number: str | None
    needs_review: list[dict[str, Any]] = field(default_factory=list)
    rejected: list[dict[str, Any]] = field(default_factory=list)
    sources: list[Source] = field(default_factory=list)

    @property
    def review_ids(self) -> set[str]:
        return {entry["id"] for entry in self.needs_review}

    def report(self) -> dict[str, Any]:
        drawing = self.drawing
        return {
            "drawing": drawing.reference if drawing else None,
            "stated_number": self.stated_number,
            "elements": len(drawing.nodes) if drawing else 0,
            "lines": len(drawing.edges) if drawing else 0,
            "needs_review": self.needs_review,
            "rejected": self.rejected,
            "review_threshold": REVIEW_THRESHOLD,
            "confidence_basis": CONFIDENCE_BASIS,
            "sources": [source.__dict__ for source in self.sources],
        }


# ------------------------------------------------------------------ review
def equipment_register(library: DrawingLibrary | None = None) -> set[str]:
    """Every tag the site already knows: authored drawings and the inspection register."""
    from backend.core.config import PROJECT_ROOT

    library = library or get_drawing_library()
    known = {tag for drawing in library.drawings.values() for tag in drawing.nodes}
    register = PROJECT_ROOT / "sample_data" / "datasets" / "inspection-history.csv"
    if register.exists():
        with register.open(newline="") as handle:
            known |= {row["tag"].strip() for row in csv.DictReader(handle) if row.get("tag")}
    return known


def _confidence(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if 0.0 <= number <= 1.0 else None


def _bbox(value: Any) -> list[float] | None:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    try:
        x1, y1, x2, y2 = (float(v) for v in value)
    except (TypeError, ValueError):
        return None
    return [x1, y1, x2, y2] if x1 < x2 and y1 < y2 else None


def _text(value: Any) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text if text and text.lower() not in ("null", "none") else None


def _provenance(source: Source, bbox: list[float] | None, confidence: float | None) -> dict[str, Any]:
    return {"method": "vision", "file": source.file, "sha256": source.sha256, "page": source.page,
            "bbox": bbox, "model": source.model, "model_digest": source.model_digest,
            "confidence": confidence, "confidence_basis": CONFIDENCE_BASIS}


def review_proposal(
    pages: list[tuple[dict[str, Any], Source]],
    *,
    register: set[str],
    threshold: float = REVIEW_THRESHOLD,
) -> Extraction:
    """Check what the model proposed, page by page, and build the graph that survives."""
    nodes: dict[str, dict[str, Any]] = {}
    reasons: dict[str, list[str]] = {}
    rejected: list[dict[str, Any]] = []
    stated: dict[str, str | None] = {"number": None, "title": None, "revision": None}

    for proposal, source in pages:
        header = proposal.get("drawing") if isinstance(proposal.get("drawing"), dict) else {}
        for key in stated:
            stated[key] = stated[key] or _text(header.get(key))
        for raw in proposal.get("elements") or []:
            if not isinstance(raw, dict):
                rejected.append({"item": raw, "page": source.page, "reasons": ["not an element object"]})
                continue
            tag = (_text(raw.get("tag")) or "").upper()
            kind = (_text(raw.get("type")) or "").lower().replace(" ", "_")
            problems = []
            if not TAG.match(tag):
                problems.append(f"'{raw.get('tag')}' is not a tag")
            if kind not in TYPES:
                problems.append(f"'{raw.get('type')}' is not an element type the graph knows")
            if tag in nodes:
                # The same tag on a second page is the same element (a continuation sheet).
                nodes[tag]["provenance"].setdefault("also_on_pages", []).append(source.page)
                continue
            if problems:
                rejected.append({"item": raw, "page": source.page, "reasons": problems})
                continue
            confidence = _confidence(raw.get("confidence"))
            bbox = _bbox(raw.get("bbox"))
            flags = []
            prefix = TYPE_PREFIX.get(kind)
            if prefix and not prefix.match(tag):
                flags.append(f"tag {tag} does not fit the {kind.replace('_', ' ')} pattern")
            if register and tag not in register:
                flags.append(f"{tag} is on no authored drawing and not in the equipment register")
            if confidence is None:
                flags.append("the model gave no usable confidence")
            elif confidence < threshold:
                flags.append(f"confidence {confidence:.2f} is below {threshold:.2f}")
            if bbox is None:
                flags.append("no readable position on the sheet")
            node: dict[str, Any] = {"id": tag, "type": kind, "label": _text(raw.get("label")) or tag,
                                    "provenance": _provenance(source, bbox, confidence)}
            if bbox:
                node["x"], node["y"] = round((bbox[0] + bbox[2]) / 2), round((bbox[1] + bbox[3]) / 2)
            for key in ("measures", "controls"):
                if _text(raw.get(key)):
                    node[key] = _text(raw.get(key)).upper()  # type: ignore[union-attr]
            if _text(raw.get("car_sealed")) == "open":
                node["car_sealed"] = "open"
            nodes[tag] = node
            reasons[tag] = flags

    # Instrument references must name elements that are there.
    for node in nodes.values():
        for key in ("measures", "controls"):
            target = node.get(key)
            if target and target not in nodes:
                del node[key]
                reasons[node["id"]].append(f"{key} {target}, which is not on the drawing as read")

    edges: list[dict[str, Any]] = []
    seen_edges: set[tuple[str, str]] = set()
    for proposal, source in pages:
        for raw in proposal.get("lines") or []:
            if not isinstance(raw, dict):
                rejected.append({"item": raw, "page": source.page, "reasons": ["not a line object"]})
                continue
            start, end = (_text(raw.get("from")) or "").upper(), (_text(raw.get("to")) or "").upper()
            problems = [f"joins {tag or 'nothing'}, which is not an accepted element"
                        for tag in (start, end) if tag not in nodes]
            if start and start == end:
                problems.append("joins an element to itself")
            if (start, end) in seen_edges:
                problems.append("repeats a line already read")
            if problems:
                rejected.append({"item": raw, "page": source.page, "reasons": problems})
                continue
            seen_edges.add((start, end))
            confidence = _confidence(raw.get("confidence"))
            bbox = _bbox(raw.get("bbox"))
            line = _text(raw.get("line"))
            flags = []
            if line is None:
                flags.append("no line number read")
            if confidence is None:
                flags.append("the model gave no usable confidence")
            elif confidence < threshold:
                flags.append(f"confidence {confidence:.2f} is below {threshold:.2f}")
            edge = {"from": start, "to": end, "line": line or f"unnumbered {start}-{end}",
                    "provenance": _provenance(source, bbox, confidence)}
            service = _text(raw.get("service"))
            if service:
                edge["service"] = service.lower()
            edges.append(edge)
            if flags:
                reasons[f"{start}->{end}"] = flags

    connected = {e["from"] for e in edges} | {e["to"] for e in edges}
    for tag, node in nodes.items():
        if node["type"] != "instrument" and tag not in connected:
            reasons[tag].append("not connected to any line")

    needs_review = [
        {"id": key, "kind": "line" if "->" in key else "element", "reasons": flags}
        for key, flags in reasons.items() if flags
    ]
    for node in nodes.values():
        node["review"] = "needs_review" if reasons.get(node["id"]) else "accepted"
    for edge in edges:
        edge["review"] = "needs_review" if reasons.get(f"{edge['from']}->{edge['to']}") else "accepted"

    extraction = Extraction(drawing=None, stated_number=stated["number"], needs_review=needs_review,
                            rejected=rejected, sources=[source for _, source in pages])
    if not nodes:
        return extraction
    first = pages[0][1]
    number = stated["number"] or Path(first.file).stem
    extraction.drawing = Drawing.from_data({
        "id": f"{number} (read from {first.file})",
        "title": stated["title"] or f"Drawing read from {first.file}",
        "revision": stated["revision"] or "not read",
        "status": "EXTRACTED",
        "nodes": list(nodes.values()),
        "edges": edges,
    }, first.file)
    return extraction


# --------------------------------------------------------------- comparison
def match_authored(extraction: Extraction, library: DrawingLibrary) -> tuple[Drawing | None, str | None]:
    """The authored graph of the same drawing: by the number in the title block, else by shared tags."""
    if extraction.drawing is None:
        return None, None
    number = (extraction.stated_number or "").strip().upper()
    for drawing in library.drawings.values():
        if drawing.id.upper() == number:
            return drawing, "drawing number in the title block"
    tags = set(extraction.drawing.nodes)
    best, shared = None, 0
    for drawing in library.drawings.values():
        overlap = len(tags & set(drawing.nodes))
        if overlap > shared:
            best, shared = drawing, overlap
    if best is not None and shared * 2 >= len(tags):
        return best, f"{shared} of {len(tags)} tags shared"
    return None, None


def compare(extracted: Drawing, authored: Drawing) -> dict[str, Any]:
    """Element by element and line by line: what agrees, what differs, what is missing or extra."""
    ours, theirs = extracted.nodes, authored.nodes
    type_differs = [{"tag": t, "image": ours[t]["type"], "authored": theirs[t]["type"]}
                    for t in sorted(set(ours) & set(theirs)) if ours[t]["type"] != theirs[t]["type"]]
    our_edges = {(e["from"], e["to"]): e for e in extracted.edges}
    their_edges = {(e["from"], e["to"]): e for e in authored.edges}
    reversed_ = sorted(f"{a}->{b}" for a, b in our_edges if (b, a) in their_edges and (a, b) not in their_edges)
    line_differs = [{"from": a, "to": b, "image": our_edges[(a, b)]["line"], "authored": their_edges[(a, b)]["line"]}
                    for a, b in sorted(set(our_edges) & set(their_edges))
                    if our_edges[(a, b)]["line"] != their_edges[(a, b)]["line"]]
    reversed_keys = {tuple(key.split("->")) for key in reversed_}
    return {
        "authored": authored.reference,
        "elements": {
            "agree": len([t for t in set(ours) & set(theirs) if ours[t]["type"] == theirs[t]["type"]]),
            "type_differs": type_differs,
            "missing": sorted(set(theirs) - set(ours)),
            "extra": sorted(set(ours) - set(theirs)),
        },
        "lines": {
            "agree": len(set(our_edges) & set(their_edges)),
            "reversed": reversed_,
            "line_number_differs": line_differs,
            "missing": sorted(f"{a}->{b}" for a, b in set(their_edges) - set(our_edges)
                              if (b, a) not in reversed_keys),
            "extra": sorted(f"{a}->{b}" for a, b in set(our_edges) - set(their_edges)
                            if (a, b) not in reversed_keys),
        },
    }


def _touched(result: dict[str, Any]) -> set[str]:
    """The element ids an answer rests on."""
    kind = result["kind"]
    if kind == "isolation":
        return ({result["tag"]} | {e for b in result["branches"] for e in b["elements"]}
                | {b["beyond"] for b in result["branches"] if b["beyond"]})
    if kind in ("upstream", "downstream"):
        return {result["tag"]} | {r["tag"] for r in result["reached"]}
    return {result["from"], result["to"]} | {s["to"] for s in result["steps"]}


def _answer_key(result: dict[str, Any]) -> dict[str, Any]:
    kind = result["kind"]
    if kind == "isolation":
        return {key: sorted(result[key]) for key in
                ("close_and_lock", "open_bleeds", "blinds", "non_compliant", "affected_equipment")}
    if kind in ("upstream", "downstream"):
        return {"reached": sorted(r["tag"] for r in result["reached"])}
    return {"route": [f"{s['from']}->{s['to']}" for s in result["steps"]]}


def answer(prompt: str, extraction: Extraction, library: DrawingLibrary | None = None) -> dict[str, Any] | None:
    """Answer the question from the graph read off the image, and set it against the authored one."""
    if extraction.drawing is None:
        return None
    result = DrawingLibrary.of([extraction.drawing]).question(prompt)
    if result is None:
        return None
    library = library or get_drawing_library()
    authored, matched_by = match_authored(extraction, library)
    touched = _touched(result)
    report: dict[str, Any] = {
        **extraction.report(),
        "answer_rests_on_unreviewed": sorted(touched & extraction.review_ids),
        "authored": None,
    }
    if authored is not None:
        comparison = {**compare(extraction.drawing, authored), "matched_by": matched_by}
        try:
            theirs = DrawingLibrary.of([authored]).question(prompt)
        except DrawingError as exc:
            theirs, comparison["authored_answer_error"] = None, str(exc)
        if theirs is not None and theirs["kind"] == result["kind"]:
            ours_key, theirs_key = _answer_key(result), _answer_key(theirs)
            comparison["same_answer"] = ours_key == theirs_key
            comparison["answer_differences"] = [
                {"field": key, "image": ours_key[key], "authored": theirs_key.get(key)}
                for key in ours_key if ours_key[key] != theirs_key.get(key)
            ]
        else:
            comparison["same_answer"] = None
        report["authored"] = comparison
    return {**result, "extraction": report}


def provenance_lines(result: dict[str, Any]) -> list[str]:
    """What a reader must know about an answer read off an image, as sentences."""
    report = result["extraction"]
    source = report["sources"][0] if report["sources"] else {}
    lines = [
        f"This graph was read from the drawing image {source.get('file')} by {source.get('model') or 'the vision model'}"
        f" (digest {source.get('model_digest') or 'not reported'}): {report['elements']} elements and "
        f"{report['lines']} lines accepted, {len(report['rejected'])} proposed items rejected, "
        f"{len(report['needs_review'])} marked needs review. Confidence is {CONFIDENCE_BASIS}."
    ]
    if report["answer_rests_on_unreviewed"]:
        lines.append("NEEDS REVIEW: this answer rests on " + ", ".join(report["answer_rests_on_unreviewed"])
                     + ", read with low confidence or failing a check; confirm them on the sheet.")
    authored = report.get("authored")
    if authored is None:
        lines.append("No authored graph of this drawing exists to check it against.")
        return lines
    elements, edges = authored["elements"], authored["lines"]
    lines.append(
        f"Against the authored graph {authored['authored']} (matched by {authored['matched_by']}): "
        f"{elements['agree']} elements agree, {len(elements['missing'])} missing from the image reading, "
        f"{len(elements['extra'])} extra, {len(elements['type_differs'])} of a different type; "
        f"{edges['agree']} lines agree, {len(edges['missing'])} missing, {len(edges['extra'])} extra, "
        f"{len(edges['reversed'])} reversed."
    )
    if authored.get("same_answer") is True:
        lines.append("The authored graph gives the same answer.")
    elif authored.get("same_answer") is False:
        lines.append("The authored graph gives a DIFFERENT answer: " + "; ".join(
            f"{d['field']}: image {', '.join(map(str, d['image'])) or 'none'}, authored "
            f"{', '.join(map(str, d['authored'] or [])) or 'none'}" for d in authored["answer_differences"]) + ".")
    return lines


# --------------------------------------------------------------- the run
def drawing_attachments(task: "Task") -> list["StoredFile"]:
    """Attachments that are drawings: images or PDFs classified or named as one."""
    return [
        stored for stored in task.files
        if Path(stored.stored_path).suffix.lower() in IMAGE_SUFFIXES | {".pdf"}
        and (stored.input_type.value in ("pid_diagram", "drawing") or DRAWING_NAME.search(stored.filename))
    ]


async def read_drawing(orchestrator: Any, task: "Task", user: "User", stored: "StoredFile") -> Extraction:
    """Show each page of one drawing to the vision model and review what it proposes."""
    from backend.agents.orchestrator import _parse_json
    from backend.models_layer.client import InferenceError
    from backend.rag.parsing import rasterize_pdf

    path = Path(stored.stored_path)
    if path.suffix.lower() == ".pdf":
        workspace = orchestrator.config.settings.path("workspaces") / task.id / "pid" / stored.id
        pages = list(enumerate(rasterize_pdf(path, workspace), start=1))
    else:
        pages = [(None, path)]
    prompt = orchestrator.config.prompt("task.pid_extract", types=" | ".join(TYPES), prompt=task.prompt)
    proposals: list[tuple[dict[str, Any], Source]] = []
    for number, image in pages:
        text, decision = await orchestrator._generate(
            task, user, stage="vision_extraction", system_prompt=orchestrator.config.system_prompt("vision"),
            prompt=prompt, images=[image], format_json=True,
        )
        parsed = _parse_json(text)
        if not isinstance(parsed, dict):
            raise InferenceError(f"the vision model returned no graph for {stored.filename}"
                                 + (f" page {number}" if number else ""))
        try:
            digest = (await orchestrator.router.resolve_descriptor(decision)).actual_digest
        except Exception:  # the digest is reported as unknown, never invented
            digest = None
        proposals.append((parsed, Source(file=stored.filename, sha256=stored.sha256, page=number,
                                         model=decision.selected_model, model_digest=digest)))
    return review_proposal(proposals, register=equipment_register())


async def topology_from_image(orchestrator: Any, task: "Task", user: "User", ledger: Any) -> bool:
    """Answer the run's P&ID question from an attached drawing image. False when there is none to use."""
    from backend.core.schemas import EvidenceItem, TaskStatus
    from backend.models_layer.client import InferenceError
    from backend.models_layer.router import NoEligibleModelError

    attachments = drawing_attachments(task)
    if not attachments or not _INTENT.search(task.prompt):
        return False
    stored = attachments[0]
    await orchestrator._stage(task, TaskStatus.EXECUTING, f"Reading {stored.filename} as a P&ID graph",
                              phase="engineering")
    try:
        extraction = await read_drawing(orchestrator, task, user, stored)
        result = answer(task.prompt, extraction)
    except (InferenceError, NoEligibleModelError, DrawingError, json.JSONDecodeError) as exc:
        await orchestrator._stage(task, TaskStatus.EXECUTING,
                                  f"{stored.filename} could not be read as a graph: {exc}",
                                  {"skipped": True}, phase="engineering")
        return False
    if result is None:
        await orchestrator._stage(
            task, TaskStatus.EXECUTING,
            f"The graph read from {stored.filename} does not hold the element asked about",
            {"skipped": True, "extraction": extraction.report()}, phase="engineering")
        return False

    lines = summary_lines(result) + provenance_lines(result)
    report = result["extraction"]
    source = extraction.sources[0]
    item = ledger.add(EvidenceItem(
        id="pending",
        source_document=f"{result.get('drawing')}: {stored.filename}",
        document_id=stored.id,
        location=f"{result['kind']} · {result.get('tag') or result.get('from')}",
        page_number=source.page,
        excerpt="\n".join(lines)[:4000],
        extraction_method="vision_graph",
        extraction_model=source.model,
        extraction_data={
            "kind": result["kind"],
            "elements": sorted(_touched(result)),
            "model_digest": source.model_digest,
            "needs_review": report["needs_review"],
            "answer_rests_on_unreviewed": report["answer_rests_on_unreviewed"],
            "rejected": len(report["rejected"]),
            "authored": report["authored"],
        },
        source_sha256=stored.sha256,
        classification=stored.classification,
        kind="topology",
    ))
    task.topology = {**result, "evidence_id": item.id, "lines": lines}
    orchestrator._persist_evidence(task)
    await orchestrator._stage(
        task, TaskStatus.EXECUTING,
        f"Walked the graph read from {stored.filename} for the {result['kind']} of "
        f"{result.get('tag') or result.get('from')}", phase="engineering")
    await orchestrator._emit(task, "task.topology", {"topology": task.topology})
    orchestrator.audit.record(
        category="engineering", action=f"topology_{result['kind']}_from_image", actor=user.username,
        actor_role=user.role, task_id=task.id,
        detail={"file": stored.filename, "sha256": stored.sha256, "model": source.model,
                "model_digest": source.model_digest, "elements": report["elements"],
                "needs_review": len(report["needs_review"]), "rejected": len(report["rejected"]),
                "authored": (report["authored"] or {}).get("authored"),
                "same_answer": (report["authored"] or {}).get("same_answer"), "evidence_id": item.id},
    )
    return True
