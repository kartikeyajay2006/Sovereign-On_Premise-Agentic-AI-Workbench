"""Formula inputs stated in the question itself.

"The wall went from 12.0 mm to 9.4 mm in 4 years; t-min is 6.0 mm. Remaining
life?" carries no inspection record for the extractors to read, so the run
used to hand the arithmetic to a generated script or to the model's prose,
and a model once answered 13.8 years where the formula gives 5.23.

Here the model does only what it is good at: saying which number in the
question is which variable. Its proposal is untrusted. A value is bound only
when its number is written in the question and its unit, stated there or in
the proposal, has the dimension the formula reads; everything else is
refused by name. The registry then computes, exactly as it does for a
record read from a report, and the model is told the figures.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from backend.core.schemas import CalculationRecord, IntegrityAssessment
from backend.engineering.formulas import BoundValue, as_bound, evaluate, output_value
from backend.engineering.units import (
    LENGTH,
    RATE,
    TIME,
    Dimension,
    Quantity,
    UnitError,
    dimension_name,
    parse_quantity,
)


@dataclass(frozen=True)
class StatedVariable:
    name: str
    dimension: Dimension
    description: str


# What a stated remaining-life question can supply, in the order the chain
# reads them. ``rate`` is for a question that states the rate outright.
VARIABLES: tuple[StatedVariable, ...] = (
    StatedVariable("t_previous", LENGTH, "the earlier wall thickness (previous or original measurement)"),
    StatedVariable("t_current", LENGTH, "the latest measured wall thickness"),
    StatedVariable("years_between", TIME, "the time between those two measurements"),
    StatedVariable("t_min", LENGTH, "the minimum allowable (retirement) thickness"),
    StatedVariable("rate", RATE, "a corrosion rate, only if the question states one outright"),
)
_BY_NAME = {variable.name: variable for variable in VARIABLES}

_NUMBER = re.compile(r"(?<![\w.])\d+(?:[.,]\d+)?")
# Words that are units only by coincidence ("6 in the report", "a year").
_AMBIGUOUS_UNITS = {"in", "a", "t", "m"}
_TRAILING = ".,;:)]}!?"
# " to 9.4", "→9.4", " - 9.4": the connector and second number of a range.
_RANGE = re.compile(r"\s*(?:to|→|->|-|–|—)\s*\d+(?:[.,]\d+)?", re.IGNORECASE)


@dataclass
class StatedInputs:
    source_evidence_id: str | None
    bound: dict[str, BoundValue] = field(default_factory=dict)
    # name -> why the proposed value was not bound
    refused: dict[str, str] = field(default_factory=dict)


def extraction_request() -> str:
    """The variables, as the model is asked to find them."""
    return "\n".join(f'- "{v.name}": {v.description}' for v in VARIABLES)


def _numbers(text: str) -> list[tuple[float, int]]:
    """Every number written in ``text``, with where it ends."""
    return [(float(m.group(0).replace(",", ".")), m.end()) for m in _NUMBER.finditer(text)]


def _unit_after(text: str, end: int, number: str) -> Quantity | None:
    """The quantity a number is written with, if a unit follows it directly.

    The first number of a range shares the unit written after the second:
    "12.0 to 9.4 mm", "12.0→9.4 mm", "12.0-9.4 mm".
    """
    rest = text[end:end + 60]
    ranged = _RANGE.match(rest)
    if ranged:
        rest = rest[ranged.end():]
    words = rest.split()
    for count in (3, 2, 1):
        if len(words) < count:
            continue
        unit = " ".join(words[:count]).rstrip(_TRAILING)
        if not unit or unit.lower() in _AMBIGUOUS_UNITS:
            continue
        try:
            return parse_quantity(f"{number} {unit}")
        except UnitError:
            continue
    return None


def _proposed(raw: Any) -> str | None:
    if raw is None or isinstance(raw, bool):
        return None
    text = str(raw).strip()
    return text or None


def bind_stated(question: str, proposal: dict[str, Any], evidence_id: str | None) -> StatedInputs:
    """Bind each proposed value the question actually states, and refuse the rest."""
    stated = StatedInputs(source_evidence_id=evidence_id)
    numbers = _numbers(question)
    for name, raw in (proposal or {}).items():
        variable = _BY_NAME.get(name)
        text = _proposed(raw)
        if variable is None or text is None:
            continue
        match = _NUMBER.search(text)
        if match is None:
            stated.refused[name] = f"{text!r} is not a number"
            continue
        number = match.group(0)
        value = float(number.replace(",", "."))
        places = [end for found, end in numbers if abs(found - value) < 1e-9]
        if not places:
            stated.refused[name] = f"{number} is not written in the question"
            continue

        quantity: Quantity | None = None
        proposal_unit = text[match.end():].strip().rstrip(_TRAILING)
        if proposal_unit:
            try:
                quantity = parse_quantity(f"{number} {proposal_unit}")
            except UnitError:
                quantity = None
        written = [q for q in (_unit_after(question, end, number) for end in places) if q is not None]
        if quantity is None and written:
            quantity = written[0]
        if quantity is None:
            stated.refused[name] = f"{number} has no unit, in the question or the proposal"
            continue
        if quantity.dimension != variable.dimension:
            stated.refused[name] = (
                f"{name} is a {dimension_name(variable.dimension)}; "
                f"{quantity.stated or text} is a {dimension_name(quantity.dimension)}"
            )
            continue
        if written and all(q.dimension != variable.dimension for q in written):
            stated.refused[name] = f"the question writes {number} as {written[0].stated}, not a {dimension_name(variable.dimension)}"
            continue
        stated.bound[name] = BoundValue(
            quantity,
            stated=quantity.stated or text,
            evidence_id=evidence_id,
            locator="stated in the request",
            source_text=question[:400],
        )
    return stated


def assess_stated(
    stated: StatedInputs, subject: str = "stated values"
) -> tuple[list[CalculationRecord], IntegrityAssessment] | None:
    """The remaining-life chain on stated inputs; None when the question has no thickness to assess."""
    bound = stated.bound
    if "t_current" not in bound or ("t_min" not in bound and "rate" not in bound and "t_previous" not in bound):
        return None

    records: list[CalculationRecord] = []
    rate = bound.get("rate")
    if rate is None:
        short = evaluate(
            "corrosion.short_term_rate",
            {name: bound.get(name) for name in ("t_previous", "t_current", "years_between")},
            subject=subject,
        )
        records.append(short)
        rate = as_bound(short, "rate", "mm/year")
    life = evaluate(
        "integrity.remaining_life",
        {"t_current": bound.get("t_current"), "t_min": bound.get("t_min"), "rate": rate},
        subject=subject,
    )
    records.append(life)
    if "t_min" in bound:
        records.append(evaluate(
            "integrity.below_t_min",
            {"t_current": bound["t_current"], "t_min": bound["t_min"]},
            subject=subject,
        ))

    # A rate the chain derives is not itself missing: what it lacks is.
    derived = set() if "rate" in bound else {"rate"}
    missing = sorted({name for record in records for name in record.missing} - derived)
    refused = [record for record in records if record.status == "refused"]
    calculated = not missing and not refused
    rate_value = output_value(records[0], "rate") if records[0].formula_id == "corrosion.short_term_rate" else (
        round(rate.value.to("mm/year"), 6) if rate is not None and isinstance(rate.value, Quantity) else None
    )
    t_min = bound.get("t_min")
    below = next((r for r in records if r.formula_id == "integrity.below_t_min" and r.status == "calculated"), None)
    assessment = IntegrityAssessment(
        kind="stated",
        subject=subject,
        status="calculated" if calculated else "cannot_calculate",
        governing_rate_mm_yr=rate_value,
        governing_rate_is="stated" if "rate" in bound else "short-term",
        remaining_life_years=output_value(life, "remaining_life"),
        t_min_mm=round(t_min.value.to("mm"), 6) if t_min is not None and isinstance(t_min.value, Quantity) else None,
        locations_below_t_min=["stated thickness"] if below is not None and output_value(below, "below_t_min") else [],
        missing=missing + [f"{r.formula_id}: {r.reason}" for r in refused],
        source_evidence_ids=[stated.source_evidence_id] if stated.source_evidence_id else [],
    )
    return records, assessment
