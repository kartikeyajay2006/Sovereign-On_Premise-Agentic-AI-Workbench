# Phased Implementation Plan

Budget: **~36 hours, 4 people.** Companion to [implementation-architecture.md](implementation-architecture.md)
(what we're building). This is the original delivery plan, retained as build and demo
context after implementation.

## Workstream ownership

| Workstream | Owns | Primary reference-architecture layers |
|---|---|---|
| **A — Backend core** | FastAPI app, SQLite schema, task analyzer, policy gateway, audit logger | API/application layer, task analyzer, policy gateway, audit §5 §4 |
| **B — Model layer** | Ollama/llama.cpp integration, model registry + router, prompt templates, `/generate` endpoint | Model router, model manager |
| **C — Agent, RAG, sandbox** | Orchestrator loop, RAG ingestion/retrieval, Python sandbox, verification checks | Agent orchestrator, knowledge base, secure sandbox, verification engine §6 §7 |
| **D — Frontend + deliverables** | Next.js UI (chat, file manager, agent timeline, security center), DOCX generation, sovereignty monitor UI | Presentation layer, deliverable engine, sovereignty monitor |

Each workstream also owns the smoke test for its own layer (see Definition of Done per
phase).

## Phase 0 — Setup & contract freeze (Hour 0–2, everyone together)

- Agree and write down the shared contract from `implementation-architecture.md`
  (task lifecycle JSON, `/generate` shape, tool-call shape) — **do not start Phase 1
  until this is frozen**, since all 4 people build against it independently.
- Repo scaffold per the layout in `implementation-architecture.md`, pushed.
- Everyone: install Ollama/llama.cpp, pull/convert candidate models, do a 15-minute
  timeboxed spike on the laptop to confirm the vision model choice (moondream2 vs
  Qwen2-VL-2B) actually runs in acceptable time — pick one and move on, don't relitigate
  this later.
- Pick and commit the sample data: 1 scanned inspection report image, 2–3 short sample
  SOP/manual text files, 1 sample CSV for the coding-task demo.
- Each person's service returns **mock/stubbed responses** matching the frozen contract
  shape, so integration can start incrementally instead of at the end.

**Definition of Done:** contract committed to `docs/`, repo skeleton pushed, all 4
services boot locally and respond with mocked data on the agreed endpoints, sample data
committed to `sample_data/`.

## Phase 1 — Core build, parallel (Hour 2–10)

- **A:** SQLite schema (users, tasks, files, audit_log, policies) · task analyzer
  (rule/keyword-based classification of input type, task type, complexity, sensitivity
  — no time for a learned classifier) · default-deny policy gateway middleware · audit
  logger (hash-chained JSONL) · `POST /tasks`, `GET /tasks/{id}`, `GET /audit`.
- **B:** working `/generate` backed by the real reasoning/coding model (Ollama or
  llama.cpp server) · model registry with 2 entries · rule-based router
  (`task_type/input_type → model_id`) · prompt templates for reasoning, coding, and
  document-interpretation.
- **C:** RAG ingestion script (chunk + embed sample SOPs into FAISS) + retrieval
  function returning cited passages · sandbox runner (`subprocess`, `resource` limits,
  timeout, static AST import check) · orchestrator skeleton (plan → select → execute →
  observe → verify, bounded steps, single retry).
- **D:** Next.js scaffold · chat + file upload page wired to A's `POST /tasks` ·
  Agent Timeline component polling `GET /tasks/{id}` · Security Center panel skeleton ·
  `docx_generate` function (python-docx) producing a templated approval note from
  structured input.

**Checkpoint (Hour ~8–10), everyone:** wire A ↔ B for a **text-only** task
(no RAG, no sandbox, no vision yet) and confirm one full request round-trips: task
created → classified → real model called → response stored → visible in the UI.

**Definition of Done:** the text-only path works end-to-end on the real stack; every
workstream's own unit-level smoke test passes.

## Phase 2 — Feature completion, first full integration (Hour 10–20)

- **Path 1 (agentic + multimodal):** C wires vision call (via B) + RAG retrieval + a
  sandboxed calculation tool into the orchestrator; D's `docx_generate` is called with
  the orchestrator's structured findings; A stores/serves the resulting file; D shows a
  download link plus the evidence panel (source, page/section, excerpt per §8 of the
  reference architecture).
- **Path 2 (coding task):** B's coding prompt → C's sandbox executes generated code →
  verification checks exit code/output → D shows code, stdout/stderr, and a
  verified/failed badge.
- **Multimodal standalone:** upload an image directly in chat → vision model →
  extraction shown as its own step (reuses Path 1's vision call, demoed independently
  too, satisfying the multimodal criterion on its own).
- **Sovereignty monitor:** D+A build the `psutil.net_connections()` poller and SSE
  stream; Security Center panel shows live outbound-connection count (should read 0
  throughout); OS-level egress block configured on the demo machine as a second layer of
  proof, not just self-reporting.
- **Human approval gate:** D adds approve/reject buttons; A flips task status and logs
  the decision to audit before the deliverable is marked released.

**Checkpoint (Hour ~18–20), everyone:** run all three demo scenarios back-to-back on
the actual laptop. Write down every failure — this is expected; Phase 3 exists to fix
exactly this list.

**Definition of Done:** all three demo paths complete once, even if slow or rough at the
edges. No new features start after this checkpoint.

## Phase 3 — Hardening & polish (Hour 20–28)

- Fix everything on the Hour-20 failure list, in priority order: correctness bugs in the
  two required demo paths first, then sovereignty-monitor accuracy, then UI polish.
- Harden the sandbox's no-network guarantee (retest the static-check + resource-limit
  path with a deliberately "hostile" script that tries to import `socket`/`requests`,
  confirm it's rejected before execution).
- Verify the audit hash chain: tamper with one entry manually, confirm a chain-check
  script detects it — this is the "immutable" claim, so it should actually be checked,
  not asserted.
- CPU performance: pre-warm/keep models loaded in memory at startup (avoid cold-load
  latency mid-demo), stream partial output to the UI so waits feel responsive, trim
  prompt lengths.
- Agent Timeline: make sure it clearly shows model-selected + reason, each tool call,
  and verification results — this is the visible proof of "agentic," not just working
  backend logic nobody sees.

**Checkpoint (Hour ~26–28):** feature freeze. Nothing but bug fixes past this point.

**Definition of Done:** both required demo paths run reliably (≥3 consecutive successful
runs each on the demo machine), sovereignty monitor and audit chain both verified by an
adversarial test, not just a happy-path run.

## Phase 4 — Demo prep & submission (Hour 28–36)

- Lock 2–3 known-good sample inputs (the exact image, the exact SOP set, the exact
  coding prompt) — given CPU inference speed, the live demo should run prepared inputs,
  not improvised ones.
- Record a backup video of one fully successful run of each required path, in case live
  CPU inference stalls during judging.
- Write the demo script: map each visible moment in the UI to a specific judging
  criterion from the problem statement (model auto-selection, agentic end-to-end,
  verified coding, multimodal, zero-egress proof) so nothing the judges care about is
  left implicit.
- Finalize `README.md` and the docs in `docs/` (this plan, the implementation
  architecture, the reference architecture) so the repo tells the same story as the demo.
- Buffer: last ~2 hours reserved for the unexpected, not scheduled.

**Definition of Done:** demo script written, backup recordings exist, repo pushed,
submission complete.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| CPU inference too slow for a live demo | Small quantized models chosen up front (Phase 0 spike); pre-warmed models; streaming output; prepared inputs; recorded backup video |
| Vision model doesn't run acceptably on this laptop | Phase 0 timeboxed spike picks between 2 candidates before anyone builds on top of it |
| Integration breaks late because workstreams drifted from the contract | Contract frozen in Phase 0; Hour-8 and Hour-18 checkpoints are mandatory, not optional |
| Sandbox "no network" claim doesn't actually hold | Explicit adversarial test in Phase 3 (try to break it, don't just assume it works) |
| Running out of time before all 3 demo paths work | Priority order is fixed: agentic+multimodal path first (it's the headline example in the problem statement), coding-sandbox path second, polish last |

## Explicit non-goals for this build (see reference-architecture.md for the full vision)

Postgres/Redis, pgvector, full RBAC/ABAC, Docker+gVisor container isolation, Kubernetes,
multi-model registry beyond 2 models, backup/DR, model governance lifecycle, department-
level data classification. These are real parts of the target architecture and are
documented as such — they are out of scope for a 36-hour, no-GPU build, not forgotten.
