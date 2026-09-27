"""A maintenance-management system (CMMS), read-only, and its simulated dataset.

What the workbench asks a CMMS is one question: which work orders and
notifications are raised against this tag and not yet closed? The answer
lets an approval note say whether a repair is already raised, cited to the
lookup, instead of leaving the reviewer to check a second system.

The adapter implements :class:`backend.connectors.base.ReadOnlyMaintenanceSource`:
``describe`` and ``open_items``, and nothing else. There is no create,
release, confirm or close; the connection is opened with SQLite's
``mode=ro`` URI, so the driver itself refuses writes.

Modes
-----

* ``simulator`` -- the only mode implemented. A SQLite database of SIMULATED
  work orders and notifications for the demonstration plant, written by
  ``scripts/seed_cmms.py`` (and by ``scripts/seed_demo_data.py``) from the
  fixed records below. It says it is simulated in its ``meta`` table and on
  every item it serves.
* ``live`` -- declared so a configuration can name it, and refused. No client
  for a real CMMS exists in this build. A SAP PM (notifications and orders
  against a functional location) or IBM Maximo (work orders against an asset)
  client would implement the same two methods, mapping its own statuses onto
  :data:`~backend.connectors.base.OPEN_STATUSES`; until one is written, live
  mode reports "not implemented" and reads nothing. Its endpoint must in any
  case be a literal address inside ``sovereignty.allowed_cidrs``: a hostname
  would need a DNS lookup, which is denied outright.

The simulated records are consistent with the demonstration scenario:
INS-2026-0417 found corrosion under insulation on V-2104 shell course 2 and
recommended repairing the cladding and insulation, so a notification and a
repair order are open against V-2104; PSV-2104A's March 2026 bench test and
overhaul (PRV-2026-0311) is a closed order, so nothing is open against the
valve; V-2107 was withdrawn on 2026-05-18 (INS-2026-0588) and has an open
assessment order.
"""

from __future__ import annotations

import ipaddress
import re
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from backend.connectors.base import (
    CLOSED_STATUSES,
    OPEN_STATUSES,
    ConnectorUnavailable,
    MaintenanceItem,
    UnknownTag,
)

#: An equipment or functional-location tag: V-2104, PSV-2104A, P-2104-OVHD-01.
TAG_PATTERN = re.compile(r"^[A-Z]{1,4}-\d{2,5}[A-Z]?(?:-[A-Z0-9]+)*$")

#: The date the simulated CMMS extract stands for.
SIM_AS_OF = "2026-09-20"

# Technical objects the simulated CMMS knows. A tag outside this list is not
# "a tag with no work raised": it is unknown to the CMMS, and said so.
SIMULATED_OBJECTS: tuple[tuple[str, str], ...] = (
    ("V-2101", "Feed Surge Drum"),
    ("V-2104", "Crude Overhead Knock-Out Drum"),
    ("V-2107", "Amine Flash Drum"),
    ("V-2110", "Steam Condensate Pot"),
    ("V-2115", "Fuel Gas KO Drum"),
    ("V-2118", "Reflux Accumulator"),
    ("PSV-2104A", "Relief valve on V-2104, set 10.5 bar(g)"),
    ("P-2104-OVHD-01", "Crude overhead line, C-2101 to V-2104"),
)

# id, kind, tag, title, work type, status, priority, raised, planned start, closed, raised by, reference
SIMULATED_ITEMS: tuple[tuple[str, str, str, str, str, str, str, str, str | None, str | None, str, str | None], ...] = (
    ("NOTIF-10402117", "notification", "V-2104",
     "Corrosion under insulation on shell course 2: cladding damaged over about 35%, insulation waterlogged",
     "repair", "in_progress", "medium", "2026-02-19", None, None,
     "R. Menon, Inspection Engineer (fictional)", "INS-2026-0417"),
    ("WO-4000321", "work_order", "V-2104",
     "Repair cladding and insulation on shell course 2 (SOP-MNT-022)",
     "repair", "awaiting_shutdown", "medium", "2026-02-24", "2026-11-09", None,
     "Maintenance Planner, Area 21 (fictional)", "NOTIF-10402117"),
    ("WO-4000298", "work_order", "PSV-2104A",
     "Bench test and overhaul PSV-2104A (SOP-INS-025)",
     "test", "closed", "high", "2026-02-02", "2026-03-12", "2026-03-12",
     "Maintenance Planner, Area 21 (fictional)", "PRV-2026-0311"),
    ("NOTIF-10402490", "notification", "V-2107",
     "Shell course 1 below t-min; vessel withdrawn from service",
     "assessment", "open", "high", "2026-05-18", None, None,
     "Inspection Engineer (fictional)", "INS-2026-0588"),
    ("WO-4000355", "work_order", "V-2107",
     "Engineering assessment for repair or replacement of V-2107 (SOP-INS-021)",
     "assessment", "released", "high", "2026-05-20", "2026-10-05", None,
     "Maintenance Planner, Area 21 (fictional)", "NOTIF-10402490"),
    ("WO-3990112", "work_order", "V-2118",
     "Thickness survey, shell course 2 (SOP-INS-014)",
     "inspection", "completed", "medium", "2025-05-26", "2025-06-10", "2025-06-10",
     "Inspection Planner (fictional)", None),
)


def build_simulated_cmms(path: Path) -> Path:
    """Write the simulated CMMS to ``path``, replacing any earlier build."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    statuses = ", ".join(f"'{status}'" for status in (*OPEN_STATUSES, *CLOSED_STATUSES))
    connection = sqlite3.connect(path)
    try:
        connection.executescript(
            f"""
            CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE technical_objects (tag TEXT PRIMARY KEY, description TEXT NOT NULL);
            CREATE TABLE items (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL CHECK (kind IN ('work_order', 'notification')),
                tag TEXT NOT NULL REFERENCES technical_objects(tag),
                title TEXT NOT NULL, work_type TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ({statuses})),
                priority TEXT NOT NULL, raised_on TEXT NOT NULL, planned_start TEXT,
                closed_on TEXT, raised_by TEXT NOT NULL, reference TEXT
            );
            """
        )
        connection.executemany(
            "INSERT INTO meta VALUES (?, ?)",
            [("status", "SIMULATED"),
             ("as_of", SIM_AS_OF),
             ("note", "Synthetic CMMS extract for the AEGIS demonstration. Fictional plant; "
                      "not work orders from any real maintenance system."),
             ("generator", "backend/connectors/cmms.py:build_simulated_cmms")],
        )
        connection.executemany("INSERT INTO technical_objects VALUES (?, ?)", SIMULATED_OBJECTS)
        connection.executemany("INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", SIMULATED_ITEMS)
        connection.commit()
    finally:
        connection.close()
    return path


def endpoint_is_local(endpoint: str, allowed_cidrs: list[str]) -> bool:
    """True only for a literal address inside the sovereignty ranges.

    A hostname is refused rather than resolved: resolving it is a DNS lookup,
    which the policy denies for every role.
    """
    host = urlparse(endpoint if "://" in endpoint else f"//{endpoint}").hostname
    if not host:
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    for cidr in allowed_cidrs:
        try:
            if address in ipaddress.ip_network(str(cidr), strict=False):
                return True
        except ValueError:
            continue
    return False


class CMMSConnector:
    """Read-only CMMS adapter: open work orders and notifications for a tag."""

    def __init__(self, *, mode: str = "simulator", path: Path | None = None, endpoint: str | None = None,
                 allowed_cidrs: list[str] | None = None) -> None:
        if mode not in ("simulator", "live"):
            raise ValueError(f"unknown CMMS mode {mode!r}; simulator or live")
        self.mode = mode
        self.path = path
        self.endpoint = endpoint or None
        self.allowed_cidrs = list(allowed_cidrs or ["127.0.0.0/8", "::1/128"])
        self.name = f"cmms:{mode}"

    @property
    def simulated(self) -> bool:
        return self.mode == "simulator"

    # -- availability --------------------------------------------------------
    def _unavailable(self) -> str | None:
        if self.mode == "live":
            if self.endpoint and not endpoint_is_local(self.endpoint, self.allowed_cidrs):
                return (f"CMMS endpoint {self.endpoint} is not a literal address inside "
                        "sovereignty.allowed_cidrs; nothing was contacted")
            return ("live CMMS mode is not implemented in this build: there is no SAP PM or Maximo "
                    "client; one would implement ReadOnlyMaintenanceSource (backend/connectors/base.py)")
        if self.path is None or not self.path.exists():
            name = self.path.name if self.path is not None else "(none configured)"
            return (f"CMMS database {name} does not exist; run python scripts/seed_cmms.py "
                    "to build the simulated one")
        return None

    def _connect(self) -> sqlite3.Connection:
        reason = self._unavailable()
        if reason:
            raise ConnectorUnavailable(reason)
        assert self.path is not None
        # mode=ro: the driver refuses any write on this connection.
        connection = sqlite3.connect(f"{self.path.resolve().as_uri()}?mode=ro", uri=True)
        connection.row_factory = sqlite3.Row
        return connection

    def _meta(self) -> dict[str, str]:
        with closing(self._connect()) as connection:
            try:
                return {row["key"]: row["value"] for row in connection.execute("SELECT key, value FROM meta")}
            except sqlite3.OperationalError:
                return {}

    def describe(self) -> dict[str, Any]:
        reason = self._unavailable()
        meta: dict[str, str] = {}
        if reason is None:
            try:
                meta = self._meta()
            except (ConnectorUnavailable, sqlite3.DatabaseError) as exc:
                reason = str(exc)
        return {"name": self.name, "mode": self.mode,
                "path": str(self.path) if self.mode == "simulator" and self.path else None,
                "endpoint": self.endpoint if self.mode == "live" else None,
                "available": reason is None, "unavailable_reason": reason,
                "simulated": self.simulated, "as_of": meta.get("as_of"), "note": meta.get("note"),
                "read_only": True}

    # -- reads -----------------------------------------------------------------
    def open_items(self, tag: str) -> list[MaintenanceItem]:
        wanted = tag.strip().upper()
        with closing(self._connect()) as connection:
            obj = connection.execute(
                "SELECT tag FROM technical_objects WHERE upper(tag) = ?", [wanted]
            ).fetchone()
            if obj is None:
                raise UnknownTag(f"{tag} is not a technical object in {self.name}")
            placeholders = ", ".join("?" for _ in OPEN_STATUSES)
            rows = connection.execute(
                "SELECT id, kind, tag, title, work_type, status, priority, raised_on, planned_start, "
                f"closed_on, raised_by, reference FROM items WHERE tag = ? AND status IN ({placeholders}) "
                "ORDER BY kind DESC, raised_on, id",
                [obj["tag"], *OPEN_STATUSES],
            ).fetchall()
        return [MaintenanceItem(**dict(row), source=self.name) for row in rows]

    def as_of(self) -> str | None:
        return self._meta().get("as_of")


# ----------------------------------------------------------------- the note
def source_label(connector_name: str, simulated: bool) -> str:
    """How the note names the source: ``CMMS (simulator)``, never just "CMMS"."""
    return "CMMS (simulator)" if simulated else f"CMMS ({connector_name})"


def _describe_item(item: dict[str, Any]) -> str:
    status = str(item.get("status") or "").replace("_", " ")
    planned = f", planned start {item['planned_start']}" if item.get("planned_start") else ""
    return f"{item['id']} ({item.get('work_type')}, {status}{planned}): {item.get('title')}"


def repair_status_sentence(
    tag: str, items: list[dict[str, Any]], *, evidence_id: str | None, label: str,
    unavailable: str | None = None,
) -> str:
    """The approval note's sentence on whether a repair is already raised.

    Written from the CMMS lookup, never by the model: ``items`` are the open
    items the connector returned, ``evidence_id`` the W item that records
    the lookup. When the CMMS could not be asked, the sentence says so and
    claims nothing either way.
    """
    if unavailable:
        return (f"{label} could not be read for {tag} ({unavailable}), so whether a repair is "
                "already raised is not known.")
    cite = f" [{evidence_id}]" if evidence_id else ""
    orders = [item for item in items if item.get("kind") == "work_order"]
    notifications = [item for item in items if item.get("kind") == "notification"]
    if orders:
        sentence = (f"A work order is already raised for {tag} in {label}: "
                    + "; ".join(_describe_item(item) for item in orders) + ".")
    else:
        sentence = f"No open work order found in {label} for {tag}."
    if notifications:
        sentence += (f" Open notification{'s' if len(notifications) > 1 else ''}: "
                     + "; ".join(_describe_item(item) for item in notifications) + ".")
    # The citation goes before the closing full stop, as the notes cite.
    return sentence[:-1] + cite + "." if cite else sentence
