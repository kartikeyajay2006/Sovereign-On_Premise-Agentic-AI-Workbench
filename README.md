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

## Run locally

Install the Python dependencies, start a local Ollama runtime with the approved
models, then run the API and frontend in separate terminals:

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
ollama serve
.venv/bin/uvicorn backend.api.main:app --host 127.0.0.1 --port 8000

cd frontend && npm ci && npm run dev
```

The default local sign-in password is `workbench`. It is intended only for the
demo; set `SOVEREIGN_SECURITY__SEED_USER_PASSWORD` before first start on any
shared host. Install the models declared in `config/models.yaml` before taking
the host offline. Sample SOPs, a scanned inspection report, and a CSV coding
fixture are in `sample_data/`.

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

## What the demo proves

1. Model auto-selection across at least two task types (text/reasoning-coding vs.
   image/vision), visible in the Agent Timeline.
2. An agentic task carried end-to-end: a scanned inspection report → OCR/vision
   extraction → SOP-grounded reasoning → a drafted `APPROVAL_NOTE.docx`, with citations.
3. A coding task generated and verified inside a sandbox.
4. A multimodal (image/scanned-document) understanding task.
5. Zero external network calls at any point, shown live via a network monitor — the
   actual proof of the sovereignty claim.
