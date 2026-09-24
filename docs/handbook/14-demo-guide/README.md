# 14 · Demo guide

> Show the thesis, not the feature list: an answer is only as good as the passage it cites, the arithmetic is checked by something other than the model, and what a person may see or release is decided by policy.

| Page | Covers |
|---|---|
| [14.1 The golden path](01-golden-path.md) | A ten-minute demonstration, step by step, with what to say and the correct answers |
| [14.2 Rehearsal and recovery](02-rehearsal.md) | The checklist for the hour before, and what to do when something goes wrong on stage |

The full scripted demonstration, with thirteen scenarios and the correct answer and clause citations for each, is **[`docs/DEMO.md`](../../DEMO.md)**. This section is the short version for a live, timed slot.

## Choose reliable moments

Everything below was run on a CPU-only laptop while this handbook was written:

| Moment | Time | Reliability |
|---|---|---|
| `/clause` question, delivered and cited | ~20 s | ✅ Correct and fast when the model is warm |
| Cladding question, **held** because a Restricted memo was retrieved | ~20 s | ✅ Correct, held for the right reason |
| Reviewer releases it; own-run approval refused | seconds | ✅ Deterministic |
| Same question as `operator` vs `engineer` (department isolation) | ~20 s each | ✅ Deterministic filtering |
| Sandbox attacks and the 7/7 self-test | ~30 s | ✅ Deterministic |
| Audit chain verified on the server and in the browser | seconds | ✅ Deterministic |
| SOP question sweep harness, three questions | ~1–2 min | ✅ 3/3 traced |
| Scanned report → approval note | 4–10 min | ⚠️ **Not reliable on a 3B CPU model**: figures can be wrong ([8.5](../08-verification/05-limits.md)) |

Lead with the reliable moments. Show the scanned-report run **pre-recorded**, and say what it demonstrates: per-page vision, the held DOCX and its hash, and a reviewer checking figures against the source. Do not present its figures as verified until the calculation fixes in [8.5](../08-verification/05-limits.md#the-fixes) are in.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 13.4 · Contributing](../13-development/04-contributing.md) | [↑ The AEGIS Handbook](../README.md) | [14.1 · The golden path →](01-golden-path.md) |

<!-- nav:end -->
