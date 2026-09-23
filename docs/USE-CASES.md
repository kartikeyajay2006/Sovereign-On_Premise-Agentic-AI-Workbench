# AEGIS — Who Uses It, and For What

> **SYNTHETIC EXAMPLES.** Every document, equipment tag, reading and person
> named here comes from the synthetic demonstration corpus in `sample_data/`,
> invented for AEGIS. This page describes what the workbench does with that
> corpus. It does not describe any deployment, customer or measured result,
> because there are none to report.

AEGIS is for industrial sites where written procedures decide who may do
what, and where documents may not leave the site. Its users are the people
those procedures already name. Each one gets a role in
`policies/access-control.yaml` that bounds what they can see, run and
release.

## The people

| Plant role (as the corpus names them) | AEGIS role | Demo account | Sees | Can do | Cannot do |
|---|---|---|---|---|---|
| Inspection / integrity engineer | `engineer` | `engineer` | Inspection & Integrity and site-wide documents, up to Restricted (12 of 15) | ask, compute, attach files, draft documents, ingest documents | approve a release; read Operations procedures (department isolation) |
| Approving authority: Head of Inspection, Plant Manager | `reviewer` | `reviewer` | all departments, up to Restricted | everything an engineer can, plus decide held runs and read every task and audit event | nothing extra; the role is bounded by the same policy files |
| Internal auditor | `auditor` | `auditor` | every task trace and audit event | verify the audit chain, export the trail | create tasks, search the knowledge base, approve anything |
| Plant operator, shift staff | `operator` | `operator` | Operations and site-wide documents, up to Confidential (6 of 15) | ask, attach files, receive answers, read their own audit trail | see Inspection documents, or anything Sensitive or Restricted |
| Platform administrator | `administrator` | `admin` | everything | manage models, policy and the knowledge base | use an unregistered model or tool, or reach the network (denied for every role) |

## Integrity engineer

**The job.** Turn inspection data into dispositions that follow the site's
procedures: severity, remaining life, the next inspection date and who must
sign. Do it the same way every time, and leave a record of the basis.

**What that looks like with the corpus.**
- *A field report becomes an approval note.* The engineer attaches the scanned
  V-2104 report (INS-2026-0417). AEGIS reads the scan with a local vision
  model, retrieves the governing clauses, and drafts the note with the content
  SOP-INS-014 §6.2 requires. The note is held until an approving authority
  releases it (DEMO.md, Scenario 6).
- *Rates and remaining life computed by the site's rules, not by habit.*
  SOP-INS-017 §5.1 says the governing rate is the higher of short-term and
  long-term. On circuit P-2104-OVHD-01 that changes the answer: CML-03 has
  5.03 years of life, not 6.0, and its next measurement is due in 30 months,
  not 36. Every figure the answer asserts is recomputed in the sandbox
  (Scenario 4).
- *"What does our procedure say?" answered with the clause.* Severity and
  approving authority come back cited to the numbered sub-clause, such as
  SOP-INS-014 §5.2, and not to a whole document (Scenario 1).
- *Being told "no" with the reason.* A Low risk ranking does not extend an
  interval (SOP-INS-030 §5.1). A reading below t-min rules out interim
  operation (SOP-INS-021 §6.1). The answer says so and cites why
  (Scenarios 7 and 11).
- *Population questions over data.* Given the inspection history, find which
  vessels' surveys are overdue, including the one that is overdue only
  because SOP-INS-014 §4.5 halves its interval (DEMO.md, section 5).

**What AEGIS will not do for them.** Supply a figure no document supports.
Asked for a hydrostatic test pressure, it should say the corpus does not set
one (Scenario 8). It also will not release its own drafted document, or cite
a passage it did not retrieve.

## Approving authority

**The job.** Decide whether a recommendation is released, on the evidence,
and be accountable for that decision. In the corpus these are the Head of
Inspection and the Plant Manager. SOP-OPS-008 §2 says which of them approves
what.

**What that looks like.**
- *A queue of runs that policy says need a person.* Runs are held for four
  reasons: sensitive or restricted work, anything producing a document, any
  failed verification check, and safety-worded requests
  (`policies/approval-rules.yaml`). Each held run shows why it was held.
- *Everything needed to decide, in one place.* The answer, each citation's
  passage, the vision model's reading of any scan, every recomputed figure,
  and the result of each verification check.
- *A recorded decision.* Approve or reject, with a comment. The decision, the
  reviewer and the time go into the audit chain, and a held document is
  released only on approval.

**Where the platform stops short of the procedures (today).**
- SOP-INS-014 §5.1 needs two signatures for a High finding, from the Head of
  Inspection and the Plant Manager. The workbench records one reviewer's
  decision. The second signature lives on the approval note itself.
- SOP-OPS-008 §3.2 forbids approving your own recommendation. The engineer
  role cannot approve at all. However, the workbench does not yet stop a
  reviewer from approving a task that the same reviewer submitted.

## Internal auditor

**The job.** Establish afterwards exactly what happened: who asked what,
which model answered and why that model, which passages it relied on, what
policy allowed or refused, and who released what.

**What that looks like.**
- *Every run can be reconstructed.* Classification, routing decisions with
  their reasons, each policy decision, each model call, the evidence,
  verification, and the approval.
- *Tamper-evidence.* The audit trail is a hash chain. `GET /api/audit/chain`
  reports whether it is intact, and the trail exports as JSONL.
- *Checking that need-to-know held.* Confirm, for example, that the operator's
  run in Scenario 3 received no passage from the Restricted design memo
  ENG-DBM-2104.

**By design, the auditor cannot act.** The role cannot create tasks, search
the knowledge base or decide approvals. Oversight is kept apart from the
work it oversees (Scenario 12).

## Plant operator

**The job.** Get the procedural answer right at the moment of work: before a
permit is signed, before an entry, before a lock comes off.

**What that looks like with the corpus.**
- Hot work: gas test limits and fire precautions (SOP-OPS-011 §3.1, §4.1,
  §4.2). Because the request mentions safety, it is held for a reviewer by
  policy (Scenario 9).
- Confined space entry: the atmosphere acceptance limits (SOP-OPS-012 §3.2),
  and why closing valves is not isolation for entry (§3.1).
- Isolation: who may remove an absent person's lock, and on whose authority
  (SOP-OPS-015 §5.2).
- Incidents: whom to call at once, and what goes in the register within
  24 hours (SOP-HSE-004 §2).

**What the operator does not see.** Inspection & Integrity procedures
(department isolation), the Sensitive incident investigation, and the
Restricted design memo (classification ceiling). Retrieval never returns
those passages to them. The model cannot pass on what it was never given
(Scenarios 2 and 3).

## Platform administrator

**The job.** Keep the corpus, the models and the policy correct.

**What that looks like.**
- *Seeding the corpus with the right metadata.* `scripts/seed_demo_data.py`
  reads each document's department, classification and revision from its own
  header and maps them onto the ids in `policies/`. It refuses a document
  that is not marked SYNTHETIC or whose metadata does not map, and replaces
  superseded copies instead of keeping two revisions side by side.
- *Changing behaviour by editing policy, not code.* Roles, departments,
  classification ceilings, approval rules and tool permissions are YAML files
  under `policies/`.
- *Registered models only.* A model the registry does not declare is refused
  (`config/models.yaml`).

## What the corpus is built to exercise

| Pipeline branch | Scenario (DEMO.md) | Documents involved |
|---|---|---|
| Retrieval with clause-level citation | 1, 11 | SOP-INS-014, SOP-MNT-022, SOP-OPS-008, SOP-INS-030, SOP-INS-021 |
| Department isolation | 2 | SOP-INS-014 (not visible to Operations) |
| Classification ceiling | 3 | ENG-DBM-2104 (Restricted), SOP-OPS-008 |
| Recomputed calculation, no code | 4, 10 | INS-2026-0522, SOP-INS-017, SOP-INS-025 |
| Code in the offline sandbox | 5, stretch | V-2104 survey CSV, inspection history CSV, SOP-INS-014 |
| Scanned report read by the vision model | 6, 7 | V-2104 and V-2107 scans, SOP-INS-014, SOP-INS-021, SOP-OPS-008 |
| Drafted document held, then released by a reviewer | 6 | as above |
| Held by policy for safety wording | 9 | SOP-OPS-011, SOP-OPS-015 |
| Honest "not in the corpus" | 8 | none: the corpus sets no hydrotest requirement |
| Read-only oversight | 12 | the audit trail of the runs above |

## Known limits, stated plainly

- **Claim checking is lexical.** The verifier confirms that a claim is about
  the passage it cites, and recomputes arithmetic. It cannot confirm that
  the passage supports the claim. The corpus reduces the room for error by
  keeping one requirement per passage; a human release decision covers the
  rest.
- **Classification is escalated from attachments, not from retrieved
  passages.** An answer built on a Restricted passage can carry a lower label
  than its source (Scenario 3).
- **The model sees a bounded amount of evidence.** At the time of writing,
  the first six evidence items, each cut to 500 characters. The corpus is
  written to fit that.
- **The document list is not filtered by clearance.** The Registry lists
  every title, including the Restricted one. Passages are what retrieval
  withholds.
- **Inference is local and CPU-bound.** A run takes minutes. One captured run
  of Scenario 1's question took 246.8 s on the development host
  (`frontend/public/landing/run.json`).
