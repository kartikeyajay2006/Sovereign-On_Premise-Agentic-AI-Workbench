"""The read-only connector interfaces.

A plant system -- a process historian, an OPC UA server, a CMMS, later a
document store -- is reached through an adapter that can only read. The
interface has no write, acknowledge or subscribe method, so an adapter cannot
be asked to change anything on the plant side; the tool that uses it
(``historian_read`` in ``backend/tools/registry.py``) is declared read-only in
``policies/tool-permissions.yaml`` as well.

Every value comes back as a :class:`Reading` that carries what the source
said about it: the timestamp the source recorded (never the time it was
read), the unit, and the quality. A bad-quality sample has no value, rather
than a zero or a last-known value that would read as a measurement.

A maintenance system answers a different question -- what work is raised
against a tag -- so it has its own interface, :class:`ReadOnlyMaintenanceSource`,
returning :class:`MaintenanceItem` records (``cmms_read`` in the registry).
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


#: Statuses in which a maintenance item still stands: raised and not closed.
OPEN_STATUSES = ("open", "released", "in_progress", "awaiting_shutdown")
#: Statuses in which it no longer does.
CLOSED_STATUSES = ("completed", "closed", "cancelled")


@dataclass(frozen=True)
class MaintenanceItem:
    """One work order or notification, as the maintenance system holds it.

    The fields are the common ground of SAP PM and Maximo (an order or
    notification number, the technical object it is raised against, a type,
    a status, dates) and nothing specific to either.
    """

    #: The CMMS's own number, e.g. ``WO-4000321`` or ``NOTIF-10402117``.
    id: str
    #: ``work_order`` or ``notification``.
    kind: str
    #: The equipment or functional-location tag it is raised against.
    tag: str
    title: str
    #: ``repair``, ``inspection``, ``test``, ``replacement``, ``assessment``.
    work_type: str
    #: One of :data:`OPEN_STATUSES` or :data:`CLOSED_STATUSES`.
    status: str
    priority: str
    #: ISO dates (YYYY-MM-DD) as the CMMS recorded them.
    raised_on: str
    planned_start: str | None
    closed_on: str | None
    raised_by: str
    #: The record that prompted it, e.g. an inspection report number.
    reference: str | None
    #: Which adapter served it, e.g. ``cmms:simulator``.
    source: str

    @property
    def is_open(self) -> bool:
        return self.status in OPEN_STATUSES

    def as_dict(self) -> dict[str, Any]:
        return {**asdict(self), "open": self.is_open}


@runtime_checkable
class ReadOnlyMaintenanceSource(Protocol):
    """What every maintenance-management (CMMS) adapter offers. Reads only.

    There is no create, update, release, confirm or close method: an adapter
    cannot be asked to raise or change a work order, only to say which ones
    exist for a tag.
    """

    name: str
    simulated: bool

    def describe(self) -> dict[str, Any]:
        """What the adapter is, where it reads from, and whether it is available."""

    def open_items(self, tag: str) -> list[MaintenanceItem]:
        """Every work order and notification raised against ``tag`` and not closed.

        An empty list means the source was asked and holds none; a source
        that cannot be asked raises :class:`ConnectorUnavailable` instead.
        """
