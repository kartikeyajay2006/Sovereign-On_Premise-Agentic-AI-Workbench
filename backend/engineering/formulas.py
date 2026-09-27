"""The versioned formula registry.

Every formula here is written exactly as the procedure that governs it states
it, names that clause, declares the dimension of every input, and rounds as
the clause says. A formula is identified by ``id@version``; its source is
hashed, so a record can prove which code produced a figure, and a change to a
formula without a version bump is visible as a changed hash.

A formula never guesses. A missing input produces a ``cannot_calculate``
record naming what is missing; an input of the wrong dimension (a pressure
where a thickness belongs) produces a ``refused`` record naming the input and
what it was. Only complete, well-formed inputs produce ``calculated``.
"""

from __future__ import annotations

import calendar
import hashlib
import inspect
import json
import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Callable

from backend.core.schemas import CalculationInput, CalculationRecord
from backend.engineering.units import (
    DIMENSIONLESS,
    LENGTH,
    PRESSURE,
    RATE,
    TIME,
    Dimension,
    DimensionError,
    Quantity,
    dimension_name,
)


# ------------------------------------------------------------ bound inputs
@dataclass
class BoundValue:
    """One input value, and exactly where it was read from."""

    value: Quantity | date | float | int | str | bool
    stated: str | None = None
    evidence_id: str | None = None
    locator: str | None = None
    source_text: str | None = None

    def record(self, name: str) -> CalculationInput:
        value: Any
        unit: str | None = None
        if isinstance(self.value, Quantity):
            value, unit = round(self.value.value, 6), self.value.unit or None
        elif isinstance(self.value, date):
            value = self.value.isoformat()
        else:
            value = self.value
        return CalculationInput(
            name=name,
            stated=self.stated,
            value=value,
            unit=unit,
            evidence_id=self.evidence_id,
            locator=self.locator,
            source_text=self.source_text,
        )


@dataclass(frozen=True)
class Parameter:
    name: str
    kind: str  # quantity | date | number | text | bool
    description: str
    dimension: Dimension | None = None
    optional: bool = False


@dataclass(frozen=True)
class Formula:
    id: str
    version: int
    title: str
    clause: str
    expression: str
    parameters: tuple[Parameter, ...]
    compute: Callable[[dict[str, Any]], dict[str, Any]]
    outputs: tuple[str, ...] = field(default_factory=tuple)

    @property
    def key(self) -> str:
        return f"{self.id}@{self.version}"

    @property
    def source_hash(self) -> str:
        """Hash of what the formula is: its identity, expression and code."""
        body = json.dumps(
            {
                "id": self.id,
                "version": self.version,
                "expression": self.expression,
                "clause": self.clause,
                "code": inspect.getsource(self.compute),
            },
            sort_keys=True,
        )
        return hashlib.sha256(body.encode("utf-8")).hexdigest()

    def describe(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "version": self.version,
            "key": self.key,
            "title": self.title,
            "clause": self.clause,
            "expression": self.expression,
            "inputs": [
                {
                    "name": p.name,
                    "kind": p.kind,
                    "dimension": dimension_name(p.dimension) if p.dimension else None,
                    "description": p.description,
                    "optional": p.optional,
                }
                for p in self.parameters
            ],
            "outputs": list(self.outputs),
            "source_sha256": self.source_hash,
        }


# ----------------------------------------------------------------- helpers
def add_months(day: date, months: int) -> date:
    index = day.month - 1 + months
    year, month = day.year + index // 12, index % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def _canonical(data: Any) -> str:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), default=str)


def _sha(data: Any) -> str:
    return hashlib.sha256(_canonical(data).encode("utf-8")).hexdigest()


def _num(value: float) -> str:
    return f"{value:g}" if abs(value) >= 1e-4 or value == 0 else f"{value:.6f}"


# ---------------------------------------------------------------- formulas
def _years_between(v: dict[str, Any]) -> dict[str, Any]:
    days = (v["end_date"] - v["start_date"]).days
    if days <= 0:
        raise ValueError("the end date must be after the start date")
    years = round(days / 365.25, 1)
    return {"years": (years, "year"), "_display": f"{years:g} years = {days} days / 365.25, rounded to 0.1"}


def _short_term_rate(v: dict[str, Any]) -> dict[str, Any]:
    t_prev, t_cur, years = v["t_previous"].value, v["t_current"].value, v["years_between"].value
    if years <= 0:
        raise ValueError("years between inspections must be positive")
    rate = round((t_prev - t_cur) / years, 6)
    return {
        "rate": (rate, "mm/year"),
        "_display": f"{_num(rate)} mm/year = ({_num(t_prev)} − {_num(t_cur)}) / {_num(years)}",
    }


def _long_term_rate(v: dict[str, Any]) -> dict[str, Any]:
    t_nom, t_cur, years = v["t_nominal"].value, v["t_current"].value, v["years_in_service"].value
    if years <= 0:
        raise ValueError("years in service must be positive")
    rate = round((t_nom - t_cur) / years, 6)
    return {
        "rate": (rate, "mm/year"),
        "_display": f"{_num(rate)} mm/year = ({_num(t_nom)} − {_num(t_cur)}) / {_num(years)}",
    }


def _governing_rate(v: dict[str, Any]) -> dict[str, Any]:
    short, long = v["short_term_rate"].value, v["long_term_rate"].value
    governing = max(short, long)
    which = "long-term" if long > short else "short-term"
    return {
        "rate": (round(governing, 6), "mm/year"),
        "governing": (which, None),
        "_display": f"{_num(governing)} mm/year, the higher of {_num(short)} (short-term) and {_num(long)} (long-term): {which} governs",
    }


def _remaining_life(v: dict[str, Any]) -> dict[str, Any]:
    t_cur, t_min, rate = v["t_current"].value, v["t_min"].value, v["rate"].value
    if rate <= 0:
        return {
            "remaining_life": (None, "year"),
            "_display": "no measurable corrosion (rate ≤ 0): remaining life is not limited by corrosion",
        }
    life = round((t_cur - t_min) / rate, 2)
    return {
        "remaining_life": (life, "year"),
        "_display": f"{_num(life)} years = ({_num(t_cur)} − {_num(t_min)}) / {_num(rate)}",
    }


def _below_t_min(v: dict[str, Any]) -> dict[str, Any]:
    below = v["t_current"].value < v["t_min"].value
    return {
        "below_t_min": (below, None),
        "_display": f"{_num(v['t_current'].value)} mm {'<' if below else '≥'} t-min {_num(v['t_min'].value)} mm",
    }


def _local_metal_loss(v: dict[str, Any]) -> dict[str, Any]:
    t_nom, t_cur = v["t_nominal"].value, v["t_current"].value
    fraction = (t_nom - t_cur) / t_nom
    percent = round(fraction * 100, 1)
    trigger = fraction > 0.25
    return {
        "loss_percent": (percent, "%"),
        "ffs_trigger": (trigger, None),
        "_display": f"{percent:g}% = ({_num(t_nom)} − {_num(t_cur)}) / {_num(t_nom)}; trigger above 25%: {'yes' if trigger else 'no'}",
    }


def _shell_t_min_ug27(v: dict[str, Any]) -> dict[str, Any]:
    p, r, s = v["design_pressure"].value, v["inside_radius"].value, v["allowable_stress"].value
    e = float(v["joint_efficiency"])
    structural = v["structural_minimum"].value if "structural_minimum" in v else 6.0
    denominator = s * e - 0.6 * p
    if denominator <= 0:
        raise ValueError("S × E − 0.6 × P must be positive")
    t_calc = round(p * r / denominator, 2)
    adopted = max(t_calc, structural)
    return {
        "t_calculated": (t_calc, "mm"),
        "t_min": (adopted, "mm"),
        "_display": (
            f"t = ({_num(p)} × {_num(r)}) / ({_num(s)} × {_num(e)} − 0.6 × {_num(p)}) = {_num(t_calc)} mm; "
            f"adopted t-min {_num(adopted)} mm"
            + (" (structural minimum, Clause 3.2)" if adopted > t_calc else "")
        ),
    }


def _pipe_t_min(v: dict[str, Any]) -> dict[str, Any]:
    p, d, s = v["design_pressure"].value, v["outside_diameter"].value, v["allowable_stress"].value
    e, w, y = float(v["joint_quality"]), float(v["weld_strength"]), float(v["coefficient_y"])
    structural = v["structural_minimum"].value if "structural_minimum" in v else 2.8
    t_p = round(p * d / (2 * (s * e * w + p * y)), 2)
    adopted = max(t_p, structural)
    return {
        "t_pressure": (t_p, "mm"),
        "t_min": (adopted, "mm"),
        "_display": f"t_p = ({_num(p)} × {_num(d)}) / (2 × ({_num(s)} × {_num(e)} × {_num(w)} + {_num(p)} × {_num(y)})) = {_num(t_p)} mm; t-min {_num(adopted)} mm",
    }


# Thickness-survey intervals by service category, SOP-INS-014 Clauses 2.1-2.4.
SURVEY_INTERVAL_MONTHS = {"normal": 48, "corrosive": 24, "lethal": 24, "steam": 36}


def service_category_key(text: str) -> str | None:
    lowered = text.lower()
    if "lethal" in lowered or "toxic" in lowered:
        return "lethal"
    if "steam" in lowered or "condensate" in lowered and "hot" in lowered:
        return "steam"
    if "non-corrosive" in lowered or "non corrosive" in lowered:
        return "normal"
    if "corrosive" in lowered:
        return "corrosive"
    return None


# What the procedures require of equipment already at or below t-min. A
# routine interval ("next survey in 12 months") is the wrong answer here: the
# vessel is out of service, and the next step is an assessment, not a survey.
VESSEL_BELOW_T_MIN_ACTION = (
    "Withdraw from service immediately (SOP-INS-014 Clause 3.3) and in any case within 24 hours "
    "(Clause 5.1); raise a Fitness-For-Service assessment while it is out of service (SOP-INS-021 "
    "Clause 2.1); interim operation is not permitted, because it requires thickness at or above t-min "
    "at every location (SOP-INS-021 Clause 6.1); it does not return to service without a repair, "
    "re-rating or replacement accepted under SOP-INS-021 (Clauses 4.2 and 5)"
)
PIPING_BELOW_T_MIN_ACTION = (
    "A CML at or below t-min is a High finding: withdraw the circuit from service within 24 hours "
    "(SOP-INS-017 Clause 7.1; SOP-INS-014 Clause 5.1) and refer it for Fitness-For-Service assessment "
    "(SOP-INS-017 Clause 7.3); no routine measurement interval applies"
)


def _at_or_below_t_min(life: float | None, below: list[str]) -> bool:
    """A reading below t-min, or a remaining life already spent.

    Remaining life at or below zero means the governing reading is at or under
    t-min now; a reading can also be below t-min at a location whose rate is
    not measurable, which is why the locations are read as well.
    """
    return bool(below) or (life is not None and life <= 0)


def _vessel_survey(v: dict[str, Any]) -> dict[str, Any]:
    category = service_category_key(str(v["service_category"]))
    if category is None:
        raise ValueError(f"service category {v['service_category']!r} is not one of Clauses 2.1-2.4")
    life = v["remaining_life"].value if v.get("remaining_life") is not None else None
    below = [str(item) for item in (v.get("locations_below_t_min") or [])]
    if _at_or_below_t_min(life, below):
        # Clauses 2.1-2.4 schedule vessels that are in service. One at or
        # below t-min is withdrawn under Clause 3.3, so no interval is stated:
        # a date here would read as permission to run until it.
        why = (f"thickness below t-min at {', '.join(below)}" if below
               else f"remaining life {_num(life)} years, so t-min is already reached")
        return {
            "interval_months": (None, "month"),
            "halved": (False, None),
            "due": (None, None),
            "withdraw_from_service": (True, None),
            "_display": (
                f"No routine thickness survey is scheduled: {why}. {VESSEL_BELOW_T_MIN_ACTION}"
            ),
        }
    months = SURVEY_INTERVAL_MONTHS[category]
    halved = life is not None and life < 4
    if halved:
        months //= 2
    due = add_months(v["inspection_date"], months)
    return {
        "interval_months": (months, "month"),
        "halved": (halved, None),
        "due": (due.isoformat(), None),
        "withdraw_from_service": (False, None),
        "_display": (
            f"{months} months after {v['inspection_date'].isoformat()} = {due.isoformat()} "
            f"({category} service" + (", halved because remaining life < 4 years (Clause 4.5)" if halved else "") + ")"
        ),
    }


def _piping_next(v: dict[str, Any]) -> dict[str, Any]:
    life = v["remaining_life"].value
    if life <= 0:
        # Half of a spent life is a negative interval, which floor() turned
        # into a due date before the survey itself.
        return {
            "interval_months": (None, "month"),
            "due": (None, None),
            "withdraw_from_service": (True, None),
            "_display": f"No measurement interval: remaining life {_num(life)} years. {PIPING_BELOW_T_MIN_ACTION}",
        }
    class_max = v["class_max_interval"].value
    months = math.floor(min(life / 2, class_max) * 12)
    due = add_months(v["survey_date"], months)
    return {
        "interval_months": (months, "month"),
        "due": (due.isoformat(), None),
        "withdraw_from_service": (False, None),
        "_display": f"floor(min({_num(life)} / 2, {_num(class_max)}) × 12) = {months} months after {v['survey_date'].isoformat()} = {due.isoformat()}",
    }


def _vessel_severity(v: dict[str, Any]) -> dict[str, Any]:
    below = [str(item) for item in (v.get("locations_below_t_min") or [])]
    life = v["remaining_life"].value if v.get("remaining_life") is not None else None
    cladding = v.get("cladding_damage_percent")
    cladding_value = float(cladding) if cladding is not None else None
    # SOP-OPS-008 separates who recommends from who approves (Clauses 2.1 to
    # 2.3). The authority is stated in that shape so no reader, and no model
    # drafting from it, can collapse a recommendation into an approval.
    if below:
        severity = "high"
        basis = (f"SOP-INS-014 Clause 5.1: thickness below t-min at {', '.join(below)} "
                 "(SOP-MNT-022 Clause 4.3 escalates a CUI site to High)")
        action = VESSEL_BELOW_T_MIN_ACTION
        approver = (
            "Head of Inspection + Plant Manager (SOP-INS-014 Clause 5.1): the Inspection Engineer and "
            "Head of Inspection recommend, the Plant Manager approves (SOP-OPS-008 Clauses 2.3 and 3.5)"
        )
        recommended_by, approved_by = ["Inspection Engineer", "Head of Inspection"], ["Plant Manager"]
    elif life is not None and life < 4:
        severity = "medium"
        basis = "SOP-INS-014 Clause 5.2: remaining life below 4 years (and Clause 4.5)"
        action = "Repair within the current shutdown window (SOP-INS-014 Clause 5.2)"
        approver = ("Head of Inspection (SOP-INS-014 Clause 5.2; SOP-OPS-008 Clause 2.2): the Inspection "
                    "Engineer recommends, the Head of Inspection approves")
        recommended_by, approved_by = ["Inspection Engineer"], ["Head of Inspection"]
    elif cladding_value is not None and cladding_value > 20:
        severity = "medium"
        basis = (
            f"SOP-MNT-022 Clause 4.1: cladding damage {cladding_value:g}% exceeds 20% of the insulated "
            "section, a Medium finding under SOP-INS-014 Clause 5.2"
        )
        action = "Repair within the current shutdown window (SOP-INS-014 Clause 5.2)"
        approver = ("Head of Inspection (SOP-INS-014 Clause 5.2; SOP-OPS-008 Clause 2.2): the Inspection "
                    "Engineer recommends, the Head of Inspection approves")
        recommended_by, approved_by = ["Inspection Engineer"], ["Head of Inspection"]
    else:
        severity = "low"
        basis = "No High or Medium criterion of SOP-INS-014 Clauses 5.1-5.2 is met by the thickness data"
        if cladding_value is None:
            # Thickness alone cannot clear a vessel of the visual Medium
            # criteria. Saying "Low" without this would read as a clean bill.
            basis += (
                "; no visual observations were in the evidence, so the Clause 5.2 criteria for coating "
                "breakdown, active external corrosion and CUI could not be assessed"
            )
        action = "Rectify within 6 months (SOP-INS-014 Clause 5.3)"
        approver = ("Inspection Engineer (SOP-INS-014 Clause 5.3; SOP-OPS-008 Clause 2.1): approved by the "
                    "Inspection Engineer, no recommendation required")
        recommended_by, approved_by = [], ["Inspection Engineer"]
    return {
        "severity": (severity, None),
        "basis": (basis, None),
        "required_action": (action, None),
        "approver": (approver, None),
        "recommended_by": (recommended_by, None),
        "approved_by": (approved_by, None),
        "visual_findings_assessed": (cladding_value is not None, None),
        "_display": f"{severity.capitalize()}: {basis}",
    }


def _ffs_triggers(v: dict[str, Any]) -> dict[str, Any]:
    triggers: list[str] = []
    if v.get("locations_below_t_min"):
        triggers.append("SOP-INS-021 Clause 2.1: thickness below t-min without a through-wall defect")
    life = v["remaining_life"].value if v.get("remaining_life") is not None else None
    if life is not None and life < 2:
        triggers.append("SOP-INS-021 Clause 2.2: remaining life below 2 years")
    loss = v.get("local_metal_loss_percent")
    if loss is not None and float(loss) > 25:
        triggers.append(f"SOP-INS-021 Clause 2.3: local metal loss {float(loss):g}% of nominal exceeds 25%")
    return {
        "triggers": (triggers, None),
        "_display": "; ".join(triggers) if triggers else "No Fitness-For-Service trigger of SOP-INS-021 Clauses 2.1-2.3 applies",
    }


# ----------------------------------------------------- pressure relief devices
# Bench-test intervals by service, SOP-INS-025 Clauses 2.1-2.2.
RELIEF_TEST_INTERVAL_MONTHS = {"clean": 48, "fouling_or_corrosive": 24}

# Pressures are compared in MPa. Six decimal places is far below any gauge's
# resolution and removes the binary-fraction noise that would otherwise fail
# the Clause 3.2 worked example (10.5 × 1.10 is not exactly 11.55 in floats).
_PRESSURE_PLACES = 6


def relief_service_key(text: str) -> str | None:
    lowered = text.lower()
    # "non-fouling, non-corrosive" is the clean service of Clause 2.1, not the
    # fouling or corrosive service of Clause 2.2, so the negations go first.
    stripped = lowered
    for negation in ("non-fouling", "non fouling", "non-corrosive", "non corrosive"):
        stripped = stripped.replace(negation, "")
    if "fouling" in stripped or "corrosive" in stripped:
        return "fouling_or_corrosive"
    if "clean" in lowered or stripped != lowered:
        return "clean"
    return None


def _bar(mpa: float) -> str:
    return f"{_num(round(mpa * 10, 4))} bar"


def _relief_test_due(v: dict[str, Any]) -> dict[str, Any]:
    service = relief_service_key(str(v["service"]))
    if service is None:
        raise ValueError(
            f"service {v['service']!r} is not one of SOP-INS-025 Clauses 2.1-2.2 "
            "(clean, or fouling or corrosive)"
        )
    months = RELIEF_TEST_INTERVAL_MONTHS[service]
    due = add_months(v["last_test_date"], months)
    as_of = v.get("as_of")
    overdue = None if as_of is None else as_of > due
    days_overdue = None if as_of is None else max((as_of - due).days, 0)
    display = (
        f"{months} months after {v['last_test_date'].isoformat()} = {due.isoformat()} "
        f"({'clean' if service == 'clean' else 'fouling or corrosive'} service)"
    )
    if overdue:
        display += f"; overdue by {days_overdue} days on {as_of.isoformat()}"
    return {
        "interval_months": (months, "month"),
        "due": (due.isoformat(), None),
        "overdue": (overdue, None),
        "days_overdue": (days_overdue, "day"),
        "_display": display,
    }


def _relief_as_received(v: dict[str, Any]) -> dict[str, Any]:
    set_p = v["set_pressure"].value
    fail_above = round(set_p * 1.10, _PRESSURE_PLACES)
    if v.get("did_not_open"):
        passed, seen = False, "did not open"
    elif v.get("opening_pressure") is not None:
        opening = round(v["opening_pressure"].value, _PRESSURE_PLACES)
        passed, seen = opening <= fail_above, f"opened at {_bar(opening)}"
    else:
        raise ValueError(
            "give the as-received opening pressure, or record that the valve did not open "
            "(SOP-INS-025 Clause 3.2)"
        )
    result: dict[str, Any] = {
        "fail_above": (fail_above, "MPa"),
        "passed": (passed, None),
        "severity": (None, None),
        "required_action": (None, None),
        "approver": (None, None),
        "report": (None, None),
    }
    if not passed:
        result.update({
            "severity": ("high", None),
            "required_action": (
                "Withdraw the protected equipment from service within 24 hours (SOP-INS-025 Clause 3.3)", None,
            ),
            "approver": ("Head of Inspection + Plant Manager (SOP-INS-025 Clause 3.3)", None),
            "report": ("Report as a near miss within 24 hours (SOP-HSE-004 Clause 2.3)", None),
        })
    result["_display"] = (
        f"{seen}; fails above {_bar(fail_above)} = 1.10 × set {_bar(set_p)}: "
        + ("passed" if passed else "FAILED, a High finding on the protected equipment")
    )
    return result


def _relief_set_limit(v: dict[str, Any]) -> dict[str, Any]:
    set_p = round(v["set_pressure"].value, _PRESSURE_PLACES)
    mawp = round(v["mawp"].value, _PRESSURE_PLACES)
    within = set_p <= mawp
    return {
        "within_limit": (within, None),
        "margin": (round(mawp - set_p, _PRESSURE_PLACES), "MPa"),
        "_display": f"set {_bar(set_p)} {'≤' if within else '>'} MAWP {_bar(mawp)}",
    }


def _relief_post_overhaul(v: dict[str, Any]) -> dict[str, Any]:
    set_p = v["set_pressure"].value
    popping = v["popping_pressure"].value
    # ±0.14 bar at or below 4.8 bar(g); ±3% above it.
    low_set = round(set_p, _PRESSURE_PLACES) <= 0.48
    tolerance = 0.014 if low_set else round(0.03 * set_p, _PRESSURE_PLACES)
    deviation = round(abs(popping - set_p), _PRESSURE_PLACES)
    within = deviation <= tolerance
    return {
        "tolerance": (tolerance, "MPa"),
        "deviation": (deviation, "MPa"),
        "within_tolerance": (within, None),
        "_display": (
            f"|{_bar(popping)} − {_bar(set_p)}| = {_bar(deviation)} {'≤' if within else '>'} "
            f"{'±0.14 bar' if low_set else '±3% = ' + _bar(tolerance)}"
        ),
    }


def _relief_inlet_loss(v: dict[str, Any]) -> dict[str, Any]:
    set_p = v["set_pressure"].value
    loss = v["inlet_loss"].value
    limit = round(0.03 * set_p, _PRESSURE_PLACES)
    within = round(loss, _PRESSURE_PLACES) <= limit
    percent = round(loss / set_p * 100, 1)
    return {
        "loss_percent": (percent, "%"),
        "within_limit": (within, None),
        "_display": f"{_bar(loss)} = {percent:g}% of set {_bar(set_p)}; limit 3% = {_bar(limit)}",
    }


# ------------------------------------------------------ operating envelope
# SOP-INS-021 Clause 6.1: equipment awaiting a Fitness-For-Service assessment
# may be operated in the interim only where, among other conditions,
# "operating pressure is reduced to 90% of the registered MAWP or lower".
# The corpus states no general operating limit against MAWP and no design
# temperature range for operation, so neither is registered here.
INTERIM_PRESSURE_FRACTION = 0.90
INTERIM_MAX_INSPECTION_DAYS = 30
INTERIM_MAX_DAYS = 180
_BOTH_AUTHORITIES = "Head of Inspection + Plant Manager"


def _interim_operating_pressure(v: dict[str, Any]) -> dict[str, Any]:
    operating = round(v["operating_pressure"].value, _PRESSURE_PLACES)
    mawp = round(v["mawp"].value, _PRESSURE_PLACES)
    if mawp <= 0:
        raise ValueError("MAWP must be positive")
    limit = round(INTERIM_PRESSURE_FRACTION * mawp, _PRESSURE_PLACES)
    within = operating <= limit
    percent = round(operating / mawp * 100, 1)
    return {
        "within_limit": (within, None),
        "limit": (limit, "MPa"),
        "margin": (round(limit - operating, _PRESSURE_PLACES), "MPa"),
        "percent_of_mawp": (percent, "%"),
        "_display": (
            f"operating {_bar(operating)} = {percent:g}% of MAWP {_bar(mawp)}; "
            f"{'≤' if within else '>'} 90% of MAWP = {_bar(limit)}"
            + ("" if within else ": interim operation is not permitted at this pressure")
        ),
    }


# ------------------------------------------ operating limits after an FFS finding
# SOP-INS-021 Clauses 5 and 6: a re-rated MAWP, and the whole interim-operation
# decision, whose pressure condition is the envelope check above.
def _rerated_mawp(v: dict[str, Any]) -> dict[str, Any]:
    mawp = v["mawp"].value
    rsf = float(v["rsf"])
    # Clause 5.1 re-rates equipment that cannot sustain its registered
    # pressure: the factor reduces it. Anything else is not a re-rating.
    if not 0 < rsf <= 1:
        raise ValueError(f"RSF {rsf:g} does not reduce the MAWP; SOP-INS-021 Clause 5.1 needs 0 < RSF <= 1")
    rerated = round(mawp * rsf, _PRESSURE_PLACES)
    return {
        "mawp_rerated": (rerated, "MPa"),
        "approver": (f"{_BOTH_AUTHORITIES} (SOP-INS-021 Clause 5.2; SOP-OPS-008 Clause 2.6)", None),
        "required_actions": ([
            "Update the nameplate within 30 days (SOP-INS-021 Clause 5.2)",
            "Reset the relief devices to the re-rated MAWP or lower before return to service (SOP-INS-025 Clause 4.2)",
            "Process the re-rating as a change under SOP-ENG-009 before it takes effect (SOP-INS-021 Clause 5.4)",
            "Re-assess at every subsequent inspection (SOP-INS-021 Clause 5.3)",
        ], None),
        "_display": f"{_bar(rerated)} = {_bar(mawp)} × RSF {rsf:g}",
    }


def _interim_operation(v: dict[str, Any]) -> dict[str, Any]:
    mawp = v["mawp"].value
    envelope = _interim_operating_pressure(v)
    limit = envelope["limit"][0]
    operating = round(v["operating_pressure"].value, _PRESSURE_PLACES)
    interval_days = round(v["inspection_interval"].value * 365.25, 6)
    latest_end = v["finding_date"] + timedelta(days=INTERIM_MAX_DAYS)
    unmet: list[str] = []
    if v.get("through_wall_or_leak"):
        unmet.append("SOP-INS-021 Clause 6.1: there is a through-wall defect or an active leak")
    if v.get("below_t_min"):
        unmet.append("SOP-INS-021 Clause 6.1: thickness is below t-min at a location; it must be at or above t-min everywhere")
    if not envelope["within_limit"][0]:
        unmet.append(
            f"SOP-INS-021 Clause 6.1: operating pressure {_bar(operating)} exceeds 90% of the registered MAWP ({_bar(limit)})"
        )
    if interval_days > INTERIM_MAX_INSPECTION_DAYS:
        unmet.append(
            f"SOP-INS-021 Clause 6.1: inspections every {interval_days:g} days; the 30-day interval is the most allowed"
        )
    planned_end = v.get("planned_end")
    if planned_end is not None and planned_end > latest_end:
        unmet.append(
            f"SOP-INS-021 Clause 6.2: planned to {planned_end.isoformat()}, beyond 180 days from the finding "
            f"({latest_end.isoformat()})"
        )
    permitted = not unmet
    return {
        "permitted": (permitted, None),
        "unmet": (unmet, None),
        "operating_limit": (limit, "MPa"),
        "latest_end": (latest_end.isoformat(), None),
        "approver": (
            f"{_BOTH_AUTHORITIES}, recommended by the Inspection Engineer (SOP-INS-021 Clause 6.2; SOP-OPS-008 Clause 2.8)",
            None,
        ),
        "_display": (
            ("permitted" if permitted else "NOT permitted")
            + f": at most {_bar(limit)} (90% of MAWP {_bar(mawp)}), inspected at least every 30 days, "
            f"until {latest_end.isoformat()} at the latest"
            + ("" if permitted else "; unmet: " + "; ".join(unmet))
        ),
    }


def _q(name: str, dimension: Dimension, description: str, optional: bool = False) -> Parameter:
    return Parameter(name, "quantity", description, dimension, optional)


FORMULAS: dict[str, Formula] = {
    formula.id: formula
    for formula in (
        Formula(
            "time.years_between", 1, "Years between two dates",
            "SOP-INS-014 Clauses 4.1-4.2; SOP-INS-017 Clause 5.1",
            "years = days / 365.25, rounded to one decimal place",
            (Parameter("start_date", "date", "earlier date"), Parameter("end_date", "date", "later date")),
            _years_between, ("years",),
        ),
        Formula(
            "corrosion.short_term_rate", 1, "Short-term corrosion rate",
            "SOP-INS-014 Clause 4.1; SOP-INS-017 Clause 5.1",
            "short_term_rate = (t_previous − t_current) / years_between",
            (
                _q("t_previous", LENGTH, "thickness at the previous inspection"),
                _q("t_current", LENGTH, "thickness at this inspection"),
                _q("years_between", TIME, "years between the two inspections"),
            ),
            _short_term_rate, ("rate",),
        ),
        Formula(
            "corrosion.long_term_rate", 1, "Long-term corrosion rate",
            "SOP-INS-014 Clause 4.2; SOP-INS-017 Clause 5.1",
            "long_term_rate = (t_nominal − t_current) / years_in_service",
            (
                _q("t_nominal", LENGTH, "original nominal thickness"),
                _q("t_current", LENGTH, "thickness at this inspection"),
                _q("years_in_service", TIME, "years since entering service"),
            ),
            _long_term_rate, ("rate",),
        ),
        Formula(
            "corrosion.governing_rate", 1, "Governing corrosion rate",
            "SOP-INS-014 Clause 4.3; SOP-INS-017 Clause 5.1",
            "governing_rate = max(short_term_rate, long_term_rate)",
            (
                _q("short_term_rate", RATE, "short-term rate"),
                _q("long_term_rate", RATE, "long-term rate"),
            ),
            _governing_rate, ("rate", "governing"),
        ),
        Formula(
            "integrity.remaining_life", 1, "Remaining life",
            "SOP-INS-014 Clause 4.4; SOP-INS-017 Clause 5.2",
            "remaining_life = (t_current − t_min) / governing_rate",
            (
                _q("t_current", LENGTH, "thickness at this inspection"),
                _q("t_min", LENGTH, "minimum allowable thickness"),
                _q("rate", RATE, "governing corrosion rate"),
            ),
            _remaining_life, ("remaining_life",),
        ),
        Formula(
            "integrity.below_t_min", 1, "Thickness below t-min",
            "SOP-INS-014 Clause 3.3",
            "below_t_min = t_current < t_min",
            (_q("t_current", LENGTH, "measured thickness"), _q("t_min", LENGTH, "minimum allowable thickness")),
            _below_t_min, ("below_t_min",),
        ),
        Formula(
            "integrity.local_metal_loss", 1, "Local metal loss of nominal",
            "SOP-INS-021 Clause 2.3",
            "loss = (t_nominal − t_current) / t_nominal; FFS trigger above 25%",
            (_q("t_nominal", LENGTH, "nominal thickness"), _q("t_current", LENGTH, "minimum recorded thickness")),
            _local_metal_loss, ("loss_percent", "ffs_trigger"),
        ),
        Formula(
            "design.shell_t_min_ug27", 1, "Minimum shell thickness (UG-27)",
            "SOP-INS-014 Clauses 3.1-3.2",
            "t = (P × R) / (S × E − 0.6 × P); t_min = max(t, structural minimum 6.0 mm)",
            (
                _q("design_pressure", PRESSURE, "design pressure"),
                _q("inside_radius", LENGTH, "inside radius"),
                _q("allowable_stress", PRESSURE, "allowable stress at design temperature"),
                Parameter("joint_efficiency", "number", "joint efficiency E"),
                _q("structural_minimum", LENGTH, "structural minimum (6.0 mm carbon steel)", optional=True),
            ),
            _shell_t_min_ug27, ("t_calculated", "t_min"),
        ),
        Formula(
            "design.pipe_t_min", 1, "Piping pressure design thickness and t-min",
            "SOP-INS-017 Clauses 4.1-4.3",
            "t_p = (P × D) / (2 × (S × E × W + P × Y)); t_min = max(t_p, structural minimum 2.8 mm)",
            (
                _q("design_pressure", PRESSURE, "design pressure"),
                _q("outside_diameter", LENGTH, "outside diameter"),
                _q("allowable_stress", PRESSURE, "allowable stress"),
                Parameter("joint_quality", "number", "longitudinal joint quality factor E"),
                Parameter("weld_strength", "number", "weld joint strength reduction factor W"),
                Parameter("coefficient_y", "number", "coefficient Y"),
                _q("structural_minimum", LENGTH, "structural minimum (2.8 mm)", optional=True),
            ),
            _pipe_t_min, ("t_pressure", "t_min"),
        ),
        Formula(
            "schedule.vessel_thickness_survey", 2, "Next vessel thickness survey",
            "SOP-INS-014 Clauses 2.1-2.4, 3.3 and 4.5; SOP-INS-021 Clauses 2.1 and 6.1",
            "due = inspection_date + interval(service category), halved when remaining life < 4 years; "
            "no interval when a reading is below t-min or remaining life ≤ 0 (withdraw, Clause 3.3)",
            (
                Parameter("inspection_date", "date", "date of this inspection"),
                Parameter("service_category", "text", "service category on the equipment record"),
                _q("remaining_life", TIME, "governing remaining life", optional=True),
                Parameter("locations_below_t_min", "text", "locations whose reading is below t-min", optional=True),
            ),
            _vessel_survey, ("interval_months", "halved", "due", "withdraw_from_service"),
        ),
        Formula(
            "schedule.piping_next_measurement", 2, "Next piping thickness measurement",
            "SOP-INS-017 Clauses 6.1, 7.1 and 7.3",
            "months = floor(min(remaining_life / 2, class maximum) × 12); due = survey_date + months; "
            "no interval when remaining life ≤ 0 (High finding, withdraw and refer for FFS)",
            (
                _q("remaining_life", TIME, "governing CML remaining life"),
                _q("class_max_interval", TIME, "maximum interval for the circuit class"),
                Parameter("survey_date", "date", "date of this survey"),
            ),
            _piping_next, ("interval_months", "due", "withdraw_from_service"),
        ),
        Formula(
            "severity.vessel_finding", 2, "Finding severity and approving authority",
            "SOP-INS-014 Clauses 3.3 and 5.1-5.3; SOP-MNT-022 Clauses 4.1 and 4.3; SOP-OPS-008 Clauses 2.1-2.3",
            "High if any reading below t-min; Medium if remaining life < 4 years or cladding damage > 20%; else Low",
            (
                Parameter("locations_below_t_min", "text", "locations whose reading is below t-min"),
                _q("remaining_life", TIME, "governing remaining life", optional=True),
                Parameter("cladding_damage_percent", "number", "cladding damage over the insulated section", optional=True),
            ),
            _vessel_severity, ("severity", "basis", "required_action", "approver", "recommended_by", "approved_by"),
        ),
        Formula(
            "ffs.triggers", 1, "Fitness-For-Service triggers",
            "SOP-INS-021 Clauses 2.1-2.3",
            "raise FFS if below t-min, remaining life < 2 years, or local metal loss > 25% of nominal",
            (
                Parameter("locations_below_t_min", "text", "locations below t-min"),
                _q("remaining_life", TIME, "governing remaining life", optional=True),
                Parameter("local_metal_loss_percent", "number", "local metal loss at the governing location", optional=True),
            ),
            _ffs_triggers, ("triggers",),
        ),
        Formula(
            "relief.test_due", 1, "Next relief-device bench test",
            "SOP-INS-025 Clauses 2.1-2.2",
            "due = last_test_date + 48 months (clean service) or 24 months (fouling or corrosive service)",
            (
                Parameter("last_test_date", "date", "date of the last bench test"),
                Parameter("service", "text", "service of the protected equipment"),
                Parameter("as_of", "date", "date to judge overdue against", optional=True),
            ),
            _relief_test_due, ("interval_months", "due", "overdue", "days_overdue"),
        ),
        Formula(
            "relief.as_received_test", 1, "As-received relief-device test",
            "SOP-INS-025 Clauses 3.2-3.3; SOP-HSE-004 Clause 2.3",
            "fails if opening_pressure > 1.10 × set_pressure or the valve did not open; a failure is High",
            (
                _q("set_pressure", PRESSURE, "set pressure"),
                _q("opening_pressure", PRESSURE, "as-received opening pressure", optional=True),
                Parameter("did_not_open", "bool", "the valve did not open on test", optional=True),
            ),
            _relief_as_received, ("fail_above", "passed", "severity", "required_action", "approver", "report"),
        ),
        Formula(
            "relief.set_pressure_limit", 1, "Set pressure within MAWP",
            "SOP-INS-025 Clauses 4.1-4.2",
            "within_limit = set_pressure ≤ MAWP (including a re-rated MAWP)",
            (
                _q("set_pressure", PRESSURE, "set pressure"),
                _q("mawp", PRESSURE, "MAWP of the protected equipment"),
            ),
            _relief_set_limit, ("within_limit", "margin"),
        ),
        Formula(
            "relief.post_overhaul_setting", 1, "Setting tolerance after overhaul",
            "SOP-INS-025 Clause 3.4",
            "|popping − set| ≤ 3% of set, or ≤ 0.14 bar where set ≤ 4.8 bar(g)",
            (
                _q("set_pressure", PRESSURE, "set pressure"),
                _q("popping_pressure", PRESSURE, "pressure the valve opened at after setting"),
            ),
            _relief_post_overhaul, ("tolerance", "deviation", "within_tolerance"),
        ),
        Formula(
            "relief.inlet_loss", 1, "Relief-device inlet pressure loss",
            "SOP-INS-025 Clause 5.2",
            "within_limit = inlet_loss ≤ 3% of set_pressure",
            (
                _q("set_pressure", PRESSURE, "set pressure"),
                _q("inlet_loss", PRESSURE, "inlet pressure loss at relieving flow"),
            ),
            _relief_inlet_loss, ("loss_percent", "within_limit"),
        ),
        Formula(
            "envelope.interim_operating_pressure", 1, "Operating pressure for interim operation",
            "SOP-INS-021 Clause 6.1",
            "within_limit = operating_pressure ≤ 0.90 × MAWP, while the equipment awaits a "
            "Fitness-For-Service assessment",
            (
                _q("operating_pressure", PRESSURE, "operating pressure of the equipment"),
                _q("mawp", PRESSURE, "registered MAWP of the equipment"),
            ),
            _interim_operating_pressure, ("within_limit", "limit", "margin", "percent_of_mawp"),
        ),
        Formula(
            "ffs.rerated_mawp", 1, "Re-rated MAWP",
            "SOP-INS-021 Clause 5 (5.1-5.4); SOP-OPS-008 Clause 2.6",
            "MAWP_rerated = MAWP_original × RSF, 0 < RSF ≤ 1",
            (
                _q("mawp", PRESSURE, "registered (original) MAWP"),
                Parameter("rsf", "number", "remaining strength factor from the FFS assessment"),
            ),
            _rerated_mawp, ("mawp_rerated", "approver", "required_actions"),
        ),
        Formula(
            "ffs.interim_operation", 1, "Interim operation pending an FFS assessment",
            "SOP-INS-021 Clauses 6.1-6.2; SOP-OPS-008 Clause 2.8",
            "permitted only if no through-wall defect or leak, thickness ≥ t-min everywhere, "
            "operating pressure ≤ 0.90 × MAWP, inspected at most every 30 days, and within 180 days of the finding",
            (
                Parameter("through_wall_or_leak", "bool", "a through-wall defect or an active leak exists"),
                Parameter("below_t_min", "bool", "any location reads below t-min"),
                _q("operating_pressure", PRESSURE, "operating pressure during interim operation"),
                _q("mawp", PRESSURE, "registered MAWP"),
                _q("inspection_interval", TIME, "interval between inspections during interim operation"),
                Parameter("finding_date", "date", "date of the finding that triggered the assessment"),
                Parameter("planned_end", "date", "planned end of interim operation", optional=True),
            ),
            _interim_operation, ("permitted", "unmet", "operating_limit", "latest_end", "approver"),
        ),
    )
}


def get_formula(formula_id: str) -> Formula:
    try:
        return FORMULAS[formula_id]
    except KeyError as exc:
        raise KeyError(f"no registered formula {formula_id!r}") from exc


def catalogue() -> list[dict[str, Any]]:
    return [formula.describe() for formula in FORMULAS.values()]


# --------------------------------------------------------------- evaluation
def evaluate(
    formula_id: str,
    inputs: dict[str, BoundValue | None],
    *,
    subject: str | None = None,
) -> CalculationRecord:
    """Evaluate one formula on bound inputs, never raising for bad input.

    The record is the same shape whatever happens: ``calculated`` with every
    input and output, ``cannot_calculate`` naming what is missing, or
    ``refused`` naming what was wrong. Callers show all three.
    """
    formula = get_formula(formula_id)
    recorded = [bound.record(name) for name, bound in inputs.items() if bound is not None]
    base = dict(
        formula_id=formula.id,
        formula_version=formula.version,
        title=formula.title,
        clause=formula.clause,
        expression=formula.expression,
        subject=subject,
        inputs=recorded,
        formula_hash=formula.source_hash,
    )

    missing = [
        p.name for p in formula.parameters
        if not p.optional and (inputs.get(p.name) is None or inputs[p.name].value is None)
    ]
    if missing:
        return CalculationRecord(
            **base,
            status="cannot_calculate",
            missing=missing,
            reason="cannot calculate: missing " + ", ".join(missing),
        )

    values: dict[str, Any] = {}
    try:
        for parameter in formula.parameters:
            bound = inputs.get(parameter.name)
            if bound is None or bound.value is None:
                continue
            value = bound.value
            if parameter.kind == "quantity":
                if not isinstance(value, Quantity):
                    raise DimensionError(f"{parameter.name} must carry a unit")
                value.require(parameter.dimension or DIMENSIONLESS, parameter.name)
            elif parameter.kind == "date" and not isinstance(value, date):
                raise DimensionError(f"{parameter.name} must be a date")
            elif parameter.kind == "number":
                if isinstance(value, Quantity):
                    if value.dimension != DIMENSIONLESS:
                        raise DimensionError(
                            f"{parameter.name} must be a plain number; got {dimension_name(value.dimension)}"
                        )
                    value = value.value
                value = float(value)
            values[parameter.name] = value
        result = formula.compute(values)
    except (DimensionError, ValueError, ZeroDivisionError, TypeError) as exc:
        return CalculationRecord(**base, status="refused", reason=str(exc))

    display = str(result.pop("_display", "")) or None
    outputs = {name: {"value": value, "unit": unit} for name, (value, unit) in result.items()}
    input_hash = _sha([item.model_dump() for item in recorded])
    result_hash = _sha({"formula": formula.source_hash, "inputs": input_hash, "outputs": outputs})
    return CalculationRecord(
        **base,
        status="calculated",
        outputs=outputs,
        display=display,
        input_hash=input_hash,
        result_hash=result_hash,
    )


def output_value(record: CalculationRecord, name: str) -> Any:
    entry = record.outputs.get(name) or {}
    return entry.get("value")


def as_bound(record: CalculationRecord, name: str, unit: str) -> BoundValue | None:
    """Feed one formula's output into the next, keeping the chain visible."""
    if record.status != "calculated":
        return None
    value = output_value(record, name)
    if value is None:
        return None
    return BoundValue(
        value=Quantity.of(value, unit),
        stated=f"{value} {unit}",
        evidence_id=record.evidence_id,
        locator=f"output '{name}' of {record.formula_id}@{record.formula_version}",
    )
