# 8.6 · Engineering verification

> The model is told the figures. It is never asked for them.

Asked for a corrosion rate, a 3B model once answered 0.8 mm/year where the evidence gives 0.55, called the finding "Severe" (a band that does not exist), and passed every check ([8.5](05-limits.md)). The answer to that is not a better prompt: it is to take the arithmetic away from the model.

## The formula registry

`backend/engineering/`. Before any model writes an answer, the engineering stage looks for an inspection record in the run's evidence, reads its inputs, and evaluates registered formulas on them.

| Module | Does |
|---|---|
| `units.py` | Quantities with dimensions (length, time, pressure, temperature). `11.6 mm`, `10.5 bar(g)`, `920 kPa`, `152 psig`, `0.55 mm/yr`, `ksi`, `mils`, `°C`, `°F` and `K` convert exactly; adding a pressure to a length raises an error, and a pressure where a thickness belongs is **refused** |
| `formulas.py` | 19 versioned formulas (`id@version`), each citing its clause: years between dates; short-term, long-term and governing corrosion rate; remaining life; below t-min; local metal loss; ASME UG-27 shell t-min with the 6.0 mm structural minimum; pipe t-min; vessel survey and piping measurement intervals; severity; Fitness-For-Service triggers; five relief-device checks; the interim operating-pressure limit. Each evaluation records its inputs, outputs, the formula's source hash, an input hash and a result hash |
| `extraction.py` | Reads inputs from evidence and remembers where: `readings table · row 'Shell course 2 (mid)' · column 2026`. Header fields, readings tables (skipping repeated headers and the vision model's JSON copy), survey CSVs and piping CML lists |
| `assessment.py` | Chains the formulas per location and picks the **governing location by lowest remaining life**, not by the thinnest reading or the fastest rate |
| `stage.py` | Registers the results as **C evidence**, tells the model the figures, and detects conflicts between sources |
| `relief.py` | Reads every pressure-relief valve bench-test record in the run field by field (tag, protected equipment, service, MAWP, set and as-received pressures, setting after overhaul, inlet loss, test dates), each value bound to its line, compares records of one valve, and applies the five `relief.*` formulas of SOP-INS-025 |
| `stated.py` | For a calculation whose values are written in the question itself ("12.0 to 9.4 mm over 4 years, t-min 6.0 mm"). The model only proposes which number is which variable. A value is bound only when the question writes that number with a unit of the right dimension, and the rest are refused by name. The request becomes **H evidence** that every input cites, and the registry computes the rate, remaining life and below-t-min check |

A missing input gives **cannot calculate**, naming what is missing; a malformed one gives **refused**, saying why. Neither is estimated. When two sources disagree about an input, the assessment is **conflicted**, and nothing that depends on it is computed until a person chooses ([2.9](../02-concepts/09-conflicts.md)).

### Below t-min: withdrawn, not scheduled

A vessel with a reading below t-min, or a governing remaining life at or below zero, gets **no routine interval**. V-2107 (shell course 1 at 5.8 mm against a t-min of 6.0 mm, remaining life −0.31 years) used to be told "next thickness survey in 12 months": the corrosive-service interval, halved for a life under 4 years. `schedule.vessel_thickness_survey@2` now returns no due date and `withdraw_from_service: true`, and the decision states the procedures' immediate action instead: withdraw from service immediately (SOP-INS-014 Clause 3.3), and in any case within 24 hours (Clause 5.1). An FFS assessment is raised while the vessel is out of service (SOP-INS-021 Clause 2.1). Interim operation is not permitted, because it needs thickness at or above t-min everywhere (Clause 6.1). No return to service without an accepted repair, re-rating or replacement. `schedule.piping_next_measurement@2` does the same for a piping CML whose life is spent (SOP-INS-017 Clauses 7.1 and 7.3), where it used to compute a negative interval.

### Recommend is not approve

`severity.vessel_finding@2` outputs who **recommends** and who **approves** under SOP-OPS-008 Clauses 2.1 to 2.3. For a High finding, the Inspection Engineer and Head of Inspection recommend and the Plant Manager approves. The decision lines and every generated deliverable carry this statement, taken from the formula and not from the model: *"AEGIS prepares the recommendation only; it takes effect when the approving authority signs it."* The approval gate enforces the signatures ([2.5](../02-concepts/05-approval.md)).

### Operating limits after an FFS finding

SOP-INS-021 Clauses 5 and 6, as two formulas. `ffs.rerated_mawp@1` computes MAWP_rerated = MAWP_original × RSF and refuses a factor that does not reduce it (0 < RSF ≤ 1); the procedure's own example, 10.5 bar(g) × 0.86 = 9.03 bar(g), is a test. It names the authority (Head of Inspection + Plant Manager, Clause 5.2; SOP-OPS-008 Clause 2.6) and what must follow: the nameplate within 30 days, the relief devices reset (SOP-INS-025 Clause 4.2), a change under SOP-ENG-009, and re-assessment at every inspection.

`ffs.interim_operation@1` decides whether equipment awaiting an assessment may keep running, and lists every unmet condition by clause: no through-wall defect or leak, thickness at or above t-min everywhere, operating pressure at most 90% of the registered MAWP, inspection at most every 30 days, and no more than 180 days from the finding (Clauses 6.1-6.2). It returns the operating limit and the latest end date, and the authority (recommended by the Inspection Engineer, approved by the Head of Inspection and the Plant Manager; SOP-OPS-008 Clause 2.8). Both are in the registry and on `POST /api/engineering/evaluate`.

### Relief devices

A PSV's test record has no rate and no remaining life: its figures are one verdict per clause of SOP-INS-025. `relief.test_due@1` gives the next bench test, 24 months after the last in fouling or corrosive service and 48 in clean service (Clauses 2.1-2.2), and whether a test was overdue on a given date. `relief.as_received_test@1` fails a valve that opened more than 10% above its set pressure, or did not open at all (Clause 3.2); the procedure's own example, 10.5 bar(g) failing above 11.55 bar(g), passes at exactly the limit, because pressures are compared at six decimal places. `relief.set_pressure_limit@1` checks set pressure against MAWP (4.1), `relief.post_overhaul_setting@1` the ±3% or ±0.14 bar tolerance (3.4), and `relief.inlet_loss@1` the 3% inlet loss limit (5.2).

A failed as-received test is a failed relief device: a **High** finding on the protected equipment, withdrawn within 24 hours and reported as a near miss (Clause 3.3; SOP-HSE-004 Clause 2.3). The assessment (`kind: relief`) carries that severity to the approval gate, which then asks for the Head of Inspection and the Plant Manager in turn. The model is told the verdicts as cited sentences and nothing about thickness or corrosion; the integrity card shows each check. The synthetic record `sample_data/relief/PSV-2104A-bench-test-record.md`, attached by the *A relief valve failed its test* starter card, opened at 11.9 bar(g) and fails.

**Every record in the run is assessed.** Each valve's tests are grouped by test date. Two records of one test (the bench sheet and a technician's copy, say) are compared the way two surveys of one vessel are: a set pressure, MAWP, service, as-received result, popping pressure, inlet loss or previous test date they disagree on is an input conflict, the valve's verdicts are withheld (`conflicted`), and the run is held until a person chooses; the choice is recomputed like any other resolution. The same value in other units (11.9 bar(g) and 1.19 MPa) is not a disagreement, and one record may fill a field the other lacks. Tests of one valve on different dates are both judged, each verdict named by its test (*PSV-2104A (test 2024-03-14) · As-received test*) and cited to its own C item; the **latest** test decides the valve's severity and action, since an earlier failure was a finding at the time. A set pressure, MAWP or service that differs between tests is recorded as a medium conflict and not withheld: a valve can be re-set under SOP-ENG-009 (SOP-INS-025 Clause 4.2) or its vessel re-rated (SOP-INS-021 Clause 5), and a person should confirm which is current. With several valves the run's severity is the highest among their latest tests.

### Operating envelope

The corpus states one operating limit: SOP-INS-021 Clause 6.1 permits interim operation of equipment awaiting a Fitness-For-Service assessment only where "operating pressure is reduced to 90% of the registered MAWP or lower". `envelope.interim_operating_pressure@1` computes it, at or below 0.90 × MAWP passing, pressures compared at six decimal places in any unit the table knows. The vessel assessment reads `Operating Pressure` and `MAWP` from the record and applies it when an FFS trigger (SOP-INS-021 Clauses 2.1-2.3) is met and the vessel is not withdrawn. Below t-min interim operation is not permitted at all, so there is no pressure to judge. With one of the two values missing it is *cannot calculate*, and the model is told not to estimate it. The verdict is a check on the integrity card, a decision line, and a row in the approval note's calculations. A breach adds to the required action that interim operation is not permitted at that pressure. No severity is invented for it. The run is held by the `interim_operation_limit` rule for the Head of Inspection and the Plant Manager, who approve interim operation (SOP-INS-021 Clause 6.2; SOP-OPS-008 Clause 2.8).

The corpus has no clause holding operating pressure to MAWP outside interim operation, and none holding operating temperature to a design range, so neither is registered. SOP-MNT-022 Clause 2's temperature bands decide CUI susceptibility, not an operating limit.

The registry is browsable on the Knowledge screen's **Formulas** tab and over the API ([11.7](../11-api/07-engineering-proof.md)).

## engineering_verification

Fails when the answer states:

- a corrosion rate (`… mm/year`) that is not within 1 % (or 0.005) of a rate the registry computed;
- a remaining life, in a sentence about remaining life, that no formula produced;
- a severity band, nearest the word "severity", other than the computed one;
- for a *cannot calculate* or *conflicted* assessment, any rate, remaining life or severity at all.

It passes the honest answers: *"cannot be calculated: the previous inspection date is missing"* and *"the scan reads 9.4 mm and the contractor sheet 9.9 mm, so the remaining life is withheld"*.

When the registry has answered, no generated code runs: a model's script would be a second, weaker opinion. `calculation_verification` then reports how many figures the registry computed.

## Claim verdicts

Every material claim in the answer gets one verdict, with the evidence it rests on and the reason, in the order of authority:

| Verdict | When |
|---|---|
| **CONFLICTED** | It states a conclusion that depends on a disputed input, or takes one source's side of an open conflict |
| **REQUIRES_HUMAN_DECISION** | It states a disposition (continued service, return to service, a deferred interval) that only the approving authority can take. Such a claim holds the run (`human_decision`) |
| **CALCULATED** | Its figures, due date, severity band, governing location, approving authority, or the clause the severity rests on, are the registry's |
| **UNSUPPORTED** | It contradicts the registry; or no cited or retrieved evidence carries it |
| **SUPPORTED** | A passage carries its figures or terms |

A sentence that *reports* a disagreement ("the sources disagree: 9.4 mm [V1] against 9.9 mm [F1], so the conclusion is withheld") is SUPPORTED by the conflict's own sources. **claim_verification** fails when an engineering claim is UNSUPPORTED or any claim is CONFLICTED.

A claim about the clause is CALCULATED only when every clause it names is one the decision names (its severity basis, approver or required action) and it adds no word or figure the decision does not state: *"Governing clause is SOP-MNT-022 Clause 4.1."* is the registry's; *"SOP-MNT-022 Clause 4.1 requires the vessel to be decommissioned."* is judged against the passages.

Severity, remaining life, corrosion rate and dispositions are material claims whether or not they carry a number: *"Severity is Low."* and *"V-2104 may continue in service."* used to escape examination entirely.

On the live V-2104 answer: 8 claims, 6 CALCULATED and 2 SUPPORTED. On the wrong answer from 8.5: the rate and the severity are UNSUPPORTED ("contradicts the formula registry"), and "may continue in service" requires a human decision.

## topology_verification

For a P&ID isolation plan ([3.11](../03-user-guide/11-drawings.md)), the answer must name every branch of the equipment, including every branch that cannot be isolated as drawn. Leaving a branch out is the dangerous error in an isolation plan: the reader isolates what is listed and opens a vessel still connected to what is not. On the live run the model stated one branch of five; the other four were restored from the drawing's graph, marked as added and cited, and the omission was recorded as a limitation.

## Tests

`tests/test_engineering.py` (units, every formula against the SOPs' worked examples and the corpus's expected answers), `tests/test_engineering_pipeline.py` (the stage on a real orchestrator; the live wrong answer failing), `tests/test_engineering_api.py`, `tests/test_calculation_intent.py`, `tests/test_conflicts.py` (claim verdicts under conflict), `tests/test_pid.py` (the isolation-plan check), `tests/test_operating_envelope.py` (the interim limit in and out of the envelope, cannot calculate, bar/kPa/psi and °C/K), `tests/test_relief_records.py` (several valves, two records of one test, two tests of one valve).

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 8.5 · What verification cannot catch](05-limits.md) | [↑ 08 · Verification](README.md) | [09 · Security and governance →](../09-security/README.md) |

<!-- nav:end -->
