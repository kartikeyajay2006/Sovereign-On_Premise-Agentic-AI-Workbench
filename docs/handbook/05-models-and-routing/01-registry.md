# 5.1 · The model registry

`config/models.yaml` is the list of models the workbench **may** use. Nothing in the Python code names a model; adding one is an edit to this file.

## An entry

```yaml
- id: qwen2.5:3b                 # the registry id; also used in the model menu
  family: qwen2.5
  display_name: Qwen2.5 3B
  role: reasoning                # reasoning | coding | vision | embedding
  capabilities: [text, reasoning, planning, analysis, summarization, coding, tool_calling]
  context_window: 32768
  quantization: Q4_K_M
  parameters_b: 3.0              # billions of parameters; used by the router and the memory estimate
  approved_classifications: [normal, confidential, restricted, sensitive]
  serving:
    provider: ollama
    model: qwen2.5:3b            # the runtime's own name for it
    thinking: false              # optional; for models with a deliberation mode
  generation_defaults:
    temperature: 0.3
    top_p: 0.9
    num_predict: 1200            # overridden per stage by routing.yaml
  notes: >-
    Free text shown in the Models tab.
```

| Field | Used by | Meaning |
|---|---|---|
| `id` | Everything | The stable identifier. A run's routing record, the audit log and the model menu all use it |
| `role` | Router | The kind of work it is for. Role match is scored, not required |
| `capabilities` | Router | Free-form tags. A stage's required capabilities must **all** be present: a hard gate |
| `approved_classifications` | Router | The data classes it may see: a hard gate |
| `parameters_b` | Router, manager | The smaller-model bonus, and the memory estimate when the runtime does not report a size |
| `context_window` | Router, manager | The declared window, capped at `inference.max_context_tokens` (8192) when calling |
| `serving.model` | Client | What to send to Ollama |
| `serving.thinking` | Client | Sends `think: false` so Qwen3 does not deliberate before answering |
| `generation_defaults` | Client | Base options; stage budgets in `routing.yaml` override `num_predict` and `num_ctx` |
| `embedding_dimensions` | Knowledge base | For embedding models: vector length (768 for Nomic) |

## Reconciliation

The registry (`backend/models_layer/registry.py`) asks the runtime what it has installed (`GET /api/tags`) and compares:

| Declared? | Installed? | State | Routed to? |
|:--:|:--:|---|:--:|
| ✅ | ✅ | **available** | Yes |
| ✅ | ❌ | **unavailable** | No. The router's notes say *not installed locally* |
| ❌ | ✅ | **unregistered** | No. Refused as `unregistered_model_use` |

The result is cached for `inference.registry_refresh_seconds` (30 s), so pulling or removing a model takes effect within half a minute, without a restart. If the runtime cannot be reached, every model is unavailable, and the router's reason says *Local inference server is unreachable*.

The **installed size** reported by the runtime becomes the model's `size_bytes`, which the memory manager prefers over its own estimate.

## Where the registry shows up

- **Knowledge → Models**: every declared and unregistered model, its state, its clearances and capabilities.
- **The Thread's model menu**: the available generation models, plus *Automatic*.
- **`GET /api/models`** and **`GET /api/models/status`** in the API.
- **Every routing record**: the candidates considered and their states.

## What the registry does not do yet

The runtime reports a **digest** for each installed model, but the registry does not compare it against an approved value. A model replaced under the same name would be used. Pinning approved digests in a manifest and refusing mismatches before inference is roadmap item 20 ("model integrity"). Until then, control who can run `ollama pull` on the host.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 05 · Models and routing](README.md) | [↑ 05 · Models and routing](README.md) | [5.2 · How a model is chosen →](02-router.md) |

<!-- nav:end -->
