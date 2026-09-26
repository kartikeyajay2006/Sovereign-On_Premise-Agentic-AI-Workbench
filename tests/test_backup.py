"""scripts/backup.py: an online, complete, verifiable backup -- on a temporary tree."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pytest

from scripts import backup as backup_script
from scripts.backup import MANIFEST, SUMS, Source

NOW = datetime(2026, 9, 27, 8, 15, 0, tzinfo=timezone.utc)


def _tree(root: Path) -> list[Source]:
    """A small install: a live WAL database, a historian, and the storage folders."""
    storage = root / "storage"
    for name, files in {
        "logs": {"audit.jsonl": '{"sequence": 1}\n', "audit-roots.jsonl": "{}\n", "audit.jsonl.lock": ""},
        "keys": {"host-signing.key": "PRIVATE", "host-signing.pub": "PUBLIC"},
        "proofs": {"task-1.json": "{}"},
        "uploads": {"u1/f_report.pdf": "%PDF"},
        "deliverables": {"task-1/note.docx": "DOCX"},
        "vision-cache": {"abc.json": '{"text": "{}"}'},
    }.items():
        for relative, text in files.items():
            path = storage / name / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
    (root / "config").mkdir()
    (root / "config" / "app.yaml").write_text("app: {}\n", encoding="utf-8")
    (root / "policies").mkdir()
    (root / "policies" / "dlp.yaml").write_text("detectors: []\n", encoding="utf-8")

    historian = storage / "historian.db"
    with sqlite3.connect(historian) as connection:
        connection.execute("create table readings (tag text, value real)")
        connection.execute("insert into readings values ('TI-2104', 81.5)")

    return [
        Source("database", storage / "workbench.db", "workbench.db", "sqlite"),
        Source("historian", historian, "historian.db", "sqlite"),
        Source("logs", storage / "logs", "storage/logs", "tree"),
        Source("keys", storage / "keys", "storage/keys", "tree"),
        Source("proofs", storage / "proofs", "storage/proofs", "tree"),
        Source("uploads", storage / "uploads", "storage/uploads", "tree"),
        Source("deliverables", storage / "deliverables", "storage/deliverables", "tree"),
        Source("vision-cache", storage / "vision-cache", "storage/vision-cache", "tree"),
        Source("reports", storage / "reports", "storage/reports", "tree"),
        Source("config", root / "config", "config", "tree"),
        Source("policies", root / "policies", "policies", "tree"),
    ]


@pytest.fixture
def live_db(tmp_path: Path):  # type: ignore[no-untyped-def]
    """The API's database, open and in WAL mode, with writes not yet checkpointed."""
    path = tmp_path / "install" / "storage" / "workbench.db"
    path.parent.mkdir(parents=True)
    connection = sqlite3.connect(path)
    connection.execute("pragma journal_mode=wal")
    connection.execute("pragma wal_autocheckpoint=0")
    connection.execute("create table tasks (id text)")
    connection.executemany("insert into tasks values (?)", [(f"t{i}",) for i in range(50)])
    connection.commit()
    yield connection
    connection.close()


def test_backs_up_everything_while_the_database_is_open(tmp_path: Path, live_db: sqlite3.Connection) -> None:
    sources = _tree(tmp_path / "install")
    # The rows are in the WAL, not the main file: a file copy would lose them.
    assert (tmp_path / "install" / "storage" / "workbench.db-wal").stat().st_size > 0

    folder = backup_script.backup(sources, tmp_path / "out", now=NOW, audit_head={"valid": True})

    assert folder.name == "aegis-backup-20260927T081500Z"
    with sqlite3.connect(folder / "workbench.db") as copy:
        assert copy.execute("select count(*) from tasks").fetchone()[0] == 50
    with sqlite3.connect(folder / "historian.db") as copy:
        assert copy.execute("select value from readings").fetchone()[0] == 81.5
    for relative in (
        "storage/logs/audit.jsonl", "storage/logs/audit-roots.jsonl", "storage/keys/host-signing.key",
        "storage/proofs/task-1.json", "storage/uploads/u1/f_report.pdf",
        "storage/deliverables/task-1/note.docx", "storage/vision-cache/abc.json",
        "config/app.yaml", "policies/dlp.yaml",
    ):
        assert (folder / relative).is_file(), relative
    # A live process's lock file is not part of the record.
    assert not (folder / "storage/logs/audit.jsonl.lock").exists()


def test_manifest_hashes_every_file_and_notes_what_was_absent(tmp_path: Path, live_db: sqlite3.Connection) -> None:
    folder = backup_script.backup(_tree(tmp_path / "install"), tmp_path / "out", now=NOW)
    manifest = json.loads((folder / MANIFEST).read_text(encoding="utf-8"))
    on_disk = {p.relative_to(folder).as_posix() for p in folder.rglob("*") if p.is_file()} - {MANIFEST, SUMS}
    assert set(manifest["files"]) == on_disk
    assert all(len(entry["sha256"]) == 64 for entry in manifest["files"].values())
    present = {item["name"]: item["present"] for item in manifest["items"]}
    assert present["reports"] is False and present["database"] is True
    sums = (folder / SUMS).read_text(encoding="utf-8").splitlines()
    assert len(sums) == len(on_disk)
    assert backup_script.verify(folder) == []


def test_verify_catches_a_changed_a_missing_and_an_added_file(tmp_path: Path, live_db: sqlite3.Connection) -> None:
    folder = backup_script.backup(_tree(tmp_path / "install"), tmp_path / "out", now=NOW)
    (folder / "storage/logs/audit.jsonl").write_text("edited\n", encoding="utf-8")
    (folder / "storage/proofs/task-1.json").unlink()
    (folder / "storage/proofs/forged.json").write_text("{}", encoding="utf-8")
    problems = backup_script.verify(folder)
    assert "changed: storage/logs/audit.jsonl" in problems
    assert "missing: storage/proofs/task-1.json" in problems
    assert "not in manifest: storage/proofs/forged.json" in problems


def test_a_missing_database_is_not_created_at_the_source(tmp_path: Path) -> None:
    sources = [Source("database", tmp_path / "nothing.db", "workbench.db", "sqlite")]
    folder = backup_script.backup(sources, tmp_path / "out", now=NOW)
    assert not (tmp_path / "nothing.db").exists()
    assert not (folder / "workbench.db").exists()


def test_the_default_sources_cover_what_a_restore_needs() -> None:
    names = {source.name for source in backup_script.default_sources()}
    assert {"database", "historian", "logs", "keys", "proofs", "uploads", "deliverables",
            "vision-cache", "config", "policies"} <= names
    assert "keys" not in {source.name for source in backup_script.default_sources(include_keys=False)}


def test_command_line_backup_and_verify(tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
                                       live_db: sqlite3.Connection, capsys: pytest.CaptureFixture[str]) -> None:
    sources = _tree(tmp_path / "install")
    monkeypatch.setattr(backup_script, "default_sources", lambda include_keys=True: [
        source for source in sources if include_keys or source.name != "keys"
    ])
    assert backup_script.main(["--out", str(tmp_path / "out"), "--no-keys"]) == 0
    [folder] = list((tmp_path / "out").iterdir())
    assert not (folder / "storage" / "keys").exists()
    assert backup_script.main(["--verify", str(folder)]) == 0
    assert "INTACT" in capsys.readouterr().out
