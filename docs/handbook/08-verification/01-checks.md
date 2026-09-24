# 8.1 · The checks

The checks run in this order after the answer is written: sources, citations, page citations, calculations, code, then document (when drafted), and finally the hallucination check over the whole answer. Each produces a `VerificationCheck` with a `name`, `kind`, `passed`, a `detail` sentence, the `evidence_ids` involved, and `warnings`.

## source_verification

*Are the answer's material claims backed by evidence?*

1. Split the answer into sentences and keep the **material claims** (see [8.2](02-claims.md)).
2. No claims → **pass**: *No material claims requiring documentary support were made.*
3. Claims but no evidence at all → **fail**: *3 material claim(s) were made but no local evidence was retrieved to support them.*
4. Otherwise, count the claims that corroborate some evidence item. Pass when the fraction is at least `min_supported_fraction` (0.6).

> *3 of 5 material claims are supported by local evidence (60%; threshold 60%).*

The unsupported claims are listed as warnings, so a reviewer sees which sentences had nothing behind them.

## citation_verification

*Does every citation lead somewhere?*

Every bracketed marker that looks like a citation (`[S1]`, `[V12]`, `[F3]`, even an invented shape such as `[SOP4]`) is checked against the IDs this run recorded.

- No citations → **pass**: *The answer carries no citations to resolve.* (Uncited claims are source verification's concern.)
- Any marker with no matching evidence → **fail**, naming it. A citation to evidence the run never had is a fabricated source.
- Otherwise → **pass**: *All 2 cited id(s) name evidence this run recorded.*

## page_citation_verification

*Do page citations point at the right page?*

For each sentence citing file or visual evidence (`[F…]`, `[V…]`):

- if the sentence mentions a page (*"on page 4 [V2]"*) and the cited evidence came from a different page → **fail**: *[V2] is from page 2, not page 4*;
- if the cited evidence is a page nothing could read (*No legible content extracted from this page.*) and the sentence states a fact from it → **fail**: *[V3] contains no legible content to support a fact*;
- a citation to a missing ID is reported here too.

> *Page citations match their evidence pages.*

## calculation_verification

*Do the figures add up?*

The reasoning model restates every calculation the answer asserts as a pure arithmetic expression; the sandbox recomputes each; results are compared within `calculation_tolerance` (1 %). Bare numbers quoted from a source are reported as *quoted*, never as recomputed. Full detail in [8.3](03-calculations.md).

| Outcome | Detail |
|---|---|
| Nothing asserted | *No numeric calculations were asserted.* (pass) |
| Only quoted figures | *No calculations were made: 2 figure(s) were quoted from the sources rather than computed, so there was nothing to recompute.* (pass) |
| All match | *3 of 3 calculation(s) independently recomputed in the sandbox and matched within 1.00% tolerance.* (pass) |
| Any mismatch or error | *0 of 2 calculation(s) … matched …* (fail) |
| Could not run | *Figures could not be recomputed: …* (fail) |

## code_verification

*Did the generated code run cleanly?*

| Situation | Result |
|---|---|
| No code this run | pass: *No code was generated or executed for this task.* |
| Static validation refused it | fail: *Generated code was rejected by static security validation before execution*, with the violations |
| Timed out | fail: *Sandbox execution exceeded its time limit and was terminated.* |
| Exit 0 (with `code_must_exit_zero: true`) | pass: *Sandbox execution exited 0 in 1169ms; 2 line(s) of output; 0 network attempt(s) blocked.* |
| Non-zero exit | fail, with the first 300 characters of stderr |

Note what this check means: the code **ran**. It does not mean its output is right. In the live demonstration, a generated script exited 0 and printed a remaining life of −5.23 years. This check passed; source and calculation verification failed, and the run was held.

## document_verification

*Is the drafted document fit to hand to a reviewer?* Runs only when a deliverable was drafted. Fails if the draft has no title, no body sections, no recommendation, or no inline citation although evidence was retrieved.

## hallucination_check

*Taken as a whole, how much of the answer is traceable?* The same material-claim count as source verification, over the full answer, reported as *3 of 5 material claim(s) traceable to local evidence or independent computation*, with the same 60 % threshold.

## The report

```json
{
  "valid": false,
  "checks": [ … ],
  "material_claims_total": 3,
  "material_claims_supported": 0,
  "limitations": [
    "source_verification: 0 of 3 material claims are supported by local evidence (0%; threshold 60%).",
    "calculation_verification: 0 of 2 calculation(s) independently recomputed …"
  ],
  "completed_at": "…"
}
```

`limitations` collects everything the run itself flagged (no passages found, unreadable pages) plus the detail of every failed check. It is what the Approvals screen shows under **Limitations it states**.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 08 · Verification](README.md) | [↑ 08 · Verification](README.md) | [8.2 · Material claims →](02-claims.md) |

<!-- nav:end -->
