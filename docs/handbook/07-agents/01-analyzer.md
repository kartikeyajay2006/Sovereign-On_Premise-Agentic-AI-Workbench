# 7.1 · The task analyzer

`backend/core/analyzer.py` turns an unstructured request and its attachments into a **task profile**. Every signal it uses lives in `config/classification.yaml`, so classification can be tuned without a deployment.

## The profile

| Field | Values | Decides |
|---|---|---|
| `input_type` | `text`, `document`, `pdf`, `spreadsheet`, `presentation`, `image`, `scanned_pdf`, `drawing`, `pid_diagram`, `code`, `multimodal` | Routing rule; whether vision is needed |
| `task_type` | `question_answering`, `analysis`, `calculation`, `coding`, `document_generation`, `vision_analysis`, `summarization`, `conversation` | Routing rule; retrieval; code; deliverable |
| `complexity` | `simple`, `multi_step`, `agentic` | Step budget |
| `sensitivity` | `normal`, `confidential`, `sensitive`, `restricted` | Model and tool eligibility; approval |
| `confidence` | 0–1 | The low-confidence approval rule |
| `step_budget` | 4 / 8 / 14 | A ceiling, capped by `agent.max_step_budget` (20) |
| `requires_retrieval`, `requires_vision`, `requires_code_execution`, `produces_deliverable`, `deliverable_format` | | Which stages run |
| `required_capabilities` | e.g. `[reasoning, vision]` | Added to routing requirements |
| `signals`, `reasons` | | Why, in words, shown in the transcript |

## How each field is decided

### Conversation first

With no attachment, a message of at most **six words** that matches one of the `conversation.patterns` as a whole (*hi*, *thanks*, *ok*, *what can you do*, *help*, …) is a **conversation**, answered in one short call. Anything longer, anything with a file, and anything that goes on to ask something is a task.

### Input type

From the attachments' extensions (`input_types.by_extension`), refined by words in the request:

| Refinement | From | Triggered by | To |
|---|---|---|---|
| Scan | image, pdf | *scanned*, *scan of*, *photocopy*, *handwritten* | `scanned_pdf` |
| P&ID | image, pdf | *p&id*, *piping and instrumentation*, *process flow diagram*, *pfd* | `pid_diagram` |
| Drawing | image, pdf | *drawing*, *blueprint*, *schematic*, *isometric*, *layout plan* | `drawing` |

Mixed attachments (for example an image and a spreadsheet) become `multimodal`. No attachment means `text`.

### Task type: weighted patterns

Every class has patterns with weights; each match adds its weight, and the highest total wins (ties go to the class declared first). Examples:

| Class | Strong signals (weight) |
|---|---|
| `coding` | *python script* (7), *write a python* (7), *write a program* (6), *write code* (5) |
| `calculation` | *calculate* (5), *corrosion rate* (5), *remaining life* (5), *compute* (4) |
| `document_generation` | *approval note* (5), *generate a report* (4), *word document* (4) |
| `summarization` | *summarise* / *summarize* (5), *key points* (4) |
| `analysis` | *analyse* / *analyze* (4), *root cause* (4), *review*, *assess*, *evaluate* (3) |
| `vision_analysis` | *ocr* (5), *what does this drawing* (5), *extract from* (4) |
| `question_answering` | *which sop* (4), *does our* (3), *what is* (2) |

With no match, the default is `question_answering`. A visual input turns `question_answering` into `vision_analysis`.

Why "python script" outweighs "calculate": *write a python script to compute X* is a request for a program, not a calculation that happens to mention Python.

### Sensitivity

The same weighted matching over the request (*restricted*, *defence*, *tender* → restricted; *confidential*, *p&id*, *financial* → confidential; *safety*, *hazard*, *incident*, *shutdown*, *regulatory*, *statutory*, *approval note* → sensitive), combined with the classification of attached files. It can only be raised later, by evidence; see [2.3](../02-concepts/03-classification.md).

### Complexity

Patterns (*and then*, *step by step*, *based on our sop*, *verify against* → agentic; *then*, *also*, *as well as* → multi-step) plus signals: multiple files, a deliverable, a visual input. Retrieval alone does not count: looking one thing up and answering it is two steps, and counting it made every one-line question "agentic".

### Retrieval, code, deliverable

| Requirement | True when |
|---|---|
| **Retrieval** | Task is `document_generation`, `question_answering` or `analysis`; or the request contains a trigger such as *sop*, *procedure*, *manual*, *policy* |
| **Code** | Task is `coding`; or task is `calculation` or `analysis` **and** a `.csv`, `.xlsx` or `.xls` is attached. (The configuration also lists `data_analysis`, which the analyzer never produces: there is no such task type.) |
| **Deliverable** | A format was requested (anything but *answer*); or the request names one (*docx*, *word*, *approval note*, *memo*, *letter*, *note* → DOCX; *excel*, *spreadsheet*, *workbook* → XLSX; *powerpoint*, *presentation*, *slide*, *deck*, *board pack* → PPTX; *markdown* → MD); or the task is `document_generation` (→ DOCX) |

> [!WARNING]
> **A calculation with only a scanned report attached runs no code.** The code rule needs a data file. The figures are then written by the language model and checked only for internal consistency. This is the most important gap in the pipeline today: see [8.5](../08-verification/05-limits.md).

> [!NOTE]
> Through the API with no format given, the word *note* anywhere in a request (*"note the interval…"*) makes a DOCX deliverable, which is always held for sign-off. The console always sends a format, and its default *Answer only* prevents this.

### Confidence

```text
confidence = min(1.0, task-type pattern score / 8)     (0.15 if nothing matched)
           + 0.15 if files are attached                 (capped at 1.0)
```

Below 0.35, with a deliverable to release, the run is held for a person (`low_confidence_classification`).

## Seeing it

Every run's transcript opens with its profile and the reasons:

```text
input type 'scanned_pdf' from 1 attachment(s)
task type 'calculation' (pattern score 10)
complexity 'agentic' -> step budget 14
data classification 'restricted'
request references local knowledge: sop
deliverable: caller requested a docx deliverable
```

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 07 · Agents and orchestration](README.md) | [↑ 07 · Agents and orchestration](README.md) | [7.2 · The orchestrator →](02-orchestrator.md) |

<!-- nav:end -->
