# 2.4 · Verification

Before anything reaches a person as a result, AEGIS tries to **falsify its own output**. Every run that is not a conversation ends with a verification report: a list of independent checks, each passed or failed, each with a plain-language detail.

## The checks

| Check | Question it asks | Runs when |
|---|---|---|
| **Source verification** | Are the answer's material claims backed by the evidence? | Always |
| **Citation verification** | Does every cited ID name evidence this run actually recorded? | Always |
| **Page citation verification** | Do page citations point at the page the evidence came from? | Always |
| **Calculation verification** | Do the figures the answer asserts recompute to the same values in the sandbox? | Always; passes trivially when nothing was computed |
| **Code verification** | Did the generated code exit cleanly, and was any network attempt blocked? | Always; passes trivially when no code ran |
| **Document verification** | Does the drafted deliverable have the structure and citations policy requires? | When the run produces a document |
| **Hallucination check** | Overall, how many material claims are traceable to evidence or computation? | Always |

A run passes verification when every check passes. A run that **fails** verification is never delivered automatically. The `verification_failure` approval rule holds it for a reviewer, who sees exactly which check failed and why.

## What a "material claim" is

A sentence is a material claim when it carries something that could be wrong in a way that matters:

- a quantity with a unit (`48 months`, `0.55 mm/year`, `10.5 bar`);
- a directive (*shall*, *must*, *required to*, *prohibited*, *mandatory*);
- a clause reference (*clause 5.2*, *section 4*, *table 3*);
- a citation (`[S1]`).

These patterns are in `policies/approval-rules.yaml` under `verification.material_claim_patterns`. At least **60 %** of material claims (`min_supported_fraction: 0.6`) must be traceable for source verification to pass.

## Recomputing figures

A small local model's arithmetic is not trusted. When the answer asserts a calculation, the verifier asks the model to restate it as an expression, runs that expression in the sandbox, and compares the result with the value the answer gave, within a 1 % tolerance (`calculation_tolerance: 0.01`).

A bare number quoted from a source ("the threshold is 20 %") is not a calculation, and recomputing it would prove nothing. It is reported as *quoted*, never counted as *recomputed*.

## Failing safe

Verification reads model output, which is untrusted input. A check that cannot complete, for example because the model returned "19.9 mm" where a number was expected, is reported as a **failed check**, never as a crashed run. Refusing to verify is itself a result.

## What verification can and cannot tell you

> [!IMPORTANT]
> Verification catches fabricated citations, answers built on nothing, code that did not run, and arithmetic that does not add up. It does **not** yet prove that a figure was computed from the *right inputs* with the *right formula*, and its claim-tracing is lexical rather than semantic.

This matters. A wrong answer that cites a real passage, quotes one of its numbers, and asserts no calculation can pass every check. [8.5 What verification cannot catch](../08-verification/05-limits.md) shows a real example and the planned fixes: a deterministic formula engine with evidence-bound inputs, and a check that fails when a calculation was requested but none was computed.

This is also why policy, not verification alone, decides what is released: sensitive work, restricted evidence and every deliverable are held for a person whatever the checks say.

## Related

- Every check in detail: [8.1 The checks](../08-verification/01-checks.md)
- Thresholds and how to tune them: [8.4 Thresholds](../08-verification/04-thresholds.md)

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 2.3 · Classification and clearance](03-classification.md) | [↑ 02 · Core concepts](README.md) | [2.5 · Approval →](05-approval.md) |

<!-- nav:end -->
