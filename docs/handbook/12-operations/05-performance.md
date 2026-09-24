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

## Levers

| Symptom | Lever | Setting |
|---|---|---|
| Every first question after a restart is slow | Prewarm the everyday model | `inference.prewarm: true` |
| A model reloads between runs | Keep models resident longer | `inference.keep_alive: 30m` |
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

Before a demonstration: close browsers with many tabs, IDEs and container runtimes; make sure only one API process runs; run one short question to load the model; and keep `keep_alive` long enough that nothing is evicted mid-demo.

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
