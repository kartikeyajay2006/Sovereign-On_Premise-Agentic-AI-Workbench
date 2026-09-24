# 5.3 · Memory and residency

On a laptop or a modest workstation, two multi-gigabyte models loaded at once can exhaust memory, and the runtime then dies mid-request or the host starts swapping. The model manager (`backend/models_layer/manager.py`) makes loading a model an explicit, audited decision.

## The policy, in order

1. **Embedding models are exempt.** They are small and needed alongside generation for retrieval, so they are never evicted and never evict anything.
2. **Already resident?** Nothing to do. Recorded as `already_resident`.
3. **Single residency.** With `inference.single_model_residency: true` (the default), only one generation model stays loaded. Switching to a different one, say from the vision model reading a scan to the reasoning model drafting, **evicts** the previous one first.
4. **Memory admission.** With single residency off, a second model may stay loaded alongside the first, **if** the host's free memory covers the new model's footprint plus `inference.memory_headroom_mb` (1,536 MB). If not, the resident model is evicted anyway, with the reason *insufficient free memory for co-residency*.

Eviction asks the runtime to release the model at once (`keep_alive: 0`), waits briefly, and records it.

## The footprint estimate

```text
footprint = model size  +  KV cache for its context window

model size  = the installed size the runtime reports
              (or 0.7 GB per billion parameters for Q4, if unknown)
KV cache    ≈ 140 KB per 1,000 tokens of context,
              with the context capped at inference.max_context_tokens (8,192)
```

It is an order-of-magnitude estimate, used only to decide whether two models can coexist. It errs towards evicting.

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

Every call to the runtime carries `keep_alive: inference.keep_alive` (default `30m`): how long the runtime keeps a model loaded after its last use.

| Setting | Effect |
|---|---|
| Long (`30m`) | A demonstration never pays a reload between runs. Loading the everyday model measured 7–14 s on the demonstration host |
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
