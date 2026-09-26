"""Render the demonstration P&ID as a drawing image the vision model can read.

    python scripts/make_sample_pid_image.py

Writes sample_data/pid/PID-2104-01-crude-overhead.png from the authored graph
(PID-2104-01-crude-overhead.json): every element at its sheet position with
its tag, every line with its number and flow arrow, instrument bubbles with
dashed signal lines, and a title block. The image is SYNTHETIC, like the
graph it is drawn from, and says so in the title block. Rendering is
deterministic, so the committed image changes only when the graph does.

Having the authored graph beside the image is deliberate: what the vision
model reads from the image (backend/engineering/pid_extraction.py) is compared
with it element by element, and every disagreement is reported.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "sample_data" / "pid" / "PID-2104-01-crude-overhead.json"
TARGET = SOURCE.with_suffix(".png")
SCALE = 1.5
TITLE_BLOCK = 120

EQUIPMENT = {"column": (34, 90), "drum": (90, 44), "exchanger": (70, 34), "pump": (40, 40), "tank": (80, 60)}
VALVES = {"gate_valve", "control_valve", "check_valve", "psv"}


def _font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow before 10.1 has one fixed size
        return ImageFont.load_default()


def render(source: Path = SOURCE, target: Path = TARGET) -> Path:
    data = json.loads(source.read_text())
    width, height = int(data["width"] * SCALE), int(data["height"] * SCALE)
    image = Image.new("RGB", (width, height + TITLE_BLOCK), "white")
    draw = ImageDraw.Draw(image)
    small, text, large = _font(13), _font(15), _font(22)
    nodes = {node["id"]: node for node in data["nodes"]}

    def at(node: dict) -> tuple[float, float]:
        return node["x"] * SCALE, node["y"] * SCALE

    # Process lines first, so symbols sit on top of them.
    labelled: set[str] = set()
    for edge in data["edges"]:
        (x1, y1), (x2, y2) = at(nodes[edge["from"]]), at(nodes[edge["to"]])
        draw.line([(x1, y1), (x2, y2)], fill="black", width=2)
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        # Flow arrow at the midpoint.
        length = max(((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5, 1)
        ux, uy = (x2 - x1) / length, (y2 - y1) / length
        tip = (mx + ux * 7, my + uy * 7)
        draw.polygon([tip, (mx - ux * 5 - uy * 5, my - uy * 5 + ux * 5),
                      (mx - ux * 5 + uy * 5, my - uy * 5 - ux * 5)], fill="black")
        if edge["line"] not in labelled:
            labelled.add(edge["line"])
            draw.text((mx + 6, my + 6), edge["line"], fill="#1f3f8f", font=small)

    # Instrument signal lines, dashed.
    for node in nodes.values():
        if node["type"] != "instrument":
            continue
        for key in ("measures", "controls"):
            other = nodes.get(node.get(key) or "")
            if not other or other["id"] == node["id"]:
                continue
            (x1, y1), (x2, y2) = at(node), at(other)
            steps = int(max(abs(x2 - x1), abs(y2 - y1)) // 8) or 1
            for i in range(0, steps, 2):
                a, b = i / steps, min((i + 1) / steps, 1)
                draw.line([(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a), (x1 + (x2 - x1) * b, y1 + (y2 - y1) * b)],
                          fill="#666666", width=1)

    for node in nodes.values():
        x, y = at(node)
        kind, tag = node["type"], node["id"]
        if kind in EQUIPMENT:
            w, h = EQUIPMENT[kind]
            box = (x - w / 2, y - h / 2, x + w / 2, y + h / 2)
            if kind == "pump":
                draw.ellipse(box, outline="black", width=3, fill="white")
            else:
                draw.rounded_rectangle(box, radius=12, outline="black", width=3, fill="white")
            draw.text((x - w / 2, y + h / 2 + 4), tag, fill="black", font=text)
            draw.text((x - w / 2, y + h / 2 + 22), node.get("label", ""), fill="#444444", font=small)
        elif kind in VALVES:
            draw.polygon([(x - 10, y - 7), (x + 10, y + 7), (x + 10, y - 7), (x - 10, y + 7)],
                         outline="black", fill="white" if kind == "gate_valve" else "#dddddd")
            if kind == "control_valve":
                draw.line([(x, y), (x, y - 14)], fill="black", width=2)
                draw.pieslice((x - 8, y - 22, x + 8, y - 6), 180, 360, outline="black", fill="white")
            if node.get("car_sealed"):
                draw.text((x + 12, y - 20), "CSO", fill="#b00000", font=small)
            draw.text((x - 18, y + 10), tag, fill="black", font=small)
        elif kind == "spectacle_blind":
            draw.ellipse((x - 7, y - 14, x + 7, y), outline="black", width=2)
            draw.ellipse((x - 7, y, x + 7, y + 14), outline="black", width=2, fill="black")
            draw.text((x + 10, y - 6), tag, fill="black", font=small)
        elif kind == "bleed":
            draw.line([(x, y), (x + 16, y)], fill="black", width=2)
            draw.polygon([(x + 16, y - 5), (x + 26, y + 5), (x + 26, y - 5), (x + 16, y + 5)], outline="black")
            draw.text((x + 28, y - 7), tag, fill="black", font=small)
        elif kind == "instrument":
            draw.ellipse((x - 18, y - 18, x + 18, y + 18), outline="black", width=2, fill="white")
            prefix, _, number = tag.partition("-")
            draw.text((x - 12, y - 14), prefix, fill="black", font=small)
            draw.text((x - 16, y), number, fill="black", font=small)
        elif kind == "boundary":
            draw.polygon([(x - 30, y - 12), (x + 22, y - 12), (x + 34, y), (x + 22, y + 12), (x - 30, y + 12)],
                         outline="black", width=2, fill="white")
            draw.text((x - 28, y - 7), tag, fill="black", font=small)
            draw.text((x - 30, y + 16), node.get("label", ""), fill="#444444", font=small)
        else:  # tee / header / injection point
            draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill="black")
            draw.text((x + 6, y - 18), tag, fill="#444444", font=small)

    # Title block.
    top = height + 10
    draw.rectangle((10, top, width - 10, height + TITLE_BLOCK - 10), outline="black", width=2)
    draw.text((24, top + 12), f"DRAWING No. {data['id']}    REV {data['revision']}", fill="black", font=large)
    draw.text((24, top + 46), data["title"], fill="black", font=text)
    draw.text((24, top + 70), f"{data['status']}: {data['note']}", fill="#b00000", font=small)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, optimize=True)
    return target


def main() -> int:
    print(f"  drawing  {render().relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT))
    raise SystemExit(main())
