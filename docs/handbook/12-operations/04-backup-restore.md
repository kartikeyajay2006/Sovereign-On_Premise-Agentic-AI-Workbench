# 12.4 · Backup and restore

## What to back up

Everything under `storage/`, **together**, plus your configuration:

| Item | Why |
|---|---|
| `storage/workbench.db` (and `-wal`, `-shm` if present) | Users, sessions, runs, the knowledge base |
| `storage/logs/audit.jsonl` and any archived logs | The record |
| `storage/uploads/`, `storage/deliverables/` | The files runs point to |
| `config/`, `policies/` | What the runs were judged against |

The database, the files it references and the audit log describe each other. Restoring one without the others leaves runs pointing at missing deliverables, and an audit log that records events the database no longer shows.

## Backing up

```bash
./scripts/run.sh --stop
tar -czf aegis-backup-$(date +%Y%m%d-%H%M).tar.gz storage config policies
python scripts/audit_tool.py verify > aegis-backup-head.txt
./scripts/run.sh
```

Stopping the API first guarantees the SQLite WAL is checkpointed and no record is half-written. For a backup without downtime, use SQLite's online backup for the database (`sqlite3 storage/workbench.db ".backup backup.db"`) and copy the audit log after it. The log is append-only, so a copy taken later contains everything the database copy refers to.

Store the head hash from `verify` with the backup.

## Restoring

```bash
./scripts/run.sh --stop
mv storage storage.broken-$(date +%s)
tar -xzf aegis-backup-YYYYMMDD-HHMM.tar.gz
python scripts/audit_tool.py verify     # compare the head hash with the one stored with the backup
./scripts/run.sh
```

Runs that were in progress when the backup was taken are closed as *interrupted* on the next start.

## Moving to another host

Copy the backup, install the same Python, Node and models ([1.3](../01-getting-started/03-install-linux-macos.md), [1.5](../01-getting-started/05-models.md)), restore, and start. The knowledge base's vectors travel with the database. They were produced by `nomic-embed-text`, so install the same embedding model on the new host, or re-seed.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 12.3 · The audit tool](03-audit-tool.md) | [↑ 12 · Operations](README.md) | [12.5 · Performance tuning →](05-performance.md) |

<!-- nav:end -->
