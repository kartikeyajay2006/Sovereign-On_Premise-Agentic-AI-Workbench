# Sovereign On-Premise Agentic AI Workbench

A self-hosted, air-gapped AI workbench for confidential industrial knowledge work
(refineries, PSUs, defence-linked manufacturing, government offices) — approval notes,
engineering calculations, review of scanned drawings/inspection reports, internal
coding tasks — where the underlying data can never leave the organization's premises.

Everything runs locally: models, tools, retrieval, logs, and outputs. No cloud API
calls, no internet requirement, no uncontrolled data egress — and the system proves
that claim live, via a network monitor, rather than just stating it.

## Status

**Working local MVP.** The FastAPI backend, Next.js console, local Ollama model
router, RAG knowledge base, sandbox, policy gateway, approval workflow,
hash-chained audit log, and live sovereignty monitor are implemented. The
production-scale items explicitly listed as deferred in the architecture are
still deliberately out of scope for this single-machine build.

## Run it

First time only — install dependencies and the local models:

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd frontend && npm install && cd ..

ollama serve &                    # the local model runtime
ollama pull qwen3:8b              # reasoning
ollama pull qwen2.5vl:3b          # reading scans and drawings
ollama pull nomic-embed-text      # document search
```

Then start everything with one command:

```bash
./scripts/run.sh
```

It stops anything already running, builds the console, starts the API and web
server in the right order, and waits until both answer. Open
**http://localhost:3000** and sign in as `engineer` with the password
`workbench`.

```bash
./scripts/run.sh --status   # what is running
./scripts/run.sh --stop     # stop both services
./scripts/run.sh --dev      # frontend in development mode
```

Change the demo password before putting this on any shared machine: set
`SOVEREIGN_SECURITY__SEED_USER_PASSWORD` before the first start. Every model
declared in `config/models.yaml` must be pulled while the host still has
network access; after that it runs disconnected. Sample procedures, a scanned
inspection report and a CSV fixture are in `sample_data/`.

### Adding a model

Append an entry to `config/models.yaml` and pull it. No code changes: the
registry reconciles what is declared against what is installed, and the router
scores candidates on capability, so a new model becomes routable on the next
refresh. A model that is installed but not declared is refused by policy.

### Checking your work

```bash
.venv/bin/python -m pytest tests/ -q         # backend, including containment tests
node scripts/check-console.mjs               # every screen, free of browser errors
.venv/bin/python scripts/demo_e2e.py         # the full workflow end to end
.venv/bin/python scripts/audit_tool.py verify  # activity log chain integrity
```

If the activity log ever reports **ALTERED**, `audit_tool.py verify` explains
what happened: entries sharing a sequence number mean two service instances
wrote at once, while a single mismatched entry means the file was edited.
`audit_tool.py archive` retires a broken chain and starts a new one — it copies
the old log aside unmodified and records the archive as the first entry of the
new chain, so nothing is ever quietly rewritten.

## Run with Docker Compose

`infrastructure/docker-compose.yml` starts the frontend, API, and local model
runtime on an internal-only Docker network. The Ollama model volume must be
pre-seeded with approved models before deploying to an air-gapped machine.

```bash
docker compose -f infrastructure/docker-compose.yml up --build
```

## Documentation

- [`docs/reference-architecture.md`](docs/reference-architecture.md) — the full target
  architecture from the original problem specification (production vision).
- [`docs/implementation-architecture.md`](docs/implementation-architecture.md) — the
  scoped-down architecture we are actually building for this build (4 people, ~36
  hours, CPU-only hardware), and how each simplification maps back to the reference
  architecture.
- [`docs/phased-implementation-plan.md`](docs/phased-implementation-plan.md) — the
  original phased build plan, retained as delivery and demo context.

## What you can see working

1. **The right model for each step.** A scanned report is read by the vision
   model and reasoned about by the reasoning model. The workspace shows which
   was chosen at each step and the grounds for choosing it.
2. **A full job, start to finish.** Scanned inspection report → readings
   extracted → your procedure retrieved → figures recomputed → an approval note
   drafted as a Word file with citations → held for a human to sign.
3. **Code that has actually been run.** Generated code executes in a sandbox
   with no network route; if it does not run cleanly, verification fails and the
   result is held.
4. **Reading a scan or drawing** as a task in its own right.
5. **The containment proof.** The Security page shows live connection counts, a
   sandbox break-in test you can trigger yourself, and an activity log whose
   hash chain reports exactly where it was altered, if it ever is.

## Speed, and how to get more of it

The reference machine for this build is a laptop with no GPU, so inference runs
on the CPU at roughly four tokens per second. That number governs everything:
the length of a response is the cost, not the complexity of the request.

A full agentic run — read a scan, retrieve procedures, compute, draft, verify —
takes a few minutes on that hardware. Nothing is stalled; the workspace shows
each step as it happens, and every stage is timed in the activity record.

Three things already tuned for it, all in config:

- **Output budgets per stage** (`config/routing.yaml → stage_output_tokens`). A
  plan is short JSON and gets 350 tokens; a drafted document gets 900. This
  roughly halved total run time.
- **Scan downscaling** (`config/app.yaml → max_image_edge_px`). Image tokens
  dominate the reading stage. Dropping to 1100px took it from 255s to 81s with
  no loss of legibility.
- **One model resident at a time** (`single_model_residency`). Reading happens
  before planning so the vision and reasoning models are each loaded once.

**To go faster still,** pull a smaller reasoning model and register it — the
router prefers the smaller of two models that both satisfy the requirement, so
it will be selected automatically and the timeline will say why:

```bash
ollama pull qwen2.5:3b     # roughly 2-3x faster than the 8B, less capable
```

Add a matching entry to `config/models.yaml`. Quality drops with size, which is
the trade you are making; the routing reason shown in the workspace makes it
visible rather than silent.

**On a GPU machine** raise the budgets in `routing.yaml`, set
`single_model_residency: false` so models stay loaded, and raise
`max_context_tokens` — the trade-offs above only exist because of CPU inference.

## Contributors

- [Kartikeya Jay](https://github.com/kartikeyajay2006)
- [Ankit Pandey](https://github.com/ankit25bcs10610)


