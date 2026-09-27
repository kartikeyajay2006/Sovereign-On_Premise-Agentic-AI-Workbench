# What AEGIS implements today

Everything below is in `main` on 27 September 2026 (after PRs #8–#15), and every count was read
from the running host or the tree on that date. Each line says where the code
lives and how to see it working. What is not built yet is in
[the readiness review](SIH-READINESS-REVIEW.md#what-still-stands-between-this-build-and-a-winning-demo).

## At a glance

| | |
|---|---|
| Engineering formulas | **18**, versioned and clause-cited (vessel, piping, relief devices, severity, FFS, schedules) |
| API | **87** operations on 81 paths, local only |
| Console screens | **12** signed-in screens, plus the public page, sign-in, owner setup, invitation, password reset and access request |
| Agent tools | **6**: `knowledge_search`, `file_read`, `spreadsheet_analyze`, `python_exec`, `document_generate`, `historian_read` |
| Skills and harnesses | **5** skills, **3** harnesses |
| Models declared | **6** local models via Ollama, digests pinned |
| Access control | **7** roles, **22** permissions, **7** demo accounts |
| Approval rules | **11**, one of them requiring two signatures in order |
| Red team | **31 of 31** attacks held on the live host |
| Tests | **1111 passed, 13 skipped** on Linux (Windows runs in CI) |
| Handbook | **111** pages |
| Demo corpus | **15** synthetic documents, **207** passages, a P&ID, scanned reports, a PSV test record |

## 1 · Understand: documents become evidence

| Capability | What it does | Where | See it |
|---|---|---|---|
| Parsing | PDF page by page, DOCX, XLSX, CSV, PPTX, Markdown, images | `backend/rag/parsing.py` | Attach any of them in the thread |
| Vision reading | Scanned pages rasterised with PyMuPDF and read by a local vision model three pages a call; Tesseract as fallback | `backend/agents/orchestrator.py`, `backend/rag/parsing.py` | *Can V-2104 keep running?* starter |
| Vision cache | A page already read is not read again: keyed by image hash, model digest and prompt | `backend/agents/vision_cache.py` | Run the same scan twice |
| Evidence ledger | Every item gets a stable id: **S** passage, **F** file, **V** vision, **C** computation, **H** human decision, **T** topology | `EvidenceLedger` in `orchestrator.py` | Citation chips in every answer |
| Revision control | One revision in force per document code; superseded ones retrieved only on request, and labelled | `backend/knowledge/revisions.py` | Ask for a superseded SOP by revision |
| Ingestion guard | Uploads judged by their bytes: PDF JavaScript and launch actions, Office macros, remote templates, DDE, archive bombs, renamed executables refused | `backend/security/file_guard.py` | Red team `UPLOAD-01`…`12` |
| Injection screening | Text in a document that addresses the model is withheld from it and holds the run | `backend/security/injection.py` | *A document that gives orders* starter |
| Content scanning | Secrets, personal data and classification markings found and acted on at each boundary | `backend/security/dlp.py`, `policies/dlp.yaml` | "Content scanned" line in a run's transcript |

## 2 · Decide: routing, retrieval and policy

| Capability | What it does | Where | See it |
|---|---|---|---|
| Model registry | Six declared models; an installed model whose digest differs from the approved one is refused | `config/models.yaml`, `backend/models_layer/` | Knowledge → Models |
| Routing | Per-stage rules, hard gates (installed, approved, capable, fits in memory), a reason for every choice | `backend/models_layer/router.py`, `config/routing.yaml` | A run's transcript |
| Retrieval | Local embeddings and BM25 fused by Reciprocal Rank Fusion; **department and clearance applied before ranking** | `backend/rag/knowledge_base.py` | Knowledge → retrieval tester, as `engineer` and as `operator` |
| Policy gateway | Default deny for permissions, tools, models and paths; every decision audited with the rule that made it | `backend/policy/gateway.py`, `policies/*.yaml` | Assurance → Policy |
| Classification | A run's class rises to the highest class of the evidence it used, and the reason names that evidence | `orchestrator.py` | A run that retrieves a Restricted memo |

## 3 · Compute: deterministic engineering

The model is told the figures. It is never asked for them.

| Capability | What it does | Where | See it |
|---|---|---|---|
| Formula registry | 18 formulas, `id@version`, each citing its clause, with inputs, outputs, source hash, input hash and result hash; *cannot calculate* when an input is missing, *refused* for a wrong dimension | `backend/engineering/formulas.py`, `units.py` | `GET /api/engineering/formulas` |
| Vessel assessment | Rates per location, governing location by **lowest remaining life**, severity, FFS triggers, next survey; withdrawn below t-min | `backend/engineering/assessment.py` | *Can V-2104 keep running?* |
| Piping assessment | CML rates, remaining life, next measurement | same | The piping survey in the corpus |
| Stated calculations | Values written in the question are bound only when the question writes them with the right unit | `backend/engineering/stated.py` | "12.0 to 9.4 mm in 4 years, t-min 6.0 mm: remaining life?" |
| Relief devices | A PSV test record read field by field and judged by SOP-INS-025: as-received test, set pressure ≤ MAWP, setting after overhaul, inlet loss, next bench test; a failed valve is High | `backend/engineering/relief.py` | *A relief valve failed its test* starter |
| Conflicts | Sources that disagree about an input withhold the decision until a person chooses; the choice becomes H evidence and the formulas recompute | `backend/engineering/stage.py`, `facts.py` | *Two records disagree* starter |
| P&ID topology | A drawing's graph, authored or read from the drawing image and compared with it; isolation plans judged branch by branch against SOP-OPS-015; flow up and down, paths, affected loops | `backend/engineering/pid.py`, `pid_extraction.py` | Knowledge → Drawings; "How do we isolate V-2104 for confined space entry?" |
| Plant systems | Read-only historian and OPC UA (simulator) adapters behind one interface; a bad-quality sample carries no value | `backend/connectors/`, `scripts/seed_historian.py` | The `historian_read` tool |

## 4 · Execute: generated code, contained

| Layer | What it does | Where |
|---|---|---|
| Static validation | Imports, calls, `getattr` tricks and process escapes refused before anything runs | `backend/tools/sandbox.py` |
| OS limits | `setrlimit` on Linux, a memory watchdog on macOS, a probed Job Object on Windows; refused where no limit can be proven | same |
| Runtime shim | Sockets (including raw `_socket`), writes and reads outside the workspace refused | same |
| Network namespace | On Linux, each program runs in a private network namespace: the kernel refuses every connection, including to this host's model runtime and API | `backend/tools/netns.py` |
| Container | Rootless Podman or Docker with `--network none`, a read-only root, no capabilities, used only when a probe proves it here | `backend/tools/container_sandbox.py`, `infrastructure/sandbox/` |
| Egress firewall | An nftables default-deny table, with its kernel drop counters read back | `backend/security/egress_firewall.py`, `infrastructure/firewall/` |
| Sovereignty monitor | Samples the workbench's own connections every 2 s; says "cannot observe" rather than a false zero | `backend/security/sovereignty.py` |

See it: the **Sandbox** screen (runtime, network boundary, attack presets, self-test) and **Assurance** (egress, containment, policy).

## 5 · Verify: model output is untrusted

Checks on every answer (`backend/agents/verifier.py`): source, citation, page citation, calculation (recomputed in the sandbox), **engineering** (every rate, life and severity stated must be the registry's), code, document, hallucination and isolation-plan. Each material claim gets a verdict: **calculated**, **supported**, **conflicted**, **unsupported** or **requires a human decision**. See it: the checks line and the claims fold under every answer.

## 6 · Govern: a person decides

| Capability | What it does | Where |
|---|---|---|
| Approval rules | 11 rules hold a run: sensitive or restricted work, a deliverable, failed verification, low classification confidence, an unresolved conflict, a disposition only an authority can take, injected instructions, sensitive content found by scanning, an isolation plan, a High finding, a safety topic | `policies/approval-rules.yaml` |
| Two signatures | A High finding needs the Head of Inspection and then the Plant Manager (SOP-OPS-008 Clauses 2.3 and 3.5), each a different person with that role | `backend/api/task_service.py` |
| Separation of duties | Nobody decides their own run, whatever their role | same |
| Accounts | No account exists without an administrator's act: a one-time owner setup token on a fresh production host, invitations that fix the role and department, access requests an administrator decides, administrator-issued password resets. Codes are 60-bit, stored only as hashes, one-time and throttled. A host switched from demo to production retires the demo accounts that still take the shared password | `backend/core/accounts.py`, `backend/api/routes/accounts.py` |
| Bound to what was reviewed | A decision carries the review digest of the version read; a changed run voids the signatures already given | `backend/proof/certificate.py` |
| Request revision | A reviewer can send a run back with a note | Approvals screen |

## 7 · Prove: every step has a history

| Capability | What it does | Where | See it |
|---|---|---|---|
| Audit chain | Append-only SHA-256 chain of every task, model call, decision and sign-in, verified by the server **and** the browser | `backend/core/audit.py` | Audit → Verify chain |
| Signed roots | Ed25519-signed Merkle roots, so a rewritten and re-chained history is still caught | `backend/proof/audit_roots.py` | Red team `AUDIT-02` |
| Run certificates | Bind a run's evidence, calculations, approval, deliverable bytes, model digests, config hashes, egress and sandbox provenance; verifiable offline with the public key | `backend/proof/certificate.py`, `scripts/verify_certificate.py` | Proof Mode → certificate |
| Proof Mode | The whole chain of one run on one screen: request, policy, models, evidence, formulas, claims, approval, certificate | `backend/proof/proof_view.py` | **Proof** under any answer |
| Measurements | A dashboard of figures computed from their artifacts, skipped ones labelled as skipped | `backend/proof/measurements.py` | Assurance → Measurements |
| Re-run and compare | Re-run a finished run as a linked child; compare two runs with every difference named | `backend/proof/compare.py` | **Run again**, **Compare** |
| Red team | 31 attacks against a live host, each a measurement, with a hashed report | `scripts/red_team.py`, `backend/security/red_team.py` | `storage/reports/red-team-*.json` |
| Golden demo check | The three judged moments, checked end to end against a running API | `scripts/golden_demo.py` | `storage/reports/golden-demo-*.json` |

## 8 · The console

| Screen | For |
|---|---|
| Thread | Ask, attach, pick a model or a skill; four starter cards for the golden demos |
| Skills | Saved, hashed request templates called with `/` |
| Harnesses | One governed job over many items, with one hashed report |
| Approvals | Held runs, why each is held, its evidence and checks, and the decision |
| Knowledge | What retrieval can cite for you, the models, drawings, formulas and a retrieval tester |
| Assurance | Posture (egress, containment, policy), Sandbox, Audit, Measurements |
| Proof, Compare | One run's chain; two runs side by side |
| People | Access requests, invitations, accounts and resets, for `users.manage` |

## 9 · Running it

- `scripts/run.sh` builds and starts the API and console, bound to loopback; `--status`, `--stop`, `--dev`.
- Hardware tiers in `config/profiles/` (`laptop-8gb`, `laptop-16gb`, `cpu-server`, `gpu-server`), chosen by `SOVEREIGN_PROFILE`; `scripts/start-ollama.sh` starts the runtime with the tier's `OLLAMA_*` settings, and `scripts/warmup.py` loads the drafting model and says READY or NOT READY.
- `GET /api/ready` answers a readiness probe without a session, booleans only; the model manager reconciles with what Ollama holds at startup.
- `scripts/backup.py` takes an online backup with a SHA-256 manifest.
- `scripts/offline_bundle.py` (and `.sh`, `.ps1`) builds an installer bundle on a connected machine, verified before anything installs on the air-gapped one.
- `infrastructure/docker-compose.yml` and the Dockerfiles build the stack; host state stays out of the images.
- CI runs the backend suite on Ubuntu and Windows, the red-team tests, and the frontend typecheck and build on every push.

## How it got here

| When | What |
|---|---|
| 4–5 Sep | Foundation: config, identity, audit chain, routing, knowledge base, sandbox, policy gateway, orchestrator, API, sovereignty monitor, first console |
| 21–24 Sep | Honesty pass (no claim the backend does not make), chat-first console, Windows Job Objects, harnesses, the synthetic plant, clearance before ranking, design system |
| 25 Sep | Engineering engine, evidence and conflicts, ingestion guard and red team, signed proof, P&ID isolation, handbook |
| 26 Sep | PR #6: the 23 items of the [build plan](SIH-WINNING-BUILD-PLAN.md), from the container runtime to Proof Mode, measurements and two signatures |
| 27 Sep | PRs #8–#15: the Hi-Vis redesign, account provisioning and the People screen, hardware tiers and deployment readiness, Harness Control, answers that open with one cited sentence, a copy sweep |
| 26–27 Sep | Relief devices in the registry and in runs, the network namespace, the signature footer, the [readiness review](SIH-READINESS-REVIEW.md), and a [codebase-wide error sweep](SIH-READINESS-REVIEW.md#error-sweep-27-september) that fixed the uploaded-survey reader and the golden demo's second moment |
