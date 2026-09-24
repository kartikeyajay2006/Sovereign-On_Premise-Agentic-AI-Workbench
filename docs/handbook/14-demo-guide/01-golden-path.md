# 14.1 · The golden path

Ten minutes, six moments. Each says what to do, what appears, and the line to say.

## 0 · Before the judges arrive

Pre-run, as `engineer`: the `/clause` question, the cladding question, and the three-question sweep. Pre-run the scanned-report task as well, and have its held run open in a tab. Note the audit head hash.

## 1 · The claim (30 s)

Open the landing page. *"AEGIS runs the model, the search and the checks on this laptop, and hands over every answer with its sources, its checks and its record."* Point at the live line: *no connection has left this host since …*.

## 2 · A cited answer (1.5 min) · `engineer`

Type `/clause`, Enter, then *internal inspection of a pressure vessel in corrosive service*.

> A pressure vessel in corrosive service shall receive an internal inspection at intervals not exceeding **48 months**. `S1` SOP-INS-014 §2.2 · **Delivered** · 6 of 6 checks passed

Open the transcript. *"Every step: which model ran and why it was allowed to, the six passages retrieved, the tokens, and every check. Click S1: that is the exact clause."*

## 3 · Policy holds a correct answer (2 min) · `engineer` → `reviewer`

Ask: *What severity applies when cladding damage exceeds 20% of an insulated section, and who must approve continued operation? Cite the clauses.*

> **Medium**, approved by the **Head of Inspection**. **Held for review.** *Evidence S5 (ENG-DBM-2104) is restricted, so the run is restricted too.*

*"Every check passed, and it is still held. Retrieval admitted a Restricted design memo, so the answer is Restricted, and restricted work needs a signature. The model's confidence played no part. The policy file did."*

Switch to `reviewer` (account menu → Switch demo account), <kbd>G</kbd> <kbd>A</kbd>, read **Held because**, press <kbd>A</kbd>, add a reason, confirm.

Then show separation of duties: as `reviewer`, try to approve a run the reviewer submitted. *"Refused. Nobody signs their own work, not even the administrator."*

**Correct answer:** Medium (SOP-MNT-022 §4.1; SOP-INS-014 §5.2); repair within the current shutdown window; approver Head of Inspection (SOP-INS-014 §5.2; SOP-OPS-008 §2.2). **Must not appear:** "Head of Inspection + Plant Manager", which is the High authority.

## 4 · Same question, two clearances (1.5 min) · `operator` vs `engineer`

In **Knowledge**, show the Documents count: `engineer` 12, `operator` 6. Run the Retrieval test with the same query as each. *"Clearance is applied before ranking, so the operator gets their best passages from what they may read, and learns nothing about what they may not. Not even the titles."*

## 5 · Code runs, network doesn't (2 min) · `engineer`

**Assurance → Sandbox**. Run **Memory bomb**: *Contained · MemoryError*, peak memory, the limits applied. Run **Socket connect**: *Refused before it ran*. Then **Posture → Run the self-test**: **7/7**.

*"Egress is measured, containment is tested, policy is configured, and the screen tells you which is which."*

Be ready for the question *"is this a container?"* The answer: *"No. It is a subprocess with static checks, OS limits and a runtime shim. The handbook says exactly what that does and does not stop, and moving it into a rootless container is next on our list."*

## 6 · Prove it (1.5 min) · `reviewer`

**Assurance → Audit → Verify chain**. Server and browser both recompute the chain to the same head. *"Every step you just saw, including this click, is a record that seals the one before it. Change one character in the file and both checks fail at that record."*

Show the held scanned-report run in its tab: per-page `V` evidence, the withheld DOCX and its SHA-256. *"This is why a person signs: the reviewer checks the figures against the page they came from."*

## Close (30 s)

*"AEGIS does not depend on the model never being wrong. It detects, contains, verifies, governs and records what happened, before an AI-generated result becomes an action."*

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 14 · Demo guide](README.md) | [↑ 14 · Demo guide](README.md) | [14.2 · Rehearsal and recovery →](02-rehearsal.md) |

<!-- nav:end -->
