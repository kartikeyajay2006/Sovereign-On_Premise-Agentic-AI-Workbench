# 3.5 · Approvals

<div align="center">
<img src="../../assets/readme/screenshot-approvals.webp#gh-light-mode-only" alt="The approval queue with a held run open" width="860">
<img src="../../assets/readme/screenshot-approvals-dark.webp#gh-dark-mode-only" alt="The approval queue with a held run open" width="860">
</div>

The Approvals screen is the review queue: every run held for a person before anything it produced is released. Each decision is recorded against the reviewer who made it. Requires `approval.read`; deciding requires `approval.decide`. Of the seeded roles, **reviewer** and **administrator** have both.

## The queue

At the top right, **● Live** means the queue is updating from the event stream; **Refresh** reloads it by hand. The sidebar's **Approvals** item carries a badge with the number of runs waiting.

Two filters sit above the list:

| Filter | Options |
|---|---|
| Status | **Held** (waiting), **Approved**, **Rejected**, **All**, each with its count |
| Class | **Any class**, or one classification, e.g. *normal*, *restricted* |

Each item shows: **Held**, its class, how long it has waited, the request, the run ID, who submitted it, and whether it has an attached file.

## The review pane

Select an item and the right-hand pane shows everything needed to decide, in the order a reviewer reads it:

| Block | What it shows |
|---|---|
| **Header** | Status, class, run ID, the request, who submitted it and when, how long it ran, its task type. *Your decision is recorded against [you] in the audit chain.* |
| **Held because** | Every approval rule that matched, in plain language, and which roles may decide |
| **Deliverable** | The answer with its citation chips, and any document the run would release, with its hash |
| **Verification** | *N of M checks passed*, then every check (Sources, Citations, Pages, Calculations, Code, Document) with its detail |
| **Limitations it states** | Anything the run itself flagged: no passages found, a check that could not complete, an unreadable page |

## Deciding

| Key | Action |
|---|---|
| <kbd>J</kbd> / <kbd>↓</kbd> | Next item |
| <kbd>K</kbd> / <kbd>↑</kbd> | Previous item |
| <kbd>Enter</kbd> | Open the selected item |
| <kbd>A</kbd> | Approve |
| <kbd>R</kbd> | Reject |
| <kbd>Esc</kbd> | Back to the list |

Approve or reject opens a dialog for an optional note. <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd> confirms. The note is stored on the run and in the audit record; a decision without one shows *No note was recorded with this decision.*

- **Approve** marks the run **Delivered** and releases its documents to the requester.
- **Reject** marks it **Rejected**. Nothing is released.

## When you cannot decide

| Message | Why |
|---|---|
| *You ran this task, so you cannot approve or reject it.* | Separation of duties: nobody decides their own work, whatever their role |
| *Role '…' is not an approving authority for this task* | The matching rules name other approver roles |
| *This task is not awaiting approval* | Someone else decided it first |

## A good review

> [!TIP]
> 1. Read **Held because** first. It tells you what the policy is worried about.
> 2. Open every citation chip, and check that the passage says what the sentence claims. Verification checks that the words and figures match; only you can check that the *meaning* does.
> 3. For any figure, find the inputs in the evidence and redo the arithmetic, or open the run's transcript to see the code that computed it.
> 4. Write the reason in the note. *"Figures match the UT survey; severity per SOP-MNT-022 §4.1"* is worth far more in an audit than a bare approval.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 3.4 · Harnesses](04-harnesses.md) | [↑ 03 · Using the workbench](README.md) | [3.6 · Knowledge →](06-knowledge.md) |

<!-- nav:end -->
