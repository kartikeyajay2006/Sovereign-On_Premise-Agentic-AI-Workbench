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
from backend.engineering.formulas import BoundValue, service_category_key
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


# ---------------------------------------------------------------- conflicts
@dataclass
class InputConflict:
    """Two or more sources give different values for one input."""

    field: str
    label: str
    # "high": a formula reads it, so the decision is withheld until a person
    # resolves it. "medium": no formula reads it; recorded and shown only.
    impact: str
    values: list[BoundValue]


# Inputs no formula reads. A disagreement is still recorded and shown, but
# does not by itself withhold the decision. (Report numbers are not compared
# at all: two records of one vessel carry two numbers by design.)
_RECORDED_ONLY = {"design_pressure"}

_LABELS = {
    "tag": "Equipment Tag",
    "report_no": "Report No.",
    "service_category": "Service Category",
    "design_pressure": "Design Pressure",
    "nominal": "Nominal Thickness",
    "t_min": "t-min",
    "current_date": "Date of Inspection",
    "previous_date": "Previous Inspection",
    "in_service_date": "In Service Since",
    "years_between": "Years between inspections",
    "years_in_service": "Years in service",
    "cladding_damage_percent": "Cladding damage",
}


def _normal(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().casefold()


def _comparable(name: str, bound: BoundValue) -> object:
    """What two sources must agree on: the value, not how it was written."""
    value = bound.value
    if isinstance(value, Quantity):
        return (value.dimension, round(value.value, 6))
    if name == "service_category":
        return service_category_key(str(value)) or _normal(str(value))
    if isinstance(value, float):
        return round(value, 6)
    if isinstance(value, str):
        return _normal(value)
    return value


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
    # Where the plain-text fields (tag, report number) were read from.
    text_sources: dict[str, BoundValue] = field(default_factory=dict)
    conflicts: list[InputConflict] = field(default_factory=list)

    _SCALARS = (
        "service_category", "design_pressure", "nominal", "t_min", "in_service_date",
        "previous_date", "current_date", "years_between", "years_in_service",
        "cladding_damage_percent",
    )

    @property
    def found(self) -> bool:
        """Enough to call this an inspection record at all."""
        return bool(self.readings) and (self.nominal is not None or self.t_min is not None)

    @property
    def blocking_conflicts(self) -> list[InputConflict]:
        return [conflict for conflict in self.conflicts if conflict.impact == "high"]

    def _dispute(self, name: str, label: str, mine: BoundValue, theirs: BoundValue) -> None:
        for conflict in self.conflicts:
            if conflict.field == name:
                if all(_comparable(name, value) != _comparable(name, theirs) for value in conflict.values):
                    conflict.values.append(theirs)
                return
        impact = "medium" if name in _RECORDED_ONLY else "high"
        self.conflicts.append(InputConflict(name, label, impact, [mine, theirs]))

    def merge(self, other: "VesselInputs") -> None:
        """Fill what is missing from another piece of evidence; record every disagreement.

        This used to keep whichever source came first and drop the rest, so a
        contractor's re-measurement that contradicted the scan changed nothing
        and said nothing. The first value still stays in place, but a value
        another source contradicts becomes a conflict, and the assessment
        withholds everything that depends on it until a person decides.
        """
        for name in self._SCALARS:
            mine, theirs = getattr(self, name), getattr(other, name)
            if theirs is None:
                continue
            if mine is None:
                setattr(self, name, theirs)
            elif _comparable(name, mine) != _comparable(name, theirs):
                self._dispute(name, _LABELS[name], mine, theirs)
        for name in ("tag", "report_no"):
            mine, theirs = getattr(self, name), getattr(other, name)
            if theirs is None:
                continue
            if mine is None:
                setattr(self, name, theirs)
                if name in other.text_sources:
                    self.text_sources[name] = other.text_sources[name]
            elif name == "tag" and _normal(mine) != _normal(theirs):
                self._dispute(
                    name, _LABELS[name],
                    self.text_sources.get(name) or BoundValue(mine, stated=mine),
                    other.text_sources.get(name) or BoundValue(theirs, stated=theirs),
                )
        rows = {_normal(row.location): row for row in self.readings}
        for row in other.readings:
            key = _normal(row.location)
            mine_row = rows.get(key)
            if mine_row is None:
                self.readings.append(row)
                rows[key] = row
                continue
            for side in ("previous", "current"):
                mine, theirs = getattr(mine_row, side), getattr(row, side)
                if theirs is None:
                    continue
                if mine is None:
                    setattr(mine_row, side, theirs)
                elif _comparable("reading", mine) != _comparable("reading", theirs):
                    self._dispute(reading_field(mine_row.location, side),
                                  f"{mine_row.location} · {side} thickness", mine, theirs)
        for evidence_id in other.source_evidence_ids:
            if evidence_id not in self.source_evidence_ids:
                self.source_evidence_ids.append(evidence_id)

    def override(self, name: str, bound: BoundValue) -> None:
        """Apply a person's resolution of a conflict over ``name``."""
        if name.startswith("reading:"):
            _, *location, side = name.split(":")
            key = ":".join(location)
            for row in self.readings:
                if _normal(row.location) == key:
                    setattr(row, side, bound)
        elif name in ("tag", "report_no"):
            setattr(self, name, str(bound.value))
            self.text_sources[name] = bound
        else:
            setattr(self, name, bound)
        self.conflicts = [conflict for conflict in self.conflicts if conflict.field != name]


def reading_field(location: str, side: str) -> str:
    """The conflict field name for one thickness reading."""
    return f"reading:{_normal(location)}:{side}"


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
        # A structured copy of the table (the vision model emits one as JSON)
        # is not the table's header line.
        if line.lstrip().startswith(("{", "[")):
            continue
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
        # A repeated header ("Location | 2022 | 2026") is not a location
        # measured at 2022 mm and 2026 mm.
        if label.casefold() in ("location", "locations", "point", "cml") or all(
            _YEAR.fullmatch(number) for number in numbers[:2]
        ):
            if rows:
                break
            offset += len(line) + 1
            continue
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
                inputs.text_sources[name] = BoundValue(raw, stated=raw, evidence_id=item.id, locator=locator,
                                                       source_text=_line_of(text, at))
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


def vessel_inputs(
    evidence: list[EvidenceItem], overrides: dict[str, BoundValue] | None = None
) -> VesselInputs | None:
    """Merge vessel inputs across a run's file and visual evidence.

    ``overrides`` are resolved conflicts, keyed by conflict field: each
    replaces the disputed value with the one a person chose, bound to the H
    evidence that records the decision. A resolved equipment tag also decides
    which records describe the equipment at all: a source naming another tag
    is left out rather than merged into it.
    """
    overrides = overrides or {}
    chosen_tag = overrides.get("tag")
    merged = VesselInputs()
    for item in evidence:
        if item.kind not in ("uploaded_file", "vision_extraction"):
            continue
        text = item.excerpt or ""
        if item.source_document.lower().endswith(".csv") or re.match(r"^\s*location,", text, re.IGNORECASE):
            found = vessel_inputs_from_csv(text, item)
        else:
            found = vessel_inputs_from_text(text, item)
        if chosen_tag is not None and found.tag and _normal(found.tag) != _normal(str(chosen_tag.value)):
            continue
        merged.merge(found)
    for name, bound in overrides.items():
        merged.override(name, bound)
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
