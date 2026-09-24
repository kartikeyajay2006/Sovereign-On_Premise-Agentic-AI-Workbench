# 5.2 · How a model is chosen

The router (`backend/models_layer/router.py`) answers one question per stage: *which installed, approved model should do this, and why?*

## Step 1 · Pick the rule

`config/routing.yaml` has an ordered list of rules. The **first** rule whose `when` clauses all match the run's profile wins; an omitted clause means *any*.

| Rule | When | Requires | Fallback |
|---|---|---|---|
| `visual_understanding` | input is `image`, `scanned_pdf`, `drawing` or `pid_diagram` | role `vision`, capability `vision` | the same |
| `code_generation` | task is `coding`, `calculation` or `data_analysis` | role `coding`, capability `coding` | role `reasoning`, capability `text` |
| `document_reasoning` | task is `document_generation`, `analysis`, `summarization` or `question_answering` | role `reasoning`, capability `reasoning` | role `reasoning`, capability `text` |
| `default` | anything | role `reasoning`, capability `text` | the same |

## Step 2 · Apply the stage override

A run has several stages, and a rule written for the task as a whole would be wrong for most of them. A task on a scanned PDF matches `visual_understanding`, but its *planning* and *drafting* are text work.

So when a stage is named, `stage_roles` and `stage_capabilities` **replace** the rule's role and capabilities:

| Stage | Role | Capabilities |
|---|---|---|
| `vision_extraction` | vision | vision |
| `planning` | reasoning | reasoning |
| `code_generation` | coding | coding |
| `verification` | reasoning | reasoning |
| `drafting` | reasoning | reasoning |
| `embedding` | embedding | embedding |

## Step 3 · Hard gates

A model is **eligible** only if all three hold:

1. it is **installed** (available);
2. it is **approved** for the run's classification;
3. it has **every** required capability.

## Step 4 · Score the candidates

Every registered model is scored, eligible or not, so the record can show why the losers lost. The weights are in `routing.yaml` under `scoring`:

| Term | Points |
|---|---|
| Installed | +100 |
| Role matches | +50 |
| Each required capability it has | +15 |
| Approved for the run's classification | +40 |
| Smaller than the largest registered model | +5 per billion parameters of difference |
| Context window | +0.0005 per token: a 32,768-token window adds about 16 |

The highest-scoring **eligible** model wins.

### A worked example

A `question_answering` run, *confidential*, at the drafting stage (role `reasoning`, capability `reasoning`). The largest registered model is Qwen3 8B.

| Model | Installed | Role | Capability | Approved | Smaller | Context | **Score** |
|---|---|---|---|---|---|---|---|
| Qwen2.5 3B | 100 | 50 | 15 | 40 | (8 − 3) × 5 = 25 | 16.4 | **246.4** ✅ |
| Qwen3 8B | 100 | 50 | 15 | 40 | 0 | 16.4 | **221.4** |
| Qwen2.5 Coder 7B *(not installed)* | 0 | 0 | 0 | 40 | 5 | 16.4 | 61.4 ✗ not installed |
| Qwen2.5-VL 3B | 100 | 0 | 0 | 40 | 25 | 16.4 | 181.4 ✗ lacks `reasoning` |

The 3B wins because, with everything else equal, the router prefers the smaller of two qualified models: on a CPU host it has about three times the throughput. The reason recorded:

> rule 'document_reasoning' requires a reasoning model; capabilities ['reasoning'] matched; approved for confidential data; installed locally

## Step 5 · Fallback

If no model passes the gates, and the rule declares a `fallback`, the requirement is relaxed and the gates run again. The `code_generation` fallback drops the `coding` capability for plain `text`, so a host without a coding model still gets code, from the reasoning model. That is safe because generated code must run cleanly in the sandbox and is verified. The reason then begins *primary requirement unmet, applied configured fallback*.

If nothing passes even then, the stage, and so the run, is **blocked**, with a reason that names the problem:

> No installed model satisfies role 'vision' with capabilities ['vision'] approved for classification 'restricted'. Registered but not installed: qwen2.5vl:3b.

## Step 6 · A preferred model

When you pick a model in the Thread's model menu, it is sent as `preferred_model`. It is a **request, not an override**:

- It is looked for among the models that already passed every gate for this stage, after any fallback, so it is judged by exactly the same policy.
- If it is there, it wins, and the reason begins *qwen3:8b requested and eligible*.
- If not, the router's own choice stands, and the reason says which gate the request failed, for example *requested moondream:latest not used: moondream:latest is not approved for restricted data*.

A preference is honoured stage by stage. Choosing a text model does not stop a vision model reading your scan.

## Stage budgets

`routing.yaml` also sets how much each stage may generate and how much context it gets. On a CPU host, response length is the dominant cost: at about four tokens a second, an unbounded 1,200-token answer is five minutes.

| Stage | `stage_output_tokens` | `stage_context_tokens` |
|---|--:|--:|
| planning | 350 | 5120 |
| vision_extraction | 2400 | 8192 |
| code_generation | 700 | 5120 |
| verification | 250 | 5120 |
| drafting | 900 | 5120 |

The text stages share **one** context value on purpose. The runtime allocates the model's cache when it loads it, and a call asking for a different window forces a full reload of a model already in memory. Measured: with drafting at 5120 and verification at 3072, every verification paid a seven-second reload to shrink a cache it already had.

Raise these on a GPU host, where the trade does not apply.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 5.1 · The model registry](01-registry.md) | [↑ 05 · Models and routing](README.md) | [5.3 · Memory and residency →](03-residency.md) |

<!-- nav:end -->
