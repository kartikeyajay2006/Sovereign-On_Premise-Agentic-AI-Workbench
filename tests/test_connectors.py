"""Read-only plant-data connectors and the historian_read tool."""

from __future__ import annotations

import asyncio
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

import pytest

from backend.connectors import (
    ConnectorUnavailable,
    OPCUAConnector,
    ReadOnlyConnector,
    SQLiteHistorian,
    UnknownTag,
)
from backend.connectors.historian import build_simulated_historian, simulated_samples
from backend.connectors.opcua import asyncua_installed
from backend.core.schemas import EvidenceItem, PolicyDecision, Sensitivity
from backend.tools.registry import ToolContext, ToolRegistry
from tests.test_engineering_pipeline import ENGINEER


@pytest.fixture
def historian(tmp_path: Path) -> SQLiteHistorian:
    return SQLiteHistorian(build_simulated_historian(tmp_path / "historian.db"))


def test_the_simulated_dataset_is_deterministic(tmp_path: Path) -> None:
    assert simulated_samples() == simulated_samples()
    first = build_simulated_historian(tmp_path / "a.db")
    second = build_simulated_historian(tmp_path / "b.db")
    def dump(path: Path) -> list[tuple]:
        with closing(sqlite3.connect(path)) as connection:
            return list(connection.execute("SELECT * FROM samples ORDER BY tag, ts"))

    assert dump(first) == dump(second)


def test_the_historian_serves_tags_and_equipment(historian: SQLiteHistorian) -> None:
    assert isinstance(historian, ReadOnlyConnector)
    assert historian.simulated
    assert {t.tag for t in historian.tags_for("V-2107")} == {"PT-2107", "TT-2107"}
    assert [t.tag for t in historian.tags_for("pt-2104")] == ["PT-2104"]
    assert historian.tags_for("X-1") == []


def test_a_read_returns_the_newest_samples_in_time_order(historian: SQLiteHistorian) -> None:
    readings = historian.read("TT-2104", limit=5)
    assert len(readings) == 5
    assert [r.timestamp for r in readings] == sorted(r.timestamp for r in readings)
    assert readings[-1].timestamp == "2026-05-24T23:00:00Z"
    assert all(r.unit == "degC" and r.source == "historian:sqlite" for r in readings)

    window = historian.read("PT-2104", start=datetime(2026, 5, 20, tzinfo=timezone.utc),
                            end=datetime(2026, 5, 20, 9, tzinfo=timezone.utc), limit=100)
    assert len(window) == 10
    outage = [r for r in window if r.quality == "bad"]
    assert len(outage) == 6
    # A bad sample has no value: never a zero or a carried-forward reading.
    assert all(r.value is None and r.quality_reason == "comm_failure" for r in outage)


def test_a_withdrawn_vessel_reports_out_of_service(historian: SQLiteHistorian) -> None:
    latest = historian.read("PT-2107", limit=1)[0]
    assert latest.quality == "bad" and latest.value is None and latest.quality_reason == "out_of_service"


def test_the_historian_cannot_be_written_through(historian: SQLiteHistorian) -> None:
    connection = historian._connect()
    try:
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            connection.execute("DELETE FROM samples")
    finally:
        connection.close()


def test_missing_database_and_unknown_tags_are_errors_not_empty_results(
    historian: SQLiteHistorian, tmp_path: Path
) -> None:
    with pytest.raises(UnknownTag):
        historian.read("XX-9999")
    absent = SQLiteHistorian(tmp_path / "nowhere.db")
    assert absent.describe()["available"] is False
    with pytest.raises(ConnectorUnavailable, match="seed_historian"):
        absent.tags()


def test_the_opcua_simulator_serves_the_historian_without_restamping(historian: SQLiteHistorian) -> None:
    simulator = OPCUAConnector(mode="simulator", historian=historian)
    assert isinstance(simulator, ReadOnlyConnector)
    assert simulator.describe()["available"] and simulator.simulated
    served = simulator.read("PT-2104", limit=3)
    stored = historian.read("PT-2104", limit=3)
    assert [(r.timestamp, r.value, r.quality) for r in served] == [(r.timestamp, r.value, r.quality) for r in stored]
    assert all(r.source == "opcua:simulator" for r in served)


def test_live_opcua_without_the_library_says_not_installed() -> None:
    live = OPCUAConnector(mode="live", endpoint="opc.tcp://127.0.0.1:4840")
    description = live.describe()
    assert description["available"] is (asyncua_installed())
    if not asyncua_installed():
        assert "not installed" in description["unavailable_reason"]
        with pytest.raises(ConnectorUnavailable, match="not installed"):
            live.read("PT-2104")


# ------------------------------------------------------------------ the tool
def _context(tmp_path: Path, sensitivity: Sensitivity = Sensitivity.CONFIDENTIAL) -> ToolContext:
    return ToolContext(user=ENGINEER, task_id="t-historian", sensitivity=sensitivity, files=[], workspace=tmp_path)


@pytest.fixture
def seeded(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = build_simulated_historian(tmp_path / "historian.db")
    monkeypatch.setattr("backend.connectors.historian_path", lambda: path)
    return path


def test_historian_read_is_registered_read_only_and_policy_gated(tmp_path: Path) -> None:
    registry = ToolRegistry()
    entry = next(e for e in registry.describe() if e["name"] == "historian_read")
    assert entry["registered_in_policy"] and entry["side_effects"] == "read_only"
    assert "historian_read" in registry.available_for(ENGINEER, Sensitivity.CONFIDENTIAL)

    # Above the tool's classification ceiling the gateway refuses before any read.
    declared = registry.config.tool_permissions["tools"]["historian_read"]
    original = declared["max_data_classification"]
    declared["max_data_classification"] = "normal"
    try:
        call = asyncio.run(registry.invoke("historian_read", {"tag": "PT-2104"}, _context(tmp_path)))
    finally:
        declared["max_data_classification"] = original
    assert not call.ok and call.policy_decision == PolicyDecision.DENY
    assert "historian_read" in call.error


def test_historian_read_returns_citable_evidence(tmp_path: Path, seeded: Path) -> None:
    registry = ToolRegistry()
    call = asyncio.run(registry.invoke(
        "historian_read", {"tag": "V-2104", "start": "2026-05-20T00:00:00Z", "end": "2026-05-20T11:00:00Z",
                           "limit": 12}, _context(tmp_path)))
    assert call.ok and call.policy_decision == PolicyDecision.ALLOW
    items = [EvidenceItem(**item) for item in call.output["evidence"]]
    assert {item.extraction_data["tag"] for item in items} == {"PT-2104", "TT-2104", "LT-2104A"}
    pressure = next(item for item in items if item.extraction_data["tag"] == "PT-2104")
    assert pressure.kind == "historian" and pressure.extraction_data["simulated"] is True
    assert pressure.source_document.startswith("Simulated historian:sqlite")
    assert "PT-2104 · 2026-05-20T00:00:00Z to 2026-05-20T11:00:00Z" == pressure.location
    readings = pressure.extraction_data["readings"]
    assert len(readings) == 12
    assert {"tag", "timestamp", "value", "unit", "quality", "source"} <= set(readings[0])
    assert pressure.extraction_data["quality_counts"]["bad"] == 6
    assert "no value  quality bad (comm_failure)" in pressure.excerpt
    good = [r["value"] for r in readings if r["quality"] == "good"]
    assert pressure.extraction_data["good_max"] == max(good)


def test_historian_read_through_the_opcua_simulator(tmp_path: Path, seeded: Path) -> None:
    call = asyncio.run(ToolRegistry().invoke("historian_read", {"tag": "TT-2107", "source": "opcua", "limit": 2},
                                             _context(tmp_path)))
    assert call.ok
    item = call.output["evidence"][0]
    assert item["extraction_model"] == "opcua:simulator"
    assert item["extraction_data"]["latest"]["quality"] == "bad"


def test_historian_read_failures_are_reported(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    registry = ToolRegistry()
    monkeypatch.setattr("backend.connectors.historian_path", lambda: tmp_path / "absent.db")
    missing = asyncio.run(registry.invoke("historian_read", {"tag": "PT-2104"}, _context(tmp_path)))
    assert not missing.ok and "seed_historian" in missing.error and "evidence" not in missing.output
    bad_time = asyncio.run(registry.invoke("historian_read", {"tag": "PT-2104", "start": "yesterday"},
                                           _context(tmp_path)))
    assert not bad_time.ok and "ISO 8601" in bad_time.error
    unknown_source = asyncio.run(registry.invoke("historian_read", {"tag": "PT-2104", "source": "pi"},
                                                 _context(tmp_path)))
    assert not unknown_source.ok
