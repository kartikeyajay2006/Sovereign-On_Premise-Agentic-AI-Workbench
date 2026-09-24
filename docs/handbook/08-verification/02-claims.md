# 8.2 · Material claims

## What counts as a claim

The answer is split into sentences (on `.`, `!`, `?` followed by space, and on line breaks). A sentence of at least 15 characters is a **material claim** if it matches any of `verification.material_claim_patterns` in `policies/approval-rules.yaml`:

| Pattern | Catches | Example |
|---|---|---|
| A number with a unit | mm, cm, m, kg, t, bar, psi, kPa, MPa, °C, %, hours, days, years | *…intervals not exceeding **48 months**…* ¹ |
| A directive | *shall*, *must*, *required to*, *not permitted*, *prohibited*, *mandatory* | *The vessel **shall** receive an internal inspection…* |
| A clause reference | *clause*, *section*, *para*, *paragraph*, *table* + a number | *…under **SOP-INS-014 Clause 5**.* |
| A citation | `[S1]`, `[F2]`, `[V3]`, `[C1]`, `[E1]` | *Approval authority is the Head of Inspection **[S3]**.* |

¹ *months* is not in the unit list, but this sentence is caught by *shall* and by its citation.

The citation pattern matters. Without it, *"The approving authority for this severity is the Head of Inspection + Plant Manager [S4]"* was not counted as a claim at all, and an answer with three assertions was reported as *1 of 1 material claims supported*: a far stronger statement than examining one sentence of three can justify.

## How a claim is traced

A claim is **supported** when it **corroborates** at least one evidence item's excerpt. Corroboration is tested in two ways.

### 1 · A shared figure

References are first removed from both texts: clause and section numbers (*clause 5.2*, *§2.2*), revision numbers, citation markers (`[S1]`), and document codes (`SOP-INS-014`). Otherwise the claim's *"5.2"* could match the passage's own heading. Then, if any **number** in the claim appears in the excerpt, the claim is supported.

> *…intervals not exceeding 48 months.* ↔ excerpt contains *48* → **supported**.

### 2 · Enough shared words

Otherwise, compare the claim's words (references removed) with the excerpt's:

```text
required = min(number of words in the claim,  max(3,  35% of them))
supported if shared words ≥ required
```

The cap matters for short claims: *"The severity is Medium [S1]"* has two distinctive words, and requiring three flatly meant a short, exact claim could never corroborate.

## What this can and cannot establish

It is a **lexical** test. It establishes that a claim is *about* something in the evidence: it shares its numbers or much of its vocabulary. It does **not** establish that the claim says the *same thing*.

| Case | Result | Why |
|---|---|---|
| Claim quotes the passage's figure correctly | ✅ supported | Shared figure |
| Claim invents a figure but shares 35 % of the passage's words | ✅ supported | Shared words |
| Claim puts a correct figure from one row of a table next to the wrong row's label | ✅ supported | The figure and the words are both in the table |
| Claim is supported by a *different* evidence item than the one it cites | ✅ supported | Corroboration is tested against **all** the run's evidence, not the cited item |
| Claim cites nothing and matches nothing | ❌ unsupported | |

The code says this plainly: catching a wrong-row answer *"needs entailment, or the reviewer this system routes to, which is why a failed check holds the task for a human rather than rewriting the answer"*.

Two improvements are on the roadmap: tracing each claim to **the evidence it cites**, and classifying claims (factual, numerical, procedural, recommendation) with per-type checks, including independent recomputation of engineering values. See [8.5](05-limits.md).

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 8.1 · The checks](01-checks.md) | [↑ 08 · Verification](README.md) | [8.3 · Calculations →](03-calculations.md) |

<!-- nav:end -->
