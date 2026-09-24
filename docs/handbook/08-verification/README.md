# 08 · Verification

> The system tries to falsify its own output before anyone treats it as final.

<div align="center">
<img src="../../assets/readme/flow-prove.svg" alt="Model output passes evidence, calculation and policy checks, then human approval, producing a verified output and a hash-chained audit record" width="100%">
</div>

The verification engine is `backend/agents/verifier.py`. It reads model output as **untrusted input**: parsed, never evaluated. It runs a fixed set of checks, each independent, each reporting in plain language, and none able to crash the run it checks.

| Page | Covers |
|---|---|
| [8.1 The checks](01-checks.md) | All seven checks: what each tests, how, and what its pass and fail messages say |
| [8.2 Material claims](02-claims.md) | Which sentences count as claims, and exactly how a claim is traced to evidence |
| [8.3 Calculations](03-calculations.md) | How asserted figures are extracted and recomputed in the sandbox |
| [8.4 Thresholds](04-thresholds.md) | Every tunable setting, and what moving it does |
| [8.5 What verification cannot catch](05-limits.md) | A real wrong answer that passed every check, why, and the fixes |

## In one table

| Check | Fails when |
|---|---|
| **source_verification** | Fewer than 60 % of material claims can be traced to evidence, or claims were made with no evidence at all |
| **citation_verification** | Any cited ID names evidence the run never recorded |
| **page_citation_verification** | A page citation names a page its evidence did not come from, or cites an illegible page as fact |
| **calculation_verification** | A computed figure does not recompute within 1 %, or recomputation could not complete |
| **code_verification** | Generated code was refused by static validation, exited non-zero, or timed out |
| **document_verification** | A drafted document has no title, no sections, no inline citations despite evidence, or no recommendation |
| **hallucination_check** | Overall, fewer than 60 % of material claims are traceable to evidence or computation |

A run is **valid** only when every check passes. An invalid run is never delivered automatically: `verification_failure` holds it for a reviewer.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 7.5 · Deliverables](../07-agents/05-deliverables.md) | [↑ The AEGIS Handbook](../README.md) | [8.1 · The checks →](01-checks.md) |

<!-- nav:end -->
