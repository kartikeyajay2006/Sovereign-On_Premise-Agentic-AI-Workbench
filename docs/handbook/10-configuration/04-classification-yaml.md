# 10.4 · `config/classification.yaml`

The analyzer's signals. How they are used is in [7.1](../07-agents/01-analyzer.md).

## Blocks

| Block | Keys | Meaning |
|---|---|---|
| `conversation` | `max_words` (6), `patterns` | Whole-message patterns that make a message a conversation |
| `input_types` | `default`, `by_extension`, `refinements`, `multi_input_type` | File extensions to input types; words that refine an image or PDF into a scan, P&ID or drawing |
| `task_types` | `default`, `classes.<type>.patterns`, `classes.<type>.produces_deliverable` | Weighted patterns per task type |
| `complexity` | `default`, `classes.<c>.patterns`, `classes.<c>.signals`, `step_budget` | Weighted patterns and signals; step budget per class (4 / 8 / 14) |
| `sensitivity` | `default`, `classes.<level>.patterns` | Weighted patterns per level |
| `retrieval` | `always_for_task_types`, `trigger_patterns`, `top_k`, `min_score` | When a run retrieves |
| `code_execution` | `always_for_task_types`, `for_task_types_with_data`, `data_file_extensions` | When a run writes and runs code |
| `capability_map` | `visual_input`, `code_task`, `reasoning_task`, `retrieval_task` | Capabilities added to routing per feature |

## Pattern syntax

```yaml
task_types:
  classes:
    calculation:
      patterns:
        - {match: "calculate", weight: 5}
        - {match: "remaining life", weight: 5}
```

`match` is a lowercase substring searched in the lowercased request. Each match adds its `weight`; the highest total wins; ties go to the class declared first. Conversation patterns are regular expressions matched against the whole message.

## Tuning safely

| Goal | Change |
|---|---|
| Make every calculation run code | Add `calculation` to `code_execution.always_for_task_types` |
| Treat a new word as sensitive | Add `{match: "…", weight: 4}` under `sensitivity.classes.sensitive.patterns` |
| Stop a plain question being called a calculation | Lower or remove the pattern that tips it; check with a known question |
| Retrieve for a new phrasing | Add it to `retrieval.trigger_patterns` |
| Recognise a new file type | Add its extension under `input_types.by_extension` |

> [!IMPORTANT]
> A word added to a sensitivity class affects every request containing it. A skill or harness template containing that word would hold **every** run it starts. `tests/test_skills.py` and `tests/test_harness_expansion.py` run the built-in templates through the real analyzer to catch exactly this.

## Values that are declared but never produced

`data_analysis` appears in `code_execution.for_task_types_with_data` and in `routing.yaml`'s `code_generation` rule, but the analyzer has no `data_analysis` class and never produces it.

`retrieval.top_k` and `retrieval.min_score` are declared here, but retrieval uses `knowledge_base.default_top_k` and `knowledge_base.min_score` from `app.yaml` (both are 6 and 0.15 in the shipped files).

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 10.3 · `config/routing.yaml`](03-routing-yaml.md) | [↑ 10 · Configuration reference](README.md) | [10.5 · Prompts, skills and harnesses →](05-prompts-skills-harnesses.md) |

<!-- nav:end -->
