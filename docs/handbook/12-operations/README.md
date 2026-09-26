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
curl -s http://127.0.0.1:8000/api/ready                    # no sign-in: ready + one boolean per check
python scripts/warmup.py --check                           # the same checks, with the detail
curl -s http://127.0.0.1:8000/api/health -H "Authorization: Bearer $TOKEN" | jq
python scripts/audit_tool.py verify
python scripts/backup.py                                   # nightly; see 12.4
```

`/api/ready` answers 200 when every check passes and 503 otherwise, so a process supervisor or load balancer can probe it without a token. It discloses nothing but booleans; `warmup.py --check` prints why a check failed.

| Check | Healthy |
|---|---|
| API and console | Both listening |
| `inference_reachable` | `true` |
| `models_available` | At least a reasoning model and the embedding model |
| `retrieval_mode` | `hybrid` |
| `sandbox_ready` | `true` |
| `audit_chain_valid` | `true`, and the tool prints the head hash |
| `sovereignty_ok` | `true`, external calls 0 |
| Free memory | More than the largest model's footprint plus 1.5 GB (`free_memory_ok` in `/api/ready`) |
| `drafting_model_resident` | `true`: the everyday model is loaded at the context a question asks for |
| `pinned_models_verified` | `true`: every installed pinned model matches its digest |

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 11.7 · Engineering, conflicts, drawings and proof](../11-api/07-engineering-proof.md) | [↑ The AEGIS Handbook](../README.md) | [12.1 · Running the services →](01-run-script.md) |

<!-- nav:end -->
