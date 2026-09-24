# 10.3 · `config/routing.yaml`

How a model is chosen for each stage. The algorithm is in [5.2](../05-models-and-routing/02-router.md).

## `rules`

An ordered list; the first rule whose `when` clauses all match wins. The last rule should match everything.

| Key | Type | Meaning |
|---|---|---|
| `name` | string | Appears in every routing reason: *rule 'document_reasoning' requires…* |
| `description` | string | For people |
| `when.input_types` | list | Any of the analyzer's input types; omitted = any |
| `when.task_types` | list | Any of the task types; omitted = any |
| `when.complexities` | list | `simple`, `multi_step`, `agentic`; omitted = any |
| `when.sensitivities` | list | `normal` … `restricted`; omitted = any |
| `require.role` | role | Preferred role (scored) |
| `require.capabilities` | list | Required capabilities (hard gate) |
| `fallback.role`, `fallback.capabilities` | | Used when nothing meets `require`. Should relax something, or it changes nothing |

Shipped rules: `visual_understanding`, `code_generation`, `document_reasoning`, `default`.

## `scoring`

| Key | Default | Points for |
|---|--:|---|
| `role_match` | 50 | The model's role equals the required role |
| `capability_match_each` | 15 | Each required capability it has |
| `classification_approved` | 40 | Approval for the run's classification |
| `availability` | 100 | Being installed |
| `smaller_model_bonus` | 5 | Each billion parameters below the largest registered model |
| `context_window_bonus` | 0.0005 | Each token of context window |

Raising `smaller_model_bonus` favours small models more strongly. Setting it to 0 lets role and capabilities decide, and the larger of two otherwise equal models then wins on context only if its window is larger.

## `stage_roles` and `stage_capabilities`

When a stage is named, these **replace** the rule's role and capabilities.

| Stage | Role | Capabilities |
|---|---|---|
| `vision_extraction` | vision | `[vision]` |
| `planning` | reasoning | `[reasoning]` |
| `code_generation` | coding | `[coding]` |
| `verification` | reasoning | `[reasoning]` |
| `drafting` | reasoning | `[reasoning]` |
| `embedding` | embedding | `[embedding]` |

## `stage_output_tokens`

The `num_predict` sent per stage, overriding the model's `generation_defaults`.

| Stage | Tokens | Why that much |
|---|--:|---|
| `planning` | 350 | A short JSON plan |
| `vision_extraction` | 2400 | Transcribing up to three pages |
| `code_generation` | 700 | One script |
| `verification` | 250 | A short JSON list of calculations |
| `drafting` | 900 | The answer, or the structured document |

## `stage_context_tokens`

The `num_ctx` sent per stage. Text stages share one value (5120) so that the runtime does not reload the same model to change its cache size; vision uses 8192 for image tokens.

> [!TIP]
> On a GPU host, raise `drafting` to 2000 or more and every context value to 16384, and set `inference.max_context_tokens` to match.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 10.2 · `config/models.yaml`](02-models-yaml.md) | [↑ 10 · Configuration reference](README.md) | [10.4 · `config/classification.yaml` →](04-classification-yaml.md) |

<!-- nav:end -->
