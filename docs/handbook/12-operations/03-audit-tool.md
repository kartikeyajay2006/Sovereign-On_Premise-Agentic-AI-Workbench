# 12.3 · The audit tool

`scripts/audit_tool.py` inspects and maintains the audit log from the command line.

## `verify`

```bash
python scripts/audit_tool.py verify
```

```text
Chain verifies end to end over 82 events.
Head hash: 4298ec8736be2d1d58a6b324cc701b11a2cc1c152d0b9447d74219bcd2f9dc24
```

Recomputes every record's hash from genesis. Exit code 0 when valid. When broken, it names the first sequence number that fails and suggests archiving.

Run it:

- before and after a demonstration, noting the head hash;
- after restoring a backup;
- whenever the Audit screen or the boot log reports a problem.

## `archive`

```bash
python scripts/audit_tool.py archive
```

A broken chain is **evidence**, not an inconvenience: it means records were edited, or written by two processes without the lock. `archive` therefore never rewrites or deletes anything. It:

1. moves the current log aside under a timestamped name, next to it in `storage/logs/`;
2. starts a fresh chain whose **first record** says why, and names the archived file;
3. leaves the old file in place, so it can still be read, verified and investigated.

## When the chain breaks

1. **Stop** the API.
2. Run `verify` and note the failing sequence number.
3. **Copy** the log somewhere safe, before anything else touches it.
4. Look at the records around the failure: `sed -n '<n-2>,<n+2>p' storage/logs/audit.jsonl | jq`. An edit shows as a record whose content does not match its hash. A write race shows as two records claiming the same sequence number.
5. `archive`, then start the API.
6. Record the incident, and the old and new head hashes, outside the host.

## Periodic archiving

The log grows forever. For a long-running host, archive on a schedule, for example monthly, *while the chain is valid*. The archived file keeps its own head hash, and the new chain's first record names it, so the history remains a verifiable sequence of files.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 12.2 · Logs and storage](02-logs-storage.md) | [↑ 12 · Operations](README.md) | [12.4 · Backup and restore →](04-backup-restore.md) |

<!-- nav:end -->
