# 7.3 · Planning and prompts

## When a plan is made

A plan earns its cost only when the work branches. `_needs_plan` is true when the run:

- requires code execution, or
- requires vision, or
- produces a deliverable, or
- has any attached file.

Otherwise planning is **skipped and says so**: *No plan required: a single retrieval step with no code, files or deliverable.* The decision is deliberately not keyed on the step budget, which is a ceiling the analyzer allows, not an estimate of what a task needs.

### Who makes the plan

The pipeline runs from the task profile. A model plan affects it in one way only: it can add code execution that the classifier did not require. So `_template_plan_reason` takes the plan from the task shape, meaning the same steps as the deterministic fallback plan with no model call (about 40 s on CPU), when:

- code execution is already required, so the model has nothing to add, or
- the classification confidence is at least `agent.template_plan_min_confidence` (0.6 in `config/app.yaml`) and no CSV or XLSX is attached.

A spreadsheet or a low-confidence classification still asks the model. The transcript says which happened (*Plan taken from the task shape: code execution is already required*). `task.planned` and the `plan_created` audit record carry `source`, which is `template`, `model` or `fallback`.

## What a plan is

The planning prompt gives the model the request, the profile, the attached files and the available tools, and asks for JSON only:

```json
{
  "steps": [
    {"id": 1, "action": "vision_extract",  "objective": "Read the scanned report",           "inputs": "V-2104 scan"},
    {"id": 2, "action": "knowledge_search", "objective": "Find the governing clauses",       "inputs": "findings"},
    {"id": 3, "action": "python_exec",      "objective": "Compute rate and remaining life",  "inputs": "UT readings"},
    {"id": 4, "action": "reason",           "objective": "Answer with citations",            "inputs": "evidence"}
  ],
  "expected_outputs": ["approval note"],
  "risks": ["illegible readings"]
}
```

Planning has a budget of 350 output tokens. If the model's output cannot be parsed as a plan, the **fallback plan** for the profile is used:

| Step | Included when |
|---|---|
| `vision_extract` | The run requires vision |
| `knowledge_search` | The run requires retrieval |
| `python_exec` | The run requires code execution |
| `reason` | Always |
| `document_generate` | The run produces a deliverable |

### What the plan controls

Almost nothing, by design. The pipeline's stages are decided by the **profile**. The one thing a plan adds is code: if a parsed plan contains `python_exec`, the code stage runs even when the profile did not require it. Step statuses are written onto the plan for the record, and `agent / plan_created` audits it.

> [!NOTE]
> This is why a calculation over a scanned report can end with no code at all. The profile says no code (no data file is attached), and if the small model's plan is unparseable, the fallback plan follows the profile. See [8.5](../08-verification/05-limits.md).

## The prompt library

Every prompt is in `config/prompts/prompts.yaml`. No prompt text lives in Python. Templates use `{placeholders}`; `{base}` is the shared standing rules.

### System prompts, one per role

| Key | Used for | Its standing instructions, in short |
|---|---|---|
| `base` | Included in all | Ground every claim in evidence, or say it is absent. Never claim internet access. Precise, industrial tone. Quantities carry units; standards carry clause references |
| `planning` | Planning | An explicit, minimal plan; each step one tool or direct reasoning |
| `reasoning` | Answers | The first sentence is the answer. Answer only what was asked. Every factual sentence ends with the identifier of its evidence, `[S2]`. Figures and clause numbers exactly as stated; never invent one. One to four sentences. If the evidence does not settle it, say so and name the document that would |
| `coding` | Code | Dependency-light Python 3 for an offline sandbox; standard library plus pandas, numpy, openpyxl; never import socket, requests, urllib or subprocess; print results |
| `vision` | Reading scans | Transcribe what is visible; mark unreadable values `[illegible]` rather than infer them |
| `drafting` | Deliverables | Formal industrial documents citing each factual statement inline as `[S1]` |

### Task prompts

| Key | Stage | Returns |
|---|---|---|
| `plan` | Planning | JSON: steps, expected outputs, risks |
| `vision_extract` | Reading one image | Transcription and findings |
| `vision_extract_pages` | Reading a batch of PDF pages | Per-page transcription and findings |
| `converse` | Conversation | A short reply |
| `reason_with_evidence` | Reasoning | The cited answer |
| `reason_with_page_evidence` | Reasoning with page evidence | The cited answer, attributing each figure to its page |
| `generate_code` | Code | One fenced Python block, nothing else |
| `extract_calculations` | Verification | JSON: each asserted calculation as a label, a pure arithmetic expression with literal numbers, the expected value and units |
| `draft_deliverable` | Drafting | JSON: title, reference, summary, sections with inline citations, findings with severity and reference, recommendation, approval statement |
| `summarize_for_timeline` | Transcript | One sentence of 18 words at most |

### Changing a prompt

Edit the YAML and restart the API. Keep three things intact, because the code depends on them:

1. **JSON-only prompts must still ask for the same keys.** Parsers read `steps`, `calculations`, `title`, `sections` and the rest by name. Output that does not parse falls back (plans) or fails the check (calculations). It is never guessed at.
2. **The citation format** `[S1]` is what the verifier's patterns look for.
3. **Double braces** `{{ }}` are literal braces in a template; single braces are placeholders.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 7.2 · The orchestrator](02-orchestrator.md) | [↑ 07 · Agents and orchestration](README.md) | [7.4 · Tools →](04-tools.md) |

<!-- nav:end -->
