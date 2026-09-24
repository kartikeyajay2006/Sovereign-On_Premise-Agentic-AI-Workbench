# 3.4 · Harnesses

<div align="center">
<img src="../../assets/readme/screenshot-harnesses.webp#gh-light-mode-only" alt="A finished SOP question sweep with three of three items traced" width="860">
<img src="../../assets/readme/screenshot-harnesses-dark.webp#gh-dark-mode-only" alt="A finished SOP question sweep with three of three items traced" width="860">
</div>

A harness runs **one job over many items**. Each item is an ordinary, fully governed run, and the job ends in one hashed report. The idea is explained in [2.8 Skills and harnesses](../02-concepts/08-skills-harnesses.md).

## The library

Open **Harnesses** (<kbd>G</kbd> then <kbd>H</kbd>). The library lists the three built-in harnesses with what each asks for, and your recent harness runs with their status.

| Harness | You provide | Each item is | You get |
|---|---|---|---|
| **SOP question sweep** | Up to 25 questions, one per line; optional standing context (e.g. *Vessel V-2104, crude overhead knock-out drum*) | One question | An answer matrix |
| **Requirements register** | A department; an optional document filter | One indexed section of that department's procedures | A cited register of what each section requires |
| **Obligation coverage check** | Up to 25 external obligations, one per line; their source reference | One obligation, checked against the corpus | Which obligations the procedures cover, and where |

## Configure and preview

Choose a harness. The configure screen shows each input with its help text and limits. Fill them in and click **Preview**.

The preview shows **exactly the items the job will run**, as they will be asked, and the SHA-256 of the harness definition you are previewing. Untick any item you do not want.

> [!IMPORTANT]
> The start request carries the items you approved and the definition hash you saw. If the definition has been edited since your preview, or no longer produces one of those items, the start is **refused** rather than silently running something else.

## Watching the run

Items run one after another through the ordinary queue, so a harness never jumps ahead of other people's runs. The run view shows:

- a progress count (*3 / 3 settled*) and a strip with one square per item;
- the **answer matrix**, one row per item: the question, its outcome, how many of its material claims were traced (for example *1/1*), its time, and a link to the full run;
- live updates from `harness.child` events as each item finishes.

Held, refused and failed items are counted and shown as such. They are never folded into the answers.

Click **Run again with these inputs** to start a fresh job with the same inputs. A running job can be **cancelled**: the item in progress finishes or stops, and the rest are not started.

## The report

When every item has settled, a report is written in two formats, named after the harness, the run and the version:

| File | For |
|---|---|
| `sop-question-sweep-d05f3f1c-v1.md` | People: the matrix, citations and untraced claims, readable anywhere |
| `sop-question-sweep-d05f3f1c-v1.json` | Machines: every child's outcome, checks and citations, the scope and exclusions |

Each file's SHA-256 is recorded, and the report panel shows it. A download is **served only if the file still matches its recorded hash**, so a report edited on disk is refused rather than handed out.

The report records who ran the job, when it was written, and the **highest classification** found among the children and their evidence. If a child's run was later approved or rejected, **regenerate** the report to write a new version from the child records as they stand now. Versions are kept, never overwritten.

## When the report is held

If the harness's rules require sign-off, for example because the job produced material a person must release, the report waits for a reviewer. A reviewer (`approval.decide`) approves or rejects it from the run view, and the decision is audited like any other approval.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 3.3 · Skills](03-skills.md) | [↑ 03 · Using the workbench](README.md) | [3.5 · Approvals →](05-approvals.md) |

<!-- nav:end -->
