"""A process historian held in SQLite, read-only, and its simulated dataset.

The adapter opens the database with SQLite's ``mode=ro`` URI, so the
connection itself refuses writes -- read-only is enforced by the driver, not
only promised by the interface.

Two tables:

* ``tags(tag, equipment, measurement, unit, description)``
* ``samples(tag, ts, value, quality, quality_reason)`` -- ``ts`` is ISO 8601
  UTC; ``value`` is NULL when the quality is bad.

The demonstration historian is SIMULATED: :func:`build_simulated_historian`
generates two weeks of hourly samples for the instruments on V-2104 and
V-2107 from a fixed seed, so every build of it is identical. It is written by
``scripts/seed_historian.py`` (and by ``scripts/seed_demo_data.py``), and it
says it is simulated in its own ``meta`` table and on every reading served.
"""

from __future__ import annotations

import math
import random
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from backend.connectors.base import ConnectorUnavailable, Reading, TagInfo, UnknownTag

MAX_LIMIT = 500

# The simulated instruments. Base values sit inside each vessel's normal
# operating envelope; PSV-2104A on V-2104 is set at 10.5 bar(g).
SIMULATED_TAGS: tuple[TagInfo, ...] = (
    TagInfo("PT-2104", "V-2104", "pressure", "bar(g)", "Crude overhead KO drum pressure"),
    TagInfo("TT-2104", "V-2104", "temperature", "degC", "Crude overhead KO drum temperature"),
    TagInfo("LT-2104A", "V-2104", "level", "%", "Crude overhead KO drum hydrocarbon level"),
    TagInfo("PT-2107", "V-2107", "pressure", "bar(g)", "Amine flash drum pressure"),
    TagInfo("TT-2107", "V-2107", "temperature", "degC", "Amine flash drum temperature"),
)
_PROFILE = {
    # tag: (base, daily swing, noise)
    "PT-2104": (6.8, 0.25, 0.06),
    "TT-2104": (42.0, 3.0, 0.4),
    "LT-2104A": (50.0, 4.0, 1.2),
    "PT-2107": (4.2, 0.15, 0.05),
    "TT-2107": (55.0, 2.0, 0.3),
}
SIM_START = datetime(2026, 5, 11, tzinfo=timezone.utc)
SIM_HOURS = 14 * 24
# V-2107 was withdrawn on 2026-05-18 (sample_data/datasets/inspection-history.csv):
# from then its instruments report out of service, with no value.
V2107_WITHDRAWN = datetime(2026, 5, 18, tzinfo=timezone.utc)
# A six-hour communications outage on PT-2104, so bad quality is exercised.
PT2104_OUTAGE = (datetime(2026, 5, 20, 2, tzinfo=timezone.utc), datetime(2026, 5, 20, 8, tzinfo=timezone.utc))


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def simulated_samples() -> list[tuple[str, str, float | None, str, str | None]]:
    """Every simulated sample, deterministically: the same rows on every call."""
    rows: list[tuple[str, str, float | None, str, str | None]] = []
    for info in SIMULATED_TAGS:
        base, swing, noise = _PROFILE[info.tag]
        rng = random.Random(f"aegis-historian:{info.tag}")
        for hour in range(SIM_HOURS):
            moment = SIM_START + timedelta(hours=hour)
            daily = math.sin(2 * math.pi * (hour % 24) / 24)
            value: float | None = round(base + swing * daily + rng.gauss(0, noise), 2)
            quality, reason = "good", None
            draw = rng.random()
            if info.equipment == "V-2107" and moment >= V2107_WITHDRAWN:
                value, quality, reason = None, "bad", "out_of_service"
            elif info.tag == "PT-2104" and PT2104_OUTAGE[0] <= moment < PT2104_OUTAGE[1]:
                value, quality, reason = None, "bad", "comm_failure"
            elif draw < 0.01:
                quality, reason = "uncertain", "sensor_calibration_due"
            rows.append((info.tag, _iso(moment), value, quality, reason))
    return rows


def build_simulated_historian(path: Path) -> Path:
    """Write the simulated historian to ``path``, replacing any earlier build."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    connection = sqlite3.connect(path)
    try:
        connection.executescript(
            """
            CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE tags (
                tag TEXT PRIMARY KEY, equipment TEXT, measurement TEXT NOT NULL,
                unit TEXT NOT NULL, description TEXT NOT NULL
            );
            CREATE TABLE samples (
                tag TEXT NOT NULL REFERENCES tags(tag), ts TEXT NOT NULL, value REAL,
                quality TEXT NOT NULL CHECK (quality IN ('good', 'uncertain', 'bad')),
                quality_reason TEXT, PRIMARY KEY (tag, ts)
            );
            """
        )
        connection.executemany(
            "INSERT INTO meta VALUES (?, ?)",
            [("status", "SIMULATED"),
             ("note", "Synthetic historian for the AEGIS demonstration. Fictional plant; "
                      "not measurements from any real equipment."),
             ("generator", "backend/connectors/historian.py:build_simulated_historian")],
        )
        connection.executemany(
            "INSERT INTO tags VALUES (?, ?, ?, ?, ?)",
            [(t.tag, t.equipment, t.measurement, t.unit, t.description) for t in SIMULATED_TAGS],
        )
        connection.executemany("INSERT INTO samples VALUES (?, ?, ?, ?, ?)", simulated_samples())
        connection.commit()
    finally:
        connection.close()
    return path


class SQLiteHistorian:
    """Read-only adapter over a historian database file."""

    name = "historian:sqlite"

    def __init__(self, path: Path) -> None:
        self.path = path

    def _connect(self) -> sqlite3.Connection:
        if not self.path.exists():
            raise ConnectorUnavailable(
                f"historian database {self.path.name} does not exist; run "
                "python scripts/seed_historian.py to build the simulated one"
            )
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

    @property
    def simulated(self) -> bool:
        try:
            return self._meta().get("status") == "SIMULATED"
        except ConnectorUnavailable:
            return False

    def describe(self) -> dict[str, Any]:
        try:
            meta = self._meta()
            available, reason = True, None
        except ConnectorUnavailable as exc:
            meta, available, reason = {}, False, str(exc)
        return {"name": self.name, "path": str(self.path), "available": available,
                "unavailable_reason": reason, "simulated": meta.get("status") == "SIMULATED",
                "note": meta.get("note"), "read_only": True}

    def tags(self) -> list[TagInfo]:
        with closing(self._connect()) as connection:
            rows = connection.execute(
                "SELECT tag, equipment, measurement, unit, description FROM tags ORDER BY tag"
            ).fetchall()
        return [TagInfo(**dict(row)) for row in rows]

    def tags_for(self, tag_or_equipment: str) -> list[TagInfo]:
        wanted = tag_or_equipment.strip().upper()
        known = self.tags()
        exact = [t for t in known if t.tag.upper() == wanted]
        return exact or [t for t in known if (t.equipment or "").upper() == wanted]

    def read(
        self,
        tag: str,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 24,
    ) -> list[Reading]:
        info = next((t for t in self.tags() if t.tag.upper() == tag.strip().upper()), None)
        if info is None:
            raise UnknownTag(f"{tag} is not a tag in the historian")
        limit = max(1, min(int(limit), MAX_LIMIT))
        clauses, values = ["tag = ?"], [info.tag]
        if start is not None:
            clauses.append("ts >= ?")
            values.append(_iso(start))
        if end is not None:
            clauses.append("ts <= ?")
            values.append(_iso(end))
        with closing(self._connect()) as connection:
            # The newest `limit` samples in the window, then put back in time order.
            rows = connection.execute(
                f"SELECT ts, value, quality, quality_reason FROM samples WHERE {' AND '.join(clauses)} "
                "ORDER BY ts DESC LIMIT ?",
                [*values, limit],
            ).fetchall()
        return [
            Reading(tag=info.tag, timestamp=row["ts"], value=row["value"], unit=info.unit,
                    quality=row["quality"], quality_reason=row["quality_reason"], source=self.name)
            for row in reversed(rows)
        ]
