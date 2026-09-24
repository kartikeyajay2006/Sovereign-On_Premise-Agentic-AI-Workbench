# 13.1 · Repository layout

```text
.
├── backend/                 Python API and pipeline (about 16,400 lines)
├── frontend/                Next.js console (about 24,000 lines)
├── config/                  models, routing, classification, prompts, skills/, harnesses/, app settings
├── policies/                access control, approval rules, data classification, tool permissions
├── sample_data/             the SYNTHETIC corpus: sop/, records/, inspection/, datasets/, coding/, expected-answers.json
├── scripts/                 run.sh, seed_demo_data.py, demo_e2e.py, audit_tool.py, capture_landing_fixture.py,
│                            make_sample_inspection_report.py
├── tests/                   435 tests
├── storage/                 runtime data (ignored by git, except .gitkeep)
├── infrastructure/          docker-compose.yml
├── docs/
│   ├── handbook/            this handbook
│   ├── assets/brand/        the mark, lockups, app icon, brand guide
│   ├── assets/readme/       README diagrams and screenshots
│   ├── DEMO.md              scripted demonstration with correct answers
│   ├── USE-CASES.md         use cases
│   ├── RUNTIME-ENVIRONMENT.md   what the sandbox does and does not guarantee
│   ├── design/              design direction and playbook
│   └── plan/                SIH roadmap and planning notes
├── Dockerfile               API image
├── requirements.txt         pinned Python dependencies
└── pytest.ini               test configuration
```

## Where to find things

| To change… | Look in |
|---|---|
| Which model answers | `config/models.yaml`, `config/routing.yaml`, `backend/models_layer/router.py` |
| How a request is classified | `config/classification.yaml`, `backend/core/analyzer.py` |
| What the model is told | `config/prompts/prompts.yaml` |
| The pipeline's stages | `backend/agents/orchestrator.py` |
| A verification check | `backend/agents/verifier.py`, `policies/approval-rules.yaml` |
| Who may do what | `policies/access-control.yaml`, `backend/policy/gateway.py` |
| When a run is held | `policies/approval-rules.yaml` |
| The sandbox | `backend/tools/sandbox.py`, `config/app.yaml` → `sandbox` |
| Retrieval | `backend/rag/knowledge_base.py`, `config/app.yaml` → `knowledge_base` |
| A document format | `backend/tools/deliverables.py` |
| An endpoint | `backend/api/routes/` |
| A screen | `frontend/app/(app)/<route>/page.tsx` → `frontend/components/<area>/` or `frontend/features/<area>/` |
| The mark | `frontend/components/aegis-logo.tsx`, `frontend/app/icon.svg`, `docs/assets/brand/` |
| Design tokens | `frontend/app/globals.css` |
| The demonstration corpus | `sample_data/`, `scripts/seed_demo_data.py` |

## Scripts

| Script | Does |
|---|---|
| `scripts/run.sh` | Start, stop and check both services ([12.1](../12-operations/01-run-script.md)) |
| `scripts/seed_demo_data.py` | Build and index the synthetic corpus ([1.6](../01-getting-started/06-seed-and-run.md)) |
| `scripts/demo_e2e.py` | Drive a full demonstration through the API ([11.6](../11-api/06-events-session.md)) |
| `scripts/audit_tool.py` | Verify or archive the audit chain ([12.3](../12-operations/03-audit-tool.md)) |
| `scripts/make_sample_inspection_report.py` | Regenerate the scanned inspection report images |
| `scripts/capture_landing_fixture.py` | Record a real run as the landing page's replay fixture (`frontend/public/landing/run.json`) |

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 13 · Development](README.md) | [↑ 13 · Development](README.md) | [13.2 · Testing →](02-testing.md) |

<!-- nav:end -->
