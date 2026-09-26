# 3.4 · Harnesses

<div align="center">
<img src="../../assets/readme/screenshot-harnesses.webp#gh-light-mode-only" alt="A finished SOP question sweep with three of three items traced" width="860">
<img src="../../assets/readme/screenshot-harnesses-dark.webp#gh-dark-mode-only" alt="A finished SOP question sweep with three of three items traced" width="860">
</div>

A harness runs **one job over many items**. Each item is an ordinary, fully governed run, and the job ends in one hashed report. The idea is explained in [2.8 Skills and harnesses](../02-concepts/08-skills-harnesses.md).

## The library

Open **Harnesses** (<kbd>G</kbd> then <kbd>H</kbd>). The library shows the three built-in harnesses as numbered tiles, each with what it asks for, and below them your recent harness runs with their status. <kbd>J</kbd> / <kbd>K</kbd> or the arrow keys move between tiles; <kbd>Enter</kbd> opens one.

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

## Watching the run: Harness Control

Items run **one after another** through the ordinary queue, so a harness never jumps ahead of other people's runs. The header says so: **SERIAL · 1 WORKER**, next to the run id, the elapsed time on the server's clock and the SHA-256 of the definition it ran. Harness Control never shows two items running at once, because two never do.

| Pane | What it shows | Where it comes from |
|---|---|---|
| **Run rail** | One square per item: hollow before it runs, a lime outline for the one the worker is on, then ok, amber (held, or delivered with claims untraced) or red (refused, rejected, failed). Below it, *settled 3/25 · supported 2 · partial 1*. | Each item's outcome, from its run's record |
| **Stage lanes** | The selected item's stages as lanes on one time axis: CLASSIFY, PLAN, RETRIEVE, REASON, VERIFY, POLICY. Bars are stages, thin lines are model calls, outlined blocks are tool calls; each lane shows the model it used and its tokens per second. RETRIEVE scans while retrieval is running, and REASON shows the tail of the draft as it streams. | The item's own `task.*` events while it runs, and its task record once it has settled. Every position is a timestamp the backend wrote; nothing is interpolated. |
| **Evidence graph** | Documents, sections, claims and items in four columns, joined where a claim's evidence names a passage. Brackets lock onto a section when the claims resting on it were supported (amber when only some were); each section shows its retrieval score. | The verifier's claims on each **released** item. A held item's claims are not shown. |
| **Answer matrix** | One row per item: outcome, claims traced over claims, time, the first passage it cites, and a square per verification check. Enter opens the full detail under the row. | The run record |
| **Report / seal** | The report files and their hashes, classification, sign-off and anything changed since. When the report is released it is **sealed** with the audit chain head recorded when it was written. | The report record and the `harness.report_written` event |

A settled item replays from its record, so opening a finished run shows each item's lanes as they ran. Records written before stage marks were kept replay their model and tool calls only, and say so.

### Keyboard

| Key | Does |
|---|---|
| <kbd>j</kbd> / <kbd>k</kbd>, <kbd>1</kbd>–<kbd>9</kbd> | Pick an item |
| <kbd>h</kbd> / <kbd>l</kbd> | Move between lanes; the line under the lanes lists the focused lane's measured spans |
| <kbd>Enter</kbd> | Open the item in the matrix |
| <kbd>o</kbd> | Open the item's run in the thread |
| <kbd>g</kbd> / <kbd>m</kbd> | Focus the graph / the matrix |
| <kbd>.</kbd> | Follow the item the worker is on |
| <kbd>[</kbd> / <kbd>]</kbd> | Step back and forward through the item's recorded events |
| <kbd>?</kbd> / <kbd>Esc</kbd> | Help / close |

Motion on this screen marks something the backend did: a cell ticks when an item settles, a scan runs only while retrieval runs, an edge traces when a new claim lands, and the seal runs once when the report is released. Nothing a key does animates, and with reduced motion turned on every one of these becomes a short fade or a static mark.

Held, refused and failed items are counted and shown as such. They are never folded into the answers.

Click **Run again with these inputs** to start a fresh job with the same inputs. A running job can be **cancelled**: the item in progress finishes or stops, and the rest are not started.

## The report

When every item has settled, a report is written in two formats, named after the harness, the run and the version:

| File | For |
|---|---|
| `sop-question-sweep-d05f3f1c-v1.md` | People: the matrix, citations and untraced claims, readable anywhere |
| `sop-question-sweep-d05f3f1c-v1.json` | Machines: every child's outcome, checks and citations, the scope and exclusions |

Each file's SHA-256 is recorded, and the report panel shows it, together with the **audit chain head** (sequence and hash of the `report_generated` record) at the moment the version was written. A download is **served only if the file still matches its recorded hash**, so a report edited on disk is refused rather than handed out.

The report records who ran the job, when it was written, and the **highest classification** found among the children and their evidence. If a child's run was later approved or rejected, **regenerate** the report to write a new version from the child records as they stand now. Versions are kept, never overwritten.

## When the report is held

If the harness's rules require sign-off, for example because the job produced material a person must release, the report waits for a reviewer. A reviewer (`approval.decide`) approves or rejects it from the run view, and the decision is audited like any other approval.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 3.3 · Skills](03-skills.md) | [↑ 03 · Using the workbench](README.md) | [3.5 · Approvals →](05-approvals.md) |

<!-- nav:end -->
