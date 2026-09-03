"""Generate a realistic 'scanned' inspection report image for demonstration.

Produces a PNG that looks like a photocopied field inspection form — noise,
slight rotation, uneven contrast — so the vision path is exercised on
something closer to a real scan than clean rendered text. The content matches
the sample SOPs in ``sample_data/sop`` so the retrieval path has something
genuine to ground against.

Run: python scripts/make_sample_inspection_report.py
"""

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

WIDTH, HEIGHT = 1700, 2200
OUTPUT = Path(__file__).resolve().parents[1] / "sample_data" / "inspection"

FORM = {
    "title": "PLANT INSPECTION REPORT",
    "subtitle": "Inspection & Integrity Department — Field Record",
    "fields": [
        ("Report No.", "INS-2026-0417"),
        ("Equipment Tag", "V-2104"),
        ("Description", "Crude Overhead Knock-Out Drum"),
        ("Service", "Sour hydrocarbon vapour / condensate"),
        ("Design Pressure", "10.5 bar(g)"),
        ("Design Temp.", "145 deg C"),
        ("Material", "SA-516 Gr.70 Carbon Steel"),
        ("Nominal Thickness", "12.0 mm"),
        ("Date of Inspection", "18 February 2026"),
        ("Previous Inspection", "20 February 2022"),
        ("Inspector", "R. Menon (Cert. API-510 #38812)"),
        ("Method", "UT thickness survey + visual external"),
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
    "observations_title": "VISUAL OBSERVATIONS",
    "observations": [
        "1. External cladding damaged over approx. 35% of shell course 2;",
        "   insulation found waterlogged on removal. Rust bleeding at the",
        "   cladding joints on the north face.",
        "2. Localised external metal loss beneath damaged insulation on",
        "   shell course 2. Pitting observed, max pit depth 1.6 mm,",
        "   density approx. 12 pits per 100 sq.cm.",
        "3. Inlet nozzle N1 shows general wall loss consistent with",
        "   erosion-corrosion at the inlet impingement zone.",
        "4. Relief valve PSV-2104A tested satisfactory on 12 Jan 2026.",
        "5. Support saddles, earthing and nameplate in good condition.",
        "6. No through-wall defects or active leaks identified.",
    ],
    "remarks_title": "INSPECTOR REMARKS",
    "remarks": [
        "Corrosion under insulation confirmed on shell course 2. Wall loss",
        "at course 2 is the governing location. Recommend engineering",
        "assessment of remaining life before the next operating campaign,",
        "and repair of cladding and insulation during the current",
        "shutdown window. Vessel considered fit for continued service in",
        "the interim, subject to review.",
    ],
    "signature": "Signed: R. Menon        Date: 18/02/2026        Sheet 1 of 1",
}


def _font(size: int, bold: bool = False, mono: bool = False):
    candidates = [
        "/usr/share/fonts/liberation-sans/LiberationSans-{}.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-{}.ttf",
        "/usr/share/fonts/liberation/LiberationSans-{}.ttf",
        "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans{}.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans{}.ttf",
    ]
    mono_candidates = [
        "/usr/share/fonts/liberation-mono/LiberationMono-{}.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-{}.ttf",
        "/usr/share/fonts/dejavu-sans-mono-fonts/DejaVuSansMono{}.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono{}.ttf",
    ]
    pool = mono_candidates if mono else candidates
    for template in pool:
        for suffix in (("Bold", "-Bold") if bold else ("Regular", "")):
            path = template.format(suffix)
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default(size)


def build() -> Path:
    random.seed(20260218)
    image = Image.new("L", (WIDTH, HEIGHT), 247)
    draw = ImageDraw.Draw(image)

    title_font = _font(46, bold=True)
    subtitle_font = _font(26)
    label_font = _font(25, bold=True, mono=True)
    value_font = _font(25, mono=True)
    section_font = _font(29, bold=True)
    body_font = _font(25, mono=True)

    margin = 90
    y = 70

    draw.rectangle([margin - 25, y - 25, WIDTH - margin + 25, HEIGHT - 60], outline=70, width=3)

    draw.text((WIDTH // 2, y + 20), FORM["title"], font=title_font, fill=25, anchor="mm")
    y += 60
    draw.text((WIDTH // 2, y + 20), FORM["subtitle"], font=subtitle_font, fill=60, anchor="mm")
    y += 60
    draw.line([margin, y, WIDTH - margin, y], fill=80, width=2)
    y += 35

    # Two-column field block
    column_width = (WIDTH - 2 * margin) // 2 + 20
    for index, (label, value) in enumerate(FORM["fields"]):
        column = index % 2
        if column == 0 and index > 0:
            y += 42
        x = margin + column * column_width
        draw.text((x, y), f"{label}:", font=label_font, fill=35)
        draw.text((x + 330, y), value, font=value_font, fill=20)
    y += 75

    # Readings table
    draw.text((margin, y), FORM["readings_title"], font=section_font, fill=25)
    y += 45
    columns = [margin, margin + 520, margin + 760, margin + 1000]
    table_top = y
    for index, header in enumerate(FORM["readings_header"]):
        draw.text((columns[index], y), header, font=label_font, fill=30)
    y += 38
    draw.line([margin, y - 8, WIDTH - margin, y - 8], fill=90, width=2)
    for row in FORM["readings"]:
        for index, cell in enumerate(row):
            draw.text((columns[index], y), cell, font=body_font, fill=20)
        y += 40
    draw.line([margin, y, WIDTH - margin, y], fill=90, width=2)
    for column_x in columns[1:]:
        draw.line([column_x - 25, table_top - 10, column_x - 25, y], fill=140, width=1)
    y += 45

    draw.text((margin, y), FORM["observations_title"], font=section_font, fill=25)
    y += 45
    for line in FORM["observations"]:
        draw.text((margin, y), line, font=body_font, fill=20)
        y += 38
    y += 25

    draw.text((margin, y), FORM["remarks_title"], font=section_font, fill=25)
    y += 45
    for line in FORM["remarks"]:
        draw.text((margin, y), line, font=body_font, fill=20)
        y += 38

    y += 60
    draw.line([margin, y, WIDTH - margin, y], fill=110, width=1)
    y += 20
    draw.text((margin, y), FORM["signature"], font=body_font, fill=40)

    # --- make it look photocopied -------------------------------------
    image = image.rotate(-0.45, resample=Image.BICUBIC, fillcolor=247, expand=False)

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

    image = image.filter(ImageFilter.GaussianBlur(radius=0.4))

    OUTPUT.mkdir(parents=True, exist_ok=True)
    target = OUTPUT / "scanned-inspection-report-V-2104.png"
    image.convert("RGB").save(target, "PNG", optimize=True)
    return target


if __name__ == "__main__":
    path = build()
    print(f"Wrote {path} ({path.stat().st_size // 1024} KB)")
