# AEGIS SIH winning build plan

## The product to demonstrate

AEGIS must not present as a local chatbot with governance features. Its flagship
demonstration is an **Asset Integrity Decision**: an inspection report, active
procedure, historical readings and an equipment topology become an evidence-backed
recommendation that a named authority can approve or reject.

```text
Scanned inspection report + thickness history + active SOP + P&ID topology
                                  |
                                  v
Page/table/region evidence --> deterministic engineering calculation
                                  |
                                  v
Revision, conflict, clearance and policy gates
                                  |
                                  v
Human approval --> signed proof bundle + released approval note
```

The model explains and drafts. It must never be the authority for arithmetic,
source authority, release or a safety decision.

## The three judged moments

1. **Can V-2104 continue operating?**

   A scanned report is read locally; its governing CML, corrosion rate,
   remaining life, next due date, applicable SOP, approval authority and
   affected isolation path are visible with evidence.

2. **The workbench refuses to guess.**

   A conflicting report or superseded procedure produces a conflict object,
   withholds an automatic conclusion and requires a human resolution.

3. **Attack the controls.**

   A hostile document, host-file read, DNS/HTTP/socket attempt, invalid upload,
   unauthorised retrieval and audit tamper attempt are visibly refused or
   detected. Each result is a measured artifact, never a green assertion.

## Build order

### 1. Deterministic engineering first

- Create a versioned formula registry for corrosion rate, remaining life,
  inspection interval, minimum-thickness checks, pressure/temperature limits,
  relief-device due checks and the severity matrix.
- Add a local unit-aware calculation layer and reject dimensionally invalid
  inputs.
- Bind every calculation input to an evidence ID, page/table cell or approved
  historian value.
- Persist formula version, units, expression, intermediate values, input hashes
  and result hash as calculation evidence.
- A request classified as a calculation must fail verification when no
  independently recomputable expression exists.

**Exit condition:** the same evidence and formula version always produce the
same result, and the UI says *cannot calculate* when an input is missing.

### 2. Evidence ledger and claim verdicts

- Give every source, vision extraction, computation, human decision and tool
  result a stable evidence ID.
- Preserve original file hash, document identity, revision, page, region/table
  cell, extraction method, confidence, classification, producer model digest
  and parent evidence links.
- Give every material claim one of: `SUPPORTED`, `CALCULATED`, `CONFLICTED`,
  `UNSUPPORTED` or `REQUIRES_HUMAN_DECISION`.
- Make the thread, approval pane and proof bundle read the same ledger rather
  than separate citation conventions.

**Exit condition:** clicking any material claim shows why it was accepted,
blocked or escalated, and the exact source it depends on.

### 3. Secure execution and enforceable sovereignty

- Run generated code in a rootless Podman/Docker container with no network,
  read-only root filesystem, non-root user, dropped capabilities, seccomp and
  only controlled input/output mounts.
- Keep the subprocess implementation only as a clearly labelled development
  fallback; refuse execution where the required containment capability is
  unavailable.
- Apply host-level outbound default-deny rules and expose their kernel counters
  and ruleset hash alongside the process-level monitor.
- Run automated HTTP, DNS, raw socket, subprocess-network and host-file escape
  tests at startup and in the red-team suite.

**Exit condition:** the system can prove both that egress was not observed and
that the execution environment was structurally unable to reach it.

### 4. Trusted ingestion and authority

- Quarantine uploads using detected media type, PDF action/JavaScript checks,
  OOXML external-relationship and macro checks, archive depth/ratio limits and
  optional offline malware scanning.
- Treat document text as untrusted evidence. Detect instruction-like content,
  preserve it for review and prevent it from selecting tools or changing policy.
- Separate document identity from file upload identity and maintain revision
  chains: draft, active, superseded and withdrawn.
- Detect material conflicts in limits, dates, equipment tags, status and
  approval authority; make unresolved high-impact conflicts hold the run.

**Exit condition:** active authoritative evidence is preferred by default and
the workbench never silently chooses between conflicting sources.

### 5. Industrial intelligence: the memorable capability

- Extract P&ID assets, lines, valves, instruments, flow directions and
  isolation boundaries into a reviewable graph.
- Support deterministic graph questions: upstream/downstream, affected
  instruments, isolation valves, shortest safe path and connected equipment.
- Render the answer as an overlay on the drawing, linked to graph records and
  evidence IDs.
- Add read-only adapters behind stable interfaces for OPC UA, historian, CMMS,
  document management and directory services. The demo can use local CSV,
  SQLite and an OPC UA simulator; no cloud connector is required.

**Exit condition:** a judge can see the exact highlighted diagram path that
backs the system's isolation recommendation.

### 6. Proof, governance and measured quality

- Bind approval to the exact evidence, prompt, output, policy, model digest and
  formula versions; changing one invalidates the previous approval.
- Support the required number of distinct approvers for a high-risk release.
- Sign audit Merkle roots and per-run proof certificates with an offline
  Ed25519 key or hardware-backed key where available.
- Add fixed golden datasets, adversarial fixtures, model-quality measurements,
  latency/resource measurements and a benchmark dashboard that labels skipped
  cases rather than counting them as passes.
- Provide re-run/compare output that names every material configuration change.

**Exit condition:** every visible score, decision and security claim has a
reproducible artifact behind it.

## Already closed in the current build

- A generated deliverable can now be read directly in the thread, with its
  structured content and citation links preserved beside Download.
- Calculation tasks fail closed when no recomputable expression was produced.
- Runtime file reads are confined to the sandbox workspace and Python runtime.
- Session database records store hashed lookup values, and public
  self-registration is disabled by default.
- Installed demo models are pinned to approved Ollama digests; a mismatch is
  refused by the router.

## Do not spend judged-build time on

- generic chat modes, multi-agent theatrics or more cloud model providers;
- Kubernetes, blockchain branding or dashboards without measurements;
- broad enterprise SSO before session hygiene and core policy controls;
- visual polish that does not make an industrial decision easier to inspect.

The moat is not offline inference. It is an AI system that is useful in a
high-consequence industrial workflow while remaining unable to become
unaccountable authority.
