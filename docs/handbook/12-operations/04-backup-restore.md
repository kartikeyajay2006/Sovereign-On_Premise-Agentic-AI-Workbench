# 12.4 · Backup and restore

## What to back up

Everything a restore needs, **together**, taken by `scripts/backup.py`:

| Item | Why |
|---|---|
| `storage/workbench.db` | Users, sessions, runs, the knowledge base (with its vectors) |
| `storage/historian.db` | The process historian the connectors read (`connectors.historian.path`) |
| `storage/logs/` | `audit.jsonl`, the record, and `audit-roots.jsonl`, its signed roots |
| `storage/keys/` | The host's Ed25519 signing key and the DLP fingerprint key. **Secret**: see below |
| `storage/proofs/` | The run certificates this host issued |
| `storage/uploads/`, `storage/deliverables/` | The files runs point to |
| `storage/vision-cache/` | Cached vision readings. Losing it costs time, not data: a V-2104 scan run takes 5 to 6 minutes instead of ~100 s until the page is read again |
| `storage/reports/` | Golden-demo and red-team reports, when present |
| `config/`, `policies/` | What the runs were judged against |

The database, the files it references and the audit log describe each other. Restoring one without the others leaves runs pointing at missing deliverables, and an audit log that records events the database no longer shows. Earlier versions of this page left out the keys, proofs, vision cache and historian: a host restored from such a backup lost every certificate it had issued and signed new ones under a different key id.

**The keys are the one secret.** `storage/keys/` holds the private key every certificate is signed with; whoever has it can sign a certificate this host never issued. Encrypt the backup and keep it offline, or run with `--no-keys` and keep the key in a separate offline backup. Old certificates still verify without it (each carries its public key), but a restored host without it signs under a new key id.

## Backing up

```bash
.venv/bin/python scripts/backup.py                       # into ./backups/ (ignored by version control)
.venv/bin/python scripts/backup.py --out /mnt/backup     # anywhere else
.venv/bin/python scripts/backup.py --no-keys             # leave storage/keys out
```

On Windows: `.venv\Scripts\python.exe scripts\backup.py`.

No downtime is needed. The two SQLite databases are copied with SQLite's online backup API, which takes a consistent snapshot while the API keeps writing; a plain file copy of a WAL database can miss committed rows still in the `-wal` file. The audit log is copied after the databases: it is append-only, so the later copy holds every event the database copy refers to.

Each backup is one folder, `aegis-backup-<UTC time>/`, holding the copies plus:

- `MANIFEST.json`: the SHA-256 and size of every file, which sources were present on this host (an absent one, say no historian, is noted rather than failing the backup), and the audit chain's head hash and validity at backup time.
- `SHA256SUMS`: the same hashes, for `sha256sum -c SHA256SUMS` on any machine.

Check a backup at any time, including after copying it elsewhere:

```bash
.venv/bin/python scripts/backup.py --verify backups/aegis-backup-20260927T081500Z
```

It lists every changed, missing or unlisted file and prints `INTACT` when there are none.

Schedule it nightly (cron, or Task Scheduler on Windows). Seal the audit log every quarter with [the audit tool](03-audit-tool.md), and never truncate it.

## Restoring

```bash
B=backups/aegis-backup-YYYYMMDDTHHMMSSZ
.venv/bin/python scripts/backup.py --verify "$B"      # must print INTACT
./scripts/run.sh --stop
mv storage storage.broken-$(date +%s)
mkdir storage && cp -r "$B"/storage/* storage/
cp "$B"/workbench.db storage/workbench.db
[ -f "$B"/historian.db ] && cp "$B"/historian.db storage/historian.db
cp -r "$B"/config "$B"/policies .                     # only to replace this install's own copies
python scripts/audit_tool.py verify                   # head hash must equal audit_chain.head_hash in MANIFEST.json
./scripts/run.sh
```

Restore the databases and the files from the same backup folder, never mixed with another. Runs that were in progress when the backup was taken are closed as *interrupted* on the next start.

## Moving to another host

Copy the backup, install the same Python, Node and models ([1.3](../01-getting-started/03-install-linux-macos.md), [1.5](../01-getting-started/05-models.md)), restore, and start. The knowledge base's vectors travel with the database. They were produced by `nomic-embed-text`, so install the same embedding model on the new host, or re-seed. The vision cache is keyed by the vision model's digest: it is served on the new host only if the same pinned model is installed.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 12.3 · The audit tool](03-audit-tool.md) | [↑ 12 · Operations](README.md) | [12.5 · Performance tuning →](05-performance.md) |

<!-- nav:end -->
