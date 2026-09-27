# 13.2 · Testing

```bash
.venv/bin/python -m ruff check backend scripts tests
.venv/bin/python -m pytest -q                       # everything: ~80 s
.venv/bin/python -m pytest -q tests/test_security.py
.venv/bin/python -m pytest -q -k "sandbox or egress"
```

As measured on CI (2026-09-26): **921 passed, 13 skipped** on Linux, **933 passed, 1 skipped** on Windows. After the relief-device, network-namespace and approval-footer commits of 2026-09-27: **959 passed, 13 skipped** on Linux, measured locally; after the error sweep the same day, **981 passed, 13 skipped**. Windows not yet re-measured, where the network-namespace tests skip. The Linux skips are the Windows Job Object tests, which run only on a Windows host where the probe passes, and the real-container sandbox test, which runs only where Podman or Docker is installed.

## Isolation

`tests/conftest.py` runs before anything is imported. It points every storage path, the database and the audit log at a fresh temporary directory through `SOVEREIGN_*` environment variables, turns off model preloading, and clears every cached singleton so the redirect takes effect. Another fixture gives each test a fresh policy gateway bound to that isolated audit log. **Tests never touch your data.**

Tests do not call the model runtime on purpose: where a test exercises the pipeline, model calls are replaced with fakes and stubs (13 of the test files use them), so results do not depend on what a model happens to say.

## The suite by area

| Area | Files | Tests |
|---|---|--:|
| **Security**: sandbox layers, static validation, limits, API authorisation, authorisation gaps | `test_security.py`, `test_api_security.py`, `test_authz_gaps.py`, `test_sandbox_api.py`, `test_sandbox_windows.py` | 86 |
| **Sovereignty and audit**: the egress monitor, egress in the audit log | `test_sovereignty_monitor.py`, `test_egress_audit.py` | 9 |
| **Retrieval and classification**: clearance before ranking, escalation by evidence | `test_retrieval_clearance.py`, `test_classification_escalation.py` | 10 |
| **Verification**: claims, citations, quoted figures, robustness to malformed output | `test_claim_verification.py`, `test_citation_integrity.py`, `test_quoted_figures.py`, `test_verifier_robustness.py` | 55 |
| **Evidence and visual input**: the ledger, per-page PDF batches | `test_evidence.py`, `test_visual_inputs.py` | 21 |
| **Pipeline**: conversation fast path, planning gate, queue, streaming, usage telemetry | `test_conversation_fast_path.py`, `test_planning_gate.py`, `test_queue.py`, `test_streaming.py`, `test_usage_telemetry.py` | 80 |
| **Routing**: rules, fallbacks, preferred models | `test_routing.py`, `test_model_preference.py` | 37 |
| **Skills and harnesses**: definitions, expansion through the real analyzer, aggregation, runner, API, integration | `test_skills.py`, `test_harness_*.py` | 127 |
| **Deliverables** | `test_deliverables.py` | 10 |

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request. None of its jobs installs or calls a model.

| Job | Runner | What it runs |
|---|---|---|
| `backend (ubuntu, Python 3.11)` | `ubuntu-latest` | `compileall` over `backend`, `scripts`, `tests`; a probe that fails the job if POSIX resource limits are unavailable; then the whole suite, `tests/adversarial` included |
| `backend (windows, Python 3.11)` | `windows-latest` | the whole suite, where the sandbox runs under a Job Object |
| `frontend (typecheck, build and smoke tests)` | `ubuntu-latest` | `npm ci`, `tsc --noEmit` for the app and for the smoke tests (`tsconfig.e2e.json`), `next build`, then Playwright's Chromium (`--with-deps`) and `npm run test:e2e` against that build |

The Linux job is the one that runs the sandbox containment tests (`TestSandboxContainment` and the recomputation tests). They skip on a host without resource limits, so the probe step makes sure they run on the runner instead of passing as skips. The Windows job runs the whole suite as well. Python is 3.11, the version the Dockerfile ships. pip and npm downloads are cached, and every action is pinned to a commit SHA.

To run what CI runs, locally:

```bash
python -m compileall -q backend scripts tests
python -m ruff check backend scripts tests
python -m pytest -q -p no:cacheprovider -rs
cd frontend && npm ci && npx tsc --noEmit -p . && npx tsc --noEmit -p tsconfig.e2e.json && npx next build
npx playwright install chromium && npm run test:e2e   # builds again, see below
```

## Frontend smoke tests

`frontend/e2e/` holds Playwright smoke tests: 13 tests, about 35 s once the app is built. They run against a production build served by `next start` on port 3300 (`frontend/playwright.config.ts` starts it), in Chromium.

**No backend, no model.** Every request to `/api/**` is answered in the browser by `page.route()` from the fixtures in `frontend/e2e/fixtures/`, so nothing reaches FastAPI or Ollama and no run is started. The fixtures are typed by the same interfaces the screens use (`lib/types.ts`, `components/*/api.ts`, `features/*/model/types.ts`), so a renamed field fails `tsc -p tsconfig.e2e.json` in the fixture as it would on the screen, and the run content is the real run in `public/landing/run.json`. Dates are fixed. The server's own `/api` rewrite points at a closed port (`WORKBENCH_API_URL=http://127.0.0.1:9`), so a request the browser did not intercept fails instead of reaching a workbench running on the same machine.

Two checks run after **every** test (`e2e/support/api.ts`): no console error or uncaught page error, and no `/api` call without a fixture. A screen that starts calling a new endpoint fails here, naming it, until its fixture is added.

| File | What it asserts |
|---|---|
| `landing.spec.ts` | `/` has `#crew`, `#proof`, `#product`, `#run-it` and the footer; scrolling `#proof` to the top sets `aria-current="location"` on its header link and only that one; at 390 px the document is no wider than the window and cannot be scrolled sideways |
| `sign-in.spec.ts` | the username step, then the password step (focused, with the name carried over), then `/console`; the demo-account list from `GET /api/auth/directory`, where one click signs in and lands on `/console` |
| `console.spec.ts` | the empty thread's greeting and four starter cards; a delivered run opened by `?run=` renders the Brief: the lede, the numbered claims (one per remaining sentence), the sources rail ("Sources · 2 of 4 cited") and the stamp "Delivered · 4/5", every figure computed from the fixture; a held run names who must release it ("Release needs the Approving Reviewer.") and what is withheld; a High finding reads "Release needs Head of Inspection, then Plant Manager." and never "or", then "Plant Manager (1 of 2 signed)" after the first signature; with `reducedMotion: 'reduce'`, a Brief released live (the run is in flight, the event stream reports it finished, the record is read again) shows lede, claims and stamp at opacity 1 with no animation running |
| `screens.spec.ts` | Approvals, Harnesses, Audit and People each load with their heading and a row from the fixtures |

```bash
cd frontend
npx playwright install chromium            # once
npm run test:e2e                            # next build, next start :3300, the tests
E2E_SKIP_BUILD=1 npm run test:e2e           # reuse an existing .next (it must have been built with WORKBENCH_API_URL=http://127.0.0.1:9)
E2E_WEBPACK=1 npm run test:e2e              # build with webpack
```

`E2E_WEBPACK=1` is for a git worktree on Windows whose `node_modules` is a junction to another checkout: Turbopack refuses a symlink that points out of the project. A normal checkout, and CI, build with Turbopack. CI runs the tests on Ubuntu only; the Windows job builds nothing for the frontend.

To add a test: import `test` and `expect` from `e2e/support/api.ts`, start from the default routes (signed in as the administrator, the fixture runs recorded), and replace what the test needs with `api.set({ 'GET /api/...': body })`. A handler can be a function of the request, and `json(status, body)` and `sse(events)` answer with an error or an event stream.

## What the tests are for

Many tests here encode a specific failure that happened once, with the story in the docstring. `test_quoted_figures.py` exists because *"3 of 3 calculations recomputed"* was once reported for three bare numbers. `test_visual_inputs.py` asserts the batch sizes `[3, 3, 3, 3, 3, 3, 2]` for a 20-page scan, because a four-page cap once silently dropped the rest. When you fix a bug, add the test that would have caught it, and say in its docstring what went wrong.

## What is not tested yet

- The **frontend** has smoke tests only (above), against mocked API responses, and no lint script. They do not run a starter card end to end against a live backend. `scripts/ui_check.py` is the runtime check against a live one: it opens every page under `frontend/app` in headless Chrome, as every demo account and signed out, and fails on any uncaught exception, console error, failed request or blank page, writing a hashed report to `storage/reports/ui-check-*.json`. It needs Chrome and a running console, so CI does not run it; `tests/test_ui_check.py` pins how it finds pages and what it counts as a problem. It proves each screen renders without an error, not that its content is right.
- There is no **evaluation suite** measuring answer quality against `sample_data/expected-answers.json`. The headline scanned-report scenario can therefore regress without a failing test ([8.5](../08-verification/05-limits.md)).
- There is no **adversarial suite** for prompt injection in documents.
- `scripts/demo_e2e.py` and `scripts/golden_demo.py` need a running API with models, so CI does not run them. That is how `demo_e2e.py`'s scenario 5 went stale; run `golden_demo.py` before a demonstration ([14.2](../14-demo-guide/02-rehearsal.md)). `tests/test_golden_demo.py` checks its judgement against a fake API.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 13.1 · Repository layout](01-repo-layout.md) | [↑ 13 · Development](README.md) | [13.3 · Conventions →](03-conventions.md) |

<!-- nav:end -->
