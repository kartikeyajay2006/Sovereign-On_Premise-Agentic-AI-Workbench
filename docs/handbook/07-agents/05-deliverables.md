# 7.5 · Deliverables

A **deliverable** is a document a run produces: a Word approval note, an Excel analysis, a PowerPoint briefing, or a Markdown note. It is rendered locally by `backend/tools/deliverables.py` with python-docx, openpyxl and python-pptx, stored under `storage/deliverables/<task-id>/`, and hashed with SHA-256.

## How a run gets one

1. The analyzer decides the run **produces a deliverable** and its format (see [7.1](01-analyzer.md#retrieval-code-deliverable)).
2. After verification, the drafting stage asks the model for **structured content** as JSON (the `draft_deliverable` prompt), given the request, the verified answer, the evidence and any checked calculations.
3. *document_verification* checks the draft's structure and citations.
4. At the approval gate the document is **rendered**. Because every deliverable matches the `released_deliverable` rule, it is held, and it is marked **not released**.
5. A reviewer approves, and it is released to the requester.

## What each format contains

### Word (DOCX)

| Section | Content |
|---|---|
| Title block | The title in capitals; *Prepared on the Sovereign On-Premise Agentic AI Workbench — all processing performed locally*; a table of **Reference**, **Task ID**, **Prepared for**, **Date**, **Verification** (*PASSED*, or *FAILED — see limitations*) and **Approval status** (*Pending human approval*) |
| **Executive summary** | Two to four sentences |
| **Findings** | Each finding with severity and the clause it rests on |
| **Calculations** | Each calculation with its expression, the recomputed value and whether it matched |
| **Recommendation** | The recommended action |
| **Approval sought** | What the approving authority is being asked to approve |
| **Evidence and source references** | Every evidence item cited: ID, document, section or page, classification, department |
| **Provenance and verification record** | The models that produced it and why, and every verification check with its result |

### Excel (XLSX)

A **Summary** sheet with the answer and findings; one sheet for each data table the draft supplies; and an **Evidence** sheet listing each source with its ID, document, location and classification.

### PowerPoint (PPTX)

A short briefing: a title slide noting *100% local processing*, an executive summary, one slide per drafted section, findings, a recommendation, and the evidence and sources.

### Markdown

The same content as the Word note, as plain Markdown, for pasting into another system.

## Held and released

| State | Who can download it |
|---|---|
| **Held** (not released) | Holders of `approval.decide` (reviewers, administrators), so they can inspect exactly what they are approving |
| **Released** | The requester; anyone with `deliverable.download.all` |

A download goes through the same checks every time: the caller must own the task or hold `deliverable.download.all`; a held file needs `approval.decide`; the path must be inside the deliverable store; and the file must still exist. If storage was cleared but the record survived, the answer is **HTTP 410** with *recorded for this task but is no longer in deliverable storage. Re-run the task to regenerate it*, which is more useful than a vague *not available*. Every download is audited as `deliverable / downloaded`.

## Honest limits

- **Content quality is the model's.** A small CPU model drafts thin documents, and without a report attached, an approval note comes back with placeholders. It fails its grounding checks and is held. That is the design working, not failing.
- **The hash is recorded, not re-checked.** The SHA-256 is computed when the file is rendered and shown to the reviewer, but downloads do not re-hash the file.
- **Engineers do not get department-wide downloads yet.** `deliverable.download.department` is granted to engineers but not implemented. Engineers download their own deliverables only.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 7.4 · Tools](04-tools.md) | [↑ 07 · Agents and orchestration](README.md) | [08 · Verification →](../08-verification/README.md) |

<!-- nav:end -->
