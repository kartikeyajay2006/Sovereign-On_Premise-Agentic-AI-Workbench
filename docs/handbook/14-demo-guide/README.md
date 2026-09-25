# 14 · Demo guide

> Show the thesis, not the feature list: an answer is only as good as the passage it cites, the arithmetic is checked by something other than the model, and what a person may see or release is decided by policy.

| Page | Covers |
|---|---|
| [14.1 The golden path](01-golden-path.md) | A ten-minute demonstration, step by step, with what to say and the correct answers |
| [14.2 Rehearsal and recovery](02-rehearsal.md) | The checklist for the hour before, and what to do when something goes wrong on stage |

The full scripted demonstration, with thirteen scenarios and the correct answer and clause citations for each, is **[`docs/DEMO.md`](../../DEMO.md)**. This section is the short version for a live, timed slot.

## The three judged moments

| Moment | What to show | Time on a CPU laptop |
|---|---|---|
| **1. Can V-2104 continue operating?** | Attach `scanned-inspection-report-V-2104.pdf`, ask for the corrosion rate, remaining life and severity. The figures come from the formula registry, not the model: Shell course 2 (mid), 0.55 mm/year, 6.18 years, Medium, Head of Inspection, next survey 2028-02-18. Open the integrity card's fold: every input names its table cell, every result its hash. Then ask *"How do we isolate V-2104 for confined space entry?"*: the drawing answers, branch by branch, and marks the sheet | Scan ~6 min (pre-record it); isolation ~1 min |
| **2. The workbench refuses to guess** | Attach the scan **and** `sample_data/conflict/V-2104-contractor-field-sheet.md`. The readings disagree (9.4 vs 9.9 mm): the decision is withheld, the run held, approve refused, and the submitter cannot resolve it. A reviewer chooses, with a reason; the formulas recompute; then approve succeeds. Show the certificate verifying | ~5.5 min (pre-record the run; resolve and approve live) |
| **3. Attack the controls** | `scripts/red_team.py`: 31 attacks, each a measurement, ending *31 of 31 held* and a hashed report. Then AUDIT-02 in words: rewrite history and recompute the chain; the chain is fooled, the signed root is not | ~1 min |

## Other reliable moments

| Moment | Time | Reliability |
|---|---|---|
| `/clause` question, delivered and cited | ~20 s | ✅ Correct and fast when the model is warm |
| Cladding question, **held** because a Restricted memo was retrieved | ~20 s | ✅ Correct, held for the right reason |
| Reviewer releases it; own-run approval refused | seconds | ✅ Deterministic |
| Same question as `operator` vs `engineer` (department isolation) | ~20 s each | ✅ Deterministic filtering |
| A superseded revision: *"What did SOP-INS-014 Rev 4.1 require?"* against the plain question | ~20 s each | ✅ Deterministic filtering |
| Sandbox attacks and the containment self-test | ~30 s | ✅ Deterministic |
| Audit chain verified; a certificate verified offline with `scripts/verify_certificate.py` | seconds | ✅ Deterministic |
| SOP question sweep harness, three questions | ~1–2 min | ✅ 3/3 traced |

The scanned-report run is now **correct** on the 3B model, because the model is told the figures rather than asked for them ([8.6](../08-verification/06-engineering.md)). It is still **slow** on a CPU (the vision stage alone takes three to four minutes), so run it before the slot and open it from the thread's history. A small vision model occasionally returns a malformed page; the run asks again once before failing.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 13.4 · Contributing](../13-development/04-contributing.md) | [↑ The AEGIS Handbook](../README.md) | [14.1 · The golden path →](01-golden-path.md) |

<!-- nav:end -->
