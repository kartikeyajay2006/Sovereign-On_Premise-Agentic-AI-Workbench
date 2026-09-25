# 2.9 · Conflicts and human resolution

> The workbench never chooses between disagreeing sources on its own.

Two records of one vessel can disagree. A plant scan reads 9.4 mm at shell course 2; a contractor's re-check reads 9.9 mm at the same course. Merging used to keep whichever arrived first and drop the other without a word. Now the disagreement is an object.

## A conflict

When sources give different values for an input a formula reads, the run records a **conflict**: an id (`K2`), the input (`Shell course 2 (mid) · current thickness`), and each **candidate** with its value, the evidence it came from, where in that evidence (`readings table · row 'Shell course 2 (mid)' · column 2026`) and the line it was read from.

| Kind | Impact | What happens |
|---|---|---|
| **Input conflict** on a formula input (a reading, t-min, nominal thickness, a date, the service category, cladding damage, the equipment tag) | High | Every figure that depends on it is **withheld**. The assessment is *conflicted*, the model is told to name both values and not choose, no code runs, and the run is **held** (`unresolved_conflict`) |
| Input conflict on a value no formula reads (design pressure) | Medium | Recorded and shown; the decision is not withheld |
| **Revision conflict**: a record written against a superseded procedure ("SOP-INS-014 Rev 4.1" where Rev 4.3 is in force) | Medium | Settled **by rule** in favour of the revision in force, and shown so the reader sees the record and the procedure applied to it do not match |

Two sources that agree raise nothing: the scan and the survey CSV state the same readings, and the run calculates as normal. A different equipment tag is a conflict too, and resolving it decides which records describe the equipment at all.

## Resolving

A **reviewer** resolves it from the approval screen: chooses one candidate, or enters a re-measured value, and gives a reason. The rules are those of approval, because the choice decides what approval will release: the reviewer holds `approval.decide`, an approving role for the run, and **did not submit it**. A re-measured value must have the kind of the candidates: *9.6 bar* for a thickness is refused.

The choice becomes **H evidence** (`H1`): who decided, what they accepted, over what, and why. Then:

1. the formulas **recompute** with the chosen value bound to `H1`, exactly as they would from any input: the person chooses the input, never the result;
2. the answer gains the resolution and the recomputed decision, cited;
3. verification re-runs, and reasons the resolution answered leave the approval;
4. the held document is re-rendered with the resolution in it;
5. an audit event `evidence / conflict_resolved` records it.

Approval is refused while a high-impact conflict is open.

## The demonstration

Upload `sample_data/inspection/scanned-inspection-report-V-2104.pdf` **and** `sample_data/conflict/V-2104-contractor-field-sheet.md`, and ask for the corrosion rate, remaining life and severity. On the real model:

- K1, revision: the sheet cites SOP-INS-014 Rev 4.1; Rev 4.3 is applied, by rule.
- K2, input: 9.4 mm [V1] against 9.9 mm [F1]; the answer withholds the figures; `engineering_verification` passes it for doing so; the claim that quietly took 9.4 mm is marked CONFLICTED.
- Approve: refused. The engineer who ran it resolves: 403. The reviewer resolves with candidate 0 and a reason: the registry recomputes Shell course 2 (mid), 0.55 mm/year, 6.18 years, Medium, next survey 2028-02-18, and approval then succeeds.

Choosing the contractor's 9.9 mm instead gives 0.425 mm/year and 9.18 years: the decision follows the input a person chose, by the same formulas.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 2.8 · Skills and harnesses](08-skills-harnesses.md) | [↑ 02 · Core concepts](README.md) | [03 · Using the workbench →](../03-user-guide/README.md) |

<!-- nav:end -->
