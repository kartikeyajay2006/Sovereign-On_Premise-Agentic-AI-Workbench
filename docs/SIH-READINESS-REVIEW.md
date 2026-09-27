# AEGIS SIH readiness review

Reviewed on 27 September 2026 against [the winning build plan](SIH-WINNING-BUILD-PLAN.md),
on `main` after the `integration/sih-plan` merge (PR #6) and the four commits
described under *What changed in this pass*. Every figure below was measured
on the Linux development host (laptop CPU, `qwen2.5:3b`) on that date unless
it says otherwise.

## Verdict

The plan's six phases are built, with three gaps left open: operating-envelope
checks, three of the five plant-system adapters, and frontend tests. The three judged
moments run end to end, and the red team holds **31 of 31** attacks against
the live host. What decides the result now is less the code than the demo
machine: the sandbox image and the egress firewall are not set up on it, and
a run takes 20 to 70 seconds on a CPU, which has to be rehearsed.

## Where the build plan stands

| Phase | Plan item | Status | Where it lives |
|---|---|---|---|
| 1 Engineering | Versioned, clause-cited formula registry | Done: 18 formulas | `backend/engineering/formulas.py` |
| | Corrosion rate, remaining life, interval, t-min, severity | Done | same |
| | Relief-device checks | Done (this pass): SOP-INS-025 Clauses 2-5 | `relief.*` formulas, `backend/engineering/relief.py` |
| | Pressure and temperature operating limits | **Open**: only set pressure ≤ MAWP | — |
| | Unit-aware, dimension errors refused | Done | `backend/engineering/units.py` |
| | Every input bound to evidence; hashes persisted | Done | `CalculationRecord` |
| | *Cannot calculate* when an input is missing | Done | registry and integrity card |
| 2 Evidence | Stable evidence ids, claim verdicts | Done | evidence ledger, `backend/agents/verifier.py` |
| | Thread, approval pane and proof read one ledger | Done | Proof Mode (`/proof`) |
| 3 Execution | Rootless container, no network, read-only, no caps | Done, **not set up on this host**: image not built | `backend/tools/container_sandbox.py` |
| | Subprocess kept as a labelled fallback | Done; now in a private network namespace on Linux (this pass) | `backend/tools/netns.py` |
| | Host egress default-deny with kernel counters | Done, **not applied on this host** (needs root) | `infrastructure/firewall/` |
| | HTTP, DNS, socket and host-file tests | Done on demand (red team, self-test); probes at startup or first use | `scripts/red_team.py` |
| 4 Ingestion | Quarantine, macro and PDF-script checks, archive limits | Done | `backend/security/file_guard.py` |
| | Injected instructions withheld from the model | Done | `backend/security/injection.py` |
| | Revision chains | Done for active, superseded, withdrawn; no draft state | `backend/rag` |
| | Conflicts hold the run until a person resolves them | Done, plus fact contradictions | `backend/engineering/stage.py`, `facts.py` |
| 5 Industrial | P&ID graph, from JSON or the drawing image | Done | `backend/engineering/pid*.py` |
| | Isolation, upstream and downstream questions with overlay | Done | `/pid`, drawing explorer |
| | Historian and OPC UA adapters | Done (read-only, simulator) | `backend/connectors/` |
| | CMMS, document-management and directory adapters | **Open** | — |
| 6 Proof | Approval bound to what the reviewer saw | Done (`50b0dc1`): answer, deliverables, results, conflicts, and the prompt, evidence set, policy files and model digests (review digest version 2; version 1 records still verify) | `review_digest` in `backend/proof/certificate.py` |
| | Two signatures for a High finding | Done, role by role, in order | `policies/approval-rules.yaml` |
| | Ed25519-signed audit roots and run certificates | Done | `backend/proof/` |
| | Measurements dashboard, golden demo check | Done | `/measurements`, `scripts/golden_demo.py` |
| | Re-run and compare | Done | `/compare` |

## What changed in this pass

| Commit | What it closes |
|---|---|
| `6fb959b` | Five SOP-INS-025 formulas: bench-test interval, as-received test, set pressure ≤ MAWP, setting after overhaul, inlet loss. The evaluate endpoint now reads a yes/no input instead of passing `"false"` through as true. |
| `119a29b` | Generated code on the subprocess runtime runs in a private network namespace: the kernel refuses every connection, to the internet and to this host's own loopback (Ollama, the API), with or without the shim. Probed before use, shown on the Sandbox page, measured by the self-test. |
| `ab0ccfc` | A PSV bench-test record is assessed in a run. A failed as-received test is High on the protected vessel, so the run is held for the Head of Inspection and then the Plant Manager. A fourth starter card attaches the record. The engineering check no longer raises on an assessment without a corrosion rate. |
| `f7e77e7` | A High finding's footer says "Held for Head of Inspection, then Plant Manager", then "(1 of 2 signed)", instead of "or". |
| `50b0dc1` | Approval bound to the whole run. The review digest (version 2) also binds the prompt hash, the evidence ids with their source hashes, the policy file hashes and the model digests, taken from the same values the certificate records. A change to any of them voids the signatures given and blocks release, and the refusal names what changed ("the policy files changed since review"). The review pane and Proof Mode list what a signature binds. Signatures and approvals stored under version 1 are checked under version 1 rules and keep verifying. |

Measured on the live host after these commits:

- `/clause internal inspection of a pressure vessel in corrosive service`:
  delivered in 16.4 s (18 s by the client's clock), 7 of 7 checks, cited to
  SOP-INS-014 §2.2.
- The PSV-2104A starter: 67 s to a held run; the as-received test failed
  (opened at 11.9 bar, limit 11.55 bar), the other four checks passed, 8 of 8
  verification checks, 3 claims calculated. The engineer and the reviewer
  were refused, the Head of Inspection and the Plant Manager signed, the run
  was released, and its certificate verified with every check passing.
- Red team: 31 of 31 held, 0 breached, 0 inconclusive
  (`storage/reports/red-team-20260926T190234Z.json`, sha256 `337c76b6…`).
- Test suite: 959 passed, 13 skipped on Linux. Windows was not re-measured
  after this pass.

## Error sweep, 27 September

The whole codebase, checked five ways:

| Check | Scope | Found |
|---|---|---|
| Static analysis | pyflakes and runtime-error rules (ruff F, E9, PLE) over `backend`, `scripts`, `tests`; mypy; every Python file compiled with warnings as errors; `tsc` with `noUnusedLocals` and `noUnusedParameters` | one undefined annotation name, unused variables and imports, a `className` prop never applied, dead state. mypy's remaining findings are optional-type narrowing the code already guards, and Windows-only calls |
| API | every GET operation, as each of the 7 roles, with real ids (455 calls), plus deliverable and report downloads | no server error |
| Console | every route in headless Chrome, signed out and as five roles (85 page loads), collecting exceptions, console errors and failed requests | no exception or console error from the app; a 401 on every page for a signed-out visitor, from the session probe |
| Live runs | `scripts/golden_demo.py` and `scripts/red_team.py` against the running host | **the second judged moment failed**; one correct claim in the first was marked unsupported |
| Scripts, logs, docs | every script's `--help`, the API and web logs, the audit trail, every link in 137 Markdown files | `make_sample_pid_image.py --help` wrote the drawing; no traceback or 5xx in the logs; no broken link |

Fixed, each with a test:

- **An uploaded survey was never assessed** (`8aa3aed`). The upload parser renders a CSV with `" | "` between cells; the survey reader expected commas, so a run given the V-2104 survey held no assessment, raised no conflict with the field sheet, and the model computed 0.75 mm/year where the registry gives 0.55. The golden demo's second moment now passes.
- **A correct governing location was marked unsupported** (`271a429`), failing verification on the flagship run. It is now judged as the computed figure it is; the rerun passed all nine checks.
- **The session probe logged an error on every signed-out page** (`33a5f27`); `/api/auth/session` answers with a 200.
- **The smaller ones** (`c11f1bb`): the theme toggle's margin, `--help` writing the drawing, the vision cache not ignored by git, dead state, the static errors.

After the fixes: `scripts/golden_demo.py` ends **FINAL STATUS: READY**, the red team holds 31 of 31, the suite passes 981 with 13 skipped, and the crawl finds no error on any screen.

One finding is the model's, not the code's: on one run the 3B model drafted an approval note without the inline citations its prompt asks for. Document verification failed it and the run was held, which is the control working.

## Second sweep, after PRs #8–#15

The 101 commits merged on 27 September (Hi-Vis redesign, account provisioning, deployment readiness, Harness Control, a copy sweep), checked the same way, plus the new account doors exercised live on a separate production-mode instance with an empty database: owner setup, invitations, access requests, password resets, deactivation and code guessing, 30 checks, all held.

| Check | Found |
|---|---|
| Suite, static analysis, types | 1094 passed; pyflakes clean; one unused constant in the landing page |
| API, every GET as all 7 roles (504 calls) | no server error; the pre-pull database migrated without error |
| Console, 22 routes as six signed-in roles (132 loads, sessions verified) | no exception or console error; the People page, opened by address without `users.manage`, requested three admin lists and was refused |
| Golden demo, red team | READY; 31 of 31 held |
| A relief-valve run on the new build | **every answer opened with a literal `[answer]`**, and a correct authority sentence was marked unsupported |
| Demo host switched to production | **the seven demo accounts kept the shared password**: `admin` / `workbench` signed in and no setup token was issued |

Fixed, each with a test:

- **`[answer]` before every answer.** The new lede instruction illustrated the first sentence as `"<answer> [S2]."`, and the 3B model copied the placeholder; the thread set it as the lede. The prompt now has nothing to copy, and a leading label is removed from the model's text if one appears.
- **A correct authority sentence marked unsupported.** "Recommended by the Inspection Engineer and the Head of Inspection, and approved by the Plant Manager" restates the registry's decision; it is now CALCULATED when each role is on the right side of "approved", and not when roles are swapped or an approver is added.
- **Demo accounts in production.** Starting with the demo off now deactivates every declared demo account that still accepts the shared password, ends its sessions and audits it, and the setup token takes over; switched back on, the demo gets them back. The threat model's High risk 2 is now Low.
- **The People page** asks for nothing the role cannot read; the unused landing constant is gone.

After the fixes: 1111 passed, 13 skipped; the relief run opens with its cited answer, 8 of 8 checks, every claim calculated.

## What still stands between this build and a winning demo

### Before the judges (no code)

1. **Build the sandbox image while the machine is still online.**
   `infrastructure/sandbox/build.sh`, then `runtime: podman` in
   `config/app.yaml`. Without it the Sandbox page reads "subprocess (private
   network namespace)": kernel network isolation, but not the read-only root,
   dropped capabilities and cgroup limits a container adds.
2. **Apply the egress firewall.** `sudo infrastructure/firewall/apply.sh`.
   Until then Assurance says egress is *not measurable* by the kernel on this
   host; it never shows a false zero, but a judge sees a gap.
3. **Rehearse on CPU timings.** A `/clause` run takes under 20 s, a relief
   run about 70 s, and a scanned report is read three pages per vision call.
   Keep models warm (`inference.prewarm`), run the golden demo once before
   the session, and narrate the stages while they stream.
4. **Run the checks on the demo machine that morning** and keep the hashed
   reports on screen: `scripts/golden_demo.py` and `scripts/red_team.py`.
5. **Change the seed password** or bind the console to loopback
   (`WEB_HOST=127.0.0.1`, the default in `scripts/run.sh`) on a shared network.

### Code gaps from the plan, in order of judged value

1. **Operating envelope.** Operating pressure and temperature against design
   and MAWP, and SOP-INS-021's interim limit of 90% of MAWP, as registered
   formulas. It is the last Phase 1 item.
2. **Frontend tests.** The console has none; the "or" footer above was found
   by reading a screenshot. A Playwright smoke test that opens each starter
   card, runs it and reads the integrity card would catch that class of bug.
3. **CMMS adapter.** Read-only open work orders and notifications for a tag,
   behind `backend/connectors/base.py`, would let the approval note say
   whether a repair is already raised. Document-management and directory
   adapters are lower value for the demo.
4. **Relief records.** Only the first record in a run is assessed, and two
   records for one valve are not compared as the vessel path compares two
   surveys.

### The pitch

- Open with moment 1 and let the integrity card carry it: every figure by a
  registered formula, cited, none by the model.
- Show moment 2 before moment 3: a workbench that refuses to guess is a
  stronger claim than one that refuses attacks, and it is the one other
  teams will not have.
- Use the relief card as the answer to "what else can it decide?": a second
  procedure, the same machinery, a High finding that needs two named people.
- Say where each control stops. The handbook already does; judges from
  industry will ask.
