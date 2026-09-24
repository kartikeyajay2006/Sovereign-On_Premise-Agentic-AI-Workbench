# 3.2 · Thread

The Thread is where you ask. It is a conversation-shaped view of runs: your request on the right, the workbench's answer on the left, and underneath every answer, a transcript of exactly how it was produced.

<div align="center">
<img src="../../assets/readme/screenshot-thread-answer.webp#gh-light-mode-only" alt="A delivered /clause answer with six of six checks passed" width="860">
<img src="../../assets/readme/screenshot-thread-answer-dark.webp#gh-dark-mode-only" alt="A delivered /clause answer with six of six checks passed" width="860">
</div>

## Starting a run

A new thread opens on *What should we check today?*, with the composer and starter cards.

### Starter cards

| Card | What it does |
|---|---|
| **Approval note from a scanned report** | Attaches `scanned-inspection-report-V-2104.pdf`, asks for an approval note, output **Word**. Shown only when a vision model is installed |
| **Corrosion rate and remaining life** | Attaches `V-2104-thickness-survey.csv`, asks for rate and remaining life at every location, output **Excel** |
| **What do our procedures require?** | A cited question about cladding damage and who must approve continued operation |
| **Find the governing clause** | The `/clause` skill with a ready input. Offered in place of the scanned report on a host with no vision model |

Clicking a card fills the composer; nothing runs until you send.

### The composer

| Control | What it does |
|---|---|
| Text field | Your request. <kbd>Enter</kbd> sends; <kbd>Shift</kbd>+<kbd>Enter</kbd> starts a new line; <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd> also sends |
| 📎 **Attach** | Upload files. Allowed: `.txt .md .log .pdf .docx .doc .xlsx .xls .csv .pptx .png .jpg .jpeg .webp .bmp .tiff .tif .py .js .ts .json .yaml .yml`, up to **50 MB** each. Each file is stored locally, hashed and classified |
| **Answer only ▾** | The output format: *Answer only*, *Word*, *Excel*, *PowerPoint* or *Markdown*. Choosing a document format means the run produces a deliverable, which is always held for sign-off |
| **Automatic ▾** | The model. *Automatic* lets the router choose per stage. Picking a model is **advisory**: the router honours it only for stages where that model is eligible under the same policy, and records why wherever it is not |
| **↑** | Send. While a run is in progress the field stays writable, and <kbd>Enter</kbd> sends once the current run ends |

### Skills with `/`

Type `/` at the start of the composer. A menu lists every **skill**, then every **harness**. Keep typing to filter; <kbd>Enter</kbd> or <kbd>Tab</kbd> takes the highlighted one; <kbd>Esc</kbd> closes the menu. A chosen skill sits in the composer as a chip, and the placeholder tells you what input it wants. Choosing a harness opens its configuration screen. See [3.3 Skills](03-skills.md).

## Reading an answer

An answer has four parts.

**1. The status line**

> 🛡️ **Delivered** · 18.8 s · 6 of 6 checks passed · 6 sources searched ›

| Part | Meaning |
|---|---|
| Status chip | *Delivered*, *Held for review*, *Rejected*, *Failed*, *Refused* or *Stopped* |
| Time | Wall-clock time of the whole run |
| Checks | How many verification checks passed, out of how many ran |
| Sources | How many passages retrieval returned |
| › | Opens the transcript |

**2. The answer**, with citation chips such as `S1` after the sentences they support.

**3. The sources row**: one chip per cited item, like **S1** SOP-INS-014 §2.2. Click it to open the excerpt, its document, section, page, classification and hash in the evidence rail.

**4. The actions**

| Action | Does |
|---|---|
| **Copy** | Copies the answer text |
| **Copy with sources** | Copies the answer followed by its sources list, ready to paste into an email or report |
| **Run again** | Re-submits the same request as a new run, useful after a failure or to compare |

## The transcript

Click the status line and the run opens as a transcript, like a terminal session. Each step shows its time, and failures and refusals appear in the same list as successes.

| Step | What you see |
|---|---|
| **Queued** | Position in the queue, while waiting |
| **Classified** | Input type, task type, complexity, sensitivity and the signals that decided them |
| **Model** | For each stage, the model chosen and the reason: rule, capabilities matched, approved for this class, installed |
| **Read** | For attachments: each page or batch read, and the evidence IDs it produced |
| **Plan** | The steps, or *No plan required* and why |
| **Searched** | The passages retrieved, by document and section, with scores |
| **Code** | The generated script, any retry and why, and the sandbox result |
| **Drafted** | Tokens in and out, speed, and the model |
| **Checked** | Every verification check and its detail |
| **Held** | The approval reasons and who may decide |

At the foot of a run, the **usage footer** totals what the models did: prompt and output tokens, load time, evaluation time, time to first token, context window, and why generation stopped.

## A held run

<div align="center">
<img src="../../assets/readme/screenshot-thread-held.webp#gh-light-mode-only" alt="A run held for review because a restricted memo was retrieved" width="860">
<img src="../../assets/readme/screenshot-thread-held-dark.webp#gh-dark-mode-only" alt="A run held for review because a restricted memo was retrieved" width="860">
</div>

A held run shows **Held for review** and, beneath the answer, a line naming who may decide and why:

> Held for administrator or reviewer · evidence S5 (ENG-DBM-2104) is restricted, so the run is restricted too

You can read the answer, but any document it produced is withheld until a reviewer approves it.

## Streaming

While the model drafts, its text appears word by word over the live event stream. The streamed text is a preview: the complete answer arrives once, at the end, on the `task.answer` event, and that is the authoritative copy. If your connection drops and reconnects, the run's structural events (model choice, evidence, verification) are replayed; the streamed fragments are not.

## Stopping a run

While a run is in progress, the send button becomes **Stop this run**. The run stops at the next safe point, between stages or while waiting on a model, and closes as **Stopped**, recording the stage it was in.

## Past runs

Every run you can see is listed in the sidebar. Click one to open it in the Thread; its URL (`/console?run=<id>`) can be bookmarked or shared with someone entitled to see it. Which runs you can see depends on your role: your own (`task.read.own`), or everyone's (`task.read.all`: reviewers, auditors and administrators).

> [!NOTE]
> Engineers also hold `task.read.department`, but the API does not implement department-wide visibility yet: an engineer sees only their own runs. See [9.1 Access control](../09-security/01-access-control.md) for every permission that is declared but not yet enforced.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 3.1 · Signing in and roles](01-sign-in.md) | [↑ 03 · Using the workbench](README.md) | [3.3 · Skills →](03-skills.md) |

<!-- nav:end -->
