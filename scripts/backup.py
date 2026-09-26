#!/usr/bin/env python3
"""Back up this AEGIS install while it runs, with a SHA-256 manifest.

    .venv/bin/python scripts/backup.py                        # into ./backups/
    .venv/bin/python scripts/backup.py --out D:/aegis-backups
    .venv/bin/python scripts/backup.py --no-keys              # leave the signing keys out
    .venv/bin/python scripts/backup.py --verify backups/aegis-backup-20260927T081500Z

Writes one timestamped folder, aegis-backup-<UTC time>/, holding:

* ``workbench.db`` and ``historian.db`` -- copied with SQLite's online
  backup API, so the API need not stop and a half-written transaction or
  an un-checkpointed WAL is never what is copied;
* ``storage/logs`` (the audit log and its sealed roots), ``storage/keys``
  (the host's signing key: see below), ``storage/proofs`` (issued run
  certificates), ``storage/uploads``, ``storage/deliverables``,
  ``storage/vision-cache`` and ``storage/reports`` -- each as it is on disk,
  and noted as absent in the manifest when this host has none;
* ``config/`` and ``policies/`` -- what the runs were judged against;
* ``MANIFEST.json`` -- every file's SHA-256 and size, which sources were
  present, and the audit chain's head at backup time; and ``SHA256SUMS``,
  the same hashes in the format ``sha256sum -c`` reads.

The databases are copied first and the audit log after. The log is
append-only, so a later copy holds every event the database copy refers to.

``storage/keys`` holds the private key every certificate is signed with.
Whoever has it can sign a certificate this host never issued: encrypt the
backup, keep it offline, or pass --no-keys and back the key up separately.
Without it, old certificates still verify (the public key is in each), but
this host cannot keep signing as the same key id after a restore.

Exit code 0 when the backup (or --verify) succeeded.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import shutil
import sqlite3
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = "MANIFEST.json"
SUMS = "SHA256SUMS"


@dataclass(frozen=True)
class Source:
    """One thing to back up: where it is, and where it goes in the backup."""

    name: str
    path: Path
    target: str  # relative path inside the backup folder
    kind: str  # "sqlite" | "tree"


def _under(root: Path, value: Any) -> Path:
    path = Path(str(value))
    return path if path.is_absolute() else root / path


def default_sources(*, include_keys: bool = True) -> list[Source]:
    """Everything a restore needs, resolved from the live configuration."""
    from backend.core.config import CONFIG_DIR, POLICY_DIR, PROJECT_ROOT, get_config

    settings = get_config().settings
    storage = settings.storage_root
    historian = ((settings.raw.get("connectors") or {}).get("historian") or {}).get("path") or "storage/historian.db"
    vision = (settings.raw.get("vision_cache") or {}).get("path") or "vision-cache"
    sources = [
        Source("database", settings.path("database"), "workbench.db", "sqlite"),
        Source("historian", _under(PROJECT_ROOT, historian), "historian.db", "sqlite"),
        # After the databases: the log is append-only, so this copy holds
        # every event the database copies refer to.
        Source("logs", settings.path("logs"), "storage/logs", "tree"),
        Source("keys", storage / "keys", "storage/keys", "tree"),
        Source("proofs", storage / "proofs", "storage/proofs", "tree"),
        Source("uploads", settings.path("uploads"), "storage/uploads", "tree"),
        Source("deliverables", settings.path("deliverables"), "storage/deliverables", "tree"),
        Source("vision-cache", _under(storage, vision), "storage/vision-cache", "tree"),
        Source("reports", storage / "reports", "storage/reports", "tree"),
        Source("config", CONFIG_DIR, "config", "tree"),
        Source("policies", POLICY_DIR, "policies", "tree"),
    ]
    if not include_keys:
        sources = [source for source in sources if source.name != "keys"]
    return sources


def _sqlite_backup(source: Path, target: Path) -> None:
    """SQLite's online backup: a consistent copy while other connections write.

    Opened read-only through a URI so a missing or mistyped path is an error,
    not a new empty database created at the source.
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    reader = sqlite3.connect(f"{source.resolve().as_uri()}?mode=ro", uri=True, timeout=30.0)
    try:
        writer = sqlite3.connect(target)
        try:
            reader.backup(writer)
        finally:
            writer.close()
    finally:
        reader.close()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _audit_head() -> dict[str, Any] | None:
    try:
        from backend.core.audit import get_audit_log

        chain = get_audit_log().verify_chain()
        return {"valid": chain.valid, "events": chain.events, "head_hash": chain.head_hash,
                "broken_at": chain.broken_at}
    except Exception as exc:  # the backup is still worth having
        return {"error": f"{type(exc).__name__}: {exc}"}


def backup(sources: list[Source], out_dir: Path, *, now: datetime | None = None,
           audit_head: dict[str, Any] | None = None) -> Path:
    """Copy every source into a new timestamped folder under ``out_dir``; return it."""
    stamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%dT%H%M%SZ")
    folder = out_dir / f"aegis-backup-{stamp}"
    folder.mkdir(parents=True, exist_ok=False)

    items: list[dict[str, Any]] = []
    for source in sources:
        target = folder / source.target
        present = source.path.exists()
        items.append({"name": source.name, "source": str(source.path), "target": source.target,
                      "kind": source.kind, "present": present})
        if not present:
            continue
        if source.kind == "sqlite":
            _sqlite_backup(source.path, target)
        elif source.path.is_dir():
            # A lock file belongs to a live process, not to the record.
            shutil.copytree(source.path, target, ignore=shutil.ignore_patterns("*.lock", "*.tmp"))
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source.path, target)

    files = {
        path.relative_to(folder).as_posix(): {"sha256": _sha256(path), "bytes": path.stat().st_size}
        for path in sorted(folder.rglob("*"))
        if path.is_file()
    }
    manifest = {
        "format": 1,
        "created_at": (now or datetime.now(timezone.utc)).isoformat(),
        "host": platform.node(),
        "items": items,
        "audit_chain": audit_head,
        "files": files,
    }
    (folder / MANIFEST).write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    (folder / SUMS).write_text(
        "".join(f"{entry['sha256']}  {name}\n" for name, entry in files.items()), encoding="utf-8"
    )
    return folder


def verify(folder: Path) -> list[str]:
    """Every problem with a backup folder against its manifest; empty when intact."""
    try:
        manifest = json.loads((folder / MANIFEST).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"manifest unreadable: {exc}"]
    problems: list[str] = []
    listed = manifest.get("files") or {}
    for name, entry in listed.items():
        path = folder / name
        if not path.is_file():
            problems.append(f"missing: {name}")
        elif _sha256(path) != entry.get("sha256"):
            problems.append(f"changed: {name}")
    for path in folder.rglob("*"):
        name = path.relative_to(folder).as_posix()
        if path.is_file() and name not in listed and name not in {MANIFEST, SUMS}:
            problems.append(f"not in manifest: {name}")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--out", type=Path, default=ROOT / "backups", help="folder to create the backup in")
    parser.add_argument("--no-keys", action="store_true", help="leave storage/keys out of the backup")
    parser.add_argument("--verify", type=Path, metavar="FOLDER", help="check a backup against its manifest")
    args = parser.parse_args(argv)

    if args.verify:
        problems = verify(args.verify)
        for problem in problems:
            print(problem)
        print("INTACT" if not problems else f"{len(problems)} problem(s)")
        return 0 if not problems else 1

    folder = backup(default_sources(include_keys=not args.no_keys), args.out, audit_head=_audit_head())
    manifest = json.loads((folder / MANIFEST).read_text(encoding="utf-8"))
    for item in manifest["items"]:
        print(f"  {item['name']:<14} {'copied' if item['present'] else 'absent on this host'}")
    head = manifest.get("audit_chain") or {}
    print(f"{len(manifest['files'])} files, audit chain valid={head.get('valid')} head={head.get('head_hash')}")
    print(folder)
    if not args.no_keys:
        print("This backup holds the host's private signing key: encrypt it or keep it offline.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
