# Implementation Architecture (Hackathon Build)

> Scoped-down architecture we are actually building, given real constraints: **4 people,
> ~36 hours, one CPU-only laptop (Core i7, no dGPU) for development and demo.** This
> document maps every simplification back to the [reference architecture](reference-architecture.md)
> so nothing here reads as a random shortcut — it's a deliberate, documented trade.
> See [phased-implementation-plan.md](phased-implementation-plan.md) for the hour-by-hour
> build schedule and who owns what.

## Constraints that shaped this design

- **No GPU.** All inference is CPU-only. This rules out large open-weight models and
  anything expecting VRAM. We use small, heavily quantized GGUF models served by
  `llama.cpp` / Ollama.
- **~36 hours, 4 people.** Every layer in the reference architecture that isn't required
  to demonstrate the 5 judging criteria (model auto-selection, agentic end-to-end task,
  verified coding task, multimodal task, zero-egress proof) is either stubbed to the
  simplest thing that is still real (not faked), or explicitly deferred.
- **Single demo machine.** No distributed deployment, no Kubernetes, no multi-node GPU
  cluster. Docker Compose is enough to prove the container-platform concept.

Nothing here is faked for the demo — every box below is a real, working component. We
are choosing *smaller and fewer* over *simulated*.

## What's real vs. deferred, layer by layer

| Reference-architecture layer | Hackathon implementation | Why / deferred to |
|---|---|---|
| PostgreSQL + Redis | **SQLite** (`aiosqlite`) for all tables (users, tasks, files, audit, policies); in-process `asyncio.Queue` for the job queue | No multi-worker coordination needed for a single-machine demo. Deferred: Postgres/Redis, horizontal worker scaling. |
| pgvector + reranker | **FAISS (or `sqlite-vec`)** + `sentence-transformers` (small, CPU-friendly, e.g. `all-MiniLM-L6-v2`) over a handful of sample SOP/manual docs | Same retrieval *behavior* (embed, search, cite), tiny corpus. Deferred: reranker, pgvector, large-scale ingestion. |
| Docker + gVisor sandbox | Python `subprocess` sandbox: fresh temp dir, `resource.setrlimit` (CPU time, memory, file size), wall-clock timeout via `subprocess.run(timeout=...)`, restricted environment (no `PATH` to network tools, `HOME` unset), AST-level static check rejecting `socket`/`requests`/`urllib`/`subprocess`/`os.system` imports before execution, no network namespace access on this single-user laptop | True kernel-level isolation (gVisor) needs infra we don't have time to stand up. The *policy* (no network, no host fs, resource limits, static pre-check) is real and enforced; the *isolation mechanism* is process-level, not container-level. Documented explicitly as a known gap for production. Deferred: Docker+gVisor, full syscall filtering. |
| RBAC / ABAC | One real role check: `operator` vs `reviewer`, enforced in FastAPI dependency injection, backed by a `users` table | Same enforcement point (default-deny middleware) as the target design, fewer roles. Deferred: full ABAC, department-level policy. |
| Model router | Real router: task profile (from Task Analyzer) → model registry lookup → model ID. Two real local models registered (see below) | Same interface/behavior as the target registry, 2 models instead of N. Deferred: hot-swap, quantization manager, VRAM checker (no VRAM to check). |
| Agent orchestrator | Real plan → select action → execute → observe → verify loop, implemented as an explicit Python state machine (not full LangGraph) with a bounded step count and a retry-once policy | Same lifecycle stages as the reference design (§4), simpler engine. Deferred: LangGraph, complex replanning. |
| Audit log | Real **hash-chained, append-only JSON-lines log** (`prev_hash` field per entry) — tamper-evident even without a database | Satisfies "immutable, searchable, locally stored" without standing up a DB-backed audit service. Deferred: full DB-backed retention/disposition policy. |
| Sovereignty / network monitor | Real: a background poller (`psutil.net_connections()`) samples the process tree every ~1s, and the OS firewall (`iptables`/`nftables` `OUTPUT` chain, or offline dev machine) blocks all egress except `localhost`. Counts are pushed to the frontend over SSE and shown live | Directly proves the "no external calls" claim, which the problem statement says is the actual point. Not deferred — this is core to the deliverable. |
| Container platform | Docker Compose: `frontend`, `api`, `model-server` (Ollama), `sandbox-runner` | Proves the containerization concept without Kubernetes. Deferred: full orchestration, autoscaling. |
| Backup/DR, model governance lifecycle | Not built | Out of scope for a 36-hour demo; documented as future work in the reference architecture. |

## Models (finalized choice)

CPU-only, so every model must run acceptably on a laptop CPU:

| Role | Model | Why |
|---|---|---|
| Reasoning + coding | `Qwen2.5-1.5B-Instruct` (GGUF, Q4_K_M) via Ollama/llama.cpp | Small enough for multi-second CPU responses; good enough instruction following for SOP reasoning and short Python generation. Fallback: `Qwen2.5-3B-Instruct` if the laptop handles it acceptably in testing. |
| Vision | `moondream2` (1.9B, GGUF) or `Qwen2-VL-2B-Instruct` (GGUF) via llama.cpp's vision support | Smallest workable open-weight vision-language model for OCR-ish extraction from a scanned image. Picked after a timeboxed spike in Phase 0 (see plan) — whichever actually runs fast enough on the laptop wins. |
| Embeddings | `all-MiniLM-L6-v2` (sentence-transformers, ONNX/CPU) | Tiny, fast, standard for CPU RAG. |

This already satisfies "model auto-selection across at least two different task types":
the router picks the vision model for image/scan input and the reasoning model for
text/planning/coding — visibly, in the Agent Timeline.

## Shared contract (frozen in Phase 0, everyone builds against this)

### Task lifecycle (matches reference §4, condensed)

```
POST /tasks  {input_type, files[], prompt, user_id}
  → task_id
GET /tasks/{task_id}
  → {
      status: received|classified|planned|retrieving|executing|verifying|
              awaiting_approval|approved|rejected|delivered|failed,
      classification: {input_type, task_type, complexity, sensitivity},
      plan: [step, ...],
      model_selected: {role, model_id, reason},
      tool_calls: [{tool, args, output, ok}, ...],
      verification: {checks: [...], valid: bool},
      approval: {required: bool, reviewer, decision, timestamp} | null,
      deliverable: {filename, format, hash, url} | null,
      evidence: [{source, page/section, excerpt}, ...]
    }
GET /audit?task_id=...
  → immutable event chain for that task
GET /sovereignty
  → {outbound_connections: int, cloud_calls: 0, last_checked: ts}  (SSE stream)
POST /tasks/{task_id}/approve  {decision: approve|reject, comment}
```

### Internal model-serving contract (Workstream B exposes this to A/C)

```
POST /generate
  {role: reasoning|coding|vision, prompt, images?: [...], system?: str}
  → {text, model_id, latency_ms}
```

### Tool-call contract (Workstream C's tools, called by the orchestrator)

```
{tool: "rag_search"|"python_exec"|"docx_generate"|"file_read"|"file_write",
 args: {...}}
  → {ok: bool, output, evidence?: [...], stdout?, stderr?, exit_code?}
```

Freezing these four shapes in Phase 0 is what lets all 4 workstreams build in parallel
against mocks from hour 2 and integrate continuously instead of at the end.

## Data flow — the two demo paths

### Path 1: agentic + multimodal (scanned report → approval note)

```
upload scanned inspection report (image)
  → Task Analyzer: input_type=image, task_type=document_generation, sensitivity=normal
  → Model Router → VISION model → OCR/extraction of findings
  → Model Router → REASONING model → interpret findings against retrieved SOP
  → Orchestrator: rag_search(SOP) → python_exec(any calc) → docx_generate(approval note)
  → Verification: evidence present? calc recomputed independently? consistent?
  → Human Approval Gate (reviewer approves/rejects in UI)
  → APPROVAL_NOTE.docx served + evidence panel + audit trail
```

### Path 2: coding task (verified in sandbox)

```
user prompt: "write a script that computes X from this CSV"
  → Task Analyzer: input_type=text, task_type=coding
  → Model Router → CODING-mode prompt on reasoning model → generated Python
  → Sandbox: static check → subprocess w/ resource limits → stdout/stderr/exit_code
  → Verification: exit_code==0, output shape check
  → Result + code + execution log shown, marked "verified" or "failed" with reason
```

Both paths run through the same policy gateway, audit logger, and sovereignty monitor,
which is what makes this an *architecture* demo and not two disconnected demo scripts.

## Repository layout (hackathon-scoped subset of reference §13)

```
/
├── docs/                         reference-architecture.md, implementation-architecture.md,
│                                  phased-implementation-plan.md
├── backend/
│   ├── api/                      FastAPI app, routes (tasks, audit, sovereignty, approve)
│   ├── core/                     task analyzer, policy gateway, audit logger, db (sqlite)
│   └── models.py                 pydantic schemas matching the shared contract
├── agents/
│   ├── orchestrator.py           plan/select/execute/observe/verify loop
│   ├── router.py                 model registry + selection rule
│   └── verifier.py                evidence/calc/code checks
├── model_server/                 llama.cpp/Ollama wrapper exposing POST /generate
├── tools/
│   ├── rag/                      ingest.py, retrieve.py (FAISS + MiniLM)
│   ├── sandbox/                  runner.py (subprocess isolation + static check)
│   └── documents/                docx_generate.py
├── frontend/                     Next.js app (chat, file manager, agent timeline,
│                                  security center)
├── sample_data/                  sample SOPs, sample scanned inspection report image
├── infrastructure/
│   └── docker-compose.yml        frontend, api, model-server, sandbox-runner
└── tests/                        smoke tests for each of the two demo paths
```

## Known gaps (say these out loud in the demo, don't hide them)

- Sandbox isolation is **process-level** (resource limits + static import checks +
  no network route), not gVisor/container-level. Correct for a hackathon laptop, not
  for production multi-tenant use — called out explicitly as future work.
- Single demo user set (`operator`/`reviewer`), not full multi-department RBAC/ABAC.
- Small corpus (a handful of sample SOPs), not a production knowledge base.
- CPU inference is slow (multi-second to ~1 min per response depending on model/size).
  We rehearse with pre-selected sample inputs (see phased plan, Phase 4) rather than
  relying on live improvisation, and prepare a recorded backup run.
