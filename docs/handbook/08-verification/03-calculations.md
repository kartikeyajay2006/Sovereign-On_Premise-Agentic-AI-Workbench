# 8.3 · Calculations

Arithmetic that ends up in a signed document should not rest on a language model's token prediction. Calculation verification recomputes every figure the answer *computes*, outside the model.

## Step 1 · Extract

After the answer is written, the reasoning model is asked (prompt `extract_calculations`) to list every calculation the text asserts, as JSON:

```json
{"calculations": [
  {"label": "corrosion rate, shell course 2",
   "expression": "(11.6 - 9.4) / 4.0",
   "expected": 0.55,
   "units": "mm/year"},
  {"label": "remaining life",
   "expression": "(9.4 - 6.0) / 0.55",
   "expected": 6.18,
   "units": "years"}
]}
```

(These are the real V-2104 figures: shell course 2 thinned from 11.6 mm to 9.4 mm over 4.0 years, against a t-min of 6.0 mm.) Only calculations with a concrete asserted result are listed; at most eight are kept. The expression must be pure arithmetic over literal numbers.

## Step 2 · Separate quoted figures

A bare literal (`20`, `24.0`, `-3.5`) is not a calculation. It is a figure **quoted** from a source. Recomputing it proves nothing: the sandbox evaluates `20` and gets `20`.

This was learned the hard way. Asked about an approval authority, the model once listed *"Insulated piping damage threshold: 20"*, *"Inspection interval: 24"* and *"Approval authority: 1 (Head of Inspection)"* as calculations, and the report said *3 of 3 calculation(s) independently recomputed and matched*: a pass for three tautologies, on the check whose whole claim is independence. Now a literal is reported as quoted, with the note *quoted from the sources, not calculated; nothing to recompute*, and is never counted. `tests/test_quoted_figures.py` holds this.

## Step 3 · Recompute in the sandbox

The remaining expressions are assembled into one small program and run in the sandbox under the same static validation and OS limits as any other code:

```python
import json
results = []
try:
    value = ((11.6 - 9.4) / 4.0)
    results.append({'index': 0, 'value': float(value), 'error': None})
except Exception as exc:
    results.append({'index': 0, 'value': None, 'error': str(exc)})
…
print(json.dumps(results))
```

The expressions are never `eval`-ed in the API process.

## Step 4 · Compare

For each: `|recomputed − expected| / |expected| ≤ calculation_tolerance` (0.01, i.e. 1 %). The model's asserted value is parsed defensively: *"19.9 mm"*, *"about 6.2"* and *"≈ 0.55"* yield their number rather than crashing the check.

Each recomputed figure becomes a `C` evidence item:

> **C2** independent sandbox recomputation · remaining life · `(9.4 - 6.0) / 0.55 = 6.1818 years`

## What this proves, and what it does not

| It proves | It does not prove |
|---|---|
| The arithmetic in each expression was done correctly | That the expression uses the **right formula** |
| The answer's figures are consistent with its own expressions | That the numbers fed in are the **right inputs** from the evidence |
| A figure the model mis-added is caught | That a calculation the task **needed** was actually made |

In other words: it checks the model's arithmetic, not its engineering. If the model uses the wrong reading, the wrong minimum thickness, or the wrong years, and does the arithmetic correctly, this check passes. If the model asserts no calculation at all, it passes with *nothing to recompute*.

The fix, on the roadmap, is a **deterministic engineering calculation engine**: a versioned registry of formulas (corrosion rate, remaining life, next inspection date and others), invoked by ID, with each input bound to the evidence item it came from and carrying its units, executed deterministically, and recorded as calculation evidence with formula ID, version, inputs and output. Verification can then recompute *from the evidence*, not from the model's own expression. See [8.5](05-limits.md).

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 8.2 · Material claims](02-claims.md) | [↑ 08 · Verification](README.md) | [8.4 · Thresholds →](04-thresholds.md) |

<!-- nav:end -->
