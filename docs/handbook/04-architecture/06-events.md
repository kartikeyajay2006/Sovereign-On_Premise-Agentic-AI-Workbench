# 4.6 · The live event stream

Everything the Thread, Approvals, Harnesses and Assurance screens show *as it happens* comes from one Server-Sent Events stream: `GET /api/events`.

## The bus

`backend/core/events.py` is an in-process fan-out: the orchestrator, the task service, the harness service and the sovereignty monitor **publish**; each open browser connection **subscribes** with its own bounded queue.

| Property | Value | Why |
|---|---|---|
| Queue per subscriber | 256 events | A slow browser tab drops events rather than stalling the agent |
| Replay buffer | the last 400 events | A tab that reconnects can catch up on what it missed |
| Not replayed | `task.token` | Streamed fragments would evict the structural events a reconnecting client needs, and a replayed tail would rebuild a draft that starts mid-sentence. The full text always arrives on `task.answer` |

## Visibility

Events are filtered per connection. A person receives an event about a task only if they may read that task: their own, or any when they hold `task.read.all`. Platform events that carry no task content, such as sovereignty heartbeats, are visible to every signed-in user. Pass `?task_id=` to follow one run.

## Every event type

There are **32** event types.

### Task events (25)

| Event | When | Main data |
|---|---|---|
| `task.created` | The task was accepted | Task ID, prompt, profile |
| `task.queued` | Its place in the queue changed | Position, how many are ahead, which task is running |
| `task.classified` | The analyzer profiled it, or later, the evidence raised its class | Profile; or `sensitivity`, `raised_from`, `reason` |
| `task.planned` | A plan was made, or planning was skipped | Steps, or `skipped` |
| `task.stage` | A stage began | Status, message, phase |
| `task.model_selected` | A model was chosen for a stage | Stage, model, reason, candidates |
| `task.model_swapped` | The residency manager evicted a model to load another | Evicted, loaded, memory |
| `task.model_completed` | A model call finished | Usage: tokens, load, evaluation, first-token time, done reason |
| `task.tool_started` / `task.tool_completed` | A tool ran | Tool, arguments summary, outcome |
| `task.extraction` | A batch of pages or an image was read | File, pages, evidence IDs |
| `task.evidence` | Retrieval returned | Mode, count, the evidence items |
| `task.code_generated` | A script was written | Code, attempt |
| `task.code_retry` | A script failed and will be retried | Attempt, the problem |
| `task.sandbox_result` | A script ran | Exit, output, limits, network attempts blocked |
| `task.token` | A fragment of the answer streamed | Text (live only, never replayed) |
| `task.draft` | A deliverable's content was drafted, before rendering | The structured content: title, summary, findings, calculations, recommendation, approval statement |
| `task.answer` | The complete answer | Text |
| `task.verified` | Verification finished | The whole verification report |
| `task.deliverable` | A document was rendered | File, format, SHA-256, released |
| `task.blocked` | No eligible model or tool | Reason |
| `task.failed` | The run failed | Reason |
| `task.cancelled` | The run was stopped | Stage it was in |
| `task.finished` | The run ended, whatever the outcome | Final status, duration |
| `task.approval_decided` | A reviewer decided | Decision, reviewer, comment, status |

### Harness events (5)

`harness.started`, `harness.child` (one item settled), `harness.report` (a report version was written), `harness.cancelling`, `harness.finished`.

### Sovereignty events (2)

`sovereignty.status` (each sample: egress count, local connections, DNS attempts, violations) and `sovereignty.error` (the monitor could not observe).

## Wire format

```text
: stream open

event: task.stage
data: {"event":"task.stage","task_id":"8b78…","at":"2026-09-25T18:43:12Z","data":{"status":"retrieving","message":"Searching the local knowledge base","phase":"retrieval"}}
```

When nothing has happened for 20 seconds, the server sends a `: keep-alive` comment so proxies do not close the idle connection.

Any SSE client can consume it. From a terminal:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"engineer","password":"workbench"}' | jq -r .token)
curl -N http://127.0.0.1:8000/api/events -H "Authorization: Bearer $TOKEN"
```

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 4.5 · The data model](05-data-model.md) | [↑ 04 · Architecture](README.md) | [05 · Models and routing →](../05-models-and-routing/README.md) |

<!-- nav:end -->
