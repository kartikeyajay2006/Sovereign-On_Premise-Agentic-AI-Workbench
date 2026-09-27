<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/aegis-mark-white.svg">
  <img src="docs/assets/brand/aegis-mark.svg" alt="" width="64">
</picture>

# AEGIS

**Answers your plant can prove.**

An air-gapped AI workbench for regulated industrial work. The model, the search, the engineering formulas and every check run on one machine, and each answer arrives with its sources, its checks, the person who approved it and a signed record.

[![ci](https://github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench/actions/workflows/ci.yml)
![tests](https://img.shields.io/badge/tests-1211_passed-2ea44f)
![red team](https://img.shields.io/badge/red_team-31%2F31_held-2ea44f)
![console](https://img.shields.io/badge/console-132%2F132_screens_clean-2ea44f)
![formulas](https://img.shields.io/badge/engineering_formulas-21-c8f542)
![egress](https://img.shields.io/badge/egress-0_measured-c8f542)
![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-3776ab?logo=python&logoColor=white)
![Ollama](https://img.shields.io/badge/models-Ollama%2C_local-000?logo=ollama&logoColor=white)

[The judged moments](#the-judged-moments) · [The console](#the-console) · [Proved, not claimed](#proved-not-claimed) · [How a question runs](#how-a-question-runs) · [Quickstart](#quickstart) · [Docs](#docs) · [Limitations](#%EF%B8%8F-limitations)

</div>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/landing-light.webp">
    <img src="docs/assets/readme/landing-dark.webp" alt="The AEGIS public page: Answers your plant can prove, with a recorded run's figures beside a drawing of the vessel" width="100%">
  </picture>
</p>

## In one minute

- **Figures come from a registry, not the model.** Corrosion rate, remaining life, severity, the next survey, relief-valve verdicts, re-rating and interim-operation limits are computed by **21 versioned, clause-cited formulas** before the model writes a word. The model is told the figures and cites them.
- **Every claim is checked.** Each material sentence is traced to the passage or calculation it cites, and a claim nothing supports fails verification. Citations that name evidence the run does not hold are refused.
- **It refuses to guess.** When two records disagree, no figure is stated until a named person chooses, and the choice becomes evidence.
- **A person approves what policy says must be approved.** A High finding needs the Head of Inspection and then the Plant Manager, each on the version they read.
- **Nothing leaves the machine.** Models run through Ollama on loopback, generated code runs in a sandbox the kernel cuts off from the network, and egress is measured, not assumed.
- **Every step is on a signed record.** A SHA-256 hash chain with Ed25519-signed roots, and a certificate per run that anyone can verify offline.

## The judged moments

Each moment is checked end to end against the running workbench by `scripts/golden_demo.py`, which ends `FINAL STATUS: READY` on the demo host. The screens below are those runs.

### 1 · Can V-2104 keep running?

A scanned inspection report goes in. The vision model reads it on this machine, the formula registry computes every figure from the readings it read, and the approval note is drafted from those figures and held for sign-off.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/thread-integrity-light.webp">
    <img src="docs/assets/readme/thread-integrity-dark.webp" alt="The integrity decision for V-2104: governing location Shell course 2 (mid), 0.55 mm/year, 6.18 years, Medium severity, next survey 2028-02-18, 36 figures by registered formulas, and the drafted approval note below" width="100%">
  </picture>
  <br><sub><b>Integrity decision.</b> The governing location is the one with the lowest remaining life, not the thinnest reading. 36 figures, each with its formula version, inputs and hash; <i>cannot calculate</i> when an input is missing.</sub>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/proof-light.webp">
    <img src="docs/assets/readme/proof-dark.webp" alt="Proof Mode: request, classification, policy, model routing, evidence, 36 of 36 formulas calculated, claims, 9 of 9 checks, approval, and a signed certificate verified" width="100%">
  </picture>
  <br><sub><b>Proof Mode.</b> The same run from request to signed certificate on one screen: 36 of 36 figures calculated, 9 of 9 checks, approved by a reviewer, certificate verified.</sub>
</p>

### 2 · The workbench refuses to guess

The thickness survey and a contractor's field sheet disagree at shell course 2 (9.4 mm against 9.9 mm). No rate, life or severity is stated; the run is held until a reviewer chooses, and the formulas then recompute from that choice.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/thread-conflict-light.webp">
    <img src="docs/assets/readme/thread-conflict-dark.webp" alt="A conflicted run: the sources disagree about shell course 2, 9.4 mm in F1 and 9.9 mm in F2, the decision is withheld and the run is held; a superseded procedure revision is settled by rule" width="100%">
  </picture>
  <br><sub><b>Decision withheld.</b> Conflict K2 is never chosen silently. The field sheet also cites SOP-INS-014 Rev 4.1; the revision in force, 4.3, is applied and shown.</sub>
</p>

### 3 · Attack the controls

31 attacks run against a live host: hostile PDFs and Office files, prompt injection, host-file reads, HTTP, DNS and raw-socket egress from generated code, privilege escalation, forged sessions and audit tampering. **31 of 31 held.**

<table>
<tr>
<td width="50%"><picture><source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/assurance-light.webp"><img src="docs/assets/readme/assurance-dark.webp" alt="Assurance: 0 egress measured, containment 8 of 8 tested, 10 actions no role can take"></picture><br><sub><b>Assurance.</b> Egress <i>measured</i> at zero, containment <i>tested</i> 8/8, policy <i>configured</i>, each labelled with how the host knows it.</sub></td>
<td width="50%"><picture><source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/sandbox-light.webp"><img src="docs/assets/readme/sandbox-dark.webp" alt="The sandbox refusing a socket connection before it runs, in a private network namespace"></picture><br><sub><b>Sandbox.</b> Static checks, OS limits, and on Linux a private network namespace: the kernel refuses a connection even if the interpreter guard is bypassed.</sub></td>
</tr>
</table>

### And one more: a failed relief valve, two signatures

A PSV bench-test record goes in. Every SOP-INS-025 clause is judged by formula: the valve opened at 11.9 bar(g) against a limit of 11.55, so the finding on V-2104 is High, and release needs the Head of Inspection and then the Plant Manager.

<table>
<tr>
<td width="50%"><picture><source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/thread-relief-light.webp"><img src="docs/assets/readme/thread-relief-dark.webp" alt="The relief device decision for PSV-2104A on V-2104: as-received test failed, four other checks passed, High severity, held for the Head of Inspection then the Plant Manager"></picture><br><sub><b>Relief device decision.</b> Five clauses, five verdicts, all by formula; 8 of 8 checks.</sub></td>
<td width="50%"><picture><source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/approvals-light.webp"><img src="docs/assets/readme/approvals-dark.webp" alt="Approvals as the Head of Inspection: the run needs two signatures, Head of Inspection recommends then Plant Manager approves, 0 of 2 given"></picture><br><sub><b>Approvals.</b> Signatures in order, each bound to the version signed; the person who ran it can never sign.</sub></td>
</tr>
</table>

## The console

<table>
<tr>
<td width="50%"><picture><source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/drawings-light.webp"><img src="docs/assets/readme/drawings-dark.webp" alt="Knowledge, Drawings: the isolation plan for V-2104 drawn on the P&ID, 2 of 5 branches cannot be isolated for confined space entry as drawn"></picture><br><sub><b>Drawings.</b> An isolation plan judged branch by branch against the lockout procedure, and drawn on the sheet.</sub></td>
<td width="50%"><picture><source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/harness-control-light.webp"><img src="docs/assets/readme/harness-control-dark.webp" alt="Harness Control: a SOP question sweep of three questions, stage lanes, evidence graph, answer matrix and a sealed report"></picture><br><sub><b>Harness Control.</b> One governed job over many questions, each an ordinary checked run, ending in one sealed report.</sub></td>
</tr>
<tr>
<td><picture><source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/thread-answer-light.webp"><img src="docs/assets/readme/thread-answer-dark.webp" alt="The thread: a /clause question answered in one cited sentence, 48 months, SOP-INS-014 section 2.2, 7 of 7 checks"></picture><br><sub><b>Thread.</b> Ask in plain language or call a skill with <code>/</code>; the first sentence is the answer, cited.</sub></td>
<td><picture><source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/audit-light.webp"><img src="docs/assets/readme/audit-dark.webp" alt="Audit: the hash chain verified by the server and recomputed in the browser, with the latest records"></picture><br><sub><b>Audit.</b> Every task, model call, decision and sign-in, hash-chained and verified by the server <i>and</i> by your browser.</sub></td>
</tr>
<tr>
<td><picture><source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/knowledge-light.webp"><img src="docs/assets/readme/knowledge-dark.webp" alt="Knowledge: the procedures this account may retrieve, with department and classification"></picture><br><sub><b>Knowledge.</b> What retrieval may cite for <i>you</i>: department and clearance are applied before ranking.</sub></td>
<td><picture><source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/measurements-light.webp"><img src="docs/assets/readme/measurements-dark.webp" alt="Measurements: figures computed from their artifacts, each linked to its source"></picture><br><sub><b>Measurements.</b> Every figure computed from an artifact on this host; a skipped measurement says skipped.</sub></td>
</tr>
<tr>
<td><picture><source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/skills-light.webp"><img src="docs/assets/readme/skills-dark.webp" alt="Skills: saved, hashed request templates called with a slash"></picture><br><sub><b>Skills.</b> Saved instructions called with <code>/</code>; every run records which skill version shaped it.</sub></td>
<td><picture><source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/people-light.webp"><img src="docs/assets/readme/people-dark.webp" alt="People: access requests, invitations and accounts for an administrator"></picture><br><sub><b>People.</b> No self sign-up: invitations, access requests and resets, each an administrator's act on the record.</sub></td>
</tr>
</table>

<sub>Every screenshot is taken from the running workbench by <a href="scripts/capture_screens.py"><code>scripts/capture_screens.py</code></a>, in both themes; GitHub shows the one that matches yours.</sub>

## Proved, not claimed

The workbench is measured by a small set of repeatable checks, not a wall of promises.

<table>
<tr>
<td width="50%" valign="top">
<b>🟢 Demo ready</b><br>
<sub><code>FINAL STATUS: READY</code> across the three judged moments.</sub><br><br>
<a href="scripts/golden_demo.py"><code>run the golden demo →</code></a>
</td>
<td width="50%" valign="top">
<b>🛡️ Red team held</b><br>
<sub><b>31 of 31</b> attacks contained, with a hashed report.</sub><br><br>
<a href="scripts/red_team.py"><code>run the red team →</code></a>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<b>🖥️ Console clean</b><br>
<sub><b>132 of 132</b> account-and-screen visits free of exceptions, console errors and failed requests.</sub><br><br>
<a href="scripts/ui_check.py"><code>check every screen →</code></a>
</td>
<td width="50%" valign="top">
<b>✅ Regression suite</b><br>
<sub><b>1211 passed</b>, 13 expected platform skips; <b>13 of 13</b> browser smoke tests passed.</sub><br><br>
<a href="docs/handbook/13-development/02-testing.md"><code>see the test guide →</code></a>
</td>
</tr>
</table>

<details>
<summary><b>Every measured check and the command behind it</b></summary>
<br>

| Check | Measured result | Run it |
|---|---|---|
| Golden demo | `FINAL STATUS: READY` | `python scripts/golden_demo.py` |
| Red team | 31 of 31 held | `python scripts/red_team.py` |
| Console | 132 of 132 clean | `python scripts/ui_check.py` |
| Python suite | 1211 passed, 13 skipped | `pytest` |
| Browser smoke tests | 13 of 13 passed | `cd frontend && npm run test:e2e` |
| Audit chain | verified and roots signed | `python scripts/audit_tool.py verify` |
| Run certificate | every check passed | `python scripts/verify_certificate.py <certificate.json>` |
| Demo corpus | 15 documents, 207 passages | `python scripts/seed_demo_data.py --check` |

</details>

## How a question runs

One orchestrator handles the whole run. Optional stages appear only when the request needs them; the audit chain records every stage.

<p align="center">
  <img src="docs/assets/readme/assurance-flow.png" alt="A colourful industrial workflow: a report passes through local reading, retrieval, calculation, secure execution, drafting, verification, policy and audit controls before branching to a verified release or human review." width="100%">
</p>

<p align="center"><sub><b>TRIAGE</b> → <b>PLANNER*</b> → <b>READER*</b> → <b>SCOUT</b> → <b>RECKONER*</b> → <b>BENCH*</b> → <b>SCRIBE</b> → <b>CHECKER</b> → <b>WARDEN</b> → <b>NOTARY</b> &nbsp; · &nbsp; <i>* only when needed</i></sub></p>

<details>
<summary><b>Stage reference: what each call-sign does</b></summary>
<br>

| Call-sign | Responsibility | Runs on |
|---|---|---|
| **TRIAGE** | Classifies the request, inputs and sensitivity | Rules |
| **PLANNER** | Breaks complex work into steps | `qwen2.5:3b`, when needed |
| **READER** | Reads scans and drawings | `qwen2.5vl:3b`, cached per file |
| **SCOUT** | Retrieves permitted evidence | `nomic-embed-text` and keyword search |
| **RECKONER** | Applies registered formulas | Formula registry |
| **BENCH** | Executes guarded code | Sandbox limits |
| **SCRIBE** | Drafts a cited answer | `qwen2.5:3b` |
| **CHECKER** | Verifies claims and citations | Rules |
| **WARDEN** | Applies policy and approval gates | Policy engine |
| **NOTARY** | Hashes the run into the audit chain | SHA-256 chain |

</details>

<details>
<summary><b>A recorded run, stage by stage</b></summary>
<br>

Run `f30c2459`, captured on 24 Sep 2026 with Ollama on loopback; the figures are from [`frontend/public/landing/run.json`](frontend/public/landing/run.json), the record the public page replays.

> **Prompt** · `/clause` internal inspection of a pressure vessel in corrosive service
>
> **Answer** · A pressure vessel in corrosive service shall receive an internal inspection at intervals not exceeding 48 months. `[S1]` → **SOP-INS-014 §2.2**

| Stage | Call-sign | Time | What happened |
|---|---|--:|---|
| classify | TRIAGE | 3 ms | question answering, confidential |
| retrieve | SCOUT | 602 ms | 6 passages from 2 documents, embedding search |
| draft | SCRIBE | 38,902 ms | `qwen2.5:3b` Q4_K_M: 1,170 prompt tokens, 29 output tokens at 6.16 tok/s |
| verify | CHECKER | | 4 of 4 checks passed; 1 of 1 material claims supported |
| release | WARDEN | | no approval required |
| record | NOTARY | | 10 records appended, head `bf6ec740` |

Drafting took 98% of the run on an 8 GB CPU laptop; on a 16 GB laptop the same question answers in under 20 s.

</details>

## What is inside

| | |
|---|---|
| **Understand** | Per-page PDF reading by a local vision model with a cache keyed by image, model digest and prompt; DOCX, XLSX, CSV, PPTX; revision control; uploads judged by their bytes; injected instructions withheld from the model; secrets and personal data scanned |
| **Decide** | Six declared models with pinned digests; per-stage routing with a reason for every choice; hybrid retrieval with clearance applied before ranking; a default-deny policy gateway |
| **Compute** | 21 formulas (vessel, piping, relief devices, severity, FFS, re-rating, the interim operating envelope, schedules); conflicts that withhold the decision; P&ID graphs read from the drawing; read-only historian and OPC UA adapters |
| **Execute** | AST validation, OS limits, a runtime guard, a private network namespace on Linux, a rootless container where its image is built, an nftables egress table |
| **Verify** | Source, citation, page, calculation, engineering, code, document, claim and isolation-plan checks; claim verdicts: calculated, supported, conflicted, unsupported, needs a person |
| **Govern** | 11 approval rules, two signatures in order for a High finding, separation of duties by account, decisions bound to the version reviewed; accounts only by an administrator's act |
| **Prove** | Hash-chained audit with signed Merkle roots, a signed certificate per run, Proof Mode, measurements, re-run and compare, the red team and the golden demo check |

Everything, with where it lives and how to see it: **[docs/IMPLEMENTED.md](docs/IMPLEMENTED.md)**.

## Quickstart

**You need:** Python 3.11+, Node.js 20+ (CI builds with 22), git, [Ollama](https://ollama.com) and about 15 GB of free disk. No GPU is required. Tesseract is an optional OCR fallback. Details: [1.2 Requirements](docs/handbook/01-getting-started/02-requirements.md).

### Linux and macOS

```bash
git clone https://github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench.git
cd Sovereign-On_Premise-Agentic-AI-Workbench
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
(cd frontend && npm ci)

ollama pull qwen2.5:3b && ollama pull qwen2.5vl:3b && ollama pull nomic-embed-text
python scripts/seed_demo_data.py

scripts/start-ollama.sh --tier laptop-8gb         # in its own terminal; runs `ollama serve`
SOVEREIGN_PROFILE=laptop-8gb ./scripts/run.sh     # Linux: builds the console, starts API and console
.venv/bin/python scripts/warmup.py                # READY / NOT READY
```

`scripts/run.sh` is written for Linux and also takes `--status`, `--stop` and `--dev`. On macOS, start the API and the console in two terminals with the commands below ([1.6 Seed and run](docs/handbook/01-getting-started/06-seed-and-run.md)).

### Windows (PowerShell)

```powershell
git clone https://github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench.git
cd Sovereign-On_Premise-Agentic-AI-Workbench
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd frontend; npm ci; cd ..

ollama pull qwen2.5:3b; ollama pull qwen2.5vl:3b; ollama pull nomic-embed-text
.\.venv\Scripts\python.exe scripts\seed_demo_data.py

# Terminal 1: Ollama with the tier's variables (quit the tray app first)
.\scripts\start-ollama.ps1 -Tier laptop-8gb

# Terminal 2: the API, with the same tier
$env:SOVEREIGN_PROFILE = 'laptop-8gb'
.\.venv\Scripts\python.exe -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8000 --timeout-keep-alive 75

# Terminal 3: the console
cd frontend; npm run build; npx next start -H 127.0.0.1

# Then: is the host ready?
.\scripts\warmup.ps1
```

Full walk-through: [1.4 Install on Windows](docs/handbook/01-getting-started/04-install-windows.md). Air-gapped host: [1.9 Offline install](docs/handbook/01-getting-started/09-offline-install.md).

Open **http://127.0.0.1:3000**. An empty thread offers the golden demos as cards: pick one, press Run. Before judging, run `scripts/golden_demo.py` and `scripts/ui_check.py`; both create or open real runs, so don't point them at an instance whose history must stay as it is.

**Demo accounts.** With `demo.enabled: true` (the default), seven accounts are seeded and listed under the sign-in form, one click each: `engineer`, `reviewer`, `head_of_inspection`, `plant_manager`, `operator`, `auditor` and `admin`, sharing `security.seed_user_password`. Turn demo mode off for real use: the host then retires every demo account that still takes the shared password and issues a one-time setup token for the first administrator.

## Hardware tiers

Set the profile with `SOVEREIGN_PROFILE`; it is overlaid on `config/app.yaml` and `config/routing.yaml`. Start Ollama with the same tier.

| `SOVEREIGN_PROFILE` | Host | Users | Workers | Cited answer | Scan run |
|---|---|:--:|:--:|---|---|
| `laptop-8gb` | 8 GB, CPU only | 1 | 1 | 38–56 s, measured | ~100 s with the vision cache warm, ~290 s cold, measured |
| `laptop-16gb` | 16 GB, 8+ cores, no GPU | 1–2 | 1 | ~17 s, estimated | 1.5–2 min, estimated |
| `cpu-server` | 16–32 cores, 64–128 GB | 3–5 | 3 | ~13 s, estimated | not stated |
| `gpu-server` | ≥ 12 GB VRAM, 64 GB RAM | 5–15 | 4 | ~7 s, estimated | under a minute, estimated |

<sub>Which figures are measured and which estimated is stated in each file in <a href="config/profiles/"><code>config/profiles/</code></a>. Tuning: <a href="docs/handbook/12-operations/05-performance.md#hardware-profiles">12.5 Performance</a>. The runbook for the demo laptop: <a href="docs/handbook/14-demo-guide/03-demo-day.md">14.3 Demo day</a>.</sub>

## Accounts and access

There is no self sign-up. Every account is an administrator's decision, and each one is on the audit chain ([3.1 Sign-in and accounts](docs/handbook/03-user-guide/01-sign-in.md)).

| Path | How it works |
|---|---|
| **Setup token** | With demo mode off, a fresh host has no accounts. At startup it writes a one-time token, valid 24 h, to `storage/setup-token` and prints it in the API console. `/setup` uses it to create the first administrator |
| **Invitation** | An administrator creates a code on **People**, with the role and department fixed. Single-use, expiring, only its hash stored |
| **Access request** | `/request-access` creates an account that cannot sign in until an administrator approves it and chooses its role and department |
| **Password reset** | An administrator issues a one-time `RESET-…` code. An air-gapped host has no mail, so there is no *forgot password* |

Five failed sign-ins in five minutes lock an account; guessing codes is throttled per address.

## Architecture

```mermaid
flowchart LR
    U[Browser] --> N["Next.js console<br/>:3000"]
    N -->|"/api/* proxy"| A["FastAPI<br/>127.0.0.1:8000"]
    A -->|loopback only| O["Ollama<br/>127.0.0.1:11434"]
    A --> D[("SQLite + files<br/>storage/")]
    A --> L[["Audit chain<br/>storage/logs/audit.jsonl"]]
    A --> X["Sandbox<br/>no network"]
```

Three processes on one host. Storage is SQLite plus files, vectors are computed in process, and the live trace is Server-Sent Events. There is no external database, queue or cloud service. More in [4 · Architecture](docs/handbook/04-architecture/README.md).

| Folder | What is in it |
|---|---|
| [`backend/`](backend) | The FastAPI app: `agents/` (orchestrator, verifier), `rag/`, `knowledge/`, `engineering/` (formula registry, relief devices, P&ID), `models_layer/`, `policy/`, `security/`, `proof/`, `tools/` (sandbox), `connectors/`, `api/` |
| [`frontend/`](frontend) | The Next.js 16 console and the public page |
| [`config/`](config) | `app.yaml`, `models.yaml`, `routing.yaml`, `classification.yaml`, hardware `profiles/`, prompts, skills, harnesses |
| [`policies/`](policies) | Access control, approval rules, data classification, content scanning, tool permissions |
| [`scripts/`](scripts) | `run.sh`, `start-ollama.*`, `warmup.*`, `seed_demo_data.py`, `golden_demo.py`, `red_team.py`, `ui_check.py`, `capture_screens.py`, `backup.py`, `audit_tool.py`, the offline bundle |
| [`sample_data/`](sample_data) | The synthetic plant: SOPs, records, scanned reports, a P&ID, a PSV test record, attack files |
| [`infrastructure/`](infrastructure) | `docker-compose.yml`, the sandbox container image, the nftables egress table |
| [`tests/`](tests) | The pytest suite, including the adversarial tests; no test needs a model |
| [`docs/`](docs) | The handbook and the project documents |

## Docs

> **Your route through AEGIS starts here.** Choose a mission below, then follow the connected guides from first run to evidence-backed delivery.

<table>
<tr>
<td width="25%" valign="top">
<a href="docs/handbook/01-getting-started/README.md"><img src="https://img.shields.io/badge/01—03-FIRST_RUN-00B8D9?style=for-the-badge&labelColor=0B1320" alt="First run"></a><br><br>
<b>🚀 Start with confidence</b><br>
<sub>Install the workbench, load the synthetic plant and see a complete answer delivered.</sub><br><br>
<a href="docs/handbook/01-getting-started/README.md">Open getting started →</a><br>
<a href="docs/handbook/14-demo-guide/README.md">Watch the guided demo →</a>
</td>
<td width="25%" valign="top">
<a href="docs/handbook/04-architecture/README.md"><img src="https://img.shields.io/badge/04—08-INSIDE_AEGIS-8B5CF6?style=for-the-badge&labelColor=17112A" alt="Inside AEGIS"></a><br><br>
<b>🧭 See every decision</b><br>
<sub>Trace the architecture, model routing, knowledge path, agents and verification gates.</sub><br><br>
<a href="docs/handbook/04-architecture/README.md">Explore the architecture →</a><br>
<a href="docs/handbook/07-agents/README.md">Meet the agents →</a>
</td>
<td width="25%" valign="top">
<a href="docs/handbook/09-security/README.md"><img src="https://img.shields.io/badge/09—12-TRUST_%26_CONTROL-22C55E?style=for-the-badge&amp;labelColor=082616" alt="Trust and control"></a><br><br>
<b>🛡️ Operate with proof</b><br>
<sub>Review access, containment, audit evidence, configuration and the operating model.</sub><br><br>
<a href="docs/handbook/09-security/README.md">Review security →</a><br>
<a href="docs/handbook/12-operations/README.md">Run operations →</a>
</td>
<td width="25%" valign="top">
<a href="docs/handbook/13-development/README.md"><img src="https://img.shields.io/badge/13—15-BUILD_%26_SHIP-F97316?style=for-the-badge&amp;labelColor=2B1205" alt="Build and ship"></a><br><br>
<b>🧰 Build and extend</b><br>
<sub>Use the API, run the suite, adapt the workbench and find answers quickly.</sub><br><br>
<a href="docs/handbook/13-development/README.md">Build on AEGIS →</a><br>
<a href="docs/handbook/11-api/README.md">Read the API →</a>
</td>
</tr>
</table>

### 🗺️ The handbook · 15 guides, one connected map

<table>
<tr>
<th width="25%" align="left">🚀 Use it</th>
<th width="25%" align="left">🧭 Understand it</th>
<th width="25%" align="left">🛡️ Run it safely</th>
<th width="25%" align="left">🧰 Build on it</th>
</tr>
<tr>
<td valign="top"><a href="docs/handbook/01-getting-started/README.md"><b>01 · Getting started</b></a><br><sub>Install, configure, seed and run.</sub></td>
<td valign="top"><a href="docs/handbook/04-architecture/README.md"><b>04 · Architecture</b></a><br><sub>Boundaries, data flow and evidence.</sub></td>
<td valign="top"><a href="docs/handbook/09-security/README.md"><b>09 · Security and governance</b></a><br><sub>Controls, evidence and accountability.</sub></td>
<td valign="top"><a href="docs/handbook/13-development/README.md"><b>13 · Development</b></a><br><sub>Test, contribute and extend.</sub></td>
</tr>
<tr>
<td valign="top"><a href="docs/handbook/02-concepts/README.md"><b>02 · Core concepts</b></a><br><sub>Runs, evidence, claims and policy.</sub></td>
<td valign="top"><a href="docs/handbook/05-models-and-routing/README.md"><b>05 · Models and routing</b></a><br><sub>Local models and routing choices.</sub></td>
<td valign="top"><a href="docs/handbook/10-configuration/README.md"><b>10 · Configuration</b></a><br><sub>Profiles, policy and environment.</sub></td>
<td valign="top"><a href="docs/handbook/14-demo-guide/README.md"><b>14 · Demo guide</b></a><br><sub>Present the full system story.</sub></td>
</tr>
<tr>
<td valign="top"><a href="docs/handbook/03-user-guide/README.md"><b>03 · Using the workbench</b></a><br><sub>Ask, inspect, approve and compare.</sub></td>
<td valign="top"><a href="docs/handbook/06-knowledge-and-retrieval/README.md"><b>06 · Knowledge and retrieval</b></a><br><sub>Sources, scanning and citations.</sub></td>
<td valign="top"><a href="docs/handbook/11-api/README.md"><b>11 · API reference</b></a><br><sub>Endpoints and integration contracts.</sub></td>
<td valign="top"><a href="docs/handbook/15-reference/README.md"><b>15 · FAQ and glossary</b></a><br><sub>Find the exact term or answer.</sub></td>
</tr>
<tr>
<td valign="top"><a href="docs/handbook/01-getting-started/09-offline-install.md"><b>↳ Offline install</b></a><br><sub>Set up without downloading at runtime.</sub></td>
<td valign="top"><a href="docs/handbook/07-agents/README.md"><b>07 · Agents</b></a><br><a href="docs/handbook/08-verification/README.md"><b>08 · Verification</b></a><br><sub>Orchestrate, then prove.</sub></td>
<td valign="top"><a href="docs/handbook/12-operations/README.md"><b>12 · Operations</b></a><br><sub>Observe, maintain and recover.</sub></td>
<td valign="top"><a href="docs/DEMO.md"><b>↳ Demo script with answers</b></a><br><sub>Run the judge-ready narrative.</sub></td>
</tr>
</table>

### ✦ Judge, review and ship

| See the working system | Run the presentation | Assess readiness | Plan the build |
|---|---|---|---|
| [**What AEGIS implements today**](docs/IMPLEMENTED.md)<br>Current capabilities and honest boundaries. | [**Demo script with answers**](docs/DEMO.md)<br>A precise live-demo route. | [**SIH readiness review**](docs/SIH-READINESS-REVIEW.md)<br>Evidence, gaps and next checks. | [**SIH winning build plan**](docs/SIH-WINNING-BUILD-PLAN.md)<br>Execution plan for the challenge. |

<p align="center"><sub><b>Security review lane</b> · <a href="docs/handbook/09-security/06-threat-model.md">Threat model</a> · <a href="docs/handbook/09-security/03-sandbox.md">Sandbox</a> · <a href="docs/handbook/09-security/05-audit-log.md">Audit log</a> · <a href="docs/handbook/09-security/08-red-team.md">Red team</a> · <a href="docs/handbook/09-security/09-proof.md">Signed proof</a> · <a href="docs/handbook/README.md">Handbook home</a></sub></p>

## ⚠️ Limitations

- **Latency is hardware-bound.** On an 8 GB CPU laptop a cited answer takes 38–56 s and a scanned report minutes. Once the host swaps, a 70-second call can take 25 minutes ([12.5](docs/handbook/12-operations/05-performance.md)).
- **Small models are small.** A 3B model drafts thin prose and sometimes cites what it should not. Figures and isolation plans come from deterministic engines, and what it gets wrong fails verification and holds the run, but the prose stays thin ([8.5](docs/handbook/08-verification/05-limits.md)).
- **Claims are traced lexically.** A passage that carries a claim's terms supports it, which is not the same as entailing it. Engineering figures are the exception: they are computed.
- **The sandbox is a container only where its image is built** (`infrastructure/sandbox/build.sh`). Elsewhere it is runtime guards and OS limits in the API user's process tree; on Linux a private network namespace still refuses its connections ([9.3](docs/handbook/09-security/03-sandbox.md)).
- **Egress is measured for the workbench's own processes, not the whole host.** For a provable air gap, apply the host firewall (`infrastructure/firewall/`); its counters are read back on Linux only.
- **The signing key lives on the host it signs for.** Copy the public key and the sealed roots off-host.
- **The policy files are a starting point, not your organisation's policy.** Some declared permissions are not enforced yet, and [9.1](docs/handbook/09-security/01-access-control.md) marks each one.
- **Compliance is not a software property.** The audit chain supports an assurance process; it is not one.

## 👥 The team

<table>
<tr>
<td align="center" width="30%" valign="top">
<a href="https://github.com/kartikeyajay2006"><img src="https://avatars.githubusercontent.com/u/317522874?v=4&s=200" width="120" alt="Kartikeya Yadav"></a>
<br><b>Kartikeya Yadav</b>
<br><a href="https://github.com/kartikeyajay2006">@kartikeyajay2006</a>
<br><br><img src="https://img.shields.io/badge/lead-architecture_&_backend-ff6a1a?style=flat-square" alt="Lead">
<br><br>
<sub>Designed and built the platform end to end, from the reference architecture to a working local deployment.</sub>
<br><br>
<sub>🏗️ <b>Foundation</b>: config-driven core, SQLite persistence, local identity and the hash-chained audit log</sub><br>
<sub>🧭 <b>Intelligence</b>: model registry and routing, the knowledge base, tools and the default-deny policy gateway</sub><br>
<sub>🤖 <b>Pipeline</b>: the agent orchestrator, the API and task queue, the sovereignty monitor and secure event streams</sub><br>
<sub>📦 <b>Sandbox & proof</b>: contained code execution, the verifier and the human approval gate</sub><br>
<sub>🧮 <b>Engineering</b>: relief-device and FFS formulas, relief records in runs, the network-namespace sandbox</sub><br>
<sub>✅ <b>Correctness sweeps</b>: the uploaded-survey reader, claim verification, demo accounts in production, the console check</sub><br>
<sub>🔧 <b>Reliability</b>: scanned PDFs reaching the vision model, the queue worker, approvals and deliverables</sub><br>
<sub>⚡ <b>Performance</b>: stopped host swapping (a 72 s call had become 25 min), roughly halved run time, fixed concurrent audit writes</sub><br>
<sub>🎨 <b>Identity & docs</b>: the AEGIS mark and brand kit, the synthetic industrial dataset, the README and the handbook</sub>
</td>
<td align="center" width="30%" valign="top">
<a href="https://github.com/kunalKumar-13"><img src="https://avatars.githubusercontent.com/u/166685451?v=4&s=200" width="120" alt="Kunal Kumar"></a>
<br><b>Kunal Kumar</b>
<br><a href="https://github.com/kunalKumar-13">@kunalKumar-13</a>
<br><br><img src="https://img.shields.io/badge/workbench-thread_·_skills_·_harnesses-ff2d6f?style=flat-square" alt="Workbench">
<br><br>
<sub>Built the day-to-day workbench experience and the proof surfaces that make its work reviewable.</sub>
<br><br>
<sub>💬 <b>Workbench</b>: the chat-first thread, streamed answers, run transcripts and the sidebar of past runs</sub><br>
<sub>⚡ <b>Skills & harnesses</b>: saved instructions called with <code>/</code>, governed multi-run jobs and Harness Control</sub><br>
<sub>🧾 <b>Proof & governance</b>: two signatures in order, Proof Mode, measurements, re-run and compare, account provisioning</sub><br>
<sub>🛡️ <b>Containment</b>: the Windows Job Object sandbox, the container runtime and the nftables egress table</sub><br>
<sub>📈 <b>Telemetry</b>: what each run cost, which model ran it, and a stop control</sub><br>
<sub>✅ <b>Correctness</b>: clearance before ranking, classification raised by evidence, unresolved citations held, no approving your own run</sub><br>
<sub>🌐 <b>Experience</b>: the Hi-Vis design system, the public page that replays a real run, keyboard navigation</sub><br>
<sub>🔍 <b>Honesty pass</b>: removed every reading, score and posture claim the backend never measured</sub><br>
<sub>📚 <b>Docs & demo</b>: deployment and rehearsal guidance, browser smoke fixtures and CI evidence that keep the workbench reproducible</sub>
</td>
<td align="center" width="20%" valign="top">
<a href="https://github.com/raghav-shell"><img src="https://avatars.githubusercontent.com/u/239672511?v=4&s=200" width="120" alt="Raghav Sharma"></a>
<br><b>Raghav Sharma</b>
<br><a href="https://github.com/raghav-shell">@raghav-shell</a>
<br><br><img src="https://img.shields.io/badge/design-visual_system_·_motion-b23bd9?style=flat-square" alt="Design">
<br><sub>Frontend visual system and motion; scanned-PDF extraction and the macOS sandbox</sub>
</td>
<td align="center" width="20%" valign="top">
<a href="https://github.com/ankit25bcs10610"><img src="https://avatars.githubusercontent.com/u/232535999?v=4&s=200" width="120" alt="Ankit Pandey"></a>
<br><b>Ankit Pandey</b>
<br><a href="https://github.com/ankit25bcs10610">@ankit25bcs10610</a>
<br><br><img src="https://img.shields.io/badge/contributor-workbench-7c4dff?style=flat-square" alt="Contributor">
<br><sub>Contributions to the workbench</sub>
</td>
</tr>
</table>

<p align="center"><sub>Built for Smart India Hackathon 2026. Every figure on this page was measured on the demo host; every screenshot was taken from it.</sub></p>
