"""P&ID topology: deterministic answers from a reviewable graph.

A drawing is held as a graph -- equipment, valves, blinds, bleeds, boundaries
and the numbered lines between them, with flow direction, plus instruments
and what they measure and control. Questions a model would otherwise guess at
are answered by walking it:

* upstream / downstream of a tag, following flow;
* the instruments on a tag, and the control loops that cross it;
* how to isolate a tag: every branch out of it, the isolation elements on
  that branch, the method they make (positive isolation, double block and
  bleed, single valve), and whether that method is permitted for the work
  and the service under SOP-OPS-015 Clauses 2.1 to 2.3 and 6;
* the path between two tags.

Every answer names the drawing, its revision and the element ids it rests
on, so a reviewer can find each one on the sheet. Control and check valves
are never isolation points; car-sealed-open valves are relief-path valves
whose closing needs an isolation certificate.
"""

from __future__ import annotations

import json
import re
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

EQUIPMENT = {"column", "exchanger", "drum", "pump", "tank"}
INLINE = {"gate_valve", "control_valve", "check_valve", "psv", "spectacle_blind", "bleed"}
BLOCK = {"gate_valve"}
PURPOSES = ("confined_space", "hot_work", "maintenance")

PURPOSE_WORDS = {
    "confined_space": "confined space entry",
    "hot_work": "hot work",
    "maintenance": "maintenance (other than entry or hot work)",
}


class DrawingError(ValueError):
    pass


@dataclass
class Drawing:
    id: str
    title: str
    revision: str
    nodes: dict[str, dict[str, Any]]
    edges: list[dict[str, Any]]
    meta: dict[str, Any] = field(default_factory=dict)

    @property
    def reference(self) -> str:
        return f"{self.id} rev {self.revision}"

    @classmethod
    def load(cls, path: Path) -> "Drawing":
        data = json.loads(path.read_text())
        nodes = {node["id"]: node for node in data["nodes"]}
        for edge in data["edges"]:
            for end in (edge["from"], edge["to"]):
                if end not in nodes:
                    raise DrawingError(f"{path.name}: line {edge.get('line')} joins unknown element {end}")
        for node in nodes.values():
            for key in ("measures", "controls"):
                if node.get(key) and node[key] not in nodes:
                    raise DrawingError(f"{path.name}: {node['id']} {key} unknown element {node[key]}")
        meta = {k: v for k, v in data.items() if k not in ("nodes", "edges")}
        return cls(data["id"], data["title"], str(data.get("revision", "")), nodes, data["edges"], meta)

    # -- graph ---------------------------------------------------------------
    def _out(self, tag: str) -> list[dict[str, Any]]:
        return [edge for edge in self.edges if edge["from"] == tag]

    def _in(self, tag: str) -> list[dict[str, Any]]:
        return [edge for edge in self.edges if edge["to"] == tag]

    def _neighbours(self, tag: str) -> list[tuple[str, dict[str, Any]]]:
        return [(e["to"], e) for e in self._out(tag)] + [(e["from"], e) for e in self._in(tag)]

    def require(self, tag: str) -> dict[str, Any]:
        node = self.nodes.get(tag)
        if node is None:
            raise DrawingError(f"{tag} is not on {self.reference}")
        return node

    def label(self, tag: str) -> str:
        node = self.nodes[tag]
        return tag if node.get("label", tag) == tag else f"{tag} ({node['label']})"

    # -- queries -------------------------------------------------------------
    def reach(self, tag: str, direction: str) -> list[dict[str, Any]]:
        """Everything upstream or downstream of ``tag``, nearest first, with the line reached by."""
        self.require(tag)
        step = self._in if direction == "upstream" else self._out
        seen = {tag}
        queue = deque([(tag, 0)])
        found: list[dict[str, Any]] = []
        while queue:
            current, depth = queue.popleft()
            for edge in step(current):
                nxt = edge["from"] if direction == "upstream" else edge["to"]
                if nxt in seen:
                    continue
                seen.add(nxt)
                node = self.nodes[nxt]
                found.append({"tag": nxt, "type": node["type"], "label": node.get("label"),
                              "line": edge["line"], "steps": depth + 1})
                queue.append((nxt, depth + 1))
        return found

    def instruments(self, tags: set[str]) -> list[dict[str, Any]]:
        """Instruments measuring any of ``tags``, and loops whose element is among them."""
        hits = []
        for node in self.nodes.values():
            if node["type"] != "instrument":
                continue
            measures, controls = node.get("measures"), node.get("controls")
            if measures in tags or controls in tags:
                hits.append({"tag": node["id"], "label": node.get("label"), "measures": measures,
                             "controls": controls})
        return hits

    def path(self, start: str, end: str) -> list[dict[str, Any]]:
        """The shortest route between two tags: along the flow if there is one, else any."""
        self.require(start)
        self.require(end)
        return self._route(start, end, directed=True) or self._route(start, end, directed=False)

    def _route(self, start: str, end: str, *, directed: bool) -> list[dict[str, Any]]:
        previous: dict[str, tuple[str, dict[str, Any]] | None] = {start: None}
        queue = deque([start])
        while queue:
            current = queue.popleft()
            if current == end:
                break
            step = [(e["to"], e) for e in self._out(current)] if directed else self._neighbours(current)
            for nxt, edge in step:
                if nxt not in previous:
                    previous[nxt] = (current, edge)
                    queue.append(nxt)
        if end not in previous:
            return []
        steps = []
        cursor = end
        while previous[cursor] is not None:
            before, edge = previous[cursor]  # type: ignore[misc]
            steps.append({"from": before, "to": cursor, "line": edge["line"]})
            cursor = before
        return list(reversed(steps))

    def isolation(self, tag: str, purpose: str = "maintenance") -> dict[str, Any]:
        """How to isolate ``tag`` for ``purpose``, branch by branch, against SOP-OPS-015."""
        target = self.require(tag)
        if purpose not in PURPOSES:
            raise DrawingError(f"unknown purpose {purpose!r}; one of {', '.join(PURPOSES)}")
        branches = []
        for first, edge in self._neighbours(tag):
            elements: list[str] = []
            previous, current = tag, first
            beyond = None
            while True:
                node = self.nodes[current]
                if node["type"] not in INLINE:
                    beyond = current
                    break
                elements.append(current)
                onward = [n for n, _ in self._neighbours(current) if n != previous]
                if len(onward) != 1:
                    beyond = current
                    break
                previous, current = current, onward[0]
            branches.append(self._judge_branch(tag, elements, beyond, edge, purpose))

        affected_equipment = sorted({
            reached for b in branches if b["beyond"]
            for reached in self._equipment_beyond(b["beyond"], b["elements"][-1] if b["elements"] else tag)
        })
        instruments = [i for i in self.instruments({tag}) if i["measures"] == tag]
        loops = []
        for instrument in self.nodes.values():
            if instrument["type"] != "instrument" or not instrument.get("controls"):
                continue
            measured, element = instrument.get("measures"), instrument["controls"]
            if measured == tag:
                effect = (f"{instrument['id']} ({instrument.get('label')}) measures {tag}, which is out of "
                          f"service once isolated, so its loop on {element} is lost")
            elif self._cut_off(element, measured, tag):
                effect = (f"{instrument['id']} ({instrument.get('label')}) measures {measured} and acts on "
                          f"{element}, and the process path between them runs through {tag}: isolating it "
                          "leaves the loop without its final element")
            else:
                continue
            loops.append({"instrument": instrument["id"], "controls": element, "effect": effect})
        compliant = all(branch["compliant"] for branch in branches)
        return {
            "drawing": self.reference,
            "tag": tag,
            "label": target.get("label"),
            "purpose": purpose,
            "purpose_words": PURPOSE_WORDS[purpose],
            "service": target.get("service"),
            "branches": branches,
            "compliant": compliant,
            "actions": [b["action"] for b in branches],
            "close_and_lock": [e for b in branches for e in b["close"]],
            "open_bleeds": [e for b in branches for e in b["bleeds"]],
            "blinds": [e for b in branches for e in b["blind"]],
            "affected_equipment": affected_equipment,
            "instruments": instruments,
            "loops": loops,
            "non_compliant": [b["line"] for b in branches if not b["compliant"]],
        }

    def _equipment_beyond(self, start: str, came_from: str) -> list[str]:
        """The nearest equipment or boundaries past a header, away from the isolated tag."""
        if self.nodes[start]["type"] in EQUIPMENT or self.nodes[start]["type"] == "boundary":
            return [start]
        found, seen, queue = [], {start, came_from}, deque([start])
        while queue:
            current = queue.popleft()
            for nxt, _ in self._neighbours(current):
                if nxt in seen:
                    continue
                seen.add(nxt)
                if self.nodes[nxt]["type"] in EQUIPMENT or self.nodes[nxt]["type"] == "boundary":
                    found.append(nxt)
                else:
                    queue.append(nxt)
        return found

    def _cut_off(self, element: str, measured: str | None, tag: str) -> bool:
        """Whether the path from a loop's measurement to its element runs through ``tag``."""
        if not measured or measured == element:
            return False
        route = self.path(measured, element)
        return any(step["to"] == tag or step["from"] == tag for step in route[:-1]) if route else False

    def _judge_branch(self, tag: str, elements: list[str], beyond: str | None,
                      edge: dict[str, Any], purpose: str) -> dict[str, Any]:
        types = [self.nodes[e]["type"] for e in elements]
        blocks = [e for e in elements if self.nodes[e]["type"] in BLOCK]
        sealed = [e for e in blocks if self.nodes[e].get("car_sealed") == "open"]
        blinds = [e for e in elements if self.nodes[e]["type"] == "spectacle_blind"]
        bleeds = [e for e in elements if self.nodes[e]["type"] == "bleed"]
        non_isolating = [e for e in elements if self.nodes[e]["type"] in ("control_valve", "check_valve", "psv")]
        dbb = None
        for index, element in enumerate(elements):
            if self.nodes[element]["type"] == "bleed":
                before = [e for e in elements[:index] if e in blocks]
                after = [e for e in elements[index + 1:] if e in blocks]
                if before and after:
                    dbb = (before[-1], element, after[0])
                    break
        method = ("positive isolation" if blinds else "double block and bleed" if dbb
                  else "valves without a bleed" if len(blocks) > 1 else "single valve" if blocks else "none")
        service = edge.get("service", "hydrocarbon")
        hazardous = service in ("hydrocarbon", "sour water", "toxic", "steam")
        needs_positive = purpose in ("confined_space", "hot_work")
        line = edge["line"]
        towards = self.label(beyond) if beyond else "the line"

        close = [e for e in (dbb[0], dbb[2])] if dbb else blocks[:1]
        if dbb and not needs_positive:
            compliant = True
            clause = "SOP-OPS-015 Clause 2.2"
            action = (f"{line} towards {towards}: close and lock {dbb[0]} and {dbb[2]}, open bleed {dbb[1]}"
                      + (f"; positive isolation is also available at {blinds[0]}" if blinds else ""))
        elif blinds:
            compliant = True
            clause = "SOP-OPS-015 Clause 2.1"
            action = (f"{line} towards {towards}: turn {blinds[0]} to its blind side"
                      + (f" after closing and locking {', '.join(close)}" if close else "")
                      + (f" and venting at {dbb[1]}" if dbb else "") + " (positive isolation)")
        elif needs_positive:
            compliant = False
            clause = "SOP-OPS-015 Clause 2.1"
            action = (f"{line} towards {towards}: {PURPOSE_WORDS[purpose]} needs positive isolation and this "
                      f"branch has no blind; fit a spade at the flange nearest {tag}"
                      + (f" (double block and bleed at {', '.join(dbb)} is not enough)" if dbb
                         else f" (it has only {' and '.join(blocks)})" if blocks else " (it has no valve at all)"))
        elif blocks and not hazardous:
            compliant = True
            clause = "SOP-OPS-015 Clause 2.3"
            action = f"{line} towards {towards}: close and lock {blocks[0]} (single valve, utility service)"
        else:
            compliant = False
            clause = "SOP-OPS-015 Clause 2.3"
            held_by = (
                f"valves {' and '.join(blocks)} with no bleed between them, which is not double block and bleed,"
                if len(blocks) > 1 else f"single valve {blocks[0]}" if blocks else "no isolation valve"
            )
            action = (f"{line} towards {towards}: only {held_by} in {service} service, where a single valve is "
                      "never permitted (Clause 2.3) and double block and bleed needs a bleed (Clause 2.2); fit "
                      "a spade, or a bleed between two valves, before work")
        notes = []
        if sealed:
            notes.append(f"{', '.join(sealed)} {'is' if len(sealed) == 1 else 'are'} car-sealed open on a relief "
                         "path: closing needs an isolation certificate (SOP-OPS-015 Clause 6, SOP-INS-025 Clause 5)")
            clause += "; SOP-OPS-015 Clause 6"
        if non_isolating:
            notes.append(f"{', '.join(non_isolating)} {'is' if len(non_isolating) == 1 else 'are'} not an isolation "
                         "point (control, check and relief valves do not isolate)")
        return {
            "line": line,
            "service": service,
            "beyond": beyond,
            "elements": elements,
            "element_types": types,
            "method": method,
            "compliant": compliant,
            "clause": clause,
            "action": action,
            "notes": notes,
            "close": close if (blinds or dbb or (blocks and not hazardous)) else [],
            "bleeds": [dbb[1]] if dbb else [],
            "blind": blinds[:1],
        }


# ------------------------------------------------------------------ library
_INTENT = re.compile(
    r"\b(isolat\w*|lock[\s-]?out|loto|blind(?:ing)?|spade|upstream|downstream|affected|connected\s+to|"
    r"path\s+(?:between|from)|what\s+feeds|feeds?\s+into|instruments?\s+on)\b",
    re.IGNORECASE,
)
_PURPOSE = (
    ("confined_space", re.compile(r"\b(confined\s+space|vessel\s+entry|enter(?:ing)?\s+the\s+(?:drum|vessel)|entry)\b", re.I)),
    ("hot_work", re.compile(r"\b(hot\s+work|weld\w*|grind\w*|cutting)\b", re.I)),
)


class DrawingLibrary:
    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self._drawings: dict[str, Drawing] | None = None

    @property
    def drawings(self) -> dict[str, Drawing]:
        if self._drawings is None:
            loaded: dict[str, Drawing] = {}
            for path in sorted(self.directory.glob("*.json")) if self.directory.exists() else []:
                drawing = Drawing.load(path)
                loaded[drawing.id] = drawing
            self._drawings = loaded
        return self._drawings

    def find(self, tag: str) -> Drawing | None:
        return next((d for d in self.drawings.values() if tag in d.nodes), None)

    def question(self, prompt: str) -> dict[str, Any] | None:
        """Answer a topology question the prompt asks, if it asks one about a known tag."""
        if not _INTENT.search(prompt):
            return None
        tags = [tag for tag in dict.fromkeys(re.findall(r"\b[A-Z]{1,3}-\d{3,5}[A-Z]?(?:-\d+)?\b", prompt))
                if self.find(tag)]
        if not tags:
            return None
        drawing = self.find(tags[0])
        assert drawing is not None
        lowered = prompt.lower()
        if len(tags) >= 2 and re.search(r"path\s+(?:between|from)", lowered):
            return {"kind": "path", "drawing": drawing.reference, "from": tags[0], "to": tags[1],
                    "steps": drawing.path(tags[0], tags[1])}
        if re.search(r"\bupstream\b|what\s+feeds", lowered) and not re.search(r"isolat", lowered):
            return {"kind": "upstream", "drawing": drawing.reference, "tag": tags[0],
                    "reached": drawing.reach(tags[0], "upstream")}
        if re.search(r"\bdownstream\b", lowered) and not re.search(r"isolat", lowered):
            return {"kind": "downstream", "drawing": drawing.reference, "tag": tags[0],
                    "reached": drawing.reach(tags[0], "downstream")}
        purpose = next((name for name, rule in _PURPOSE if rule.search(prompt)), "maintenance")
        return {"kind": "isolation", **drawing.isolation(tags[0], purpose)}


def summary_lines(result: dict[str, Any]) -> list[str]:
    """The result as sentences a model is told and a reviewer reads."""
    kind = result["kind"]
    if kind == "isolation":
        lines = [f"Isolation of {result['tag']} ({result['label']}) for {result['purpose_words']}, from "
                 f"{result['drawing']}: {len(result['branches'])} branches, "
                 + ("every one isolable as the procedure requires." if result["compliant"] else
                    f"{len(result['non_compliant'])} not isolable as drawn ({', '.join(result['non_compliant'])}).")]
        for branch in result["branches"]:
            lines.append(f"{'OK' if branch['compliant'] else 'NOT PERMITTED'} {branch['action']} "
                         f"[{branch['clause']}]." + (" " + " ".join(n + "." for n in branch["notes"]) if branch["notes"] else ""))
        if result["affected_equipment"]:
            lines.append("Cut off by the isolation: " + ", ".join(result["affected_equipment"]) + ".")
        if result["instruments"]:
            lines.append("Instruments on the isolated equipment: "
                         + ", ".join(f"{i['tag']} ({i['label']})" for i in result["instruments"]) + ".")
        for loop in result["loops"]:
            lines.append(f"Control loop affected: {loop['effect']}.")
        return lines
    if kind in ("upstream", "downstream"):
        equipment = [r for r in result["reached"] if r["type"] in EQUIPMENT or r["type"] == "boundary"]
        return [f"{kind.capitalize()} of {result['tag']} on {result['drawing']}: "
                + ", ".join(f"{r['tag']} ({r['label']}, via {r['line']})" for r in equipment) + "."]
    steps = result["steps"]
    if not steps:
        return [f"No connection between {result['from']} and {result['to']} on {result['drawing']}."]
    return [f"Path from {result['from']} to {result['to']} on {result['drawing']}: "
            + " → ".join([steps[0]["from"], *[f"{s['to']} ({s['line']})" for s in steps]]) + "."]


_library: DrawingLibrary | None = None


def get_drawing_library() -> DrawingLibrary:
    global _library
    if _library is None:
        from backend.core.config import PROJECT_ROOT

        _library = DrawingLibrary(PROJECT_ROOT / "sample_data" / "pid")
    return _library
