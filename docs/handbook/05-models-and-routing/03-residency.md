# 5.3 · Memory and residency

On a laptop or a modest workstation, two multi-gigabyte models loaded at once can exhaust memory, and the runtime then dies mid-request or the host starts swapping. The model manager (`backend/models_layer/manager.py`) makes loading a model an explicit, audited decision.

## The policy, in order

1. **Embedding models are exempt.** They are small and needed alongside generation for retrieval, so they are never evicted and never evict anything.
2. **Already resident?** Nothing to do. Recorded as `already_resident`.
3. **Single residency.** With `inference.single_model_residency: true` (the default), only one generation model stays loaded. Switching to a different one, say from the vision model reading a scan to the reasoning model drafting, **evicts** the previous one first.
4. **Memory admission.** With single residency off, a second model may stay loaded alongside the first, **if** the host's free memory covers the new model's footprint plus `inference.memory_headroom_mb` (1,536 MB). If not, the resident model is evicted anyway, with the reason *insufficient free memory for co-residency*.

Eviction asks the runtime to release the model at once (`keep_alive: 0`), waits briefly, and records it.

5. **Would it fit?** Before admission the orchestrator asks the manager for a projection (`projected_fit`): free memory, plus the footprint of whatever admission would evict, against the new model's footprint plus the headroom. If it would not fit, the run emits `task.model_memory` and an audit `model / memory_warning`, and falls back to a **smaller** model the router already found eligible for the stage that does fit; with none, it proceeds on the routed model and the warning stands. See [12.5](../12-operations/05-performance.md#memory-warnings-on-the-timeline).

## Reconciling at startup

Ollama outlives the API. After an API restart the manager used to believe nothing was loaded while the runtime still held a model, so the first admission under single residency evicted nothing and loaded a second model beside the first. With `inference.reconcile_on_startup: true` (the default), the API reads `/api/ps` as it starts and:

- **adopts** the registered generation model it finds resident: the drafting model if it is there, else the most recently used (audited as `model / adopted`);
- under single residency, **unloads** every other registered generation model (audited as `model / unloaded`, reason *startup reconciliation*);
- leaves embedding models alone, as admission does, and **reports** models the registry does not declare without touching them.

## The footprint estimate

```text
footprint = weights  +  KV cache per token × the context window the call asks for
```

- **Weights**: the installed size the runtime reports (or 0.7 GB per billion parameters for Q4, if unknown).
- **Context**: the stage's `num_ctx` (5,120 for text stages, 8,192 for vision by default), not the model's declared window.
- **KV cache per token**, from the best evidence available:
  1. *observed*: what `/api/ps` reported the model occupying at the window it was loaded with, less the weights, per token. When the call asks for exactly that window, the reported size is the footprint;
  2. *architecture*: 2 × layers × KV heads × head dimension × 2 bytes, from `architecture` in `models.yaml`: 36 KiB for Qwen2.5 3B and Qwen2.5-VL 3B, 56 KiB for Qwen2.5 Coder 7B, 144 KiB for Qwen3 8B;
  3. *default*: 144 KiB, sized for an 8B-class model, so an unknown model is over-estimated.

The earlier estimate charged every model 140 KiB per token at the declared window: right for the 8B, four times too high for the 3B. The estimate still errs high (the observed figure includes compute buffers), because the cost of over-estimating is a warning and the cost of under-estimating is swap.

## What gets recorded

Every admission returns, and the audit log keeps:

```json
{
  "model": "qwen2.5:3b",
  "role": "reasoning",
  "evicted": null,
  "available_before_mb": 4966,
  "footprint_mb": 2960,
  "single_residency": true,
  "action": "already_resident"
}
```

Evictions are audited as `model / unloaded` with the reason. Loads count toward **Loads · evictions** on the Knowledge → Models tab, and a swap during a run emits `task.model_swapped`. *Which model was resident when this answer was produced* is part of the run's record.

## Keep-alive

Every call to the runtime carries `keep_alive: inference.keep_alive` (default `30m`; `24h` in every `config/profiles/` tier): how long the runtime keeps a model loaded after its last use. Use a duration rather than `-1`: a model that never expires cannot be evicted by the runtime to make room.

| Setting | Effect |
|---|---|
| `24h` (profiles) | A lull between judge visits costs no reload. Loading the everyday model measured 7–14 s on the demonstration host |
| Long (`30m`) | A demonstration never pays a reload between runs close together |
| Short (`5m`) | Memory is returned sooner on a host that is short of it |
| `0` | Unload after every call. Every call pays the load |

## Prewarming

With `inference.prewarm: true`, the API loads the model an ordinary question would be answered with **as it starts**, instead of on the first question. It routes exactly as a real conversational reply would, admits the model through the manager, and sends the drafting system prompt with a one-token request. The runtime is then holding both the model and the standing instructions it will see on every call.

Measured: the first greeting after a restart went from 20 s (11 s of it loading) to a few seconds.

## Tuning

| Host | Recommended |
|---|---|
| 8 GB, CPU only | Single residency on; `keep_alive: 10m`; only the 3B models installed |
| 16 GB, CPU only | The defaults |
| 32 GB+, or a GPU with 12 GB+ | `single_model_residency: false`; raise `max_context_tokens` and the stage budgets |

If you see swap filling during runs, lower `keep_alive`, close other heavy applications, or remove the 8B model from the registry so it is never loaded. See [12.5 Performance tuning](../12-operations/05-performance.md).

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 5.2 · How a model is chosen](02-router.md) | [↑ 05 · Models and routing](README.md) | [5.4 · The Ollama client →](04-ollama-client.md) |

<!-- nav:end -->
