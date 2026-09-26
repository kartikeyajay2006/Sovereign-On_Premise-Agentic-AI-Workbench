# 11.5 · Knowledge, sandbox, audit and sovereignty

## Knowledge

| Method and path | Permission | Does |
|---|---|---|
| `GET /api/knowledge/documents` | signed in | Documents **you could retrieve**: your department and `general` (all, for override roles), up to your clearance |
| `POST /api/knowledge/search` | `knowledge.search` | Search with your clearance applied |
| `POST /api/knowledge/documents` | `knowledge.ingest` | Ingest a document. **201** |
| `DELETE /api/knowledge/documents/{id}` | `knowledge.manage` | Remove a document and its passages. **204** |

### Search

```bash
curl -s -X POST http://127.0.0.1:8000/api/knowledge/search -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"query":"severity for cladding damage over 20%","top_k":3}' \
  | jq '{retrieval_mode, took_ms, results: [.results[] | {id, source_document, location, score}]}'
```

The response carries `retrieval_mode` (`hybrid` or `lexical`), `took_ms`, and `results` as evidence items.

### Ingest

```bash
curl -s -X POST http://127.0.0.1:8000/api/knowledge/documents -H "Authorization: Bearer $TOKEN" \
  -F file=@my-procedure.md -F department=inspection -F classification=confidential -F version=1.0
```

## Sandbox

| Method and path | Permission | Does |
|---|---|---|
| `GET /api/sandbox/limits` | signed in | The mechanism in force (`posix_rlimit`, …), memory, CPU, process and wall limits, whether execution is allowed and why not |
| `POST /api/sandbox/execute` | the gateway's `python_exec` check | Run code; see below |
| `POST /api/sandbox/self-test` | signed in | The seven-payload containment self-test |
| `GET /api/sovereignty/sandbox-test` | signed in | The same self-test, via the sovereignty routes |

### Execute

```json
{ "code": "print(sum(range(1000)))", "classification": "normal" }
```

The response includes the result (`exit_code`, `stdout`, `stderr`, `duration_ms`, `timed_out`, `static_validation_passed`, `static_violations`, `network_attempts_blocked`), the **limits** applied (mechanism, memory, CPU, active processes, wall timeout, kill-on-close), and the OS's **accounting** (peak memory, CPU user and kernel time, termination reason). The request size and the number of concurrent executions are capped. Each execution is audited as `security / sandbox_execute`, together with the `policy / tool.invoke` decision.

### Self-test

```json
{
  "checks": [
    {"name": "Static import review", "target": "import socket; socket.socket()", "passed": true, "detail": "line 1: import of denied module 'socket'"},
    {"name": "Runtime socket denial", "passed": true, "detail": "BLOCKED: SovereignNetworkBlocked"},
    {"name": "Process escape review", "passed": true, "detail": "line 2: process escape 'os.system()'"},
    {"name": "Filesystem write confinement", "passed": true, "detail": "BLOCKED: SovereignFilesystemBlocked"},
    {"name": "Permitted work still runs", "passed": true, "detail": "exit 0 in 33ms"},
    {"name": "CPU-time limit terminates a spin", "passed": true, "detail": "exit -9, timed_out=False"},
    {"name": "Memory limit terminates a bomb", "passed": true, "detail": "BLOCKED: MemoryError"}
  ],
  "passed": 7, "total": 7, "assessable": true, "backend": "posix_rlimit",
  "overall": "7 of 7 containment checks held on this host",
  "all_passed": true, "duration_ms": 30715
}
```

## Audit

| Method and path | Permission | Does |
|---|---|---|
| `GET /api/audit?category=&task_id=&search=&limit=300` | `audit.read.own` (own records) or `audit.read.all` | Newest matching records |
| `GET /api/audit/chain` | signed in | `{valid, events, head_hash, broken_at, checked_at}` |
| `GET /api/audit/export` | `audit.read.all` | The whole log as JSON lines. Audited |

```bash
curl -s http://127.0.0.1:8000/api/audit/chain -H "Authorization: Bearer $TOKEN" | jq
curl -s "http://127.0.0.1:8000/api/audit?task_id=$ID" -H "Authorization: Bearer $TOKEN" \
  | jq -r '.[] | "\(.sequence)  \(.category)/\(.action)  \(.actor)"'
```

## Sovereignty

| Method and path | Permission | Returns |
|---|---|---|
| `GET /api/sovereignty` | signed in | `sovereign`, violation count and list, local connections, DNS attempts, `monitor_active`, `monitored_since`, `last_checked` |

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 11.4 · Skills and harnesses](04-skills-harnesses.md) | [↑ 11 · API reference](README.md) | [11.6 · The event stream and a worked session →](06-events-session.md) |

<!-- nav:end -->
