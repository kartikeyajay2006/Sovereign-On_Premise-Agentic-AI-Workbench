# AEGIS — Shared Agent Brief (SIH Stage 2)

Read this before anything else. Every planning agent works from these facts.

## Situation

AEGIS is a policy-controlled, evidence-verified sovereign (air-gapped) AI runtime for
industrial use. The prototype **won the internal hackathon** and is through to the next
SIH stage. The repo is at `~/dev/aegis`
(github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench).

The authoritative plan is `AEGIS SIH Implementation Roadmap` — 36 numbered work items in
8 phases. Full text: `docs/plan/00-ROADMAP.txt`.

**The standard to aim for (verbatim from the roadmap):**
> AEGIS should not depend on the AI never making mistakes. It should detect, contain,
> verify, govern, and prove what happened before an AI-generated result becomes an action.

## Current codebase — measured, not guessed

~21,900 LOC. Python/FastAPI backend, Next.js 16 + React 19 frontend.

### Backend (`backend/`, 50 .py files)
```
agents/       orchestrator.py (1313 LOC — the monolith), verifier.py
api/          main.py, task_service.py, routes/{system.py 437, tasks.py 194}
core/         schemas.py (465 — the frozen contract), analyzer, audit, config,
              database, events, identity
models_layer/ client, manager, registry, router
policy/       gateway.py (420)
rag/          knowledge_base.py, parsing.py
security/     sovereignty.py          <-- only file
tools/        deliverables.py, registry.py, sandbox.py
```
Config: `config/{app,classification,models,routing}.yaml`, `config/prompts/prompts.yaml`
Policies: `policies/{access-control,approval-rules,data-classification,tool-permissions}.yaml`
Tests: `tests/` — 10 files (api_security, deliverables, evidence, queue, routing,
security, verifier_robustness, visual_inputs)

### Frontend (`frontend/`, 42 .tsx)
Next.js App Router. Routes: `(app)/{ask,tasks,approvals,audit,registry,security}`,
`sign-in`. Key components: `agent-pipeline`, `evidence-drawer`, `result-experience`,
`sovereignty-topology`, `three-d-layer-view`, `floating-telemetry-hud`,
`animated-technical-background`, `sovereign-radial-hero`, `sovereign-cursor`.
Contract mirror: `lib/types.ts` (474), `lib/api.ts` (384), `hooks/use-event-stream.ts` (SSE).

Stack: Next 16.3.3, React 19, Tailwind **v4** (CSS-first `@theme inline`), shadcn,
@base-ui/react, three + @react-three/fiber, lucide-react, firebase (auth only).

### Design system — extend it, do not reskin it
`frontend/app/globals.css` defines a deliberate **warm-paper Swiss/industrial** language:
surfaces `#f7f7f5 / #ffffff / #f2f1ee`, ink `#090909`, borders `#dcdad6`,
`--radius: 4px`, Geist Sans + Geist Mono, and four semantic status colors:
`--sovereign #16a34a`, `--active #0284c7`, `--approval #d97706`, `--critical #dc2626`.
There is a dark "ink" token family for contrast surfaces.

This restraint is an asset — it reads as instrument panel, not SaaS dashboard. Keep it.
Do **not** propose a palette change. Do **not** apply Catppuccin. Earn expressiveness
through density, typography, motion and information design instead of new hues.

## What does not exist yet (the real gap)

Roadmap items map to directories that are **absent**:
`backend/evidence/` · `backend/verification/` · `backend/engineering/` · `backend/pid/` ·
`backend/sandbox/` · `backend/knowledge/` · `backend/workflow/` · `backend/proof/` ·
`backend/audit/` (only `core/audit.py`) · `backend/auth/` · `benchmarks/` ·
`tests/adversarial/`

`backend/security/` contains only `sovereignty.py` — no `network_guard`,
`egress_monitor`, `prompt_injection`, `content_sanitizer`, `file_guard`, `dlp`.

Frontend has **no** Proof Mode, Policy Explorer, Routing Explorer, P&ID viewer, or
benchmark dashboard. These are the five surfaces the roadmap explicitly requires.

## The tension you must respect

The roadmap's "Do Not Prioritize Yet" list includes:
> Cosmetic UI redesign before Proof Mode, Policy Explorer, Routing Explorer, and P&ID
> viewer work.

This does **not** mean "no frontend work". It means the frontend's job is to make the
evidence, policy, routing and proof chain *legible* — that is where product taste decides
whether a judge believes the system. Build the surfaces that expose truth. Skip the
marketing-site polish.

Corollary: **never render a number the backend did not measure.** `lib/api.ts` already
refuses to fall back to sample data, and the comment explaining why is the product's
conscience. Honour it. No hardcoded metrics, no fake progress, no decorative
"AI is thinking" theatre that does not correspond to a real stage event.

## Output rules for every agent

1. **Read real code before proposing anything.** Cite `path:line`. A proposal that
   contradicts the existing contract is worse than no proposal.
2. Write your deliverable to **your own file only** (assigned in your prompt). Never edit
   another agent's file or shared source — this round is design, not implementation.
3. Be concrete: exact file paths, exact model/type definitions, exact endpoint shapes,
   exact component trees. "Add a service layer" is worthless. Show the signature.
4. Sequence everything against the roadmap's 8 phases and flag cross-agent dependencies
   explicitly as `DEPENDS-ON: <agent> <thing>`.
5. State what you would **cut**. Judging is a fixed-length demo, not a feature audit.
6. Flag anything currently in the repo that is demo-ware or would embarrass the team
   under questioning.
