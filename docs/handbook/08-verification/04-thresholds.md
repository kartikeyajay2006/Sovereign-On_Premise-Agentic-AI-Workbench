# 8.4 · Thresholds

Verification's settings live in `policies/approval-rules.yaml` under `verification`. They are policy, not code: changing one changes what every future run must meet, and the change is visible in the policy file's history.

| Setting | Default | Meaning | Raise it to… | Lower it to… |
|---|---|---|---|---|
| `material_claim_patterns` | 4 patterns | Which sentences are claims | Catch more claims (add units such as `months`, `mm/y`) | Not recommended: fewer claims is weaker checking |
| `min_evidence_per_material_claim` | 1 | Declared. Claims are counted as supported or not; no per-claim minimum above one is applied | | |
| `min_supported_fraction` | 0.6 | Share of claims that must be traced, for source verification and the hallucination check | Hold more answers for review | Hold fewer: not recommended below 0.5 |
| `calculation_tolerance` | 0.01 | Relative difference allowed between asserted and recomputed figures | Accept more rounding (e.g. 0.02 for figures given to one decimal) | Demand exact figures |
| `code_must_exit_zero` | true | Code must exit 0 to pass. When false, the sandbox's own `ok` is used | | |
| `max_replans` | 2 | Code-generation attempts before the failure stands | More chances for a small model to fix its script | Faster failure |

## Worked example: rounding

An answer states a remaining life of *6.2 years* for V-2104's shell course 2, `(9.4 - 6.0) / 0.55`, which is 6.1818…:

```text
|6.1818 − 6.2| / 6.2 = 0.0029  →  0.29 %  ≤  1 %   ✅ matched
```

The same answer stating *6 years*:

```text
|6.1818 − 6| / 6 = 0.0303  →  3.03 %  >  1 %   ❌ not matched
```

Rounding to the nearest year is not accurate enough for an integrity decision, and the check says so.

## Related policy

Verification thresholds decide whether a run is **valid**. Whether a valid run is still held is decided by the approval rules in the same file. See [2.5 Approval](../02-concepts/05-approval.md). Changing a threshold never releases sensitive work, restricted evidence or a deliverable: those are held whatever the checks say.

## When a threshold changes

The policy files are read at startup. Restart the API after editing, then re-run a known question from the [demo guide](../14-demo-guide/README.md) to confirm the effect. Past runs keep the verification they were given; nothing is re-judged retroactively.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 8.3 · Calculations](03-calculations.md) | [↑ 08 · Verification](README.md) | [8.5 · What verification cannot catch →](05-limits.md) |

<!-- nav:end -->
