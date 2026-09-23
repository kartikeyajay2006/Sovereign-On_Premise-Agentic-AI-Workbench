"""Generate realistic 'scanned' inspection reports for demonstration.

Each report is rendered as a photocopied-looking field form -- noise, slight
rotation, uneven contrast -- first as a PNG and then, optionally, as a PDF
with no text layer. That PDF is what a real scanner produces, and it is what
forces the workbench down the vision path: the text parser finds nothing, the
page is rasterised, and the vision model has to read it.

Every sheet carries a SYNTHETIC stamp. The equipment, readings and people are
invented for the AEGIS demonstration corpus and match the synthetic
procedures in ``sample_data/sop`` and the datasets written by
``scripts/seed_demo_data.py``, so a correct reading of a scan is checkable.

Two reports are defined:

  V-2104  INS-2026-0417  Medium severity via corrosion under insulation;
                         remaining life above 4 years (the headline case).
  V-2107  INS-2026-0588  High severity: a shell reading below t-min.

Run:
    python scripts/make_sample_inspection_report.py              # V-2104, PNG + PDF
    python scripts/make_sample_inspection_report.py --report V-2107
    python scripts/make_sample_inspection_report.py --all
    python scripts/make_sample_inspection_report.py --all --png-only
"""

from __future__ import annotations

import argparse
import random
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFilter, ImageFont

WIDTH, HEIGHT = 1700, 2200
# 1700 x 2200 px at 200 dpi is exactly US Letter (8.5 x 11 in), so the PDF page
# keeps the scan's proportions instead of stretching it onto another size.
PDF_DPI = 200.0
PDF_JPEG_QUALITY = 82
OUTPUT = Path(__file__).resolve().parents[1] / "sample_data" / "inspection"

STAMP = "SYNTHETIC DOCUMENT — FICTIONAL DATA FOR THE AEGIS DEMONSTRATION"

# Field rows: one (label, value) pair spans the full width; two share it.
REPORTS: dict[str, dict[str, Any]] = {
    "V-2104": {
        "seed": 20260218,
        "rotation": -0.45,
        "title": "PLANT INSPECTION REPORT",
        "subtitle": "Inspection & Integrity Department — Field Record",
        "fields": [
            [("Report No.", "INS-2026-0417"), ("Equipment Tag", "V-2104")],
            [("Description", "Crude Overhead Knock-Out Drum")],
            [("Service", "Sour hydrocarbon vapour / condensate")],
            [("Service Category", "Corrosive (SOP-INS-014 Cl. 2.2)")],
            [("Design Pressure", "10.5 bar(g)"), ("Design Temp.", "145 deg C")],
            [("Material", "SA-516 Gr.70 Carbon Steel"), ("In Service Since", "18 Feb 2006")],
            [("Nominal Thickness", "12.0 mm"), ("t-min", "6.0 mm (INS-014 Cl. 3.2)")],
            [("Date of Inspection", "18 February 2026"), ("Previous Inspection", "20 February 2022")],
            [("Inspector", "R. Menon, Inspection Engineer"), ("Method", "UT survey + external visual")],
        ],
        "readings_title": "ULTRASONIC THICKNESS READINGS (mm)",
        "readings_header": ["Location", "2022", "2026", "Min. Recorded"],
        "readings": [
            ["Shell course 1 (top)", "11.8", "10.9", "10.9"],
            ["Shell course 2 (mid)", "11.6", "9.4", "9.4"],
            ["Shell course 3 (bot)", "11.9", "11.1", "11.1"],
            ["Bottom head", "12.0", "11.4", "11.4"],
            ["Inlet nozzle N1", "11.5", "10.2", "10.2"],
            ["Manway M1 flange", "12.0", "11.8", "11.8"],
        ],
        "observations": [
            "External cladding damaged over approx. 35% of shell course 2; "
            "insulation found waterlogged on removal. Rust bleeding at the "
            "cladding joints on the north face.",
            "Localised external metal loss beneath damaged insulation on shell "
            "course 2. Pitting observed, max pit depth 1.6 mm, density approx. "
            "12 pits per 100 sq.cm.",
            "Inlet nozzle N1 shows general wall loss consistent with "
            "erosion-corrosion at the inlet impingement zone.",
            "Relief valve PSV-2104A tested satisfactory on 12 Jan 2026.",
            "Support saddles, earthing and nameplate in good condition.",
            "No through-wall defects or active leaks identified.",
        ],
        "remarks": (
            "Corrosion under insulation confirmed on shell course 2. Wall loss "
            "at course 2 is the governing location. Recommend engineering "
            "assessment of remaining life before the next operating campaign, "
            "and repair of cladding and insulation during the current shutdown "
            "window. Vessel considered fit for continued service in the "
            "interim, subject to review. The 2024 thickness survey was deferred "
            "under FFS-2024-007, approved by the Head of Inspection."
        ),
        "signature": "Signed: R. Menon        Date: 18/02/2026        Sheet 1 of 1",
    },
    "V-2107": {
        "seed": 20260518,
        "rotation": 0.35,
        "title": "PLANT INSPECTION REPORT",
        "subtitle": "Inspection & Integrity Department — Field Record",
        "fields": [
            [("Report No.", "INS-2026-0588"), ("Equipment Tag", "V-2107")],
            [("Description", "Amine Flash Drum")],
            [("Service", "Rich amine / flash gas")],
            [("Service Category", "Corrosive (SOP-INS-014 Cl. 2.2)")],
            [("Design Pressure", "7.0 bar(g)"), ("Design Temp.", "90 deg C")],
            [("Material", "SA-516 Gr.70 Carbon Steel"), ("In Service Since", "18 May 2011")],
            [("Nominal Thickness", "10.0 mm"), ("t-min", "6.0 mm (INS-014 Cl. 3.2)")],
            [("Date of Inspection", "18 May 2026"), ("Previous Inspection", "18 May 2024")],
            [("Inspector", "S. Iyer, Inspection Engineer"), ("Method", "UT survey + internal visual")],
        ],
        "readings_title": "ULTRASONIC THICKNESS READINGS (mm)",
        "readings_header": ["Location", "2024", "2026", "Min. Recorded"],
        "readings": [
            ["Shell course 1 (liquid zone)", "7.1", "5.8", "5.8"],
            ["Shell course 2 (vapour zone)", "9.2", "9.0", "9.0"],
            ["Top head", "9.5", "9.4", "9.4"],
            ["Bottom head", "8.6", "8.2", "8.2"],
            ["Outlet nozzle N2", "8.8", "8.3", "8.3"],
            ["Inlet nozzle N1", "9.4", "9.3", "9.3"],
        ],
        "observations": [
            "Shell course 1: uniform internal wall loss below the normal liquid "
            "level. Minimum reading 5.8 mm, below the t-min of 6.0 mm.",
            "No pitting on shell course 1. No cracking found by magnetic "
            "particle examination of the adjacent welds.",
            "No through-wall defect and no active leak identified.",
            "Relief valve PSV-2107A bench tested satisfactory on 02 May 2026.",
            "Vessel is not insulated; external coating in good condition.",
        ],
        "remarks": (
            "Shell course 1 is below t-min. Vessel isolated at 17:30 on "
            "18/05/2026 and to remain out of service pending engineering "
            "assessment. Head of Inspection approved the withdrawal; Plant "
            "Manager notified. Recommend replacement of shell course 1 or of "
            "the vessel."
        ),
        "signature": "Signed: S. Iyer        Date: 18/05/2026        Sheet 1 of 1",
    },
}

DEFAULT_REPORT = "V-2104"

# Bare file names: Pillow searches the platform font directories itself
# (Windows\Fonts, /Library/Fonts, and the XDG font dirs on Linux).
FONT_FILES: dict[tuple[str, bool], list[str]] = {
    ("sans", False): ["LiberationSans-Regular.ttf", "DejaVuSans.ttf", "arial.ttf", "Arial.ttf"],
    ("sans", True): ["LiberationSans-Bold.ttf", "DejaVuSans-Bold.ttf", "arialbd.ttf", "Arial Bold.ttf"],
    ("mono", False): ["LiberationMono-Regular.ttf", "DejaVuSansMono.ttf", "consola.ttf", "cour.ttf", "Courier New.ttf"],
    ("mono", True): ["LiberationMono-Bold.ttf", "DejaVuSansMono-Bold.ttf", "consolab.ttf", "courbd.ttf", "Courier New Bold.ttf"],
}


def _font(size: int, bold: bool = False, mono: bool = False) -> ImageFont.ImageFont:
    for name in FONT_FILES[("mono" if mono else "sans", bold)]:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, width: float) -> list[str]:
    """Break text into lines that fit ``width`` pixels.

    Measured, not estimated: the first version of this form let two field
    values run off the page and a third overlap the next label.
    """
    lines: list[str] = []
    line = ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if not line or draw.textlength(trial, font=font) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines or [""]


def report_ids() -> list[str]:
    return list(REPORTS)


def render(report_id: str = DEFAULT_REPORT) -> Image.Image:
    """Draw one report and give it a photocopied look. Deterministic."""
    if report_id not in REPORTS:
        raise KeyError(f"unknown report '{report_id}'; known: {', '.join(REPORTS)}")
    form = REPORTS[report_id]
    random.seed(form["seed"])

    image = Image.new("L", (WIDTH, HEIGHT), 247)
    draw = ImageDraw.Draw(image)

    title_font = _font(46, bold=True)
    subtitle_font = _font(26)
    stamp_font = _font(23, bold=True)
    label_font = _font(24, bold=True, mono=True)
    value_font = _font(24, mono=True)
    section_font = _font(29, bold=True)
    body_font = _font(25, mono=True)
    line_height = 38

    margin = 90
    content_width = WIDTH - 2 * margin
    y = 70

    draw.rectangle([margin - 25, y - 25, WIDTH - margin + 25, HEIGHT - 60], outline=70, width=3)

    draw.text((WIDTH // 2, y + 20), form["title"], font=title_font, fill=25, anchor="mm")
    y += 60
    draw.text((WIDTH // 2, y + 20), form["subtitle"], font=subtitle_font, fill=60, anchor="mm")
    y += 50

    # The synthetic stamp: boxed, upright, and legible to a person or a model.
    stamp_width = draw.textlength(STAMP, font=stamp_font) + 40
    left = (WIDTH - stamp_width) / 2
    draw.rectangle([left, y, left + stamp_width, y + 44], outline=40, width=3)
    draw.rectangle([left + 5, y + 5, left + stamp_width - 5, y + 39], outline=110, width=1)
    draw.text((WIDTH // 2, y + 22), STAMP, font=stamp_font, fill=30, anchor="mm")
    y += 64

    draw.line([margin, y, WIDTH - margin, y], fill=80, width=2)
    y += 28

    # Field block.
    label_width = 300
    half = content_width // 2
    for row in form["fields"]:
        spans = [(margin, content_width)] if len(row) == 1 else [(margin, half), (margin + half, half)]
        row_lines = 1
        for (label, value), (x, span) in zip(row, spans):
            draw.text((x, y), f"{label}:", font=label_font, fill=35)
            lines = _wrap(draw, value, value_font, span - label_width - 20)
            for index, line in enumerate(lines):
                draw.text((x + label_width, y + index * line_height), line, font=value_font, fill=20)
            row_lines = max(row_lines, len(lines))
        y += row_lines * line_height + 4
    y += 30

    # Readings table.
    draw.text((margin, y), form["readings_title"], font=section_font, fill=25)
    y += 46
    columns = [margin, margin + 580, margin + 820, margin + 1060]
    table_top = y
    for index, header in enumerate(form["readings_header"]):
        draw.text((columns[index], y), header, font=label_font, fill=30)
    y += 38
    draw.line([margin, y - 8, WIDTH - margin, y - 8], fill=90, width=2)
    for row in form["readings"]:
        for index, cell in enumerate(row):
            draw.text((columns[index], y), cell, font=body_font, fill=20)
        y += 40
    draw.line([margin, y, WIDTH - margin, y], fill=90, width=2)
    for column_x in columns[1:]:
        draw.line([column_x - 25, table_top - 10, column_x - 25, y], fill=140, width=1)
    y += 42

    # Observations, numbered with a hanging indent.
    draw.text((margin, y), "VISUAL OBSERVATIONS", font=section_font, fill=25)
    y += 46
    indent = draw.textlength("00. ", font=body_font)
    for number, observation in enumerate(form["observations"], start=1):
        lines = _wrap(draw, observation, body_font, content_width - indent)
        draw.text((margin, y), f"{number}.", font=body_font, fill=20)
        for line in lines:
            draw.text((margin + indent, y), line, font=body_font, fill=20)
            y += line_height
    y += 24

    draw.text((margin, y), "INSPECTOR REMARKS", font=section_font, fill=25)
    y += 46
    for line in _wrap(draw, form["remarks"], body_font, content_width):
        draw.text((margin, y), line, font=body_font, fill=20)
        y += line_height

    y += 50
    draw.line([margin, y, WIDTH - margin, y], fill=110, width=1)
    y += 20
    draw.text((margin, y), form["signature"], font=body_font, fill=40)
    y += 44
    draw.text((margin, y), STAMP, font=_font(19, mono=True), fill=90)

    # --- make it look photocopied -------------------------------------
    image = image.rotate(form["rotation"], resample=Image.BICUBIC, fillcolor=247, expand=False)

    pixels = image.load()
    for _ in range(int(WIDTH * HEIGHT * 0.012)):
        x = random.randrange(WIDTH)
        y_noise = random.randrange(HEIGHT)
        pixels[x, y_noise] = max(0, min(255, pixels[x, y_noise] + random.randint(-55, 35)))

    # Uneven scanner illumination: darker toward one edge.
    shading = Image.new("L", (WIDTH, HEIGHT), 255)
    shade_draw = ImageDraw.Draw(shading)
    for x in range(0, WIDTH, 4):
        value = 255 - int(18 * (x / WIDTH))
        shade_draw.rectangle([x, 0, x + 4, HEIGHT], fill=value)
    image = Image.blend(image, Image.composite(image, shading, image), 0.25)

    return image.filter(ImageFilter.GaussianBlur(radius=0.4))


def png_path(report_id: str = DEFAULT_REPORT) -> Path:
    return OUTPUT / f"scanned-inspection-report-{report_id}.png"


def pdf_path(report_id: str = DEFAULT_REPORT) -> Path:
    return OUTPUT / f"scanned-inspection-report-{report_id}.pdf"


def build(report_id: str = DEFAULT_REPORT, image: Image.Image | None = None) -> Path:
    """Write the scan as a PNG and return its path."""
    OUTPUT.mkdir(parents=True, exist_ok=True)
    target = png_path(report_id)
    (image or render(report_id)).convert("RGB").save(target, "PNG", optimize=True)
    return target


def build_pdf(report_id: str = DEFAULT_REPORT, image: Image.Image | None = None) -> Path:
    """Write the scan as a single-page PDF with no text layer.

    The page is one JPEG image, which is what a scanner produces. It keeps the
    file near a megabyte; the previous approach embedded the raw pixels and
    came to about eleven. There is deliberately no OCR layer: its absence is
    what makes the workbench rasterise the page and hand it to the vision model
    (backend/rag/parsing.py, ``has_extractable_text``).
    """
    OUTPUT.mkdir(parents=True, exist_ok=True)
    target = pdf_path(report_id)
    page = (image or render(report_id)).convert("L")
    page.save(
        target,
        "PDF",
        resolution=PDF_DPI,
        quality=PDF_JPEG_QUALITY,
        title=f"Scanned inspection report {report_id} (SYNTHETIC)",
        author="AEGIS demonstration corpus (synthetic)",
    )
    return target


def build_all(report_ids_: list[str] | None = None, *, pdf: bool = True) -> list[Path]:
    written: list[Path] = []
    for report_id in report_ids_ or report_ids():
        image = render(report_id)
        written.append(build(report_id, image))
        if pdf:
            written.append(build_pdf(report_id, image))
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--report", choices=report_ids(), default=DEFAULT_REPORT)
    parser.add_argument("--all", action="store_true", help="render every defined report")
    parser.add_argument("--png-only", action="store_true", help="skip the scanned PDF")
    arguments = parser.parse_args()

    targets = report_ids() if arguments.all else [arguments.report]
    for path in build_all(targets, pdf=not arguments.png_only):
        print(f"Wrote {path} ({path.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
