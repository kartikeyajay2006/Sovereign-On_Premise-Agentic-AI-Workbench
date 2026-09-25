# 8.6 · Engineering verification

> The model is told the figures. It is never asked for them.

Asked for a corrosion rate, a 3B model once answered 0.8 mm/year where the evidence gives 0.55, called the finding "Severe" (a band that does not exist), and passed every check ([8.5](05-limits.md)). The answer to that is not a better prompt: it is to take the arithmetic away from the model.

## The formula registry

`backend/engineering/`. Before any model writes an answer, the engineering stage looks for an inspection record in the run's evidence, reads its inputs, and evaluates registered formulas on them.

| Module | Does |
|---|---|
| `units.py` | Quantities with dimensions (length, time, pressure, temperature). `11.6 mm`, `10.5 bar(g)`, `0.55 mm/yr`, `ksi`, `mils` convert exactly; adding a pressure to a length raises an error, and a pressure where a thickness belongs is **refused** |
| `formulas.py` | Versioned formulas (`id@version`), each citing its clause: years between dates; short-term, long-term and governing corrosion rate; remaining life; below t-min; local metal loss; ASME UG-27 shell t-min with the 6.0 mm structural minimum; pipe t-min; vessel survey and piping measurement intervals; severity; Fitness-For-Service triggers. Each evaluation records its inputs, outputs, the formula's source hash, an input hash and a result hash |
| `extraction.py` | Reads inputs from evidence and remembers where: `readings table · row 'Shell course 2 (mid)' · column 2026`. Header fields, readings tables (skipping repeated headers and the vision model's JSON copy), survey CSVs and piping CML lists |
| `assessment.py` | Chains the formulas per location and picks the **governing location by lowest remaining life**, not by the thinnest reading or the fastest rate |
| `stage.py` | Registers the results as **C evidence**, tells the model the figures, and detects conflicts between sources |
| `stated.py` | For a calculation whose values are written in the question itself ("12.0 to 9.4 mm over 4 years, t-min 6.0 mm"). The model only proposes which number is which variable. A value is bound only when the question writes that number with a unit of the right dimension, and the rest are refused by name. The request becomes **H evidence** that every input cites, and the registry computes the rate, remaining life and below-t-min check |

A missing input gives **cannot calculate**, naming what is missing; a malformed one gives **refused**, saying why. Neither is estimated. When two sources disagree about an input, the assessment is **conflicted**, and nothing that depends on it is computed until a person chooses ([2.9](../02-concepts/09-conflicts.md)).

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
| **CALCULATED** | Its figures, due date, severity band or approving authority are the registry's |
| **UNSUPPORTED** | It contradicts the registry; or no cited or retrieved evidence carries it |
| **SUPPORTED** | A passage carries its figures or terms |

A sentence that *reports* a disagreement ("the sources disagree: 9.4 mm [V1] against 9.9 mm [F1], so the conclusion is withheld") is SUPPORTED by the conflict's own sources. **claim_verification** fails when an engineering claim is UNSUPPORTED or any claim is CONFLICTED.

Severity, remaining life, corrosion rate and dispositions are material claims whether or not they carry a number: *"Severity is Low."* and *"V-2104 may continue in service."* used to escape examination entirely.

On the live V-2104 answer: 8 claims, 6 CALCULATED and 2 SUPPORTED. On the wrong answer from 8.5: the rate and the severity are UNSUPPORTED ("contradicts the formula registry"), and "may continue in service" requires a human decision.

## topology_verification

For a P&ID isolation plan ([3.11](../03-user-guide/11-drawings.md)), the answer must name every branch of the equipment, including every branch that cannot be isolated as drawn. Leaving a branch out is the dangerous error in an isolation plan: the reader isolates what is listed and opens a vessel still connected to what is not. On the live run the model stated one branch of five; the other four were restored from the drawing's graph, marked as added and cited, and the omission was recorded as a limitation.

## Tests

`tests/test_engineering.py` (units, every formula against the SOPs' worked examples and the corpus's expected answers), `tests/test_engineering_pipeline.py` (the stage on a real orchestrator; the live wrong answer failing), `tests/test_engineering_api.py`, `tests/test_calculation_intent.py`, `tests/test_conflicts.py` (claim verdicts under conflict), `tests/test_pid.py` (the isolation-plan check).

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 8.5 · What verification cannot catch](05-limits.md) | [↑ 08 · Verification](README.md) | [09 · Security and governance →](../09-security/README.md) |

<!-- nav:end -->
