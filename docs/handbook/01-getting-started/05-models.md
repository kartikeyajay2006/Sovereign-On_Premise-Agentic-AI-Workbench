# 1.5 · Install the models

AEGIS does not ship model weights. It reads a **registry** of models it is allowed to use from `config/models.yaml`, and reconciles that list with what the local runtime actually has installed.

## Pull what you need

```bash
# Required
ollama pull qwen2.5:3b          # reasoning: answers, plans, drafts, verification
ollama pull nomic-embed-text    # embedding: retrieval over the knowledge base

# Strongly recommended
ollama pull qwen2.5vl:3b        # vision: scanned PDFs, photographs, drawings

# Optional
ollama pull qwen3:8b            # deeper reasoning, if you have the memory
ollama pull qwen2.5-coder:7b    # a dedicated coding model
ollama pull moondream           # a lighter vision fallback
```

Check what the runtime has:

```bash
ollama list
```

## Declared, installed, authorised

Every model the workbench could use is in one of four states, and the Knowledge screen's **Models** tab shows which.

| State | Declared in `config/models.yaml` | Installed in Ollama | Routed to? |
|---|---|---|---|
| **Available** | ✅ | ✅ | Yes, when policy and memory allow |
| **Unavailable** | ✅ | ❌ | Never. The router records why |
| **Unregistered** | ❌ | ✅ | Never. Refused by policy: default deny |
| (not present) | ❌ | ❌ | No |

This is the meaning of the line *installed is not the same as authorised*. A model someone pulls onto the host does not become usable until an administrator declares it, with the data classifications it is approved for.

## What each model is for

| Model | Role | Capabilities declared | Approved for |
|---|---|---|---|
| **Qwen2.5 3B** | reasoning | text, reasoning, planning, analysis, summarization, coding, tool calling | normal → restricted |
| **Qwen3 8B** | reasoning | the same | normal → restricted |
| **Qwen2.5 Coder 7B** | coding | text, coding, debugging, tool calling, data analysis | normal → restricted |
| **Qwen2.5-VL 3B** | vision | vision, OCR, layout understanding, drawing analysis, handwriting, text | normal → restricted |
| **Moondream 2** | vision | vision, OCR, text | normal and confidential only |
| **Nomic Embed Text** | embedding | embedding (768 dimensions) | normal → restricted |

Moondream is approved only up to *confidential*. On a sensitive or restricted run the router will not choose it, even if it is the only vision model installed, and the run is **blocked** with that reason rather than sent to an unapproved model.

## Why the 3B model is chosen over the 8B

When two installed models both satisfy a stage, the router adds a bonus for being smaller (`scoring.smaller_model_bonus` in `config/routing.yaml`: 5 points per billion parameters below the largest candidate). On a CPU host, Qwen2.5 3B has roughly three times the throughput of Qwen3 8B, so it wins, and the run's transcript states that reason.

To route back to the 8B for everything, remove the `qwen2.5:3b` entry from the registry or uninstall it. To use the 8B for a single run, pick it from the **model menu** in the Thread's composer. See [5.2 How a model is chosen](../05-models-and-routing/02-router.md).

## Qwen3's thinking mode

Qwen3 emits a `<think>` deliberation block by default. The workbench strips those blocks from every answer, so on a CPU they are pure latency, often several minutes a call. The registry therefore sets `serving.thinking: false` for `qwen3:8b`. Set it to `true` on a GPU host or for a hard reasoning workload.

## Running with fewer models

| Missing | What happens |
|---|---|
| Embedding model | Retrieval uses a deterministic BM25 lexical retriever (`knowledge_base.lexical_fallback_enabled`). Seeding **stops** rather than index passages that embedding search could not see, unless you pass `--allow-lexical` |
| Vision model | Runs with a scanned attachment end **blocked**: no approved model has the `vision` capability. The Thread hides the scanned-report starter prompt on such a host |
| Coding model | The `code_generation` rule falls back to a reasoning model with the `text` capability. Code still runs in the sandbox and must exit cleanly |
| Every reasoning model | Every task ends **blocked**, with the router's reason recorded on the run and in the audit log |

## Next

**[Seed the corpus and run](06-seed-and-run.md)**.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 1.4 · Install on Windows](04-install-windows.md) | [↑ 01 · Getting started](README.md) | [1.6 · Seed the corpus and run →](06-seed-and-run.md) |

<!-- nav:end -->
