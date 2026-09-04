"""Build the demonstration dataset and load it into the workbench.

Creates industrial documents that are internally consistent — the readings in
the scanned report satisfy the rules in the procedures, so a correct answer is
reachable and a wrong one is detectable. Without that, a demonstration only
shows the machinery running, not whether it reasoned correctly.

    python scripts/seed_demo_data.py            build files and index the SOPs
    python scripts/seed_demo_data.py --files-only   build files, skip indexing

Everything runs locally; the embedding model is the one already installed.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "sample_data"

# One vessel, described consistently across every artefact, so a correct answer
# is reachable and a wrong one is detectable.
#
# The case is deliberately not the obvious one. Shell course 2 governs on
# remaining life, but that life is above the four-year threshold, so the
# severity has to be justified from the cladding damage under SOP-MNT-022
# rather than the remaining-life rule everyone reaches for first. The inlet
# nozzle corrodes faster yet has more margin, so speed alone does not decide
# which location governs.
VESSEL = {
    "tag": "V-2104",
    "description": "Crude Overhead Knock-Out Drum",
    "service": "Sour hydrocarbon vapour / condensate",
    "design_pressure_bar": 10.5,
    "design_temp_c": 145,
    "material": "SA-516 Gr.70 Carbon Steel",
    "nominal_mm": 12.0,
    "t_min_mm": 6.0,
    "previous_inspection": "20 February 2022",
    "this_inspection": "18 February 2026",
    "years_between": 4.0,
    "inspector": "R. Menon (Cert. API-510 #38812)",
    "report_no": "INS-2026-0417",
}

READINGS = [
    # location,               2022,  2026
    ("Shell course 1 (top)", 11.8, 10.9),
    ("Shell course 2 (mid)", 11.6, 9.4),   # governing location
    ("Shell course 3 (bot)", 11.9, 11.1),
    ("Bottom head", 12.0, 11.4),
    ("Inlet nozzle N1", 11.5, 10.2),
    ("Manway M1 flange", 12.0, 11.8),
]


def expected_answers() -> dict[str, object]:
    """What a correct answer looks like, derived from the same numbers.

    Used to check the workbench rather than to feed it: the model never sees
    this, so agreement means it did the work.
    """
    rows = []
    for location, before, after in READINGS:
        rate = (before - after) / VESSEL["years_between"]
        life = (after - VESSEL["t_min_mm"]) / rate if rate > 0 else float("inf")
        rows.append({"location": location, "rate_mm_yr": round(rate, 4),
                     "remaining_life_years": round(life, 2)})
    governing = min(rows, key=lambda r: r["remaining_life_years"])
    life = governing["remaining_life_years"]

    # Severity is derived, not asserted, so the expected answer cannot drift
    # from the readings the way a written-down one would.
    if life < 2:
        severity = "high"
        basis = "SOP-INS-021 Clause 2 — remaining life below 2 years requires an FFS assessment"
    elif life < 4:
        severity = "medium"
        basis = "SOP-INS-014 Clause 4.5 — remaining life below 4 years"
    else:
        # The interesting case: the life rule does NOT bite here, so a correct
        # answer must justify severity from the cladding damage instead. An
        # answer citing the 4-year rule is wrong, and detectably so.
        severity = "medium"
        basis = (
            "SOP-MNT-022 Clause 4.1 — cladding damage over 20% of the insulated "
            "section (35% recorded); the remaining-life rule in SOP-INS-014 "
            "Clause 4.5 does NOT apply, since life exceeds 4 years"
        )

    return {
        "per_location": rows,
        "governing_location": governing["location"],
        "governing_rate_mm_yr": governing["rate_mm_yr"],
        "governing_remaining_life_years": life,
        "severity": severity,
        "severity_basis": basis,
        "approver": "Head of Inspection (SOP-OPS-008 authority matrix)",
        "traps": [
            "Remaining life is above 4 years, so citing SOP-INS-014 Clause 4.5 "
            "as the basis for Medium severity is incorrect.",
            "The governing location is the worst remaining life, not the "
            "thinnest absolute reading.",
            "Inlet nozzle N1 has a higher corrosion rate but more margin, so it "
            "is not governing.",
        ],
    }


def write_thickness_csv() -> Path:
    target = SAMPLES / "datasets" / "V-2104-thickness-survey.csv"
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            ["location", "thickness_2022_mm", "thickness_2026_mm",
             "nominal_mm", "t_min_mm", "years_between"]
        )
        for location, before, after in READINGS:
            writer.writerow([location, before, after, VESSEL["nominal_mm"],
                             VESSEL["t_min_mm"], VESSEL["years_between"]])
    return target


def write_inspection_history_csv() -> Path:
    """Several vessels, so analysis tasks have a population to work over."""
    target = SAMPLES / "datasets" / "inspection-history.csv"
    target.parent.mkdir(parents=True, exist_ok=True)
    random.seed(2104)

    vessels = [
        ("V-2101", "Feed Surge Drum", "Non-corrosive"),
        ("V-2104", "Crude Overhead Knock-Out Drum", "Sour hydrocarbon"),
        ("V-2107", "Amine Flash Drum", "Corrosive"),
        ("V-2110", "Steam Condensate Pot", "Steam"),
        ("V-2115", "Fuel Gas KO Drum", "Non-corrosive"),
        ("V-2118", "Reflux Accumulator", "Corrosive"),
    ]

    with target.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            ["tag", "description", "service", "inspection_date", "nominal_mm",
             "measured_min_mm", "t_min_mm", "years_since_last"]
        )
        for tag, description, service in vessels:
            if tag == VESSEL["tag"]:
                writer.writerow([tag, description, service, "2026-02-18",
                                 12.0, 9.4, 6.0, 4.0])
                continue
            nominal = random.choice([10.0, 12.0, 14.0])
            loss = random.uniform(0.3, 2.4)
            writer.writerow([
                tag, description, service,
                f"2026-{random.randint(1, 6):02d}-{random.randint(1, 28):02d}",
                nominal, round(nominal - loss, 1), 6.0,
                round(random.uniform(2.0, 5.0), 1),
            ])
    return target


def write_expected_answers() -> Path:
    import json

    target = SAMPLES / "expected-answers.json"
    target.write_text(json.dumps(expected_answers(), indent=2) + "\n", encoding="utf-8")
    return target


async def index_procedures() -> int:
    """Load the procedures into the local knowledge base."""
    from backend.core.schemas import Sensitivity
    from backend.rag.knowledge_base import get_knowledge_base

    knowledge_base = get_knowledge_base()
    documents = await knowledge_base.ingest_directory(
        SAMPLES / "sop",
        department="inspection",
        classification=Sensitivity.CONFIDENTIAL,
    )
    for document in documents:
        print(f"  indexed  {document.title}  ({document.chunk_count} passages)")
    return len(documents)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--files-only", action="store_true")
    arguments = parser.parse_args()

    print("Building the demonstration dataset\n")

    from scripts.make_sample_inspection_report import build as build_scan

    scan = build_scan()
    print(f"  scan     {scan.relative_to(ROOT)}")

    # The same scan as a PDF with no text layer, which is what a real scanner
    # produces and what forces the vision path.
    try:
        import fitz

        pdf = SAMPLES / "inspection" / "scanned-inspection-report-V-2104.pdf"
        document = fitz.open()
        page = document.new_page(width=595, height=842)
        page.insert_image(page.rect, filename=str(scan))
        document.save(str(pdf))
        document.close()
        print(f"  scan pdf {pdf.relative_to(ROOT)} (no text layer — reads via vision)")
    except ImportError:
        print("  scan pdf skipped (PyMuPDF not installed)")

    print(f"  data     {write_thickness_csv().relative_to(ROOT)}")
    print(f"  data     {write_inspection_history_csv().relative_to(ROOT)}")
    print(f"  answers  {write_expected_answers().relative_to(ROOT)}")

    if not arguments.files_only:
        print("\nIndexing procedures into the local knowledge base")
        count = asyncio.run(index_procedures())
        print(f"\n{count} procedure(s) indexed.")

    answers = expected_answers()
    print(
        "\nA correct answer for the headline task:\n"
        f"  governing location   {answers['governing_location']}\n"
        f"  corrosion rate       {answers['governing_rate_mm_yr']} mm/year\n"
        f"  remaining life       {answers['governing_remaining_life_years']} years\n"
        f"  severity             {answers['severity']} "
        f"({answers['severity_basis']})\n"
        f"  approver             {answers['approver']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
