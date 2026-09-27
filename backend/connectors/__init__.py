"""Read-only plant-system connectors: a historian, OPC UA and a CMMS.

``get_connectors()`` builds the process-data adapters declared under
``connectors:`` in ``config/app.yaml``; ``get_cmms()`` builds the maintenance
(CMMS) adapter. Each is read-only by construction (see ``base.py``); the
demonstration uses the simulated SQLite historian, the OPC UA simulator that
serves it and the simulated CMMS, so nothing here needs a network or a cloud
service.
"""

from __future__ import annotations

from pathlib import Path

from backend.connectors.base import (
    ConnectorUnavailable,
    MaintenanceItem,
    ReadOnlyConnector,
    ReadOnlyMaintenanceSource,
    Reading,
    TagInfo,
    UnknownTag,
)
from backend.connectors.cmms import CMMSConnector
from backend.connectors.historian import SQLiteHistorian
from backend.connectors.opcua import OPCUAConnector

__all__ = [
    "CMMSConnector",
    "ConnectorUnavailable",
    "MaintenanceItem",
    "OPCUAConnector",
    "ReadOnlyConnector",
    "ReadOnlyMaintenanceSource",
    "Reading",
    "SQLiteHistorian",
    "TagInfo",
    "UnknownTag",
    "cmms_path",
    "get_cmms",
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


def cmms_path() -> Path:
    from backend.core.config import PROJECT_ROOT, get_config

    section = get_config().settings.section("connectors") or {}
    value = Path(str((section.get("cmms") or {}).get("path") or "storage/cmms.db"))
    return value if value.is_absolute() else PROJECT_ROOT / value


def get_cmms() -> CMMSConnector | None:
    """The maintenance (CMMS) adapter, or None when ``connectors.cmms`` disables it."""
    from backend.core.config import get_config

    settings = get_config().settings
    config = (settings.section("connectors") or {}).get("cmms") or {}
    if not config.get("enabled", True):
        return None
    allowed = (settings.section("sovereignty") or {}).get("allowed_cidrs") or None
    return CMMSConnector(
        mode=str(config.get("mode") or "simulator"),
        path=cmms_path(),
        endpoint=config.get("endpoint") or None,
        allowed_cidrs=list(allowed) if allowed else None,
    )
