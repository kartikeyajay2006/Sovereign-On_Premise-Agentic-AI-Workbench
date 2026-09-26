# 12.5 · Performance tuning

On a CPU host, latency is dominated by two things: **how many tokens the model reads and writes**, and **whether the host is swapping**. Almost every lever below moves one of those.

## Where the time goes

Measured on CPU-only laptops (see [1.2](../01-getting-started/02-requirements.md#what-to-expect-for-latency)):

| Run | Typical | Dominant stage |
|---|---|---|
| Cited answer | 15–40 s | Drafting (≈ 4 tokens/s on a 3B model) |
| Calculation with code | 1–3 min | Code generation + drafting |
| Scanned report → approval note | 4–10 min | Vision reading, then drafting a document |

Open any run's **usage footer** to see its own breakdown: load time, prompt evaluation, generation, time to first token, tokens per second.

## Hardware profiles

Start with the profile for the host rather than tuning setting by setting. Each is a file in `config/profiles/`, selected with `SOVEREIGN_PROFILE` and overlaid on `app.yaml` and `routing.yaml` ([10.7](../10-configuration/07-environment.md#hardware-tier-profiles-sovereign_profile) has every value):

| Tier | Host | Residency | Workers | Ollama (`scripts/start-ollama.*`) |
|---|---|---|---|---|
| `laptop-8gb` | 8 GB, CPU only (the demo laptop) | single; headroom 1024 MB | 1 | 2 loaded models, 1 parallel slot |
| `laptop-16gb` | 16 GB, 8+ cores | 3B + vision together | 1 | 3 loaded, 1 slot |
| `cpu-server` | 64–128 GB, 16–32 cores | all four; contexts 8192; drafting 2000 tokens | 3 | 4 loaded, 3 slots, flash attention, q8_0 KV cache |
| `gpu-server` | ≥ 12 GB VRAM | 8B + vision + Nomic; contexts 8192 | 4 | 3 loaded, 4 slots, flash attention, q8_0 KV cache |

Every tier sets `keep_alive: 24h` in the app and `OLLAMA_KEEP_ALIVE=24h` in the runtime. On the 8 GB laptop, [Docker is a poor fit](../../RUNTIME-ENVIRONMENT.md#local-models-on-the-demo-laptop): run natively.

## Levers

| Symptom | Lever | Setting |
|---|---|---|
| Every first question after a restart is slow | Prewarm the everyday model | `inference.prewarm: true` |
| A model reloads between runs | Keep models resident longer, in the app **and** the runtime | `inference.keep_alive: 24h`, `OLLAMA_KEEP_ALIVE=24h` (the profiles and `start-ollama.*`) |
| Two users, one waits | More workers, where memory allows | `agent.worker_count` with a matching `OLLAMA_NUM_PARALLEL` |
| The host swaps during runs | Keep models resident **shorter**; one model at a time; fewer installed models | `keep_alive: 5m`, `single_model_residency: true`; remove `qwen3:8b` from the registry |
| Reloads between stages of one run | Keep text stages on one context size | `stage_context_tokens` equal for all text stages |
| Scanned reports are slow | Smaller images | `inference.max_image_edge_px` (1100; try 900) |
| Answers cut off (`done_reason: length`) | Larger drafting budget | `stage_output_tokens.drafting` |
| Everything is slow and the answers are fine | Prefer the smaller model | `scoring.smaller_model_bonus` up |
| Answers are thin and memory allows | Prefer the larger model | Pick Qwen3 8B in the model menu, or remove `qwen2.5:3b` |
| Retrieval returns weak passages | Fewer, better passages | `knowledge_base.min_score` up, `default_top_k` down |

## Memory, specifically

A swapping host is the single biggest cause of slow runs. A model call that took seventy seconds can take twenty-five minutes once its cache is paged in and out.

```bash
free -h                      # "available" should exceed the model footprint + 1.5 GB
ollama ps                    # what the runtime has loaded
curl -s http://127.0.0.1:8000/api/models/status -H "Authorization: Bearer $TOKEN" | jq
```

Before a demonstration: close browsers with many tabs, IDEs and container runtimes; make sure only one API process runs; run `scripts/warmup.py` (or `warmup.ps1`), which loads the drafting model and ends READY only with free memory above `readiness.min_free_memory_mb`; and keep `keep_alive` long enough that nothing is evicted mid-demo. The same readings are at `GET /api/ready`, without sign-in.

### Memory warnings on the timeline

Before a stage loads a model, the model manager projects whether it fits: free memory, plus whatever the admission would evict, against the model's footprint (weights plus KV cache for the stage's window, [5.3](../05-models-and-routing/03-residency.md#the-footprint-estimate)) plus `memory_headroom_mb`. When it would not:

- the run's timeline gets a `task.model_memory` event naming the model, what it needs and what would be free, and the audit log a `model / memory_warning`;
- if the router found a **smaller** model eligible for the stage that does fit, the stage runs on it, and the routing reason says why (`action: fallback`);
- otherwise the stage proceeds on the routed model (`action: proceed`) and the warning explains a slow stage.

Seeing these regularly means the host is under-provisioned for its profile: pick a smaller tier, or close what else is running.

### After an API restart

Ollama keeps its models when the API restarts. The API reconciles at startup (`inference.reconcile_on_startup`): it adopts the drafting model if Ollama still holds it, and under single residency unloads any other registered generation model, so a restart cannot leave two models loaded on an 8 GB host.

## With a GPU

Everything in the design works unchanged. Then:

- set `single_model_residency: false` if VRAM holds both the vision and reasoning models;
- raise `max_context_tokens` (16384+) and every `stage_context_tokens`;
- raise `stage_output_tokens` (drafting 2000+);
- set `serving.thinking: true` for Qwen3 when deliberation is worth it;
- consider reducing `smaller_model_bonus` so the 8B wins.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 12.4 · Backup and restore](04-backup-restore.md) | [↑ 12 · Operations](README.md) | [12.6 · Runtime troubleshooting →](06-troubleshooting.md) |

<!-- nav:end -->
