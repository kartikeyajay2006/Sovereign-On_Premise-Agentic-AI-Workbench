# 4.3 · Backend modules

The backend is about 16,400 lines of Python in eleven packages under `backend/`.

```text
backend/
├── api/            HTTP surface, task queue and worker
├── agents/         orchestrator and verifier: the staged pipeline
├── core/           config, schemas, database, identity, audit, analyzer, events
├── harness/        multi-run jobs
├── models_layer/   registry, router, residency manager, Ollama client
├── policy/         the default-deny gateway
├── rag/            parsing, chunking, embedding, retrieval
├── security/       sovereignty monitor
├── skills/         skill registry
└── tools/          tool registry, sandbox, deliverables
```

## `api/`

| File | Owns |
|---|---|
| `main.py` | The FastAPI app, CORS, the boot and shutdown sequence, the loopback-refusal error handler, the unauthenticated `GET /` status |
| `dependencies.py` | `CurrentUser` (session from bearer token or cookie) and `require_permission(...)`, which asks the gateway and audits the decision |
| `task_service.py` | Uploads, task creation, the queue and its single worker, cancellation, restart recovery, the approval decision |
| `routes/system.py` | Auth, models, routing rules, policies, knowledge, audit, sovereignty, health, tools, the event stream |
| `routes/tasks.py` | Files, tasks, approvals, deliverable downloads |
| `routes/skills.py`, `routes/harnesses.py`, `routes/sandbox.py` | Their screens' endpoints |

## `agents/`

| File | Owns |
|---|---|
| `orchestrator.py` | `AgentOrchestrator.run`: every stage from reading visual inputs to the approval gate; the per-run `EvidenceLedger`; streaming; usage telemetry; the code stage with retries |
| `verifier.py` | The verification engine: material claims, source, citation, page, calculation, code and document checks, and the final report |

The orchestrator is about 2,100 lines. The roadmap splits it into typed stages with explicit inputs and outputs, so each stage can be tested, recovered and shown in a proof view on its own.

## `core/`

| File | Owns |
|---|---|
| `config.py` | Loads every YAML file once, applies `SOVEREIGN_` environment overrides, resolves paths against the project root, and validates at boot |
| `schemas.py` | Every Pydantic model shared between API and pipeline: tasks, profiles, evidence, routing, verification, approval, audit, sovereignty |
| `database.py` | SQLite in WAL mode: users, sessions, files, tasks, knowledge documents and chunks |
| `identity.py` | Password hashing (PBKDF2-SHA256), seeding, sign-in, registration, sessions |
| `audit.py` | The hash-chained log: append under a cross-process lock, query, verify, export |
| `analyzer.py` | Turns a request and its files into a `TaskProfile` using `config/classification.yaml` |
| `events.py` | The in-process event bus behind Server-Sent Events |

## `models_layer/`

| File | Owns |
|---|---|
| `registry.py` | Reconciles `config/models.yaml` with the runtime's installed models: available, unavailable, unregistered |
| `router.py` | Chooses a model per stage: rule, hard gates, scoring, fallback, preferred model, reason |
| `manager.py` | Memory admission, single residency, loads and evictions, all audited |
| `client.py` | The Ollama client: loopback enforcement, generate, stream, embed, image downscaling, usage statistics |

## `policy/`

`gateway.py` is the one place authorisation is decided: permissions, file access, tool invocation, model use, path confinement and the approval requirement. Every decision is a `PolicyEvent` with a subject, action, decision, reason and **rule ID** naming the policy line that decided it (for example `tool-permissions.yaml:tools.python_exec.allowed_roles`), and every decision is audited.

## `rag/`

| File | Owns |
|---|---|
| `parsing.py` | Parsers for Markdown and text, PDF (per page), DOCX, XLSX, CSV and PPTX; PDF page inspection and rasterisation; Tesseract OCR |
| `knowledge_base.py` | Ingestion, chunking, embedding, storage, and search (cosine and BM25 fused by Reciprocal Rank Fusion, or BM25 alone) with clearance applied before ranking |

## `tools/`

| File | Owns |
|---|---|
| `registry.py` | The tools an agent may call (`knowledge_search`, `file_read`, `python_exec`, `spreadsheet_analyze`, `document_generate`), each gated by the policy gateway |
| `sandbox.py` | Static validation, the `sitecustomize` shim, and the three enforcement backends: POSIX rlimits, the macOS watchdog, the Windows Job Object |
| `deliverables.py` | DOCX, XLSX, PPTX and Markdown rendering, hashing |

## `harness/`, `skills/`, `security/`

| Package | Owns |
|---|---|
| `harness/` | Definitions and input validation, expansion into items, the service that submits children through the ordinary queue, aggregation, versioned hashed reports, the `harness_runs` table |
| `skills/` | Built-in skills from `config/skills/`, custom skills in the `skills` table, template validation and hashing |
| `security/sovereignty.py` | The egress monitor |

## Dependency rules

- **Routes are thin.** They authenticate, authorise and delegate to a service.
- **Only the gateway decides policy.** Code asks it; code does not re-implement it.
- **Everything audits through `core/audit.py`.** There is one log.
- **Nothing names a model.** The router resolves models from configuration.
- **Singletons are reset in tests.** `tests/conftest.py` rebuilds config, database, audit and gateway against a temporary tree.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 4.2 · The life of a request](02-request-lifecycle.md) | [↑ 04 · Architecture](README.md) | [4.4 · The frontend →](04-frontend.md) |

<!-- nav:end -->
