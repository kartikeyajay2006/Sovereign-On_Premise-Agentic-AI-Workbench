"""Build the demonstration dataset and load it into the workbench.

Everything this script builds or indexes is SYNTHETIC. The procedures,
reports, equipment, people and figures are invented for the AEGIS
demonstration. Every document says so in its header, and indexing refuses a
document that does not.

The corpus is internally consistent: the readings in the reports satisfy the
rules in the procedures, and every clause cross-reference resolves. A correct
answer is therefore reachable and a wrong one is detectable. Without that, a
demonstration only shows the machinery running, not whether it reasoned
correctly.

    python scripts/seed_demo_data.py                  build files, then index the corpus
    python scripts/seed_demo_data.py --check          validate the corpus only: writes
                                                      nothing, opens no database
    python scripts/seed_demo_data.py --files-only     build files, skip indexing
    python scripts/seed_demo_data.py --keep-stale     keep superseded copies in the index
    python scripts/seed_demo_data.py --allow-lexical  index even with no embedding model

What is indexed, and with which metadata, is read from each document's own
header (**Department:**, **Classification:**, **Revision:**) and mapped onto
the ids declared in policies/access-control.yaml and
policies/data-classification.yaml. The scanned reports are not indexed: they
are attachments, read by the vision model when a task includes them.

Everything runs locally; the embedding model is the one already installed.
"""

from __future__ import annotations

import argparse
import asyncio
import calendar
import csv
import json
import math
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "sample_data"
KNOWLEDGE_DIRS = (SAMPLES / "sop", SAMPLES / "records")
# Superseded revisions, kept for audit history and indexed as superseded.
ARCHIVE_DIR = SAMPLES / "sop" / "archive"
POLICIES = ROOT / "policies"
PIPING_REPORT = SAMPLES / "records" / "INS-2026-0522-P-2104-OVHD-01-thickness-survey.md"

# The reasoning prompt shows each retrieved passage cut to this many
# characters (backend/agents/orchestrator.py, AgentOrchestrator._reason). A
# clause longer than this reaches the model with its end missing -- which is
# how the Medium row of a findings table came to be read as "Head of Inspec".
VISIBLE_PASSAGE_CHARS = 500

DOC_CODE = re.compile(r"(?:SOP-[A-Z]{3}-\d{3}|ENG-DBM-\d{4}|INV-\d{4}-\d{3}|INS-\d{4}-\d{4})")
FIELD = re.compile(r"^\*\*([A-Za-z][A-Za-z ]*):\*\*\s*(.+?)\s*$")
HEADING = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
CLAUSE_REF = re.compile(
    r"(?:(" + DOC_CODE.pattern + r")\s+)?Clauses?\s+"
    r"(\d+(?:\.\d+)?(?:\s*(?:,|and|or|to)\s*\d+(?:\.\d+)?)*)"
)
# Cited on purpose but not in the knowledge base: the scanned reports are
# attachments for the vision path, not indexed text.
NOT_INDEXED = {"INS-2026-0417", "INS-2026-0588"}

# Thickness survey intervals by service category, SOP-INS-014 Clauses 2.1-2.4.
SURVEY_INTERVAL_MONTHS = {
    "non-corrosive": 48,
    "corrosive": 24,
    "lethal or toxic": 24,
    "steam": 36,
}
AS_OF = date(2026, 10, 1)  # the date the inspection-history question is asked about
# Datasets carry their marking as a column: a comment line would break the
# CSV readers the sandbox uses, and the marking must survive being attached.
DATA_STATUS = "SYNTHETIC"

# Six vessels described consistently with the procedures and the scans, so a
# population question has one right answer. Readings are at each vessel's
# governing location. V-2118 is the trap: its remaining life is under four
# years, so SOP-INS-014 Clause 4.5 halves its survey interval and it is
# overdue; read without that clause, it is not.
INSPECTION_HISTORY = [
    # tag, description, category, status, in service, previous, last, location, nominal, previous mm, last mm, t-min, notes
    ("V-2101", "Feed Surge Drum", "non-corrosive", "in service", "2004-04-24",
     "2020-04-24", "2024-04-24", "Shell course 1", 10.0, 9.4, 9.2, 6.0, ""),
    ("V-2104", "Crude Overhead Knock-Out Drum", "corrosive", "in service", "2006-02-18",
     "2022-02-20", "2026-02-18", "Shell course 2 (mid)", 12.0, 11.6, 9.4, 6.0,
     "2024 survey deferred under FFS-2024-007, approved by the Head of Inspection"),
    ("V-2107", "Amine Flash Drum", "corrosive", "withdrawn", "2011-05-18",
     "2024-05-18", "2026-05-18", "Shell course 1 (liquid zone)", 10.0, 7.1, 5.8, 6.0,
     "withdrawn 2026-05-18: shell course 1 below t-min (INS-2026-0588)"),
    ("V-2110", "Steam Condensate Pot", "steam", "in service", "2010-06-15",
     "2020-06-15", "2023-06-15", "Bottom head", 12.0, 11.6, 11.4, 6.0, ""),
    ("V-2115", "Fuel Gas KO Drum", "non-corrosive", "in service", "2012-11-03",
     "2018-11-03", "2022-11-03", "Shell course 1", 14.0, 13.8, 13.7, 6.0, ""),
    ("V-2118", "Reflux Accumulator", "corrosive", "in service", "2014-06-10",
     "2023-06-10", "2025-06-10", "Shell course 2", 10.0, 8.6, 7.6, 6.0, ""),
]


# --------------------------------------------------------------------------- #
# The corpus: discovery, metadata, validation
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class CorpusDocument:
    path: Path
    code: str
    title: str
    version: str
    department: str
    classification: str
    text: str


def _read_yaml(path: Path) -> dict[str, Any]:
    import yaml

    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def header_fields(text: str) -> dict[str, str]:
    """The **Key:** value lines at the top of a document."""
    fields: dict[str, str] = {}
    for line in text.splitlines()[:30]:
        match = FIELD.match(line.strip())
        if match:
            fields[match.group(1).strip().lower()] = match.group(2).strip()
    return fields


def _department_labels() -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for entry in _read_yaml(POLICIES / "access-control.yaml").get("departments", []):
        pairs.append((str(entry["label"]).lower(), str(entry["id"])))
        pairs.append((str(entry["id"]).lower(), str(entry["id"])))
    return sorted(pairs, key=lambda pair: len(pair[0]), reverse=True)


def _classification_ids() -> set[str]:
    levels = _read_yaml(POLICIES / "data-classification.yaml").get("levels", [])
    return {str(level["id"]) for level in levels}


def map_department(raw: str, labels: list[tuple[str, str]]) -> str | None:
    """'Inspection & Integrity' -> 'inspection'; 'General (site-wide ...)' -> 'general'."""
    text = re.sub(r"[*_`]", "", raw).strip().lower()
    for label, ident in labels:
        if text.startswith(label):
            return ident
    return None


def map_classification(raw: str, levels: set[str]) -> str | None:
    """'Confidential — Internal Use Only' -> 'confidential'."""
    first = re.split(r"[\s—–-]+", re.sub(r"[*_`]", "", raw).strip())[0].lower()
    return first if first in levels else None


def load_corpus(
    directories: tuple[Path, ...] = KNOWLEDGE_DIRS,
    *,
    current: list[CorpusDocument] | None = None,
) -> tuple[list[CorpusDocument], list[str]]:
    """Every indexable document, with metadata from its own header.

    A document whose metadata does not map onto policy, or that is not marked
    SYNTHETIC, is reported as a problem and left out.

    With ``current``, the directories hold archived revisions instead: each
    must share its code with a document in force and carry a lower revision,
    so that ingestion files it as superseded rather than as a rival.
    """
    from backend.knowledge.revisions import revision_key
    from backend.rag.parsing import extract_title

    in_force = {document.code: document for document in current or []}

    labels = _department_labels()
    levels = _classification_ids()
    documents: list[CorpusDocument] = []
    problems: list[str] = []
    seen: dict[str, str] = {}

    for directory in directories:
        for path in sorted(directory.glob("*.md")):
            text = path.read_text(encoding="utf-8")
            fields = header_fields(text)
            where = path.relative_to(ROOT).as_posix()
            code = fields.get("document", "")
            title = extract_title(path) or ""
            department = map_department(fields.get("department", ""), labels)
            classification = map_classification(fields.get("classification", ""), levels)
            version = (fields.get("revision") or "").split(" ")[0]

            found: list[str] = []
            if not DOC_CODE.fullmatch(code):
                found.append("no recognisable **Document:** code in its header")
            elif code in seen:
                found.append(f"document code {code} is also used by {seen[code]}")
            elif current is not None and code not in in_force:
                found.append(f"archived revision of {code}, which is not in the corpus")
            elif current is not None and revision_key(version) >= revision_key(in_force[code].version):
                found.append(
                    f"archived revision {version} is not below the revision in force "
                    f"({in_force[code].version})"
                )
            if not title.startswith(code):
                found.append(f"title {title!r} does not begin with its document code")
            if "SYNTHETIC" not in fields.get("status", "").upper() or "SYNTHETIC DOCUMENT" not in text:
                found.append("not marked SYNTHETIC in its banner and **Status:** field")
            if department is None:
                found.append(f"department {fields.get('department')!r} is not in policies/access-control.yaml")
            if classification is None:
                found.append(
                    f"classification {fields.get('classification')!r} is not a level in "
                    "policies/data-classification.yaml"
                )
            if not version:
                found.append("no **Revision:** in its header")

            if found:
                problems.extend(f"{where}: {problem}" for problem in found)
                continue
            seen[code] = where
            documents.append(
                CorpusDocument(path, code, title, version, department, classification, text)
            )
    return documents, problems


def _clauses(text: str) -> set[str]:
    """Clause numbers a document defines: numbered headings and '4.2 ...' lines."""
    found: set[str] = set()
    for line in text.splitlines():
        heading = HEADING.match(line)
        if heading:
            match = re.match(r"(\d+(?:\.\d+)?)\.?\s", heading.group(2))
            if match:
                found.add(match.group(1))
            continue
        match = re.match(r"(\d+\.\d+)\s+\S", line.strip())
        if match:
            found.add(match.group(1))
    return found | {clause.split(".")[0] for clause in found}


def _expand(spec: str) -> list[str]:
    """'5.1 to 5.3' -> 5.1, 5.2, 5.3; '3 and 6' -> 3, 6."""
    numbers: list[str] = []
    for part in re.split(r"\s*(?:,|\band\b|\bor\b)\s*", spec):
        bounds = [bound for bound in re.split(r"\s+to\s+", part.strip()) if bound]
        numbers.extend(bounds)
        if len(bounds) == 2 and bounds[0].count(".") == bounds[1].count(".") == 1:
            major, low = bounds[0].split(".")
            major_high, high = bounds[1].split(".")
            if major == major_high:
                numbers.extend(f"{major}.{minor}" for minor in range(int(low), int(high) + 1))
    return numbers


def check_references(documents: list[CorpusDocument]) -> list[str]:
    """Every cited clause exists, and Related headers agree with the text.

    A document lists in **Related:** every document it cites. Between two
    SOPs the listing runs both ways. A record (report, memo, investigation)
    lists the procedures it cites; a procedure need not list every record
    that cites it.
    """
    by_code = {document.code: document for document in documents}
    clauses = {document.code: _clauses(document.text) for document in documents}
    cites: dict[str, set[str]] = {document.code: set() for document in documents}
    problems: list[str] = []

    for document in documents:
        body = document.text.split("\n---\n", 1)[-1]
        for match in CLAUSE_REF.finditer(body):
            target = match.group(1) or document.code
            if target not in by_code:
                if target not in NOT_INDEXED:
                    problems.append(f"{document.code}: cites {target}, which is not in the corpus")
                continue
            for number in _expand(match.group(2)):
                if number not in clauses[target]:
                    problems.append(f"{document.code}: cites {target} Clause {number}, which does not exist")
        for other in DOC_CODE.findall(body):
            if other == document.code:
                continue
            if other in by_code:
                cites[document.code].add(other)
            elif other not in NOT_INDEXED:
                problems.append(f"{document.code}: mentions {other}, which is not in the corpus")

    for document in documents:
        declared = set(DOC_CODE.findall(header_fields(document.text).get("related", "")))
        cited_by = {other for other, targets in cites.items() if document.code in targets}
        required = set(cites[document.code])
        if document.code.startswith("SOP-"):
            required |= {other for other in cited_by if other.startswith("SOP-")}
        for missing in sorted(required - declared):
            problems.append(f"{document.code}: **Related:** should list {missing}")
        for extra in sorted(declared - required - cited_by):
            problems.append(f"{document.code}: **Related:** lists {extra}, but neither cites the other")
    return problems


def check_sections(documents: list[CorpusDocument]) -> tuple[list[str], dict[str, int]]:
    """How each document will chunk, judged by the same rules ingestion uses.

    Flags a section the chunker would drop although it has text in it, and a
    section longer than the model is shown of any one passage.
    """
    from backend.rag.parsing import parse_document

    settings = _read_yaml(ROOT / "config" / "app.yaml").get("knowledge_base", {})
    minimum = int(settings.get("min_chunk_chars", 120))
    size = int(settings.get("chunk_size_chars", 1200))
    warnings: list[str] = []
    sections: dict[str, int] = {}

    for document in documents:
        parsed = parse_document(document.path)
        kept = 0
        for index, segment in enumerate(parsed.segments):
            text = segment.text.strip()
            has_body = any(line.strip() and not HEADING.match(line) for line in text.splitlines())
            if len(text) < minimum and len(parsed.segments) > 1:
                if has_body:
                    warnings.append(
                        f"{document.code}: '{segment.location}' has text but is under "
                        f"{minimum} characters, so indexing drops it"
                    )
                continue
            kept += max(1, math.ceil(len(text) / size))
            # Segment 0 is the header block: metadata, not a requirement.
            if index > 0 and len(text) > VISIBLE_PASSAGE_CHARS:
                warnings.append(
                    f"{document.code}: '{segment.location}' is {len(text)} characters; "
                    f"the model is shown the first {VISIBLE_PASSAGE_CHARS}"
                )
        sections[document.code] = kept
    return warnings, sections


def retrieval_visibility(documents: list[CorpusDocument]) -> dict[str, dict[str, Any]]:
    """Which documents each seeded account can retrieve, from policy alone.

    Mirrors the knowledge_search tool (backend/tools/registry.py): department
    isolation unless the role holds a cross-department override, then the
    role's classification ceiling.
    """
    from backend.core.config import get_config

    config = get_config()
    access = config.access_control
    overrides = set(access.get("file_access", {}).get("override_roles", []))
    tool = (config.tool_permissions.get("tools") or {}).get("knowledge_search", {})
    visibility: dict[str, dict[str, Any]] = {}
    for user in access.get("seed_users", []):
        role = user["role"]
        can_search = (
            "knowledge.search" in config.role_permissions(role)
            and role in (tool.get("allowed_roles") or [])
        )
        ceiling = config.role_max_classification(role)
        departments = None if role in overrides else {user["department"], "general"}
        visible = [
            document.code
            for document in documents
            if can_search
            and (departments is None or document.department in departments)
            and config.classification_rank(document.classification)
            <= config.classification_rank(ceiling)
        ]
        visibility[user["username"]] = {
            "role": role,
            "department": user["department"],
            "clearance": ceiling,
            "can_search": can_search,
            "documents": visible,
        }
    return visibility


# --------------------------------------------------------------------------- #
# Calculations: what a correct answer contains, derived from the documents
# --------------------------------------------------------------------------- #


def _date(text: str) -> date:
    for pattern in ("%d %B %Y", "%d %b %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text.strip(), pattern).date()
        except ValueError:
            continue
    raise ValueError(f"unrecognised date {text!r}")


def _years(start: date, end: date) -> float:
    """Years between two dates, rounded to one decimal (SOP-INS-014 Clause 4.1)."""
    return round((end - start).days / 365.25, 1)


def _add_months(day: date, months: int) -> date:
    index = day.month - 1 + months
    year, month = day.year + index // 12, index % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def _mm(text: str) -> float:
    return float(re.match(r"\s*([\d.]+)", text).group(1))


def _rate_row(location: str, previous: float, current: float, nominal: float,
              t_min: float, between: float, in_service: float) -> dict[str, Any]:
    short = (previous - current) / between
    long = (nominal - current) / in_service
    governing = max(short, long)
    life = (current - t_min) / governing if governing > 0 else math.inf
    return {
        "location": location,
        "previous_mm": previous,
        "current_mm": current,
        "short_term_mm_yr": round(short, 4),
        "long_term_mm_yr": round(long, 4),
        "rate_mm_yr": round(governing, 4),
        "governing_rate_is": "long-term" if long > short else "short-term",
        "remaining_life_years": round(life, 2) if math.isfinite(life) else None,
        "below_t_min": current < t_min,
        "_life": life,
    }


def _scan(report_id: str) -> dict[str, Any]:
    """The numbers printed on a scanned report, from the generator's own data."""
    from scripts.make_sample_inspection_report import REPORTS

    form = REPORTS[report_id]
    fields = {label: value for row in form["fields"] for label, value in row}
    return {
        "report_no": fields["Report No."],
        "tag": fields["Equipment Tag"],
        "description": fields["Description"],
        "service": fields["Service"],
        "service_category": fields["Service Category"],
        "design_pressure": fields["Design Pressure"],
        "nominal_mm": _mm(fields["Nominal Thickness"]),
        "t_min_mm": _mm(fields["t-min"]),
        "in_service": _date(fields["In Service Since"]),
        "previous": _date(fields["Previous Inspection"]),
        "current": _date(fields["Date of Inspection"]),
        "readings": [(row[0], float(row[1]), float(row[2])) for row in form["readings"]],
        "observations": form["observations"],
    }


def assess_vessel(report_id: str) -> dict[str, Any]:
    """Rates, remaining life, severity and triggers for one scanned vessel."""
    scan = _scan(report_id)
    between = _years(scan["previous"], scan["current"])
    in_service = _years(scan["in_service"], scan["current"])
    rows = [
        _rate_row(location, previous, current, scan["nominal_mm"], scan["t_min_mm"],
                  between, in_service)
        for location, previous, current in scan["readings"]
    ]
    governing = min(rows, key=lambda row: row["_life"])
    life = governing["_life"]
    below = [row["location"] for row in rows if row["below_t_min"]]
    cladding = next(
        (int(match.group(1)) for text in scan["observations"]
         for match in [re.search(r"cladding damaged over approx\. (\d+)%", text)] if match),
        None,
    )
    loss = (scan["nominal_mm"] - governing["current_mm"]) / scan["nominal_mm"]

    if below:
        severity = "high"
        basis = (
            f"SOP-INS-014 Clause 5.1 — thickness below t-min at {', '.join(below)}; "
            "withdraw immediately (Clause 3.3) and within 24 hours (Clause 5.1)"
        )
        approver = (
            "Head of Inspection + Plant Manager (SOP-INS-014 Clause 5.1): the Inspection "
            "Engineer and Head of Inspection recommend, the Plant Manager approves "
            "(SOP-OPS-008 Clauses 2.3 and 3.5)"
        )
    elif life < 4:
        severity = "medium"
        basis = "SOP-INS-014 Clause 5.2 — remaining life below 4 years (and Clause 4.5)"
        approver = "Head of Inspection (SOP-INS-014 Clause 5.2; SOP-OPS-008 Clause 2.2)"
    elif cladding is not None and cladding > 20:
        severity = "medium"
        basis = (
            f"SOP-MNT-022 Clause 4.1 — cladding damage over 20% of the insulated "
            f"section ({cladding}% recorded), classified Medium under SOP-INS-014 "
            "Clause 5 (Clause 5.2). The remaining-life rule in SOP-INS-014 Clause 4.5 "
            "does NOT apply, since life exceeds 4 years"
        )
        approver = "Head of Inspection (SOP-INS-014 Clause 5.2; SOP-OPS-008 Clause 2.2)"
    else:
        severity = "none or low"
        basis = "no Medium or High criterion met"
        approver = "Inspection Engineer (SOP-INS-014 Clause 5.3)"

    ffs = []
    if below:
        ffs.append("SOP-INS-021 Clause 2.1 — thickness below t-min without a through-wall defect")
    if life < 2:
        ffs.append("SOP-INS-021 Clause 2.2 — remaining life below 2 years")
    if loss > 0.25:
        ffs.append(f"SOP-INS-021 Clause 2.3 — local metal loss {loss:.1%} of nominal exceeds 25%")

    for row in rows:
        row.pop("_life")
    return {
        "report_no": scan["report_no"],
        "tag": scan["tag"],
        "service_category": scan["service_category"],
        "nominal_mm": scan["nominal_mm"],
        "t_min_mm": scan["t_min_mm"],
        "years_between": between,
        "years_in_service": in_service,
        "per_location": rows,
        "governing_location": governing["location"],
        "governing_rate_mm_yr": governing["rate_mm_yr"],
        "governing_remaining_life_years": governing["remaining_life_years"],
        "locations_below_t_min": below,
        "cladding_damage_percent": cladding,
        "local_metal_loss_percent_at_governing": round(loss * 100, 1),
        "severity": severity,
        "severity_basis": basis,
        "approver": approver,
        "ffs_triggers": ffs,
    }


def _v2104_traps(assessment: dict[str, Any]) -> list[str]:
    """Mistakes a plausible answer makes, each checked against the numbers.

    Derived rather than written down: an earlier version asserted that the
    inlet nozzle 'has a higher corrosion rate' than the governing course,
    which these readings contradict (0.325 against 0.55 mm/year).
    """
    rows = assessment["per_location"]
    governing = next(row for row in rows if row["location"] == assessment["governing_location"])
    traps = []
    life = assessment["governing_remaining_life_years"]
    if life is not None and life >= 4:
        traps.append(
            f"Remaining life is {life} years, above 4, so citing SOP-INS-014 Clause 4.5 as "
            "the basis for Medium severity is incorrect; the basis is SOP-MNT-022 Clause 4.1."
        )
    if governing["governing_rate_is"] == "short-term":
        traps.append(
            f"The long-term rate at {governing['location']} ({governing['long_term_mm_yr']} "
            f"mm/year) is below the short-term rate ({governing['short_term_mm_yr']} mm/year), "
            "so the short-term rate governs (SOP-INS-014 Clause 4.3)."
        )
    if not assessment["locations_below_t_min"]:
        traps.append(
            f"No reading is below t-min ({assessment['t_min_mm']} mm), so the High "
            "escalation in SOP-MNT-022 Clause 4.3 does not apply."
        )
    if not any("Clause 2.3" in trigger for trigger in assessment["ffs_triggers"]):
        traps.append(
            f"Local metal loss at the governing location is "
            f"{assessment['local_metal_loss_percent_at_governing']}% of nominal, under the "
            "25% trigger of SOP-INS-021 Clause 2.3, so no FFS assessment is triggered."
        )
    if assessment["severity"] == "medium":
        traps.append(
            "The approving authority for a Medium finding is the Head of Inspection alone. "
            "'Head of Inspection + Plant Manager' is the High authority (SOP-INS-014 "
            "Clause 5.1) and is wrong here."
        )
    fastest = max(rows, key=lambda row: row["rate_mm_yr"])
    if fastest["location"] != governing["location"]:
        traps.append(
            f"{fastest['location']} corrodes fastest ({fastest['rate_mm_yr']} mm/year) but has "
            "more margin; the governing location is the lowest remaining life."
        )
    thinnest = min(rows, key=lambda row: row["current_mm"])
    if thinnest["location"] != governing["location"]:
        traps.append(
            f"{thinnest['location']} is the thinnest reading but not the governing location."
        )
    return traps


def assess_piping() -> dict[str, Any]:
    """Circuit P-2104-OVHD-01, from the report text the model is given."""
    text = PIPING_REPORT.read_text(encoding="utf-8")

    def find(pattern: str) -> str:
        match = re.search(pattern, text)
        if match is None:
            raise ValueError(f"{PIPING_REPORT.name}: expected to find {pattern!r}")
        return match.group(1)

    nominal = float(find(r"[Nn]ominal(?: wall)? ([\d.]+) mm"))
    t_min = float(find(r"t-min:? ([\d.]+) mm"))
    class_max_years = float(find(r"maximum measurement interval (\d+) years"))
    in_service_since = _date(find(r"In service since\s+(\d{1,2} \w+ \d{4})"))
    previous = _date(find(r"readings,\s+(\d{1,2} \w+ \d{4}) then"))
    current = _date(find(r"readings,\s+\d{1,2} \w+ \d{4} then\s+(\d{1,2} \w+ \d{4})"))
    cmls = re.findall(r"^- (CML-\d+), (.+?): ([\d.]+) mm, then ([\d.]+) mm\s*$", text, re.M)
    if len(cmls) < 2:
        raise ValueError(f"{PIPING_REPORT.name}: CML readings not found")

    between = _years(previous, current)
    in_service = _years(in_service_since, current)
    rows = [
        _rate_row(f"{cml} ({where})", float(before), float(after), nominal, t_min,
                  between, in_service)
        for cml, where, before, after in cmls
    ]
    governing = min(rows, key=lambda row: row["_life"])
    life = governing["_life"]
    months = math.floor(min(life / 2, class_max_years) * 12)

    # The trap: the short-term rate alone, ignoring SOP-INS-017 Clause 5.1's
    # "higher of the two".
    short_only_life = (governing["current_mm"] - t_min) / governing["short_term_mm_yr"]
    short_only_months = math.floor(min(short_only_life / 2, class_max_years) * 12)
    for row in rows:
        row.pop("_life")
    return {
        "circuit": "P-2104-OVHD-01",
        "report_no": "INS-2026-0522",
        "nominal_mm": nominal,
        "t_min_mm": t_min,
        "years_between": between,
        "years_in_service": in_service,
        "class_max_years": class_max_years,
        "per_cml": rows,
        "governing_cml": governing["location"],
        "governing_rate_mm_yr": governing["rate_mm_yr"],
        "governing_rate_is": governing["governing_rate_is"],
        "governing_remaining_life_years": round(life, 2),
        "next_measurement_interval_months": months,
        "next_measurement_due": _add_months(current, months).isoformat(),
        "trap_short_term_only": {
            "remaining_life_years": round(short_only_life, 2),
            "interval_months": short_only_months,
            "due": _add_months(current, short_only_months).isoformat(),
        },
    }


def assess_history() -> list[dict[str, Any]]:
    """Next thickness survey for each vessel, per SOP-INS-014 Clauses 2 and 4.5."""
    results = []
    for (tag, description, category, status, in_service, previous, last, location,
         nominal, previous_mm, last_mm, t_min, notes) in INSPECTION_HISTORY:
        last_day = date.fromisoformat(last)
        row = _rate_row(
            location, previous_mm, last_mm, nominal, t_min,
            _years(date.fromisoformat(previous), last_day),
            _years(date.fromisoformat(in_service), last_day),
        )
        life = row.pop("_life")
        halved = life < 4
        months = SURVEY_INTERVAL_MONTHS[category] // (2 if halved else 1)
        due = _add_months(last_day, months)
        results.append({
            "tag": tag,
            "status": status,
            "service_category": category,
            "remaining_life_years": row["remaining_life_years"],
            "interval_months": months,
            "interval_halved_by_clause_4_5": halved,
            "next_survey_due": due.isoformat(),
            "overdue_as_of": AS_OF.isoformat(),
            "overdue": status == "in service" and due < AS_OF,
        })
    return results


def expected_answers() -> dict[str, Any]:
    """What correct answers contain, derived from the same numbers as the documents.

    Used to check the workbench rather than to feed it: the model never sees
    this file, so agreement means it did the work.
    """
    v2104 = assess_vessel("V-2104")
    v2107 = assess_vessel("V-2107")
    piping = assess_piping()
    history = assess_history()
    overdue = [row["tag"] for row in history if row["overdue"]]
    life_2104 = v2104["governing_remaining_life_years"]
    pof = 5 if life_2104 < 2 else 4 if life_2104 < 4 else 3 if life_2104 < 10 else 2 if life_2104 <= 20 else 1
    set_pressure, opened_at = 10.5, 12.1
    fail_above = round(set_pressure * 1.10, 2)

    return {
        "_synthetic": (
            "SYNTHETIC. Every document, reading and person here is invented for the AEGIS "
            "demonstration. Values are computed by scripts/seed_demo_data.py from the same "
            "numbers the documents carry."
        ),
        # The headline case, V-2104. These top-level keys keep their original
        # names so anything already reading this file still works.
        "per_location": [
            {key: row[key] for key in ("location", "rate_mm_yr", "remaining_life_years",
                                       "short_term_mm_yr", "long_term_mm_yr")}
            for row in v2104["per_location"]
        ],
        "governing_location": v2104["governing_location"],
        "governing_rate_mm_yr": v2104["governing_rate_mm_yr"],
        "governing_remaining_life_years": v2104["governing_remaining_life_years"],
        "severity": v2104["severity"],
        "severity_basis": v2104["severity_basis"],
        "approver": v2104["approver"],
        "traps": _v2104_traps(v2104),
        "vessels": {"V-2104": v2104, "V-2107": v2107},
        "piping": piping,
        "inspection_history": {"as_of": AS_OF.isoformat(), "overdue": overdue, "vessels": history},
        "rbi_v2104": {
            "pof": pof,
            "cof": 4,
            "cof_basis": (
                "flammable service at 10.5 bar(g), at or below 20 bar(g); service category "
                "Corrosive, not lethal or toxic (SOP-INS-030 Clause 2.2)"
            ),
            "risk_score": pof * 4,
            "band": "High" if pof * 4 >= 15 else "Medium" if pof * 4 >= 8 else "Low",
        },
        "psv_as_received_example": {
            "set_pressure_bar_g": set_pressure,
            "opened_at_bar_g": opened_at,
            "fails_above_bar_g": fail_above,
            "failed": opened_at > fail_above,
        },
        "restricted_cost_question": {
            "cost": "₹42 lakh (ENG-DBM-2104 Clause 6; classified Restricted)",
            "approval": (
                "above ₹5 lakh up to ₹50 lakh: recommended by the Head of Inspection, "
                "approved by the Plant Manager (SOP-OPS-008 Clause 2.10)"
            ),
        },
    }


# --------------------------------------------------------------------------- #
# Files
# --------------------------------------------------------------------------- #


def write_thickness_csv() -> Path:
    """V-2104's survey as a dataset, for the sandbox path."""
    scan = _scan("V-2104")
    between = _years(scan["previous"], scan["current"])
    in_service = _years(scan["in_service"], scan["current"])
    target = SAMPLES / "datasets" / "V-2104-thickness-survey.csv"
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            ["location", "thickness_2022_mm", "thickness_2026_mm", "nominal_mm",
             "t_min_mm", "years_between", "years_in_service", "data_status"]
        )
        for location, before, after in scan["readings"]:
            writer.writerow([location, before, after, scan["nominal_mm"], scan["t_min_mm"],
                             between, in_service, DATA_STATUS])
    return target


def write_inspection_history_csv() -> Path:
    """Six vessels, so population questions have one right answer."""
    target = SAMPLES / "datasets" / "inspection-history.csv"
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            ["tag", "description", "service_category", "status", "in_service_date",
             "previous_survey_date", "last_survey_date", "governing_location",
             "nominal_mm", "previous_mm", "last_mm", "t_min_mm", "notes", "data_status"]
        )
        writer.writerows([*row, DATA_STATUS] for row in INSPECTION_HISTORY)
    return target


def write_expected_answers() -> Path:
    target = SAMPLES / "expected-answers.json"
    target.write_text(
        json.dumps(expected_answers(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return target


# --------------------------------------------------------------------------- #
# Indexing
# --------------------------------------------------------------------------- #


def _code_of(title: str) -> str | None:
    match = DOC_CODE.match(title or "")
    return match.group(0) if match else None


async def index_corpus(
    documents: list[CorpusDocument], *, replace_stale: bool, allow_lexical: bool
) -> int:
    """Load the corpus into the local knowledge base. Returns the failure count.

    Re-running is safe: an unchanged file keeps its document id and is
    re-indexed in place. A changed file gets a new id, so the copy it replaces
    -- same document code, different id, including copies uploaded through
    the interface -- is removed unless ``replace_stale`` is off. Leaving both
    would put two revisions of one procedure in front of the model.
    """
    from backend.core.schemas import Sensitivity
    from backend.rag.knowledge_base import get_knowledge_base

    knowledge_base = get_knowledge_base()
    mode = await knowledge_base.retrieval_mode()
    if mode != "embedding" and not allow_lexical:
        print(
            "\nNo embedding model is available, so passages would be stored without "
            "vectors.\nWhile other documents carry vectors, embedding search cannot see "
            "passages without them.\nStart the inference server with nomic-embed-text "
            "installed, or pass --allow-lexical to index anyway."
        )
        return len(documents)

    existing = knowledge_base.list_documents()
    indexed_ids: set[str] = set()
    failures = 0
    for document in documents:
        try:
            record = await knowledge_base.ingest_file(
                document.path,
                department=document.department,
                classification=Sensitivity(document.classification),
                version=document.version,
                title=document.title,
            )
        except Exception as exc:  # report and carry on; the summary counts it
            failures += 1
            print(f"  FAILED   {document.code}: {exc}")
            continue
        indexed_ids.add(record.id)
        print(
            f"  indexed  {document.code:<14} {document.department:<11} "
            f"{document.classification:<13} rev {document.version:<4} "
            f"{record.chunk_count:>3} passages"
        )
        if replace_stale:
            # Only an older copy of the same revision is stale. Another
            # revision of the code is history: ingestion has already marked
            # it superseded, and it stays for the record.
            for old in existing:
                if (
                    old.id != record.id
                    and old.id not in indexed_ids
                    and _code_of(old.title) == document.code
                    and old.version == document.version
                ):
                    knowledge_base.delete_document(old.id)
                    print(
                        f"  removed  stale {document.code} copy {old.id} "
                        f"(version {old.version}, {old.chunk_count} passages, "
                        f"from {Path(old.source_path).name})"
                    )

    if mode == "embedding" and indexed_ids:
        missing = [
            row for row in knowledge_base.db.iter_chunks()
            if row["document_id"] in indexed_ids and not row.get("embedding")
        ]
        if missing:
            failures += 1
            print(
                f"\n  WARNING  {len(missing)} passage(s) were stored without an embedding "
                "and are invisible to embedding search. Check the inference server and "
                "re-run."
            )
    return failures


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #


def _print_corpus(documents: list[CorpusDocument], sections: dict[str, int]) -> None:
    print(f"  {'document':<14} {'department':<11} {'class':<13} {'rev':<5} passages  title")
    for document in documents:
        title = document.title.split(" — ", 1)[-1]
        print(
            f"  {document.code:<14} {document.department:<11} {document.classification:<13} "
            f"{document.version:<5} {sections.get(document.code, 0):>8}  {title[:60]}"
        )


def _print_visibility(visibility: dict[str, dict[str, Any]], total: int) -> None:
    print("\nWhat each demo account can retrieve (policy only, before any question):")
    for username, entry in visibility.items():
        scope = (
            f"{len(entry['documents'])} of {total} documents"
            if entry["can_search"]
            else "no knowledge search (role lacks it)"
        )
        print(
            f"  {username:<9} {entry['role']:<13} dept {entry['department']:<11} "
            f"cleared to {entry['clearance']:<13} {scope}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--check", action="store_true", help="validate the corpus only")
    parser.add_argument("--files-only", action="store_true", help="build files, skip indexing")
    parser.add_argument("--keep-stale", action="store_true", help="keep superseded copies")
    parser.add_argument("--allow-lexical", action="store_true",
                        help="index even when no embedding model is available")
    arguments = parser.parse_args()

    print("Checking the synthetic corpus\n")
    documents, problems = load_corpus()
    problems += check_references(documents)
    archived, archive_problems = load_corpus((ARCHIVE_DIR,), current=documents)
    problems += archive_problems
    warnings, sections = check_sections(documents)
    _print_corpus(documents, sections)
    print(f"\n  {len(documents)} documents, {sum(sections.values())} passages expected")
    for document in archived:
        print(f"  archive  {document.code} rev {document.version} (indexed as superseded)")
    for warning in warnings:
        print(f"  note     {warning}")
    for problem in problems:
        print(f"  PROBLEM  {problem}")
    if problems:
        print("\nNothing was written or indexed. Fix the problems above and re-run.")
        return 1

    if arguments.check:
        _print_visibility(retrieval_visibility(documents), len(documents))
        print("\nCheck complete. Nothing was written or indexed.")
        return 0

    print("\nBuilding the demonstration files\n")
    from scripts.make_sample_inspection_report import build_all

    for path in build_all():
        print(f"  scan     {path.relative_to(ROOT)}")
    print(f"  data     {write_thickness_csv().relative_to(ROOT)}")
    print(f"  data     {write_inspection_history_csv().relative_to(ROOT)}")
    print(f"  answers  {write_expected_answers().relative_to(ROOT)}")
    from backend.connectors import historian_path
    from backend.connectors.historian import build_simulated_historian

    print(f"  historian {build_simulated_historian(historian_path())} (simulated)")

    failures = 0
    if not arguments.files_only:
        print("\nIndexing the corpus into the local knowledge base\n")
        failures = asyncio.run(
            index_corpus(
                [*documents, *archived],
                replace_stale=not arguments.keep_stale,
                allow_lexical=arguments.allow_lexical,
            )
        )
        total = len(documents) + len(archived)
        print(f"\n{total - failures} of {total} document(s) indexed "
              f"({len(archived)} archived revision(s) as superseded).")
        _print_visibility(retrieval_visibility(documents), len(documents))

    answers = expected_answers()
    piping = answers["piping"]
    print(
        "\nA correct answer for the headline task (V-2104, scanned report):\n"
        f"  governing location   {answers['governing_location']}\n"
        f"  corrosion rate       {answers['governing_rate_mm_yr']} mm/year\n"
        f"  remaining life       {answers['governing_remaining_life_years']} years\n"
        f"  severity             {answers['severity']} ({answers['severity_basis']})\n"
        f"  approver             {answers['approver']}\n"
        "\nAnd for the piping calculation (P-2104-OVHD-01):\n"
        f"  governing CML        {piping['governing_cml']}\n"
        f"  governing rate       {piping['governing_rate_mm_yr']} mm/year "
        f"({piping['governing_rate_is']})\n"
        f"  remaining life       {piping['governing_remaining_life_years']} years\n"
        f"  next measurement     {piping['next_measurement_interval_months']} months, "
        f"due {piping['next_measurement_due']}"
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
