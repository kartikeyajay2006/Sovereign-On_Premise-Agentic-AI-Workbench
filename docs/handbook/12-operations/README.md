# 12 · Operations

> Keeping a workbench healthy on a real host.

| Page | Covers |
|---|---|
| [12.1 Running the services](01-run-script.md) | `run.sh` in depth, running as a service, binding to loopback |
| [12.2 Logs and storage](02-logs-storage.md) | What is written where, and how big it grows |
| [12.3 The audit tool](03-audit-tool.md) | Verifying, archiving, and what to do with a broken chain |
| [12.4 Backup and restore](04-backup-restore.md) | What to copy, when, and how to restore consistently |
| [12.5 Performance tuning](05-performance.md) | Memory, latency and the settings that move them |
| [12.6 Runtime troubleshooting](06-troubleshooting.md) | Blocked, failed, slow and stuck runs |

## A healthy host, at a glance

```bash
./scripts/run.sh --status
curl -s http://127.0.0.1:8000/api/health -H "Authorization: Bearer $TOKEN" | jq
python scripts/audit_tool.py verify
```

| Check | Healthy |
|---|---|
| API and console | Both listening |
| `inference_reachable` | `true` |
| `models_available` | At least a reasoning model and the embedding model |
| `retrieval_mode` | `embedding` |
| `sandbox_ready` | `true` |
| `audit_chain_valid` | `true`, and the tool prints the head hash |
| `sovereignty_ok` | `true`, external calls 0 |
| Free memory | More than the largest model's footprint plus 1.5 GB |

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 11.6 · The event stream and a worked session](../11-api/06-events-session.md) | [↑ The AEGIS Handbook](../README.md) | [12.1 · Running the services →](01-run-script.md) |

<!-- nav:end -->
