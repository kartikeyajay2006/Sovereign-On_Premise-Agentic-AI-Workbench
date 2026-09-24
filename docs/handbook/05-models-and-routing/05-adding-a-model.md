# 5.5 · Adding a model

A worked example: adding **Llama 3.2 3B** as a second everyday reasoning model, approved for confidential data and below only.

## 1 · Install it in the runtime

```bash
ollama pull llama3.2:3b
```

At this point the workbench sees it as **unregistered**: installed, not declared, refused.

## 2 · Declare it

Append to `config/models.yaml`:

```yaml
  - id: llama3.2:3b
    family: llama3.2
    display_name: Llama 3.2 3B
    role: reasoning
    capabilities: [text, reasoning, summarization]
    context_window: 131072
    quantization: Q4_K_M
    parameters_b: 3.2
    approved_classifications: [normal, confidential]
    serving:
      provider: ollama
      model: llama3.2:3b
    generation_defaults:
      temperature: 0.3
      top_p: 0.9
    notes: >-
      Second everyday reasoning model. Not approved above confidential.
```

Decide each field deliberately:

- **`capabilities`** are hard gates. Leave out `planning` and `coding`, and this model is never chosen for a stage that requires them.
- **`approved_classifications`** is a policy decision. Here, a Sensitive or Restricted run will never be routed to this model, whatever it scores.
- **`parameters_b`** feeds the smaller-model bonus: at 3.2 B it scores close to Qwen2.5 3B, and the capability terms decide between them.

## 3 · Restart, or wait

The registry re-reads availability every 30 seconds, but the YAML itself is loaded at boot. Restart the API:

```bash
./scripts/run.sh
```

A malformed file stops the boot with a configuration error naming the problem.

## 4 · Check

1. **Knowledge → Models**: the model is **available**, cleared for *normal, confidential*.
2. **Thread → model menu**: *Llama 3.2 3B* is listed.
3. Pick it and ask a confidential question. The transcript's model step says *llama3.2:3b requested and eligible*.
4. With it still selected, ask something the analyzer classes as Restricted from the start, for example a question containing *tender* or *unreleased*. Every stage records *requested llama3.2:3b not used: llama3.2:3b is not approved for restricted data*, and the router's own choice runs instead.

> [!NOTE]
> A run can also *become* Restricted after drafting, when retrieval admitted a Restricted passage. That raise happens after the last model stage, so it does not re-route anything; it holds the run for a reviewer instead. A model's clearance is enforced against the classification the run has **when each stage is routed**.

## Removing a model

Delete its entry, or just uninstall it with `ollama rm`. An uninstalled model becomes **unavailable** and is never routed to. To route everything back to Qwen3 8B, remove the `qwen2.5:3b` entry.

## Changing the rules instead

To send, say, all summarisation to a particular model, add a rule to `config/routing.yaml` **above** `document_reasoning`:

```yaml
  - name: summaries
    description: Summaries prefer the summarisation-tuned model.
    when:
      task_types: [summarization]
    require:
      role: reasoning
      capabilities: [summarization]
    fallback:
      role: reasoning
      capabilities: [text]
```

Rules are matched in order, and the first match wins.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 5.4 · The Ollama client](04-ollama-client.md) | [↑ 05 · Models and routing](README.md) | [06 · Knowledge and retrieval →](../06-knowledge-and-retrieval/README.md) |

<!-- nav:end -->
