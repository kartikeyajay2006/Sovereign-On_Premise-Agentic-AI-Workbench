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

Every row marked 🧪 is one of the attacks in `scripts/red_team.py`, run over HTTP against a live host; its report, with each observation and a SHA-256 over the results, is written to `storage/reports/`. The last live run held 31 of 31. See [9.8 · Red team](08-red-team.md).

| Threat | Result | How |
|---|---|---|
| Operator retrieves a Restricted passage 🧪 | ✅ Blocked | Clearance applied before ranking; departments narrowed, never widened |
| Operator sees that a Restricted document exists | ✅ Blocked | Documents list filtered by the same rules |
| Reviewer approves their own run | ✅ Blocked | Separation of duties by account |
| Auditor creates a task or runs a calculation 🧪 | ✅ Blocked | No `task.create` |
| Operator approves, engineer resolves a conflict 🧪 | ✅ Blocked | `approval.decide`, and never the account that ran the task |
| A forged or missing session token 🧪 | ✅ Refused | Sessions are looked up by `sha256(token)`; nothing plaintext is stored |
| Password guessing 🧪 | ✅ Throttled | An account locks after 5 failures in 5 minutes; a client that fails across 10 accounts locks too |
| Enumerating accounts from the sign-in screen 🧪 | ✅ Blocked | `/api/auth/directory` lists only the seeded demonstration accounts |
| Model routed to an unapproved or unregistered model | ✅ Blocked | Router hard gates; the registry pins each model to its approved digest |
| Inference pointed at a remote server | ✅ Blocked | Loopback-only client, HTTP 503 |
| Generated code opens a socket, resolves a name, fetches a URL, spawns curl 🧪 | ✅ Blocked | Static validation first; with it bypassed, the runtime shim still denies sockets and processes |
| Generated code reads `/etc/passwd` or the workbench database 🧪 | ✅ Blocked | Runtime read confinement to the workspace and the interpreter |
| Generated code writes outside its workspace | ✅ Blocked | Write guard on `open` and `os.open` |
| Fork bomb, memory bomb, infinite loop | ✅ Contained | `RLIMIT_NPROC`, `RLIMIT_AS` (or watchdog / Job Object), `RLIMIT_CPU`, wall timeout |
| A PDF that runs JavaScript, launches a program or hides either in a compressed stream 🧪 | ✅ Refused at upload | [9.7 · Ingestion guard](07-ingestion-guard.md) |
| An Office file with a macro, DDE field or remote template; an archive bomb; a renamed executable 🧪 | ✅ Refused at upload | Type read from bytes; package structure inspected |
| A document telling the model to ignore its instructions 🧪 | ✅ Flagged, withheld, held | Kept as evidence; replaced in every prompt by a marker; the run is held (`untrusted_instructions`) |
| Path traversal in a download or upload | ✅ Blocked | `check_path_confinement` resolves and confines |
| A deliverable edited on disk after approval | ✅ Refused | Re-hashed on every download; a mismatch is a 409 and an audit event |
| A wrong corrosion rate, remaining life or severity in an answer | ✅ Caught | Figures computed by the formula registry; `engineering_verification` fails an answer that disagrees |
| Two sources disagreeing about an input | ✅ Held | A conflict object withholds every dependent figure until a reviewer chooses |
| A fabricated citation | ✅ Caught | Citation verification; claim verdicts |
| An edited audit record 🧪 | ✅ Detected | Hash chain, verified on server and in browser |
| A rewritten history with every later hash recomputed 🧪 | ✅ Detected | Signed Merkle roots: the chain is fooled, the signed root is not ([9.9](09-proof.md)) |
| Browser loading a third-party script | ✅ Blocked | CSP `default-src 'self'` |

## What does not hold, yet

| # | Threat | Why it is still open | Severity |
|---|---|---|---|
| 1 | **Sandboxed code runs as the API's own user.** Containment is a validated interpreter with runtime shims and OS limits, not an operating-system boundary | A flaw in the shim would expose what that user can reach. A rootless container (`--network none`, read-only root, only the workspace mounted) removes the dependency on the shim | 🟠 High |
| 2 | **The seeded accounts share a demonstration password** (`workbench`) | By configuration, for the demonstration; change `security.seed_user_password` before first start anywhere real | 🟠 High outside a demo |
| 3 | **The signing key lives on the host it signs for.** Someone with root and the key can rewrite the log *and* re-sign it | Copy the public key and seal roots off-host (GET `/api/proof/key`, GET `/api/audit/seals`); a hardware key would close it | 🟡 Medium |
| 4 | **Injection screening is by pattern.** A novel phrasing can pass the screen | The structural guarantee does not depend on it: document text never selects a tool or changes a policy, and answers are verified and held | 🟡 Medium |
| 5 | **Egress control is process-level.** The monitor observes connections; the host firewall is the operator's | Add a default-deny outbound rule for the service user | 🟡 Medium |
| 6 | **A console started by hand binds every interface.** `scripts/run.sh` binds `127.0.0.1`; `next start` without `--hostname` does not | Use the run script, or firewall port 3000 | 🟢 Low |

## Closed since the first review

The first review of this build demonstrated eleven gaps. Nine are closed; each row names the change and, where it is measured, the red-team attack that shows it.

| Was | Closed by | Measured by |
|---|---|---|
| Sandboxed code read host files, including the database | Runtime read confinement | SANDBOX-01, SANDBOX-02 |
| Session tokens stored in plaintext | Sessions stored and looked up by hash | PRIV-05 |
| Console exposed the API on every interface | `run.sh` binds the console to `127.0.0.1` (`WEB_HOST` to override) | — |
| Open self-registration | `self_registration_enabled: false` by default | — |
| No login throttling | Account lockout and password-spray lockout | AUTH-01 |
| A wrong calculation could pass | Deterministic formula registry and `engineering_verification`; a requested calculation fails closed without one | tests/test_engineering_pipeline.py |
| No prompt-injection screening | Evidence screening, withholding and a hold | INJECT-01 |
| Uploads not screened | Upload quarantine by bytes and structure | UPLOAD-01 to UPLOAD-12 |
| Model digests not pinned | The registry approves models at a digest | — |
| The audit chain was not signed | Ed25519-signed Merkle roots, per-run certificates | AUDIT-02 |
| The user directory was public | Seeded demonstration accounts only | AUTH-02 |

## Deployment checklist

For anything beyond a single trusted machine:

- [ ] `security.seed_user_password` changed before first start
- [ ] Console started by `scripts/run.sh` (bound to `127.0.0.1`), or port 3000 firewalled
- [ ] `storage/` readable only by the service account (`chmod 700`); `storage/keys/` holds the signing key
- [ ] The API run as a dedicated, unprivileged user, with a default-deny outbound firewall rule
- [ ] The public key (`GET /api/proof/key`) and the latest seal copied off-host after each session
- [ ] `scripts/red_team.py` run after every upgrade, and its report kept

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 9.5 · The audit log](05-audit-log.md) | [↑ 09 · Security and governance](README.md) | [9.7 · Ingestion guard →](07-ingestion-guard.md) |

<!-- nav:end -->
