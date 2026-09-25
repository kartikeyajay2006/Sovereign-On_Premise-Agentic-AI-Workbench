"""Read engineering inputs out of evidence, and remember exactly where.

Every value returned is a :class:`BoundValue` naming the evidence item it came
from and its place inside it ("readings table · row 'Shell course 2 (mid)' ·
column 2026"). Parsing is deterministic and deliberately strict: a value that
is not unambiguously present is left missing, so the assessment says *cannot
calculate* instead of the model filling the gap.

Three shapes are read, the three the demonstration corpus and its scans use:

* an inspection report's text, as a vision model or OCR transcribed it, or as
  a text PDF carries it: labelled header fields and a readings table;
* a thickness-survey CSV with two dated thickness columns;
* a piping survey record listing CMLs with two readings each.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime

from backend.core.schemas import EvidenceItem
from backend.engineering.formulas import BoundValue
from backend.engineering.units import Quantity, UnitError, parse_quantity

_DATE_FORMATS = ("%d %B %Y", "%d %b %Y", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%B %d, %Y")
_DATE = r"(\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4}|\d{4}-\d{2}-\d{2})"


def parse_date(text: str) -> date | None:
    cleaned = re.sub(r"\s+", " ", text.strip().replace(".", ""))
    for pattern in _DATE_FORMATS:
        try:
            return datetime.strptime(cleaned, pattern).date()
        except ValueError:
            continue
    return None


def _line_of(text: str, start: int) -> str:
    begin = text.rfind("\n", 0, start) + 1
    end = text.find("\n", start)
    return text[begin: end if end != -1 else len(text)].strip()


def _bound_quantity(raw: str, item: EvidenceItem, locator: str, text: str, at: int,
                    default_unit: str | None = None) -> BoundValue | None:
    try:
        quantity = parse_quantity(raw, default_unit=default_unit)
    except UnitError:
        return None
    return BoundValue(quantity, stated=raw.strip(), evidence_id=item.id, locator=locator,
                      source_text=_line_of(text, at))


def _bound_date(raw: str, item: EvidenceItem, locator: str, text: str, at: int) -> BoundValue | None:
    parsed = parse_date(raw)
    if parsed is None:
        return None
    return BoundValue(parsed, stated=raw.strip(), evidence_id=item.id, locator=locator,
                      source_text=_line_of(text, at))


# ------------------------------------------------------------------ vessels
@dataclass
class ReadingRow:
    location: str
    previous: BoundValue | None = None
    current: BoundValue | None = None


@dataclass
class VesselInputs:
    tag: str | None = None
    report_no: str | None = None
    service_category: BoundValue | None = None
    design_pressure: BoundValue | None = None
    nominal: BoundValue | None = None
    t_min: BoundValue | None = None
    in_service_date: BoundValue | None = None
    previous_date: BoundValue | None = None
    current_date: BoundValue | None = None
    years_between: BoundValue | None = None
    years_in_service: BoundValue | None = None
    readings: list[ReadingRow] = field(default_factory=list)
    cladding_damage_percent: BoundValue | None = None
    source_evidence_ids: list[str] = field(default_factory=list)

    @property
    def found(self) -> bool:
        """Enough to call this an inspection record at all."""
        return bool(self.readings) and (self.nominal is not None or self.t_min is not None)

    def merge(self, other: "VesselInputs") -> None:
        """Fill what is still missing from another piece of evidence."""
        for name in (
            "tag", "report_no", "service_category", "design_pressure", "nominal", "t_min",
            "in_service_date", "previous_date", "current_date", "years_between",
            "years_in_service", "cladding_damage_percent",
        ):
            if getattr(self, name) is None and getattr(other, name) is not None:
                setattr(self, name, getattr(other, name))
        if not self.readings and other.readings:
            self.readings = other.readings
        for evidence_id in other.source_evidence_ids:
            if evidence_id not in self.source_evidence_ids:
                self.source_evidence_ids.append(evidence_id)


_FIELD_PATTERNS: dict[str, tuple[str, str]] = {
    # name: (regex with one group, kind)
    "tag": (r"Equipment\s+Tag\s*:?\s*([A-Z]{1,3}-\d{3,5}[A-Z]?)", "text"),
    "report_no": (r"Report\s+No\.?\s*:?\s*([A-Z]{2,4}-\d{4}-\d{3,4})", "text"),
    "service_category": (r"Service\s+Category\s*:?\s*([^\n|]+?)(?=\s{2,}|\||\n|$)", "text"),
    "design_pressure": (r"Design\s+Pressure\s*:?\s*([\d.]+\s*(?:bar\s*\(g\)|barg|bar|MPa|kPa|psig|psi))", "quantity"),
    "nominal": (r"Nominal\s+(?:Thickness|wall)\s*:?\s*([\d.]+\s*mm)", "quantity"),
    "t_min": (r"t-?min\s*:?\s*([\d.]+\s*mm)", "quantity"),
    "current_date": (r"Date\s+of\s+Inspection\s*:?\s*" + _DATE, "date"),
    "previous_date": (r"Previous\s+Inspection\s*:?\s*" + _DATE, "date"),
    "in_service_date": (r"In\s+Service\s+Since\s*:?\s*" + _DATE, "date"),
}

_FIELD_LABELS = {
    "tag": "Equipment Tag",
    "report_no": "Report No.",
    "service_category": "Service Category",
    "design_pressure": "Design Pressure",
    "nominal": "Nominal Thickness",
    "t_min": "t-min",
    "current_date": "Date of Inspection",
    "previous_date": "Previous Inspection",
    "in_service_date": "In Service Since",
}

_NUMBER = re.compile(r"^-?\d+(?:\.\d+)?$")
_YEAR = re.compile(r"\b(19|20)\d{2}\b")


def _cells(line: str) -> list[str]:
    if "|" in line:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
    else:
        cells = [cell.strip() for cell in re.split(r"\s{2,}|\t", line.strip())]
        if len(cells) == 1:
            # "Shell course 2 (mid) 11.6 9.4": split trailing numbers off.
            match = re.match(r"^(.*?[A-Za-z)\]])\s+(-?\d+(?:\.\d+)?(?:\s+-?\d+(?:\.\d+)?)+)\s*$", line.strip())
            if match:
                cells = [match.group(1), *match.group(2).split()]
    return [cell for cell in cells if cell != ""]


def _readings_table(text: str, item: EvidenceItem) -> list[ReadingRow]:
    lines = text.splitlines()
    header_index = None
    years: list[str] = []
    for index, line in enumerate(lines):
        if re.search(r"\bLocation\b", line, re.IGNORECASE) and (
            len(_YEAR.findall(line)) >= 2 or re.search(r"previous|current", line, re.IGNORECASE)
        ):
            header_index = index
            years = [match.group(0) for match in _YEAR.finditer(line)]
            break
    if header_index is None:
        return []
    ascending = len(years) < 2 or int(years[0]) <= int(years[1])
    older, newer = (years[0], years[1]) if len(years) >= 2 and ascending else (
        (years[1], years[0]) if len(years) >= 2 else ("previous", "current")
    )
    offset = sum(len(l) + 1 for l in lines[: header_index + 1])
    rows: list[ReadingRow] = []
    for line in lines[header_index + 1:]:
        stripped = line.strip()
        if not stripped or set(stripped) <= set("-|: "):
            if rows:
                break
            offset += len(line) + 1
            continue
        cells = _cells(stripped)
        numbers = [cell for cell in cells[1:] if _NUMBER.match(cell)]
        if not cells or len(numbers) < 2 or _NUMBER.match(cells[0]):
            if rows:
                break
            offset += len(line) + 1
            continue
        label = cells[0]
        first, second = (numbers[0], numbers[1]) if ascending else (numbers[1], numbers[0])
        rows.append(ReadingRow(
            location=label,
            previous=BoundValue(Quantity.of(float(first), "mm"), stated=f"{first} mm", evidence_id=item.id,
                                locator=f"readings table · row '{label}' · column {older}", source_text=stripped),
            current=BoundValue(Quantity.of(float(second), "mm"), stated=f"{second} mm", evidence_id=item.id,
                               locator=f"readings table · row '{label}' · column {newer}", source_text=stripped),
        ))
        offset += len(line) + 1
    return rows


def vessel_inputs_from_text(text: str, item: EvidenceItem) -> VesselInputs:
    inputs = VesselInputs()
    for name, (pattern, kind) in _FIELD_PATTERNS.items():
        match = re.search(pattern, text, re.IGNORECASE)
        if match is None:
            continue
        raw, at = match.group(1).strip(), match.start(1)
        locator = f"field '{_FIELD_LABELS[name]}'"
        if kind == "text":
            if name in ("tag", "report_no"):
                setattr(inputs, name, raw)
            else:
                setattr(inputs, name, BoundValue(raw, stated=raw, evidence_id=item.id, locator=locator,
                                                 source_text=_line_of(text, at)))
        elif kind == "quantity":
            setattr(inputs, name, _bound_quantity(raw, item, locator, text, at))
        elif kind == "date":
            setattr(inputs, name, _bound_date(raw, item, locator, text, at))

    cladding = re.search(
        r"cladding\s+damage[d]?\s+(?:over\s+)?(?:approx(?:imately)?\.?\s*)?(\d+(?:\.\d+)?)\s*%",
        text, re.IGNORECASE,
    )
    if cladding:
        inputs.cladding_damage_percent = BoundValue(
            float(cladding.group(1)), stated=f"{cladding.group(1)}%", evidence_id=item.id,
            locator="visual observations · cladding damage", source_text=_line_of(text, cladding.start()),
        )
    inputs.readings = _readings_table(text, item)
    if inputs.found or inputs.tag:
        inputs.source_evidence_ids.append(item.id)
    return inputs


def vessel_inputs_from_csv(text: str, item: EvidenceItem) -> VesselInputs:
    """A survey CSV: location, two dated thickness columns, nominal, t-min, years."""
    inputs = VesselInputs()
    try:
        reader = csv.DictReader(io.StringIO(text.strip()))
        rows = list(reader)
    except csv.Error:
        return inputs
    if not rows or not reader.fieldnames:
        return inputs
    fields = [name.strip() for name in reader.fieldnames]
    dated = sorted(
        (int(match.group(1)), name)
        for name in fields
        for match in [re.match(r"thickness_(\d{4})_mm$", name)] if match
    )
    if len(dated) < 2 or "location" not in fields:
        return inputs
    (older, previous_col), (newer, current_col) = dated[-2], dated[-1]
    first = rows[0]

    def column(name: str, unit: str, row_index: int = 0) -> BoundValue | None:
        value = (rows[row_index].get(name) or "").strip()
        if not value:
            return None
        return BoundValue(Quantity.of(float(value), unit), stated=f"{value} {unit}", evidence_id=item.id,
                          locator=f"CSV column '{name}'", source_text=",".join(str(first.get(f, "")) for f in fields))

    inputs.nominal = column("nominal_mm", "mm") if "nominal_mm" in fields else None
    inputs.t_min = column("t_min_mm", "mm") if "t_min_mm" in fields else None
    inputs.years_between = column("years_between", "year") if "years_between" in fields else None
    inputs.years_in_service = column("years_in_service", "year") if "years_in_service" in fields else None
    for row in rows:
        label = (row.get("location") or "").strip()
        before, after = (row.get(previous_col) or "").strip(), (row.get(current_col) or "").strip()
        if not label or not before or not after:
            continue
        line = ",".join(str(row.get(f, "")) for f in fields)
        inputs.readings.append(ReadingRow(
            location=label,
            previous=BoundValue(Quantity.of(float(before), "mm"), stated=f"{before} mm", evidence_id=item.id,
                                locator=f"CSV row '{label}' · column {previous_col}", source_text=line),
            current=BoundValue(Quantity.of(float(after), "mm"), stated=f"{after} mm", evidence_id=item.id,
                               locator=f"CSV row '{label}' · column {current_col}", source_text=line),
        ))
    if inputs.readings:
        inputs.source_evidence_ids.append(item.id)
    return inputs


def vessel_inputs(evidence: list[EvidenceItem]) -> VesselInputs | None:
    """Merge vessel inputs across a run's file and visual evidence."""
    merged = VesselInputs()
    for item in evidence:
        if item.kind not in ("uploaded_file", "vision_extraction"):
            continue
        text = item.excerpt or ""
        if item.source_document.lower().endswith(".csv") or re.match(r"^\s*location,", text, re.IGNORECASE):
            found = vessel_inputs_from_csv(text, item)
        else:
            found = vessel_inputs_from_text(text, item)
        merged.merge(found)
    return merged if merged.found else None


# ------------------------------------------------------------------- piping
@dataclass
class PipingInputs:
    circuit: str | None = None
    nominal: BoundValue | None = None
    t_min: BoundValue | None = None
    class_max_interval: BoundValue | None = None
    in_service_date: BoundValue | None = None
    previous_date: BoundValue | None = None
    current_date: BoundValue | None = None
    readings: list[ReadingRow] = field(default_factory=list)
    source_evidence_ids: list[str] = field(default_factory=list)

    @property
    def found(self) -> bool:
        return len(self.readings) >= 2 and self.nominal is not None and self.t_min is not None


def piping_inputs(evidence: list[EvidenceItem]) -> PipingInputs | None:
    merged = PipingInputs()
    for item in evidence:
        text = item.excerpt or ""
        if not re.search(r"\bCML-\d+", text):
            continue
        circuit = re.search(r"\b(P-\d{3,5}-[A-Z]+-\d{2})\b", text)
        if circuit and merged.circuit is None:
            merged.circuit = circuit.group(1)
        for name, pattern, kind in (
            ("nominal", r"[Nn]ominal(?:\s+wall)?\s+([\d.]+\s*mm)", "quantity"),
            ("t_min", r"t-min:?\s+([\d.]+\s*mm)", "quantity"),
            ("class_max_interval", r"maximum measurement interval\s+(\d+\s*years?)", "quantity"),
            ("in_service_date", r"In service since\s+" + _DATE, "date"),
            ("previous_date", r"readings,\s+" + _DATE + r"\s+then", "date"),
            ("current_date", r"readings,\s+\d{1,2}\s+\w+\s+\d{4}\s+then\s+" + _DATE, "date"),
        ):
            if getattr(merged, name) is not None:
                continue
            match = re.search(pattern, text)
            if match is None:
                continue
            raw, at = match.group(1), match.start(1)
            bound = (_bound_quantity(raw, item, f"text '{raw.strip()}'", text, at) if kind == "quantity"
                     else _bound_date(raw, item, f"text '{raw.strip()}'", text, at))
            setattr(merged, name, bound)
        if not merged.readings:
            for match in re.finditer(r"^- (CML-\d+), (.+?): ([\d.]+) mm, then ([\d.]+) mm\s*$", text, re.M):
                cml, where, before, after = match.groups()
                label = f"{cml} ({where})"
                line = match.group(0).strip()
                merged.readings.append(ReadingRow(
                    location=label,
                    previous=BoundValue(Quantity.of(float(before), "mm"), stated=f"{before} mm", evidence_id=item.id,
                                        locator=f"{cml} · first reading", source_text=line),
                    current=BoundValue(Quantity.of(float(after), "mm"), stated=f"{after} mm", evidence_id=item.id,
                                       locator=f"{cml} · second reading", source_text=line),
                ))
        if item.id not in merged.source_evidence_ids:
            merged.source_evidence_ids.append(item.id)
    return merged if merged.found else None
