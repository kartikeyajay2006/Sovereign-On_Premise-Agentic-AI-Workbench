# 13.2 · Testing

```bash
.venv/bin/python -m pytest -q                       # everything: ~80 s
.venv/bin/python -m pytest -q tests/test_security.py
.venv/bin/python -m pytest -q -k "sandbox or egress"
```

Expected on Linux or macOS: **423 passed, 12 skipped**. The skips are the Windows Job Object tests, which run only on a Windows host where the probe passes.

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

## What the tests are for

Many tests here encode a specific failure that happened once, with the story in the docstring. `test_quoted_figures.py` exists because *"3 of 3 calculations recomputed"* was once reported for three bare numbers. `test_visual_inputs.py` asserts the batch sizes `[3, 3, 3, 3, 3, 3, 2]` for a 20-page scan, because a four-page cap once silently dropped the rest. When you fix a bug, add the test that would have caught it, and say in its docstring what went wrong.

## What is not tested yet

- The **frontend** has no test suite and no lint script. `npx tsc --noEmit` and `npm run build` are the checks.
- There is no **evaluation suite** measuring answer quality against `sample_data/expected-answers.json`. The headline scanned-report scenario can therefore regress without a failing test ([8.5](../08-verification/05-limits.md)).
- There is no **adversarial suite** for prompt injection in documents.
- `scripts/demo_e2e.py` is not run in CI, which is how its scenario 5 went stale.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 13.1 · Repository layout](01-repo-layout.md) | [↑ 13 · Development](README.md) | [13.3 · Conventions →](03-conventions.md) |

<!-- nav:end -->
