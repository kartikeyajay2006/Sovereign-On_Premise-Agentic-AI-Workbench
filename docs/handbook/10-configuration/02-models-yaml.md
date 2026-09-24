# 10.2 · `config/models.yaml`

The model registry. The concept is in [5.1](../05-models-and-routing/01-registry.md); adding a model is in [5.5](../05-models-and-routing/05-adding-a-model.md).

## Top level

| Key | Meaning |
|---|---|
| `registry_version` | Schema version, currently `1` |
| `models` | The list of declared models |

## A model entry

| Key | Required | Type | Meaning |
|---|:--:|---|---|
| `id` | ✅ | string | Registry ID, unique. Shown in routing records, the audit log and the model menu |
| `family` | | string | Grouping label |
| `display_name` | ✅ | string | Human name |
| `role` | ✅ | `reasoning` · `coding` · `vision` · `embedding` | Primary role. Role match is scored |
| `capabilities` | ✅ | list | Tags. A stage's required capabilities must all be present |
| `context_window` | ✅ | int | Declared window in tokens; capped at `inference.max_context_tokens` when calling |
| `quantization` | | string | Informational |
| `parameters_b` | ✅ | float | Billions of parameters: the smaller-model bonus and the memory estimate |
| `approved_classifications` | ✅ | list | `normal`, `confidential`, `sensitive`, `restricted`. The data classes this model may see |
| `serving.provider` | ✅ | `ollama` | |
| `serving.model` | ✅ | string | The runtime's name for it |
| `serving.thinking` | | bool | `false` sends `think: false` (Qwen3) |
| `generation_defaults` | | map | `temperature`, `top_p`, `num_predict`, …; stage budgets override `num_predict` and `num_ctx` |
| `embedding_dimensions` | | int | Embedding models only |
| `notes` | | string | Shown in the Models tab |

## Capability vocabulary in use

`text`, `reasoning`, `planning`, `analysis`, `summarization`, `coding`, `debugging`, `tool_calling`, `data_analysis`, `vision`, `ocr`, `layout_understanding`, `drawing_analysis`, `handwriting`, `embedding`.

The stages require: `vision` (reading), `reasoning` (planning, verification, drafting), `coding` (code generation, with fallback to `text`), `embedding` (retrieval).

## The shipped registry

| ID | Role | Params | Context | Approved for |
|---|---|--:|--:|---|
| `qwen3:8b` | reasoning | 8.0 B | 32,768 | normal → restricted |
| `qwen2.5:3b` | reasoning | 3.0 B | 32,768 | normal → restricted |
| `qwen2.5-coder:7b` | coding | 7.0 B | 32,768 | normal, confidential, restricted |
| `qwen2.5vl:3b` | vision | 3.0 B | 32,768 | normal → restricted |
| `moondream:latest` | vision | 1.9 B | 2,048 | normal, confidential |
| `nomic-embed-text:latest` | embedding | 0.137 B | 8,192 | normal → restricted |

> [!NOTE]
> `qwen2.5-coder:7b` lists `normal`, `confidential` and `restricted` but not `sensitive`. A Sensitive coding run therefore never routes to it, and falls back to a reasoning model.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 10.1 · `config/app.yaml`](01-app-yaml.md) | [↑ 10 · Configuration reference](README.md) | [10.3 · `config/routing.yaml` →](03-routing-yaml.md) |

<!-- nav:end -->
