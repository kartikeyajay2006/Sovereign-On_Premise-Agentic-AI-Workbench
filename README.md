# Sovereign On-Premise Agentic AI Workbench

A self-hosted, air-gapped AI workbench for confidential industrial knowledge work
(refineries, PSUs, defence-linked manufacturing, government offices) — approval notes,
engineering calculations, review of scanned drawings/inspection reports, internal
coding tasks — where the underlying data can never leave the organization's premises.

Everything runs locally: models, tools, retrieval, logs, and outputs. No cloud API
calls, no internet requirement, no uncontrolled data egress — and the system proves
that claim live, via a network monitor, rather than just stating it.

## Status

**Planning phase.** No application code yet. See the docs below for the target
architecture, what we're actually building given real constraints, and the hour-by-hour
build plan.

## Documentation

- [`docs/reference-architecture.md`](docs/reference-architecture.md) — the full target
  architecture from the original problem specification (production vision).
- [`docs/implementation-architecture.md`](docs/implementation-architecture.md) — the
  scoped-down architecture we are actually building for this build (4 people, ~36
  hours, CPU-only hardware), and how each simplification maps back to the reference
  architecture.
- [`docs/phased-implementation-plan.md`](docs/phased-implementation-plan.md) — the
  hour-by-hour phased build plan: workstream ownership, integration checkpoints,
  definition of done per phase, and risk mitigations.

## What the demo proves

1. Model auto-selection across at least two task types (text/reasoning-coding vs.
   image/vision), visible in the Agent Timeline.
2. An agentic task carried end-to-end: a scanned inspection report → OCR/vision
   extraction → SOP-grounded reasoning → a drafted `APPROVAL_NOTE.docx`, with citations.
3. A coding task generated and verified inside a sandbox.
4. A multimodal (image/scanned-document) understanding task.
5. Zero external network calls at any point, shown live via a network monitor — the
   actual proof of the sovereignty claim.
