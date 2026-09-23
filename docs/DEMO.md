# AEGIS — Demo Script

> **SYNTHETIC DATA.** Every procedure, report, equipment tag, reading, person and
> rupee figure in this script and in `sample_data/` is invented for the AEGIS
> demonstration. No real site, customer or measurement is represented. The
> documents say so in their own headers, and the scanned reports carry a
> SYNTHETIC stamp.

This is the script for showing AEGIS to a judge. It has twelve scenarios, each
with the exact prompt, the account to sign in with, what the pipeline should
do, and the **correct answer with its clause citations**, so the person at the
keyboard can check the model live instead of trusting it.

The thesis each scenario tests is the same: *an answer is only as good as the
passage it cites, the arithmetic is checked by something other than the model,
and what a person may see or release is decided by policy, not by the model.*

---

## 1. Before you start

### Seed the corpus

```powershell
./.venv/Scripts/python.exe scripts/seed_demo_data.py --check   # validate only: writes nothing, opens no database
./.venv/Scripts/python.exe scripts/seed_demo_data.py           # build files, then index the corpus
```

Seeding needs the local inference server running with `nomic-embed-text`
installed. Without it the script stops rather than store passages that
embedding search could not see; `--allow-lexical` overrides that. Re-running
is safe. A changed document replaces its earlier copy: same document code,
new content. That includes copies uploaded through the interface.

### Demo accounts

Password for every account: `workbench` (`config/app.yaml`, `security.seed_user_password`).
What each account can retrieve follows from `policies/access-control.yaml`:
department isolation, then the role's classification ceiling.

| Username | Role | Department | Cleared to | Can retrieve |
|---|---|---|---|---|
| `operator` | operator | operations | Confidential | 6 of 15 documents: the three Operations SOPs and three site-wide SOPs |
| `engineer` | engineer | inspection | Restricted | 12 of 15: everything except the three Operations SOPs |
| `reviewer` | reviewer | engineering | Restricted | all 15 (cross-department read authority) |
| `auditor` | auditor | quality | Restricted | none: the role has no knowledge search and cannot create tasks |
| `admin` | administrator | general | Restricted | all 15 |

The seed script prints this table from policy after indexing.

### The corpus

Fifteen documents, 207 passages. The counts are what the ingestion chunker
produces from these files; confirm them in the Registry after seeding.

| Document | Title | Department | Classification | Rev | Passages |
|---|---|---|---|---|---|
| SOP-INS-014 | Pressure Vessel External and Internal Inspection | inspection | Confidential | 4.3 | 26 |
| SOP-INS-017 | Piping Thickness Monitoring, Corrosion Rate and Remaining Life | inspection | Confidential | 2.0 | 22 |
| SOP-INS-021 | Fitness-For-Service Assessment of Pressure Equipment | inspection | Confidential | 3.1 | 23 |
| SOP-INS-025 | Pressure Relief Device Inspection and Testing | inspection | Confidential | 1.4 | 13 |
| SOP-INS-030 | Risk-Based Inspection Planning and Inspection Intervals | inspection | Confidential | 1.2 | 11 |
| SOP-MNT-022 | Management of Corrosion Under Insulation (CUI) | inspection | Confidential | 2.2 | 9 |
| SOP-OPS-011 | Hot Work Permit | operations | Confidential | 3.0 | 14 |
| SOP-OPS-012 | Confined Space Entry | operations | Confidential | 2.3 | 12 |
| SOP-OPS-015 | Lockout/Tagout and Isolation of Hazardous Energy | operations | Confidential | 4.0 | 12 |
| SOP-OPS-008 | Approval Authority and Delegation Matrix | general | Confidential | 5.2 | 21 |
| SOP-ENG-009 | Management of Change | general | Confidential | 2.1 | 10 |
| SOP-HSE-004 | Incident Reporting and Investigation | general | Normal | 3.2 | 14 |
| ENG-DBM-2104 | Design Basis Memorandum: Replacement of V-2104 | general | **Restricted** | 0.3 | 8 |
| INV-2015-014 | Incident Investigation Summary: Loss of Containment on P-2104-OVHD-01 | general | **Sensitive** | 1.0 | 7 |
| INS-2026-0522 | Piping Thickness Survey Report: Circuit P-2104-OVHD-01 | inspection | Confidential | 1.0 | 5 |

Every requirement is written so that one numbered clause can be retrieved and
cited on its own. At the time of writing, the reasoning prompt shows the first
six evidence items, each cut to 500 characters (`backend/agents/orchestrator.py`,
`_reason`), so no clause body exceeds that. The old findings table in
SOP-INS-014 §5 did: the model saw the Medium row cut off at "Head of Inspec"
and never saw the Low row. That was one cause of the repeated error of giving
a Medium finding the High row's approvers.

**Attachments, not indexed:** the two scanned reports are read by the vision
model only when attached to a task.

| File | What it is |
|---|---|
| `sample_data/inspection/scanned-inspection-report-V-2104.pdf` | Scan, no text layer. V-2104, report INS-2026-0417, Medium case |
| `sample_data/inspection/scanned-inspection-report-V-2107.pdf` | Scan, no text layer. V-2107, report INS-2026-0588, High case |
| `sample_data/datasets/V-2104-thickness-survey.csv` | V-2104 readings as a dataset, for the sandbox path |
| `sample_data/datasets/inspection-history.csv` | Six vessels' survey history, for the stretch scenario |

`sample_data/expected-answers.json` holds every computed answer below,
derived by `scripts/seed_demo_data.py` from the same numbers the documents
carry. The model never sees it.

### Timing

Inference is local and CPU-only, so a run takes minutes, not seconds. The
most recent run of the Scenario 1 prompt took 134.3 s on the development host
(run `dfe0babf`, 23 Sep 2026, against this corpus). The capture the landing
page tells the story of took 246.8 s against the earlier four-document corpus
(`frontend/public/landing/run.json`).
Tasks run one at a time (`backend/api/main.py` starts one worker); a task
submitted while another runs waits in the queue and shows its position. For a
fixed demo slot, run a few scenarios live and pre-run the rest; their full
traces stay in Tasks. See section 3.

### How to read a run

- **Evidence identifiers.** `S` = passage from the knowledge base, `F` =
  attached file, `V` = what the vision model read, `C` = a figure recomputed
  in the sandbox. A citation like `[S2]` must resolve to a listed item.
- **Verification checks.** `source_verification`, `calculation_verification`,
  `code_verification`, `document_verification` (only when a document is
  drafted) and `hallucination_check`. Any failed check holds the run for a
  human (`verification_failure` in `policies/approval-rules.yaml`).
- **Approval.** A held run shows its reasons and the roles that may decide.
- **Audit.** Policy decisions, model and tool calls, verification and
  approvals are recorded as hash-chained audit events.

What the verifier can and cannot catch: it confirms that a claim is about
the passage it cites (shared figures or words) and recomputes asserted
arithmetic. It cannot tell that a claim read the wrong row of a passage, or
that the right formula was used with the wrong rate. That is what the clause
citation is for, and why the reviewer is part of the pipeline. The corrections
under "Must not appear" below are what a human checks.

---

## 2. Scenarios

The classification and hold behaviour stated for each scenario come from
running the workbench's own analyzer (`backend/core/analyzer.py`) and approval
rules (`PolicyGateway.approval_requirement`) on the exact prompt, and then
running the prompt's retrieval as its account through `POST
/api/knowledge/search`, which is scoped exactly as the agent's retrieval is. A
run's class rises to its most sensitive evidence before the approval gate
reads it, so the analyzer alone no longer predicts a hold. Checked on 23 Sep
2026:

| Scenario | Account | Class from the prompt | Class after retrieval | Held by class |
|---|---|---|---|---|
| 1 | engineer | normal | **restricted** (ENG-DBM-2104 §4) | yes |
| 2 | operator, engineer | normal | confidential | no |
| 3 | operator | normal | confidential | no |
| 3 | engineer | normal | **restricted** (ENG-DBM-2104) | yes |
| 4, 8 (variant), 10, 11 | engineer | normal | confidential | no |
| 8 | engineer | normal | **restricted** (ENG-DBM-2104) | yes |
| 9 | operator | sensitive | sensitive | yes |

Scenarios 5, 6 and 7 attach files, and a scan's retrieval query includes what
the vision model read, so they cannot be predicted this way. Any run is also
held when a verification check fails. Check every prediction against the
trace.

### Scenario 1 — A precise answer, cited to the clause

**Sign in as** `engineer`. **Format:** answer only.

```text
What severity applies when cladding damage exceeds 20% of an insulated section, and who must approve continued operation? Cite the clauses.
```

**Pipeline.** Classified `question_answering`, normal. No plan (a single
retrieval question). Stages: retrieve, draft, verify. Then the run is
**raised to restricted and held**, even when every check passes. Retrieval
for this prompt is deterministic, and its fifth passage is ENG-DBM-2104 §4,
"Protection Against Corrosion Under Insulation", from the Restricted design
memo (score 0.716, level with the Confidential passages around it). An answer
is at least as sensitive as what the model was shown, so the classification
rises before the approval gate reads it, and `sensitive_classification`
holds it for a reviewer. The held line reads *Held for administrator or
reviewer · evidence S5 (ENG-DBM-2104) is restricted, so the run is restricted
too*.

**How to say it.** "It asked a routine question. Retrieval admitted a
Restricted memo into the model's context, so the answer is treated as
Restricted and a reviewer signs it off. The model's confidence played no
part; the policy file did." Then sign in as `reviewer` to release it.

**Correct answer.**
- Severity **Medium**: SOP-MNT-022 §4.1 (cladding damage over 20% of an
  insulated section is a Medium finding under SOP-INS-014 Clause 5), and
  SOP-INS-014 §5.2 (Medium includes insulation damage permitting CUI).
- Required action: repair within the current shutdown window (SOP-INS-014 §5.2).
- Approver: the **Head of Inspection** (SOP-INS-014 §5.2; SOP-OPS-008 §2.2,
  where the Inspection Engineer recommends and the Plant Manager has no part).
- Continued operation with a Medium finding: the compensating measures are
  recorded, and the Head of Inspection approves (SOP-INS-014 §6.4). The
  approval note is countersigned by that authority (SOP-INS-014 §6.3).

**Must not appear.** "Head of Inspection + Plant Manager". That is the High
authority (SOP-INS-014 §5.1). The Plant Manager enters only for interim
operation of equipment awaiting a Fitness-For-Service assessment
(SOP-INS-021 §6.2, SOP-OPS-008 §2.8), which this question does not raise.

**Why it matters.** This is the question the small model used to get wrong by
reading the wrong table row. Now each severity is its own passage: a citation
of §5.2 points at text that names only the Head of Inspection, so a reader
can check it in one glance.

### Scenario 2 — Department isolation: same question, two departments

**Run twice:** first as `operator`, then as `engineer`. **Format:** answer only.

```text
What is the maximum interval between internal inspections of a pressure vessel in corrosive service under our procedures?
```

**Pipeline.** Classified `calculation`, because "pressure vessel" contains
"pressure", a calculation keyword; the effect is harmless. Normal
sensitivity; retrieval is triggered by "procedures".

**Correct answer as `engineer`.** **48 months** (SOP-INS-014 §2.2). The same
clause sets external inspection at 12 months and the thickness survey at
24 months. Extension needs a documented Fitness-For-Service assessment approved
by the Head of Inspection (SOP-INS-014 §2.5).

**Correct answer as `operator`.** The operator is in Operations. Inspection &
Integrity documents are outside their departments, so no SOP-INS passage is
retrieved. The correct answer says the procedures available do not state the
interval. It may mention that SOP-OPS-008 §2.7 refers to SOP-INS-014 Clause 2.5.

**Must not appear (operator).** "48 months". No passage the operator can see
supports it. If the model produces it from general knowledge, source
verification should fail and the run is held.

**How to show it.** Put the two runs' evidence lists side by side. The
operator's holds only SOP-OPS, SOP-ENG-009 and SOP-HSE-004 passages.

**Why it matters.** Need-to-know is enforced in retrieval, before the model
sees anything. A model cannot leak a passage it was never given.

### Scenario 3 — A Restricted document and the wrong clearance

**Run twice:** first as `operator`, then as `engineer`. **Format:** answer only.

```text
What is the estimated installed cost of the V-2104 replacement vessel, and who must approve that expenditure?
```

**Pipeline.** Classified `question_answering`, normal. ENG-DBM-2104 is filed
under *general*, so both accounts pass the department filter. Only the
classification ceiling separates them: the operator is cleared to
Confidential and the memo is Restricted.

**Correct answer as `engineer`.** **₹42 lakh** (ENG-DBM-2104 §6). That falls
above ₹5 lakh and up to ₹50 lakh, so the Head of Inspection recommends it and
the **Plant Manager approves** (SOP-OPS-008 §2.10). The replacement is also a
Major change, approved by the Plant Manager under SOP-ENG-009 §3.1; approving
the change does not approve its expenditure.

**Correct answer as `operator`.** The cost is not in the material available.
The expenditure bands of SOP-OPS-008 §2.9–2.11 may be quoted.

**Must not appear (operator).** "₹42 lakh", or any detail of the replacement
design.

**How to show it.** Open the Registry as each account. The operator sees six
documents and ENG-DBM-2104 is not among them: the catalogue is filtered by
department and clearance, so an account cannot learn even the title of a
document it may not read. The engineer sees twelve, the memo with its
Restricted tag. The operator's evidence list contains no passage from it.

**What the engineer's run shows.** It is raised from *normal* to
*restricted*, because its evidence includes the Restricted memo, and held
for a reviewer. The held reason names the passage and the document. The audit
trail records the raise as `classification_raised`, with the evidence ids
that caused it.

### Scenario 4 — A calculation from the knowledge base, recomputed independently

**Sign in as** `engineer`. **Format:** answer only.

```text
Using the latest thickness survey report for piping circuit P-2104-OVHD-01, calculate the short-term and long-term corrosion rates and the remaining life at each CML per SOP-INS-017, identify the governing CML, and state when the next thickness measurement is due.
```

**Pipeline.** Classified `calculation`, normal. Retrieval is triggered by
"SOP". No code is generated because nothing is attached. During verification
a separate model call extracts the calculations the answer asserts, and each
extracted expression is recomputed in the sandbox. Each recomputation becomes
a `C` evidence item.

**Inputs** (INS-2026-0522 §2): nominal 8.18 mm; in service since
12 March 2016 (10.0 years); surveys 12 March 2021 then 12 March 2026
(5.0 years); t-min 2.8 mm; Class 1, maximum interval 5 years.

**Correct answer** (SOP-INS-017 §5.1 rates, governing rate is the higher;
§5.2 remaining life; §6.1 next measurement):

| CML | Readings (mm) | Short-term (mm/yr) | Long-term (mm/yr) | Governing | Remaining life (yr) |
|---|---|---|---|---|---|
| CML-01 | 7.9 → 7.6 | 0.060 | 0.058 | 0.060 | 80.0 |
| CML-02 | 7.5 → 6.9 | 0.120 | 0.128 | 0.128 (long-term) | 32.03 |
| **CML-03** | 6.1 → 4.6 | 0.300 | **0.358** | **0.358 (long-term)** | **5.03** |
| CML-04 | 7.7 → 7.1 | 0.120 | 0.108 | 0.120 | 35.83 |

- Governing CML: **CML-03**, the elbow after the wash-water injection point.
  Its remaining life is (4.6 − 2.8) / 0.358 = **5.03 years**.
- Next measurement: the lesser of one half of 5.03 years (30.17 months,
  rounded down to 30) and the Class 1 maximum of 60 months. That is
  **30 months**, so it is due **12 September 2028** (SOP-INS-017 §6.1).
- Remaining life is above 4 years, so there is no accelerated monitoring
  (§7.2) and no FFS referral (§7.3).

**Must not appear.** The short-term rate alone at CML-03: 0.30 mm/yr, 6.0
years, 36 months, due 12 March 2029. That arithmetic is internally correct, so
the sandbox check passes it. The rule is what it breaks: SOP-INS-017 §5.1 says
the higher rate governs.

**Why it matters.** Figures are recomputed, not trusted. A recomputation that
disagrees by more than 1% fails the calculation check and holds the run.
Choosing the right rate is a rule, not arithmetic, so the answer must cite
§5.1 where a reviewer can see it.

### Scenario 5 — Code written and run in the offline sandbox

**Sign in as** `engineer`. **Attach** `sample_data/datasets/V-2104-thickness-survey.csv`.
**Format:** answer only.

```text
Using the attached thickness survey for V-2104, calculate the short-term and long-term corrosion rates and the remaining life at every location per SOP-INS-014 Clause 4, and identify the governing location.
```

**Pipeline.** Classified `calculation` with spreadsheet input. Code execution
is required: a data file is attached to a calculation. A plan runs, because
there is an attachment and code. Stages: read the file (`F` evidence),
retrieve SOP-INS-014 §4 (`S`), `spreadsheet_analyze`, generate code, run it in
the sandbox, reason, then verify with the code check (exit status and network
attempts blocked) and the calculation check. The classification follows the
one chosen at upload; it is not held unless a check fails.

**Correct answer** (4.0 years between surveys, 20.0 years in service, nominal
12.0 mm, t-min 6.0 mm; SOP-INS-014 §4.1–§4.4):

| Location | Short-term | Long-term | Remaining life (yr) |
|---|---|---|---|
| Shell course 1 (top) | 0.225 | 0.055 | 21.78 |
| **Shell course 2 (mid)** | **0.550** | 0.130 | **6.18** |
| Shell course 3 (bot) | 0.200 | 0.045 | 25.50 |
| Bottom head | 0.150 | 0.030 | 36.00 |
| Inlet nozzle N1 | 0.325 | 0.090 | 12.92 |
| Manway M1 flange | 0.050 | 0.010 | 116.00 |

The short-term rate governs everywhere (§4.3). The governing location is
**Shell course 2 (mid)**, at 0.55 mm/yr and **6.18 years**.

**Why it matters.** The model writes a program instead of doing mental
arithmetic. The program runs where it has no network, and its output becomes
cited evidence.

### Scenario 6 — A scanned report, read locally, drafted, and held for sign-off

**Sign in as** `engineer`. **Attach** `sample_data/inspection/scanned-inspection-report-V-2104.pdf`.
**Format:** Word (docx).

```text
Read the attached scanned inspection report for vessel V-2104 and prepare an approval note based on our approved SOPs. State the governing location, the corrosion rate and remaining life with the inputs used, the severity and the clause it rests on, and who must approve it.
```

**Pipeline.** Input type `scanned_pdf` ("scanned"). Task type `calculation`:
"corrosion rate" and "remaining life" outscore "approval note". Sensitivity
**sensitive**, because of "approval note". The PDF has no text layer, so the
page is rasterised and read by the vision model (`V` evidence). Then plan,
retrieve, reason, verify, draft the DOCX, and check the document. The run is
**held** for two reasons even if every check passes: `sensitive_classification`
and `released_deliverable`. Then sign in as `reviewer`, open Approvals, and
approve. The DOCX is released.

**Correct content** (all inputs are printed on the scan):
- Governing location: **Shell course 2 (mid)**, 11.6 → 9.4 mm over 4.0 years.
- Short-term rate 0.55 mm/yr. The long-term rate, (12.0 − 9.4) / 20.0 =
  0.13 mm/yr, is lower, so 0.55 governs (SOP-INS-014 §4.1–§4.3).
- t-min 6.0 mm (SOP-INS-014 §3.2, printed on the scan). Remaining life
  (9.4 − 6.0) / 0.55 = **6.18 years** (§4.4).
- Severity **Medium**. The basis is SOP-MNT-022 §4.1: cladding damage about
  35%, over 20%. SOP-INS-014 §5.2 also applies (insulation damage permitting
  CUI; active external corrosion).
- Required action: repair within the current shutdown window (SOP-INS-014 §5.2).
- Approver: **Head of Inspection** (SOP-INS-014 §5.2 and §6.3; SOP-OPS-008 §2.2).
  Continued service records its compensating measures (§6.4). The note
  references SOP-MNT-022 (SOP-MNT-022 §6.2).

**Must not appear.**
- SOP-INS-014 §4.5 as the basis for Medium: remaining life is above 4 years.
- "High": no reading is below t-min, so SOP-MNT-022 §4.3 does not apply.
- "Head of Inspection + Plant Manager".
- An FFS trigger: local metal loss is 2.6 mm, 21.7% of nominal, under the
  25% trigger of SOP-INS-021 §2.3.

**Demoer notes.** Check the `V` items: a misread 9.4 or 11.6 propagates into
every figure. The reasoning prompt takes the first six evidence items, and
the vision items come first. If the vision model lists many findings, few SOP
passages reach the model. Watch which `S` items the answer cites.

**Why it matters.** A photocopied form becomes a cited, recomputed approval
note without leaving the host, and it cannot leave the workbench until a
named person approves it.

### Scenario 7 — The same pipeline, the opposite answer: a High finding

**Sign in as** `engineer`. **Attach** `sample_data/inspection/scanned-inspection-report-V-2107.pdf`.
**Format:** answer only.

```text
Read the attached scanned inspection report for vessel V-2107. What severity is the worst finding, what must happen to the vessel and by when, is interim operation permitted, and who must approve? Cite the procedures.
```

**Pipeline.** `scanned_pdf`, becoming `vision_analysis`. Retrieval is
triggered by "procedures". It is not held unless a check fails.

**Correct answer.**
- Worst finding: **Shell course 1 (liquid zone), 5.8 mm, below t-min 6.0 mm**.
  Severity **High** (SOP-INS-014 §5.1). The short-term rate there is
  (7.1 − 5.8) / 2.0 = 0.65 mm/yr.
- Withdraw from service immediately (SOP-INS-014 §3.3), and within 24 hours
  (§5.1). The scan records isolation at 17:30 on 18/05/2026.
- A Fitness-For-Service assessment is required (SOP-INS-021 §2.1). Local metal
  loss is also 42% of nominal (§2.3).
- Interim operation is **not permitted**: it requires thickness at or above
  t-min at every location (SOP-INS-021 §6.1).
- Approval: **Head of Inspection + Plant Manager** (SOP-INS-014 §5.1). The
  Inspection Engineer and Head of Inspection recommend and the Plant Manager
  approves (SOP-OPS-008 §2.3, §3.5). The withdrawal itself is approved by the
  Head of Inspection, with the Plant Manager notified (SOP-OPS-008 §2.4).

**Why it matters.** Next to Scenario 6, this shows the authority follows the
severity. Here "Head of Inspection + Plant Manager" is correct, because the
facts are different.

### Scenario 8 — A question the corpus cannot answer

**Sign in as** `engineer`. **Format:** answer only.

```text
What hydrostatic test pressure does our procedure require after a weld repair on V-2104?
```

**Pipeline.** `question_answering`, normal. Retrieval finds passages about
tests and pressures, none of which addresses hydrostatic testing. Because the
prompt names V-2104, two of them come from the Restricted design memo for its
replacement, so the run is raised to restricted and held whatever the answer
says. The honest answer is still the one to look for.

**Correct answer.** No procedure in the knowledge base sets a hydrostatic
test requirement. The answer should say so in one sentence and name what
would settle it: a pressure-testing or repair procedure, or the vessel's code
of construction.

**Must not appear.** Any pressure figure or multiple of MAWP presented as
the site's requirement. A figure like that has no supporting passage, so the
source and hallucination checks should fail and the run is held.

**Variant with a near miss.**

```text
What is the structural minimum thickness for NPS 2 carbon steel process piping under SOP-INS-017?
```

SOP-INS-017 §4.4 says that value is set by the piping class sheet and is not
in the procedure. The answer must not give 2.8 mm, which applies only to NPS 6
to NPS 12 (§4.3).

**Why it matters.** "Not in the corpus" is a result. An assistant that fills
the gap with a plausible number is the failure this product exists to prevent.

### Scenario 9 — A safety question held for review by policy

**Sign in as** `operator`. **Format:** answer only.

```text
We need to weld on a line near the crude column. What gas test results are required before hot work starts, and what safety precautions apply? Cite the procedure.
```

**Pipeline.** `question_answering`, sensitivity **sensitive** ("safety"). The
operator can retrieve SOP-OPS-011: Operations department, Confidential. The
run is **held** even if every check passes, by `sensitive_classification`
and `safety_recommendation`. A reviewer or administrator decides.

**Correct answer.**
- Class A permit: open flame near equipment that has held hydrocarbons.
  Issued by the Area Authority, countersigned by the Shift Superintendent, and
  valid for one shift of at most 8 hours (SOP-OPS-011 §2.1).
- Gas test at most 30 minutes before hot work, at the work point and every
  drain, vent or opening within 15 m. Flammable gas must read **0% LEL** and
  oxygen **19.5–23.5%** (§3.1).
- A continuous monitor during Class A work; stop at **5% LEL** or more (§3.2).
  Retest after a break over 60 minutes, and every 2 hours (§3.3).
- A fire watch with a charged 9 kg dry chemical powder extinguisher,
  throughout the work and for 30 minutes after (§4.1). Combustibles within
  11 m removed or covered; drains within 15 m sealed (§4.2).
- On equipment that has held hydrocarbons: positive isolation (SOP-OPS-015
  §2.1), drained, purged or steamed, and gas tested first (SOP-OPS-011 §5.1).

**Why it matters.** Which answers need a human is decided by rules in
`policies/`, not by the model's confidence.

### Scenario 10 — A failed relief valve: arithmetic plus a chain of procedures

**Sign in as** `engineer`. **Format:** answer only.

```text
A PSV with a set pressure of 10.5 bar(g) opened at 12.1 bar(g) in its as-received bench test. Did it fail under SOP-INS-025, what severity does that make the finding on the protected vessel, what must be done and by when, and who must be told?
```

**Pipeline.** `calculation`, normal. Asserted figures such as the threshold
are extracted and recomputed in the sandbox during verification.

**Correct answer.**
- The failure threshold is 10.5 × 1.10 = **11.55 bar(g)**. It opened at 12.1,
  so it **failed** (SOP-INS-025 §3.2).
- A failed as-received test is a failed relief device: a **High** finding on
  the protected vessel (SOP-INS-025 §3.3; SOP-INS-014 §5.1). The vessel is
  withdrawn from service within 24 hours. Approval authority: Head of
  Inspection + Plant Manager.
- Report it as a near miss within 24 hours (SOP-INS-025 §3.3; SOP-HSE-004
  §2.3). The area supervisor investigates within 7 days (SOP-HSE-004 §4.3).

**Why it matters.** One answer draws on three procedures and a computed
threshold, each claim cited to its source.

### Scenario 11 — When the right answer is "no"

**Sign in as** `engineer`. **Format:** answer only.

```text
Our RBI ranking puts V-2101 at Low risk. Can that ranking alone extend its internal inspection interval beyond 72 months? If not, what is required and who approves?
```

**Pipeline.** `question_answering`, normal.

**Correct answer.** **No.**
- A risk ranking does not by itself authorise an extension (SOP-INS-030 §5.1).
  A Low ranking may only support a proposal (§3.3).
- A vessel interval may be extended only under SOP-INS-014 §2.5, which needs a
  documented Fitness-For-Service assessment approved by the Head of
  Inspection. The assessment must show the vessel stays above t-min to the end
  of the extended interval (SOP-INS-021 §2.6).
- The extension is recommended by the Inspection Engineer and approved by the
  Head of Inspection (SOP-OPS-008 §2.7).
- 72 months is the internal interval for non-corrosive, non-lethal service
  (SOP-INS-014 §2.1).

**Why it matters.** Refusing a shortcut the procedures forbid, and citing why,
is worth more to a regulated site than a fluent yes.

### Scenario 12 — The auditor: oversight without the power to act

**Sign in as** `auditor`.

1. Try to submit the Scenario 1 prompt. It is refused with HTTP 403, *"role
   'auditor' does not grant 'task.create' (default deny)"*
   (`backend/api/dependencies.py`, `require_permission`). The auditor also has
   no knowledge search and cannot decide approvals.
2. Open **Audit**. The auditor reads every user's events (`audit.read.all`).
   Check the chain with `GET /api/audit/chain`: it should report valid, with
   an event count and head hash.
3. Filter by the Scenario 6 task id. Expect these events: the task received
   and classified; each policy decision (tool, model, file); each model call
   with its routing reason; the PDF rasterised; verification completed;
   approval requested and then approved; the deliverable generated, and
   downloaded if anyone downloaded it.
4. Export the trail (`GET /api/audit/export`, JSONL).

**Why it matters.** The person who checks the work cannot also do it, and
what they check is tamper-evident.

---

## 3. Running order for a timed slot

Pre-run Scenarios 2 (both accounts), 3 (both accounts), 4, 5, 7 and 10. Then
live:

1. **Scenario 1**: the grounded answer. Open a citation to show that §5.2
   names only the Head of Inspection, then read the held line: retrieval
   admitted a Restricted memo, so the run is Restricted and waits for a
   reviewer.
2. **Scenario 3**: open the pre-run pair side by side, then the two Registry
   listings: six documents for the operator, twelve for the engineer, and the
   Restricted memo only in the second.
3. **Scenario 6**: start it, walk through Scenarios 4 and 7 from Tasks while
   it runs, then approve it as `reviewer`.
4. **Scenario 8**: the honest "not in the corpus".
5. **Scenario 12**: the auditor's view of everything above.

---

## 4. When a run goes wrong

A wrong answer is part of the demonstration, not a reason to stop it:

- **A check failed.** The run is held with the failing check named. Show the
  check's detail. The claim it flags is the claim a reviewer should read.
- **A wrong approver or basis that passed the checks.** The verifier confirms a
  claim is *about* its cited passage, not that the passage *supports* it. Open
  the citation: each severity and each approval is now its own passage, so the
  error is visible at a glance. This is why a released document needs a human.
- **The answer says a needed clause is missing.** Look at the evidence list.
  Only the top six passages are retrieved, and only the first six evidence
  items reach the model. The answer is correct to say what it was not shown.
- **A misread scan.** Compare the `V` items with the scan. The vision model's
  reading is evidence like any other and is cited as such.

## 5. Stretch scenario — a population question over a dataset

**Sign in as** `engineer`. **Attach** `sample_data/datasets/inspection-history.csv`.
**Format:** answer only.

```text
Using the attached inspection history and SOP-INS-014 Clauses 2 and 4.5, list every in-service vessel whose next thickness survey was due before 1 October 2026.
```

**Correct answer.** **V-2110** and **V-2118**.
- V-2110: steam service, 36-month interval (SOP-INS-014 §2.4). Last surveyed
  15 June 2023, so due 15 June 2026.
- V-2118: corrosive service. Remaining life is (7.6 − 6.0) / 0.50 = 3.2 years,
  under 4, so the 24-month interval is halved to 12 (§2.2, §4.5). Last
  surveyed 10 June 2025, so due 10 June 2026.
- Not overdue: V-2101 (due 24 April 2028), V-2104 (18 February 2028) and
  V-2115 (3 November 2026). V-2107 is withdrawn.

**Must not appear.** V-2118 treated as not due until 10 June 2027, which
happens when §4.5 is missed.
