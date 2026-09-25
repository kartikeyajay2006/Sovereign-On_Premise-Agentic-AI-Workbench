"""Stated facts, read deterministically, and where two sources contradict each other.

Input conflicts cover only what a formula reads. Two documents can still
disagree about a vessel outside any calculation: a datasheet says V-2107 is
designed for 18 bar, a memo says 16 bar. The reader deserves to be told, and
the answer must not quietly repeat one of them.

A *fact* here is ``(subject, attribute, value)``:

* the subject is an equipment tag (``V-2104``, ``PSV-2104A``) or a procedure
  clause (``SOP-INS-014 Clause 3.2``);
* the attribute is one of a fixed vocabulary (design pressure, MAWP, set
  pressure, design temperature, nominal thickness, t-min, ...);
* the value is a quantity read by :mod:`units`, a range or a bound, or a date.

Nothing is asked of a model. Extraction is by pattern, and it is deliberately
narrow: a statement it cannot place on a subject, or whose unit it does not
know, is not a fact. Missing a contradiction is the lesser failure; raising
a false one withholds a true answer.

What is *not* a contradiction:

* the same value in other units (10.5 bar(g) and 1.05 MPa), within the
  precision each was written to;
* a point inside a range, or two overlapping ranges;
* a superseded revision against the one in force: revision control handles
  that, so superseded passages are not read here;
* two values in one document ("reset from 10.5 to 12.0 bar(g)"): that is a
  change being described, not two sources disagreeing;
* values that belong to one inspection event (a date of inspection, a
  thickness reading): two records of one vessel differ there by design.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from backend.core.schemas import ConflictCandidate, ConflictRecord, EvidenceItem
from backend.engineering.extraction import _DATE, parse_date
from backend.engineering.units import LENGTH, PRESSURE, TEMPERATURE, Dimension, UnitError, parse_quantity

# attribute key -> (label, pattern, dimension; None for a date)
ATTRIBUTES: dict[str, tuple[str, str, Dimension | None]] = {
    "design_pressure": ("Design pressure", r"design\s+pressure", PRESSURE),
    "operating_pressure": ("Operating pressure", r"(?:normal\s+)?operating\s+pressure", PRESSURE),
    "mawp": ("MAWP", r"MAWP|maximum\s+allowable\s+working\s+pressure", PRESSURE),
    "set_pressure": ("Set pressure", r"set\s+pressure", PRESSURE),
    "test_pressure": ("Test pressure", r"(?:hydro(?:static)?\s+)?test\s+pressure", PRESSURE),
    "design_temperature": ("Design temperature", r"design\s+temp(?:erature|\.)?", TEMPERATURE),
    "operating_temperature": ("Operating temperature", r"operating\s+temp(?:erature|\.)?", TEMPERATURE),
    "nominal_thickness": ("Nominal thickness", r"nominal(?:\s+shell|\s+wall)?\s+thickness", LENGTH),
    "t_min": ("t-min", r"t-min|minimum\s+required\s+thickness|retirement\s+thickness", LENGTH),
    "corrosion_allowance": ("Corrosion allowance", r"corrosion\s+allowance", LENGTH),
    "inside_diameter": ("Inside diameter", r"inside\s+diameter", LENGTH),
    "in_service_date": ("In service since", r"in\s+service\s+since|commissioned(?:\s+on)?|date\s+of\s+commissioning", None),
}

# A fact the formula inputs already compare: when that input is in conflict,
# it is reported once, as the input conflict.
_INPUT_FIELD = {
    "design_pressure": "design_pressure",
    "nominal_thickness": "nominal",
    "t_min": "t_min",
    "in_service_date": "in_service_date",
}

# Equipment tags by their usual prefixes. A prefix list, not "any letters and
# digits": SOP-INS-014, INS-2026-0417 and ENG-DBM-2104 are document numbers.
_TAG = re.compile(
    r"(?<![\w-])((?:V|D|T|TK|C|E|HX|P|K|R|F|H|PSV|PRV|RV|XV|MOV|HV|FV|LV|PV|TV|CV|SDV|BDV)-\d{3,5}[A-Z]?)(?![\w-])"
)
_CLAUSE = re.compile(r"\b(SOP-[A-Z]{3}-\d{3})\s*,?\s*(?:Clause|Cl\.)\s*(\d+(?:\.\d+)*)", re.IGNORECASE)

_NUM = r"-?\d+(?:\.\d+)?"
_UNIT = (
    r"bar\s*\(g\)|barg|bar|MPa|kPa|psig|psi|kgf?/cm2|kgf?/cm²"
    r"|°\s?C|deg\.?\s?C\b|degC|°\s?F|deg\.?\s?F\b|degF"
    r"|mm|inch(?:es)?\b"
)
_LEAD = r"\s*(?:\([^)]{0,24}\))?\s*(?:[:=]|\bis\b|\bof\b|\bwas\b|\bshall\s+be\b|\bat\b)?\s*"
_RANGE = rf"(?:between\s+)?(?P<lo>{_NUM})\s*(?P<lo_unit>{_UNIT})?\s*(?:-|–|—|\bto\b|\band\b)\s*(?P<hi>{_NUM})\s*(?P<r_unit>{_UNIT})"
_BOUND = (
    r"(?P<op>≤|<=|≥|>=|<|>|\bmax(?:imum)?\.?|\bmin(?:imum)?\.?|\bup\s+to\b|\bnot\s+(?:to\s+)?exceed(?:ing)?\b"
    rf"|\bat\s+least\b|\bbelow\b|\babove\b)\s*(?P<b_num>{_NUM})\s*(?P<b_unit>{_UNIT})"
)
_POINT = rf"(?P<num>{_NUM})\s*(?P<unit>{_UNIT})"
_UPPER = re.compile(r"≤|<=|<|max|up\s+to|not|below", re.IGNORECASE)
_SENTENCE = re.compile(r"(?<=[.;!?])\s+(?=[A-Z])")


@dataclass(frozen=True)
class Fact:
    subject: str
    attribute: str
    # An interval in the attribute's base unit (or date ordinals); lo == hi
    # for a point. None on one side for an open bound.
    lo: float | None
    hi: float | None
    # Half the last written digit, in the base unit: 10.5 bar is 10.45-10.55.
    tolerance: float
    stated: str
    value: Any
    unit: str | None
    evidence_id: str
    source: str
    source_document: str
    source_text: str
    locator: str | None


def _unit_text(unit: str) -> str:
    text = unit.strip().replace("²", "2")
    text = re.sub(r"^°\s?", "deg", text)
    text = re.sub(r"^deg\.?\s?", "deg", text, flags=re.IGNORECASE)
    return text


def _quantity(number: str, unit: str, dimension: Dimension) -> tuple[float, float] | None:
    """(value, tolerance) in the base unit, or None for a unit or kind that does not fit."""
    try:
        quantity = parse_quantity(f"{number} {_unit_text(unit)}")
    except UnitError:
        return None
    if quantity.dimension != dimension:
        return None
    decimals = len(number.split(".", 1)[1]) if "." in number else 0
    step = 0.5 * 10 ** -decimals
    nudged = parse_quantity(f"{float(number) + step} {_unit_text(unit)}")
    return quantity.value, abs(nudged.value - quantity.value)


def _read_value(text: str, dimension: Dimension | None) -> tuple[float | None, float | None, float, str, Any, str | None] | None:
    """The value a label introduces: (lo, hi, tolerance, as stated, value, unit)."""
    if dimension is None:
        match = re.match(_LEAD + _DATE, text)
        if not match:
            return None
        stated = match.group(1)
        parsed = parse_date(stated)
        if parsed is None:
            return None
        return parsed.toordinal(), parsed.toordinal(), 0.0, stated, parsed.isoformat(), None
    for kind, pattern in (("range", _RANGE), ("bound", _BOUND), ("point", _POINT)):
        match = re.match(_LEAD + pattern, text, re.IGNORECASE)
        if not match:
            continue
        stated = match.group(0).strip(" :=")
        stated = re.sub(r"^(?:is|of|was|shall\s+be|at)\s+", "", stated, flags=re.IGNORECASE)
        if kind == "range":
            unit = match.group("r_unit")
            low = _quantity(match.group("lo"), match.group("lo_unit") or unit, dimension)
            high = _quantity(match.group("hi"), unit, dimension)
            if low is None or high is None:
                continue
            lo, hi = sorted((low[0], high[0]))
            return lo, hi, max(low[1], high[1]), stated, [round(lo, 6), round(hi, 6)], _base_unit(dimension)
        if kind == "bound":
            read = _quantity(match.group("b_num"), match.group("b_unit"), dimension)
            if read is None:
                continue
            if _UPPER.match(match.group("op").strip()):
                return None, read[0], read[1], stated, round(read[0], 6), _base_unit(dimension)
            return read[0], None, read[1], stated, round(read[0], 6), _base_unit(dimension)
        read = _quantity(match.group("num"), match.group("unit"), dimension)
        if read is None:
            continue
        return read[0], read[0], read[1], stated, round(read[0], 6), _base_unit(dimension)
    return None


def _base_unit(dimension: Dimension) -> str:
    return {PRESSURE: "MPa", TEMPERATURE: "degC", LENGTH: "mm"}[dimension]


def _source_key(item: EvidenceItem) -> str:
    # Two passages of one document are one source, not two witnesses.
    return item.document_id or item.source_document or item.id


def extract_facts(item: EvidenceItem) -> list[Fact]:
    """Every fact one evidence item states, each placed on a subject."""
    text = item.excerpt or ""
    header_tag = next(iter(re.findall(r"Equipment\s+Tag\s*:?\s*" + _TAG.pattern, text)), None)
    facts: list[Fact] = []
    for paragraph in re.split(r"\n\s*\n", text):
        joined = re.sub(r"\s+", " ", paragraph).strip()
        if not joined:
            continue
        paragraph_tag: str | None = None
        for sentence in _SENTENCE.split(joined):
            tags = _TAG.findall(sentence)
            clause = _CLAUSE.search(sentence)
            for key, (label, pattern, dimension) in ATTRIBUTES.items():
                for found in re.finditer(rf"\b(?:{pattern})", sentence, re.IGNORECASE):
                    read = _read_value(sentence[found.end():], dimension)
                    if read is None:
                        continue
                    # The nearest tag before the statement in its sentence,
                    # else a clause the sentence cites, else the tag the
                    # paragraph was about, else the record's own tag.
                    before = _TAG.findall(sentence[: found.start()])
                    if before:
                        subject = before[-1]
                    elif tags:
                        subject = tags[0]
                    elif clause:
                        subject = f"{clause.group(1).upper()} Clause {clause.group(2)}"
                    else:
                        subject = paragraph_tag or header_tag
                    if not subject:
                        continue
                    lo, hi, tolerance, stated, value, unit = read
                    facts.append(Fact(
                        subject=subject, attribute=key, lo=lo, hi=hi, tolerance=tolerance,
                        stated=stated, value=value, unit=unit, evidence_id=item.id,
                        source=_source_key(item), source_document=item.source_document,
                        source_text=sentence[:300], locator=item.location,
                    ))
            if tags:
                paragraph_tag = tags[-1]
    return facts


def _agree(a: Fact, b: Fact) -> bool:
    """Whether two statements can both be true: overlapping, within their precision."""
    tolerance = max(a.tolerance, b.tolerance) + 1e-9
    if a.lo is not None and b.hi is not None and a.lo > b.hi + tolerance:
        return False
    if b.lo is not None and a.hi is not None and b.lo > a.hi + tolerance:
        return False
    return True


def fact_conflicts(
    evidence: list[EvidenceItem],
    existing: list[ConflictRecord],
) -> list[ConflictRecord]:
    """The run's conflicts, with a ``fact`` conflict for every contradiction found.

    Read from retrieved passages, attachments and scans; never from computed,
    human or topology items, which are the workbench's own. A conflict already
    on the task keeps its id and its resolution.
    """
    records = list(existing)
    seen = {record.field for record in records}
    input_fields = {record.field for record in records if record.kind == "input"}
    counter = max((int(record.id[1:]) for record in records if record.id[1:].isdigit()), default=0)

    by_key: dict[tuple[str, str], dict[str, list[Fact]]] = {}
    for item in evidence:
        if item.kind not in ("knowledge_base", "uploaded_file", "vision_extraction"):
            continue
        if (item.revision_status or "active") != "active":
            continue
        for fact in extract_facts(item):
            by_key.setdefault((fact.subject.upper(), fact.attribute), {}).setdefault(fact.source, []).append(fact)

    for (subject, attribute), by_source in by_key.items():
        field = f"fact:{subject}:{attribute}"
        if field in seen or _INPUT_FIELD.get(attribute) in input_fields:
            continue
        # One statement per source. A source that disagrees with itself is
        # describing a change, not bearing witness: it is left out.
        witnesses: list[Fact] = []
        for facts in by_source.values():
            if all(_agree(facts[0], other) for other in facts[1:]):
                witnesses.append(facts[0])
        if len(witnesses) < 2:
            continue
        if all(_agree(a, b) for index, a in enumerate(witnesses) for b in witnesses[index + 1:]):
            continue
        label = f"{witnesses[0].subject} {ATTRIBUTES[attribute][0]}"
        values = " vs ".join(f"{w.stated} in {w.evidence_id}" for w in witnesses)
        counter += 1
        seen.add(field)
        records.append(ConflictRecord(
            id=f"K{counter}",
            kind="fact",
            subject=witnesses[0].subject,
            field=field,
            label=label,
            impact="high",
            status="unresolved",
            candidates=[
                ConflictCandidate(
                    value=w.value, stated=w.stated, unit=w.unit, evidence_id=w.evidence_id,
                    locator=w.locator or f"{ATTRIBUTES[attribute][0]} statement",
                    source_document=w.source_document, source_text=w.source_text,
                )
                for w in witnesses
            ],
            note=(
                f"The sources state different values for {label} ({values}). No claim that takes one "
                "of them is stated as fact until a person chooses."
            ),
        ))
    return records


def fact_block(conflicts: list[ConflictRecord]) -> str:
    """What the model is told about open fact conflicts."""
    open_facts = [c for c in conflicts if c.kind == "fact" and c.status == "unresolved"]
    if not open_facts:
        return ""
    lines = [
        "",
        "The sources contradict each other on these facts. For each, say that the sources disagree, name "
        "every value with its bracketed source, say that a person must resolve it, and do not state either "
        "value as the fact or choose between them:",
    ]
    for record in open_facts:
        values = " vs ".join(f"{c.stated} in [{c.evidence_id}]" for c in record.candidates)
        lines.append(f"- {record.label}: {values} (conflict {record.id})")
    return "\n".join(lines) + "\n"
