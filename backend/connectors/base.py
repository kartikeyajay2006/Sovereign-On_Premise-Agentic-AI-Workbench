"""The read-only connector interface.

A plant system -- a process historian, an OPC UA server, later a CMMS or a
document store -- is reached through an adapter that can only read. The
interface has no write, acknowledge or subscribe method, so an adapter cannot
be asked to change anything on the plant side; the tool that uses it
(``historian_read`` in ``backend/tools/registry.py``) is declared read-only in
``policies/tool-permissions.yaml`` as well.

Every value comes back as a :class:`Reading` that carries what the source
said about it: the timestamp the source recorded (never the time it was
read), the unit, and the quality. A bad-quality sample has no value, rather
than a zero or a last-known value that would read as a measurement.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any, Protocol, runtime_checkable

QUALITIES = ("good", "uncertain", "bad")


class ConnectorUnavailable(RuntimeError):
    """The source cannot be reached or is not set up on this host.

    Raised instead of returning an empty result, so "nothing recorded" and
    "could not ask" are never confused.
    """


class UnknownTag(LookupError):
    pass


@dataclass(frozen=True)
class TagInfo:
    tag: str
    equipment: str | None
    measurement: str
    unit: str
    description: str

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class Reading:
    tag: str
    #: When the source recorded the sample (ISO 8601, UTC).
    timestamp: str
    #: None when the quality is bad: there is no value to report.
    value: float | None
    unit: str
    quality: str
    #: The source's reason for a quality other than good, e.g. ``comm_failure``.
    quality_reason: str | None
    #: Which adapter served it, e.g. ``historian:sqlite`` or ``opcua:simulator``.
    source: str

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@runtime_checkable
class ReadOnlyConnector(Protocol):
    """What every plant-data adapter offers. Reads only."""

    #: Stable identifier recorded on every reading, e.g. ``historian:sqlite``.
    name: str
    #: True when the values are simulated rather than read from a plant system.
    simulated: bool

    def describe(self) -> dict[str, Any]:
        """What the adapter is, where it reads from, and whether it is available."""

    def tags(self) -> list[TagInfo]:
        """Every tag the source serves."""

    def tags_for(self, tag_or_equipment: str) -> list[TagInfo]:
        """A tag itself, or every tag measuring a piece of equipment."""

    def read(
        self,
        tag: str,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 24,
    ) -> list[Reading]:
        """Samples for one tag in ``[start, end]``, newest last, at most ``limit``."""
