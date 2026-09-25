"""OPC UA behind the read-only connector interface.

Two modes:

* ``simulator`` -- serves the historian's tags as OPC UA variables
  (``ns=2;s=<tag>``) from the SQLite historian, so the demonstration works
  with no server and no network. A read returns the historian's samples with
  their own timestamps and quality; it is never restamped as "now", so a
  simulated value cannot pass for a live one.
* ``live`` -- reads a real server with the optional ``asyncua`` library. It is
  not in ``requirements.txt``: the import is guarded, and without it the
  adapter says "not installed" rather than falling back to anything. Live mode
  reads the current value of a variable only (no history), and the endpoint
  must be declared in ``config/app.yaml``; the sovereignty monitor records any
  connection outside the allowed local ranges.

There is no write, method call or subscription in either mode.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend.connectors.base import ConnectorUnavailable, Reading, TagInfo, UnknownTag
from backend.connectors.historian import SQLiteHistorian

NAMESPACE = 2


def node_id(tag: str) -> str:
    return f"ns={NAMESPACE};s={tag}"


def asyncua_installed() -> bool:
    try:
        import asyncua  # noqa: F401
    except ImportError:
        return False
    return True


# OPC UA StatusCode severity is the top two bits: 00 good, 01 uncertain, 1x bad.
def _quality(status_code: int) -> str:
    severity = (status_code >> 30) & 0b11
    return "good" if severity == 0 else "uncertain" if severity == 1 else "bad"


class OPCUAConnector:
    """Read-only OPC UA adapter, simulated from the historian or live via asyncua."""

    def __init__(self, *, mode: str = "simulator", endpoint: str | None = None,
                 historian: SQLiteHistorian | None = None, tags: list[TagInfo] | None = None) -> None:
        if mode not in ("simulator", "live"):
            raise ValueError(f"unknown OPC UA mode {mode!r}; simulator or live")
        self.mode = mode
        self.endpoint = endpoint or None
        self.historian = historian
        # Live mode has no tag catalogue of its own here: the tags it may read
        # are the ones declared (by default, the historian's).
        self._declared = tags
        self.name = f"opcua:{mode}"

    @property
    def simulated(self) -> bool:
        return self.mode == "simulator"

    def _unavailable(self) -> str | None:
        if self.mode == "simulator":
            if self.historian is None:
                return "the OPC UA simulator has no historian to serve from"
            return self.historian.describe()["unavailable_reason"]
        if not asyncua_installed():
            return "OPC UA live mode needs the asyncua library, which is not installed"
        if not self.endpoint:
            return "OPC UA live mode has no endpoint configured (connectors.opcua.endpoint)"
        return None

    def describe(self) -> dict[str, Any]:
        reason = self._unavailable()
        return {"name": self.name, "mode": self.mode, "endpoint": self.endpoint if self.mode == "live" else None,
                "available": reason is None, "unavailable_reason": reason, "simulated": self.simulated,
                "library_installed": asyncua_installed(), "namespace": NAMESPACE, "read_only": True}

    def _require(self) -> None:
        reason = self._unavailable()
        if reason:
            raise ConnectorUnavailable(reason)

    def tags(self) -> list[TagInfo]:
        self._require()
        if self._declared is not None:
            return list(self._declared)
        assert self.historian is not None
        return self.historian.tags()

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
        self._require()
        info = next((t for t in self.tags() if t.tag.upper() == tag.strip().upper()), None)
        if info is None:
            raise UnknownTag(f"{tag} is not served at {node_id(tag)}")
        if self.mode == "simulator":
            assert self.historian is not None
            return [
                Reading(tag=r.tag, timestamp=r.timestamp, value=r.value, unit=r.unit, quality=r.quality,
                        quality_reason=r.quality_reason, source=self.name)
                for r in self.historian.read(info.tag, start=start, end=end, limit=limit)
            ]
        if start is not None or end is not None:
            raise ConnectorUnavailable("OPC UA live mode reads current values only; ask the historian for a window")
        return [self._read_live(info)]

    def _read_live(self, info: TagInfo) -> Reading:  # pragma: no cover - needs a server and asyncua
        from asyncua.sync import Client

        client = Client(self.endpoint)
        client.connect()
        try:
            data = client.get_node(node_id(info.tag)).read_data_value()
        finally:
            client.disconnect()
        code = int(getattr(data.StatusCode, "value", 0) or 0)
        quality = _quality(code)
        stamp = data.SourceTimestamp or data.ServerTimestamp
        if stamp is None:
            raise ConnectorUnavailable(f"{info.tag}: the server returned no timestamp")
        value = data.Value.Value if data.Value is not None else None
        return Reading(
            tag=info.tag,
            timestamp=stamp.replace(tzinfo=stamp.tzinfo or timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            value=float(value) if quality != "bad" and value is not None else None,
            unit=info.unit, quality=quality,
            quality_reason=None if quality == "good" else f"status 0x{code:08X}",
            source=self.name,
        )
