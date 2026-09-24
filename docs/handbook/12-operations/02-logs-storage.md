# 12.2 · Logs and storage

## What is written where

| Path | Written by | Grows with | Safe to delete? |
|---|---|---|---|
| `storage/workbench.db` (+ `-wal`, `-shm`) | The API | Runs, users, sessions, chunks | **No.** It is the record |
| `storage/logs/audit.jsonl` | The API, scripts | Every action | **No.** Archive it with the audit tool instead |
| `storage/logs/audit.jsonl.lock` | Lock file | Nothing | Only when nothing is running |
| `storage/uploads/` | Uploads | Attachments | No: runs reference them |
| `storage/deliverables/` | Deliverables, harness reports | Documents | No: downloads would return 410 |
| `storage/workspaces/<task-id>/` | The pipeline | Rendered pages, scripts per run | Yes, once the run is finished |
| `storage/workspaces/run-<id>/` | The sandbox | One directory per execution | Yes, when nothing is running |
| `storage/index/staging/` | Ingestion | Uploaded documents being indexed | Yes, when no ingestion is running |
| `storage/logs/api.log`, `web.log`, `build.log` | `run.sh` | Process output | Yes; they are rewritten on each start |

## Rough sizes

On the demonstration corpus, the database is about 1 MB with 15 documents and a handful of runs. The largest contributors over time are:

- **Chunks:** each passage stores its text and a 768-float vector (about 3 KB).
- **Tasks:** each run stores its whole record, including evidence excerpts and usage, typically 10–100 KB.
- **Rendered pages:** a scanned PDF's pages rendered at 1100 px are 100–300 KB each, under `workspaces/`.

Clearing old `workspaces/` directories is the one routine clean-up.

```bash
# Workspaces older than 30 days (review before deleting)
find storage/workspaces -mindepth 1 -maxdepth 1 -type d -mtime +30 -print
```

## Retention

Nothing in AEGIS deletes runs, audit records or deliverables on a schedule. The per-level `retention_days` in `policies/data-classification.yaml` are declared, not implemented. Retention is therefore an operator decision: archive the audit log periodically ([12.3](03-audit-tool.md)) and back up `storage/` as a whole ([12.4](04-backup-restore.md)).

## Reading the logs

```bash
tail -f storage/logs/api.log          # requests, boot messages, worker errors
tail -f storage/logs/web.log          # the console
jq -c 'select(.category=="agent")' storage/logs/audit.jsonl | tail   # pipeline events
jq -r '"\(.at) \(.actor) \(.category)/\(.action)"' storage/logs/audit.jsonl | tail -30
```

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 12.1 · Running the services](01-run-script.md) | [↑ 12 · Operations](README.md) | [12.3 · The audit tool →](03-audit-tool.md) |

<!-- nav:end -->
