# 10.5 · Prompts, skills and harnesses

## `config/prompts/prompts.yaml`

| Key | Meaning |
|---|---|
| `prompts_version` | Schema version |
| `system.<role>` | System prompts: `base`, `planning`, `reasoning`, `coding`, `vision`, `drafting`. `{base}` is substituted into the others |
| `task.<name>` | Task prompts: `plan`, `vision_extract`, `vision_extract_pages`, `converse`, `reason_with_evidence`, `reason_with_page_evidence`, `generate_code`, `extract_calculations`, `draft_deliverable`, `summarize_for_timeline` |

Templates use `{placeholder}`; literal braces are `{{` and `}}`. What each prompt does is in [7.3](../07-agents/03-planning-prompts.md). No prompt text lives in Python.

## `config/skills/<id>.yaml`

A built-in skill. The file name should match its `id`.

```yaml
id: severity                      # the /command; ^[a-z][a-z0-9-]{1,31}$
name: Classify a finding          # ≤ 48 characters
summary: >-                       # ≤ 160 characters
  The severity band a finding falls in under the SOPs, and who must approve
  continued operation with it.
input_hint: The finding, e.g. cladding damage over 35% of the insulated section   # ≤ 120
template: >-                      # 8–1,500 characters; exactly one {input}, no other {…}
  Under our SOPs, what severity band does this finding fall in, and who must
  approve continued operation with it? Finding: {input}
deliverable_format: docx          # optional: docx | xlsx | pptx | md
```

Built-in skills are loaded at startup and shown as *Built in · changed through the repository*. Their SHA-256 is computed from the definition, so editing the file changes the hash that later runs record.

## `config/harnesses/<id>.yaml`

A harness definition. Its shape:

| Key | Meaning |
|---|---|
| `id`, `version`, `name`, `summary`, `description` | Identity and description |
| `inputs[]` | Each input: `id`, `kind` (`lines`, `text`, `choice`), `label`, `help`, `placeholder`, `required`, limits (`min_items`, `max_items`, `max_chars`), and an optional `render` template for how it joins each child's request |
| `expansion.source` | How inputs become items: `input_lines` (one item per line of an input) or per indexed section of a department |
| `expansion.input`, `expansion.label` | Which input to expand, and how each item is labelled (`{item}`) |
| `expansion.template` | What each child run is asked: `{item}` and any rendered inputs such as `{context}` |
| `aggregation` | How children are combined, e.g. `answer_matrix` |
| `report.title`, `report.requires_approval`, `report.limitations` | The report's title, whether a reviewer must sign it, and limitations it always states |
| `limits.max_items`, `limits.child_timeout_seconds` | At most 25 items; each child may take up to 1,800 s |

The SOP question sweep's child template, for example:

```yaml
expansion:
  source: input_lines
  input: questions
  label: "{item}"
  template: |-
    {item}
    {context}
    Answer from our standard operating procedures (SOPs). Cite the governing clause for each requirement you state.
```

The harness definition decides **only what each child is asked**. Every child is an ordinary task and meets every gate. The definition's SHA-256 is shown in the preview and checked again at start, so a definition edited between preview and start is refused.

Template-writing rules for both skills and harnesses:

1. Name "our SOPs" so every child retrieves.
2. Keep *safety, hazard, shutdown, incident, statutory, regulatory, confidential* out of the template.

`tests/test_harness_definitions.py` and `tests/test_harness_expansion.py` hold both, against the real analyzer and approval rules.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 10.4 · `config/classification.yaml`](04-classification-yaml.md) | [↑ 10 · Configuration reference](README.md) | [10.6 · Policy files →](06-policies.md) |

<!-- nav:end -->
