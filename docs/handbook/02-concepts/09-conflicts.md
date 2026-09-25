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
| **Fact conflict**: two sources state different values for one attribute of one tag or clause, outside the formula inputs ("V-2107 design pressure 18 bar(g)" in S1, "16 bar(g)" in F1) | High | The model is told to name both values and not choose; a claim that takes one side is **CONFLICTED**, and the run is **held** (`unresolved_conflict`). A calculation that does not read the attribute is not withheld |

Two sources that agree raise nothing: the scan and the survey CSV state the same readings, and the run calculates as normal. A different equipment tag is a conflict too, and resolving it decides which records describe the equipment at all.

## Fact conflicts

After retrieval and the engineering stage, every retrieved passage, attachment and scan is read for **facts**: `(subject, attribute, value)`. The reading is by pattern (`backend/engineering/facts.py`), never by a model.

- **Subject**: an equipment tag by its usual prefix (`V-2104`, `PSV-2104A`; not document numbers such as `SOP-INS-014` or `INS-2026-0417`), or a procedure clause (`SOP-INS-014 Clause 3.2`). The nearest tag before the statement in its sentence wins, then a clause the sentence cites, then the tag the paragraph is about, then the record's `Equipment Tag:` line. A statement that cannot be placed on a subject is not a fact.
- **Attribute**: design, operating, test and set pressure, MAWP, design and operating temperature, nominal thickness, t-min, corrosion allowance, inside diameter, in-service date.
- **Value**: a quantity read by the unit table (a point, a range such as `15 to 20 bar(g)`, or a bound such as `not exceeding 20 bar(g)`), or a date. An unknown unit, or a unit of the wrong kind, and it is not a fact.

A conflict is raised when two **different sources** make statements that cannot both be true. What is deliberately **not** a conflict:

| Case | Why |
|---|---|
| `10.5 bar(g)` against `1.05 MPa`, or `180 °C` against `356 °F` | The same value: compared in base units, within the precision each was written to (10.5 bar is 10.45–10.55) |
| A point inside a range, or overlapping ranges | Both can be true |
| A superseded revision against the one in force | Revision control's job; superseded passages are not read |
| One document giving two values ("reset from 10.5 to 12.0 bar(g)"), or two passages of one document | A change being described, not two witnesses |
| Dates of inspection and thickness readings | They belong to one inspection event: two records of one vessel differ there by design |
| A fact that is also a formula input already in conflict | Reported once, as the input conflict |
| `V-2104` against `V-2104R` | Different subjects |

On the shipped `sample_data` corpus, with the V-2104 scan and field sheet, no fact conflict is raised: a test holds it to that.

A fact conflict is resolved the same way as an input conflict, through the same endpoint and form. The chosen or entered value becomes H evidence (an entered value must be the same kind of quantity, or a date for a date). No formula reads it, so nothing is recomputed; the claims that state it are then checked against that record.

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
