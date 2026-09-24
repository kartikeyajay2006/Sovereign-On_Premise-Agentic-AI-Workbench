# 9.6 · Threat model

This page states what AEGIS protects, against whom, what holds, and what does not. Every "does not hold" below was demonstrated on a running instance, not inferred.

## Assets

| Asset | Why it matters |
|---|---|
| Procedures, records and attachments | Confidential to Restricted industrial information; the reason the system is on-premise |
| Run records | What the model saw, said and was checked on; include restricted content |
| Deliverables | Documents that may authorise real actions once released |
| The audit log | The evidence that everything else happened as recorded |
| Sessions and credentials | Whoever holds them acts as that person |
| Model weights and configuration | Decide what answers and what is allowed |

## Adversaries and trust boundaries

| Adversary | Can | Primary controls |
|---|---|---|
| **A signed-in user acting beyond their role** | Use the UI and API with their own session | RBAC, clearance before ranking, separation of duties, audit |
| **A hostile document** (prompt injection in an SOP or a scan) | Put text in front of the model | Evidence is data in its own prompt section; the pipeline decides which tools run (a plan can add only code execution, which is sandboxed); output is verified and held |
| **A model that is wrong or manipulated** | Emit any text, any code | Verification; approval; code validated and contained; no tool selection by the model |
| **Generated code** | Run inside the sandbox | Static rules, OS limits, network and write shim |
| **Someone on the network** | Reach the host's open ports | Loopback binding of the API and model runtime |
| **Someone with shell or file access on the host** | Read and write `storage/` | Out of scope for application controls: operating-system permissions, disk encryption, host hardening |

## What holds

| Threat | Result | How |
|---|---|---|
| Operator retrieves a Restricted passage | ✅ Blocked | Clearance applied before ranking; checked twice |
| Operator sees that a Restricted document exists | ✅ Blocked | Documents list filtered by the same rules |
| Reviewer approves their own run | ✅ Blocked | Separation of duties by account |
| Auditor creates a task | ✅ Blocked | No `task.create` |
| Model routed to an unapproved or unregistered model | ✅ Blocked | Router hard gates; registry |
| Inference pointed at a remote server | ✅ Blocked | Loopback-only client, HTTP 503 |
| Generated code opens a socket | ✅ Blocked | Denied imports and the `_socket` shim |
| Generated code runs `os.system`, `subprocess`, `getattr` tricks | ✅ Blocked | Static validation |
| Generated code writes outside its workspace | ✅ Blocked | Write guard on `open` and `os.open` |
| Fork bomb, memory bomb, infinite loop | ✅ Contained | `RLIMIT_NPROC`, `RLIMIT_AS` (or watchdog / Job Object), `RLIMIT_CPU`, wall timeout |
| Path traversal in a download or upload | ✅ Blocked | `check_path_confinement` resolves and confines |
| A fabricated citation | ✅ Caught | Citation verification |
| An edited audit record | ✅ Detected | Hash chain, verified on server and in browser |
| Browser loading a third-party script | ✅ Blocked | CSP `default-src 'self'` |

## What does not hold, yet

| # | Threat | Demonstrated | Severity |
|---|---|---|---|
| 1 | **Sandboxed code reads host files**, including `storage/workbench.db`, as any role that can create tasks | Operator payload read the 1.1 MB database and `config/app.yaml` and printed them back | 🔴 Critical |
| 2 | **Session tokens are stored in plaintext**, so (1) yields live sessions, including a reviewer's, which defeats separation of duties | Token column is the raw token | 🔴 Critical |
| 3 | **The API is reachable from the network through the console.** `next start` binds every interface and proxies `/api/*`, so port 8000's loopback binding is bypassed via port 3000 | `http://<LAN-IP>:3000/api/health` answered from another interface | 🟠 High |
| 4 | **Shared default password and open self-registration.** Every seeded account, including `admin`, uses `workbench`; anyone who reaches the API can register an operator | By configuration | 🟠 High |
| 5 | **No login throttling or lockout** | Failures are audited, not limited | 🟠 High |
| 6 | **A wrong calculation can pass verification** when no code ran | A scanned-report run gave 0.8 mm/y instead of 0.55 and passed 7/7 (see [8.5](../08-verification/05-limits.md)) | 🟠 High (integrity) |
| 7 | **No prompt-injection screening** of document content | By design review | 🟡 Medium |
| 8 | **Uploads are not screened** by magic bytes, archive structure or macros | By design review | 🟡 Medium |
| 9 | **Model digests are not pinned** | By design review | 🟡 Medium |
| 10 | **The audit chain is not signed** (full rewrite possible with file access) | By design review | 🟡 Medium |

## Fix list

In the order to do them, with effort:

| Order | Fix | Closes | Effort |
|:--:|---|---|---|
| 1 | Bind the console to loopback: `next start -H 127.0.0.1` in `scripts/run.sh` and docs; or firewall port 3000 | 3 | Minutes |
| 2 | Set `security.self_registration_enabled: false` by default; require a changed seed password outside demo mode | 4 | Minutes |
| 3 | Store `sha256(token)` in `sessions` and look sessions up by hash | 2 | An hour |
| 4 | Confine **reads** in the sandbox shim to the workspace and the Python installation | 1 (practically) | Hours |
| 5 | Add `calculation` to `code_execution.always_for_task_types`; fail calculation verification when a calculation was requested and none computed | 6 | Hours |
| 6 | Throttle failed sign-ins per account and address; lock after repeated failures | 5 | Hours |
| 7 | Run sandbox code in a rootless container (`--network none`, read-only root, non-root, `--cap-drop ALL`, only the workspace mounted) | 1 (structurally) | Days |
| 8 | Screen uploads (magic bytes, archives, macros); flag injection-like content in evidence and keep it out of tool decisions | 7, 8 | Days |
| 9 | Pin approved model digests; sign audit Merkle roots with Ed25519 | 9, 10 | Days |

## Deployment checklist

Until items 1–4 are done, deploy on **a single trusted machine** for demonstration, or behind an operating-system boundary:

- [ ] Console bound to `127.0.0.1`, or port 3000 firewalled
- [ ] `security.seed_user_password` changed before first start
- [ ] `security.self_registration_enabled: false`
- [ ] `storage/` readable only by the service account (`chmod 700`)
- [ ] The API run as a dedicated, unprivileged user
- [ ] Host firewall permitting only loopback for that user
- [ ] Audit head hash recorded off-host after each session

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 9.5 · The audit log](05-audit-log.md) | [↑ 09 · Security and governance](README.md) | [10 · Configuration reference →](../10-configuration/README.md) |

<!-- nav:end -->
