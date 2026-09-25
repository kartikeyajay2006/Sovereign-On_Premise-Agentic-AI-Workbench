"""Unit-aware quantities, with no dependency beyond the standard library.

A quantity carries a value in a base unit and a dimension. Adding a pressure
to a thickness raises :class:`DimensionError` before any arithmetic happens,
and every conversion is exact to the factors below. The set of units is the
set the procedures and reports in this corpus use; an unknown unit is refused,
never guessed.

Base units: length in millimetres, time in years, pressure in megapascals,
temperature in degrees Celsius. They are the units the SOP formulas are
written in, so a normalised input is already in the form the clause states.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

# Dimension exponents: (length, time, pressure, temperature).
Dimension = tuple[int, int, int, int]

DIMENSIONLESS: Dimension = (0, 0, 0, 0)
LENGTH: Dimension = (1, 0, 0, 0)
TIME: Dimension = (0, 1, 0, 0)
PRESSURE: Dimension = (0, 0, 1, 0)
TEMPERATURE: Dimension = (0, 0, 0, 1)
RATE: Dimension = (1, -1, 0, 0)  # length per time, e.g. mm/year

DIMENSION_NAMES: dict[Dimension, str] = {
    DIMENSIONLESS: "dimensionless",
    LENGTH: "length",
    TIME: "time",
    PRESSURE: "pressure",
    TEMPERATURE: "temperature",
    RATE: "corrosion rate (length per time)",
}

BASE_UNIT: dict[Dimension, str] = {
    DIMENSIONLESS: "",
    LENGTH: "mm",
    TIME: "year",
    PRESSURE: "MPa",
    TEMPERATURE: "degC",
    RATE: "mm/year",
}

_YEAR_DAYS = 365.25

# unit text (lower case) -> (factor to base unit, dimension, gauge?)
_UNITS: dict[str, tuple[float, Dimension]] = {
    # length -> mm
    "mm": (1.0, LENGTH),
    "millimetre": (1.0, LENGTH),
    "millimeter": (1.0, LENGTH),
    "cm": (10.0, LENGTH),
    "m": (1000.0, LENGTH),
    "um": (0.001, LENGTH),
    "µm": (0.001, LENGTH),
    "in": (25.4, LENGTH),
    "inch": (25.4, LENGTH),
    "\"": (25.4, LENGTH),
    "mil": (0.0254, LENGTH),
    "mils": (0.0254, LENGTH),
    # time -> year
    "year": (1.0, TIME),
    "years": (1.0, TIME),
    "yr": (1.0, TIME),
    "yrs": (1.0, TIME),
    "y": (1.0, TIME),
    "a": (1.0, TIME),
    "month": (1.0 / 12.0, TIME),
    "months": (1.0 / 12.0, TIME),
    "mo": (1.0 / 12.0, TIME),
    "week": (7.0 / _YEAR_DAYS, TIME),
    "weeks": (7.0 / _YEAR_DAYS, TIME),
    "day": (1.0 / _YEAR_DAYS, TIME),
    "days": (1.0 / _YEAR_DAYS, TIME),
    "d": (1.0 / _YEAR_DAYS, TIME),
    "h": (1.0 / (_YEAR_DAYS * 24), TIME),
    "hr": (1.0 / (_YEAR_DAYS * 24), TIME),
    "hrs": (1.0 / (_YEAR_DAYS * 24), TIME),
    "hours": (1.0 / (_YEAR_DAYS * 24), TIME),
    # pressure -> MPa (gauge and absolute are both accepted; see `gauge`)
    "mpa": (1.0, PRESSURE),
    "kpa": (0.001, PRESSURE),
    "pa": (1e-6, PRESSURE),
    "gpa": (1000.0, PRESSURE),
    "bar": (0.1, PRESSURE),
    "barg": (0.1, PRESSURE),
    "bar(g)": (0.1, PRESSURE),
    "bar g": (0.1, PRESSURE),
    "psi": (0.00689475729, PRESSURE),
    "psig": (0.00689475729, PRESSURE),
    "ksi": (6.89475729, PRESSURE),
    "kgf/cm2": (0.0980665, PRESSURE),
    "kg/cm2": (0.0980665, PRESSURE),
    "n/mm2": (1.0, PRESSURE),
    # temperature -> degC (conversion handled separately; affine)
    "degc": (1.0, TEMPERATURE),
    "°c": (1.0, TEMPERATURE),
    "deg c": (1.0, TEMPERATURE),
    "c": (1.0, TEMPERATURE),
    # rates -> mm/year
    "mpy": (0.0254, RATE),
    # dimensionless
    "%": (0.01, DIMENSIONLESS),
    "percent": (0.01, DIMENSIONLESS),
    "": (1.0, DIMENSIONLESS),
}

_GAUGE = {"barg", "bar(g)", "bar g", "psig"}
_FAHRENHEIT = {"degf", "°f", "deg f", "f"}


class UnitError(ValueError):
    """A unit that is not in the table. Refused rather than guessed."""


class DimensionError(ValueError):
    """An operation or input whose dimension is wrong, e.g. pressure + thickness."""


def dimension_name(dimension: Dimension) -> str:
    return DIMENSION_NAMES.get(dimension, f"dimension {dimension}")


def _combine(a: Dimension, b: Dimension, sign: int) -> Dimension:
    return tuple(x + sign * y for x, y in zip(a, b))  # type: ignore[return-value]


@dataclass(frozen=True)
class Quantity:
    """A value in its base unit, its dimension, and how it was written."""

    value: float
    dimension: Dimension
    stated: str = ""
    gauge: bool = False

    # -- construction -----------------------------------------------------
    @classmethod
    def of(cls, value: float, unit: str) -> "Quantity":
        return parse_quantity(f"{value} {unit}")

    # -- conversion -------------------------------------------------------
    @property
    def unit(self) -> str:
        return BASE_UNIT.get(self.dimension, "")

    def to(self, unit: str) -> float:
        key = _normalise_unit(unit)
        if self.dimension == TEMPERATURE:
            if key in _FAHRENHEIT:
                return self.value * 9.0 / 5.0 + 32.0
            if key in _UNITS and _UNITS[key][1] == TEMPERATURE:
                return self.value
            raise DimensionError(f"cannot express a temperature in {unit!r}")
        factor, dimension = _lookup(key)
        if dimension != self.dimension:
            raise DimensionError(
                f"cannot express {dimension_name(self.dimension)} in {unit!r} "
                f"({dimension_name(dimension)})"
            )
        return self.value / factor

    # -- arithmetic -------------------------------------------------------
    def _same(self, other: "Quantity", operation: str) -> None:
        if not isinstance(other, Quantity):
            raise DimensionError(f"cannot {operation} a quantity and a bare number")
        if other.dimension != self.dimension:
            raise DimensionError(
                f"cannot {operation} {dimension_name(self.dimension)} and "
                f"{dimension_name(other.dimension)}"
            )
        if TEMPERATURE in (self.dimension,):
            raise DimensionError(f"cannot {operation} temperatures")

    def __add__(self, other: "Quantity") -> "Quantity":
        self._same(other, "add")
        return Quantity(self.value + other.value, self.dimension)

    def __sub__(self, other: "Quantity") -> "Quantity":
        self._same(other, "subtract")
        return Quantity(self.value - other.value, self.dimension)

    def __mul__(self, other: "Quantity | float | int") -> "Quantity":
        if isinstance(other, Quantity):
            return Quantity(self.value * other.value, _combine(self.dimension, other.dimension, 1))
        return Quantity(self.value * float(other), self.dimension)

    __rmul__ = __mul__

    def __truediv__(self, other: "Quantity | float | int") -> "Quantity":
        if isinstance(other, Quantity):
            if other.value == 0:
                raise ZeroDivisionError("division by a zero quantity")
            return Quantity(self.value / other.value, _combine(self.dimension, other.dimension, -1))
        return Quantity(self.value / float(other), self.dimension)

    def __lt__(self, other: "Quantity") -> bool:
        self._same(other, "compare")
        return self.value < other.value

    def __gt__(self, other: "Quantity") -> bool:
        self._same(other, "compare")
        return self.value > other.value

    def require(self, dimension: Dimension, name: str) -> "Quantity":
        """Refuse an input whose dimension is not the one a formula needs."""
        if self.dimension != dimension:
            shown = self.stated or f"{self.value} {self.unit}".strip()
            raise DimensionError(
                f"{name} must be a {dimension_name(dimension)}; got "
                f"{dimension_name(self.dimension)} ({shown})"
            )
        if not math.isfinite(self.value):
            raise DimensionError(f"{name} is not a finite number")
        return self

    def __str__(self) -> str:
        return f"{_trim(self.value)} {self.unit}".strip()


def _trim(value: float) -> str:
    text = f"{value:.6f}".rstrip("0").rstrip(".")
    return text or "0"


def _normalise_unit(unit: str) -> str:
    text = unit.strip().lower().replace("²", "2").replace(" per ", "/")
    text = re.sub(r"\s+", " ", text)
    return text


def _lookup(key: str) -> tuple[float, Dimension]:
    if key in _UNITS:
        return _UNITS[key]
    # Compound "length/time", e.g. mm/yr, mm/year, mm/y, in/yr.
    if "/" in key:
        top, bottom = (part.strip() for part in key.split("/", 1))
        if top in _UNITS and bottom in _UNITS:
            top_factor, top_dim = _UNITS[top]
            bottom_factor, bottom_dim = _UNITS[bottom]
            return top_factor / bottom_factor, _combine(top_dim, bottom_dim, -1)
    raise UnitError(f"unknown unit {key!r}")


_QUANTITY = re.compile(
    r"^\s*(?P<value>[-+]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?)\s*(?P<unit>.*?)\s*$"
)


def parse_quantity(text: str, *, default_unit: str | None = None) -> Quantity:
    """Parse "11.6 mm", "0.55 mm/year", "10.5 bar(g)", "35%", "145 deg C".

    Only the leading number and the unit immediately after it are read. Any
    trailing annotation in brackets, such as "6.0 mm (INS-014 Cl. 3.2)", is
    dropped before the unit is looked up.
    """
    source = str(text)
    cleaned = re.sub(r"\((?!g\))[^)]*\)\s*$", "", source.strip()).strip()
    match = _QUANTITY.match(cleaned)
    if match is None:
        raise UnitError(f"not a quantity: {source!r}")
    value = float(match.group("value").replace(",", "."))
    unit_text = match.group("unit").strip() or (default_unit or "")
    key = _normalise_unit(unit_text)
    if key in _FAHRENHEIT:
        return Quantity((value - 32.0) * 5.0 / 9.0, TEMPERATURE, stated=source.strip())
    factor, dimension = _lookup(key)
    return Quantity(value * factor, dimension, stated=source.strip(), gauge=key in _GAUGE)
