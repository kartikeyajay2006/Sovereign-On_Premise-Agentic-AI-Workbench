# 09 · Security and governance

> Model output is untrusted until the required checks pass.

<div align="center">
<img src="../../assets/readme/screenshot-security.webp#gh-light-mode-only" alt="The Assurance screen" width="860">
<img src="../../assets/readme/screenshot-security-dark.webp#gh-dark-mode-only" alt="The Assurance screen" width="860">
</div>

This section describes every security control in AEGIS: what it enforces, where the code is, how it is tested, and **where it stops**. A security document that lists only strengths is marketing; this one lists the gaps too, in [9.6](06-threat-model.md).

| Page | Covers |
|---|---|
| [9.1 Access control](01-access-control.md) | Five roles, 22 permissions, inheritance, departments, and which permissions are enforced where |
| [9.2 The policy gateway](02-policy-gateway.md) | Default deny; every decision with its rule ID; the ten hard-denied actions and what enforces each |
| [9.3 The sandbox](03-sandbox.md) | Static validation, the runtime shim, POSIX, macOS and Windows limits, and what the sandbox does not stop |
| [9.4 The sovereignty monitor](04-sovereignty-monitor.md) | How egress is measured, and the limits of the measurement |
| [9.5 The audit log](05-audit-log.md) | The chain, locking, verification, archiving |
| [9.6 Threat model](06-threat-model.md) | Assets, adversaries, what holds, what does not, and a prioritised fix list |

## Controls at a glance

| Layer | Control | Enforced by |
|---|---|---|
| Identity | Local accounts, PBKDF2-SHA256 (120,000 iterations), 12-hour sessions, HttpOnly SameSite=Strict cookie | `core/identity.py`, `api/routes/system.py` |
| Authorisation | Default-deny RBAC with role inheritance and department rules | `policy/gateway.py`, `api/dependencies.py` |
| Data | Classification ceilings; clearance applied before ranking; runs raised by their evidence | `rag/knowledge_base.py`, `agents/orchestrator.py` |
| Models | Registered-only; approved per classification; loopback-only inference | `models_layer/` |
| Tools | Registered-only; per-role; per-classification | `tools/registry.py`, `policy/gateway.py` |
| Execution | AST validation; OS resource limits; socket and write shim; scrubbed environment | `tools/sandbox.py` |
| Output | Verification; approval gate with separation of duties | `agents/verifier.py`, `api/task_service.py` |
| Record | Hash-chained, append-only, cross-process-locked audit log | `core/audit.py` |
| Proof | Measured egress; on-demand containment self-test | `security/sovereignty.py`, `api/routes/sandbox.py` |
| Browser | Strict Content-Security-Policy; no third-party origin | `frontend/next.config.mjs` |

## Tests

The security properties are held by tests in `tests/`, including `test_security.py`, `test_api_security.py`, `test_authz_gaps.py`, `test_sandbox_api.py`, `test_sandbox_windows.py`, `test_retrieval_clearance.py`, `test_classification_escalation.py`, `test_egress_audit.py` and `test_sovereignty_monitor.py`. Run them with `python -m pytest -q tests/test_security.py tests/test_api_security.py`.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 8.5 · What verification cannot catch](../08-verification/05-limits.md) | [↑ The AEGIS Handbook](../README.md) | [9.1 · Access control →](01-access-control.md) |

<!-- nav:end -->
