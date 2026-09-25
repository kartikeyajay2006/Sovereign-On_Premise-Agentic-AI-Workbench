"""Read-only plant-data connectors: a historian and OPC UA, behind one interface.

``get_connectors()`` builds the adapters declared under ``connectors:`` in
``config/app.yaml``. Each is read-only by construction (see ``base.py``); the
demonstration uses the simulated SQLite historian and the OPC UA simulator
that serves it, so nothing here needs a network or a cloud service.
"""

from __future__ import annotations

from pathlib import Path

from backend.connectors.base import ConnectorUnavailable, ReadOnlyConnector, Reading, TagInfo, UnknownTag
from backend.connectors.historian import SQLiteHistorian
from backend.connectors.opcua import OPCUAConnector

__all__ = [
    "ConnectorUnavailable",
    "OPCUAConnector",
    "ReadOnlyConnector",
    "Reading",
    "SQLiteHistorian",
    "TagInfo",
    "UnknownTag",
    "get_connectors",
    "historian_path",
]


def historian_path() -> Path:
    from backend.core.config import PROJECT_ROOT, get_config

    section = get_config().settings.section("connectors") or {}
    value = Path(str((section.get("historian") or {}).get("path") or "storage/historian.db"))
    return value if value.is_absolute() else PROJECT_ROOT / value


def get_connectors() -> dict[str, ReadOnlyConnector]:
    """The enabled connectors, by the source name a tool call asks for."""
    from backend.core.config import get_config

    section = get_config().settings.section("connectors") or {}
    historian_config = section.get("historian") or {}
    opcua_config = section.get("opcua") or {}
    historian = SQLiteHistorian(historian_path())
    connectors: dict[str, ReadOnlyConnector] = {}
    if historian_config.get("enabled", True):
        connectors["historian"] = historian
    if opcua_config.get("enabled", True):
        connectors["opcua"] = OPCUAConnector(
            mode=str(opcua_config.get("mode") or "simulator"),
            endpoint=opcua_config.get("endpoint") or None,
            historian=historian,
        )
    return connectors
