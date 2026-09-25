# 3.11 · Drawings

> How do we isolate V-2104 for entry? The drawing answers, and marks the sheet.

A P&ID is held as a graph: equipment, valves, blinds, bleeds, off-plot boundaries and the numbered lines between them, with flow direction, and the instruments with what they measure and control. Questions a model would otherwise guess at are answered by walking it (`backend/engineering/pid.py`).

## The Drawings tab

**Knowledge → Drawings.** Choose a drawing, a question and an element (or click one on the sheet), and **Ask the drawing**.

| Question | Answer |
|---|---|
| **Isolation plan** for confined space entry, hot work or other maintenance | Every branch out of the element; its isolation elements; the method they make; whether that method is permitted for the work and the service; what to close and lock, which bleeds to open, which blinds to turn |
| **Upstream / downstream** | Everything reached following, or against, the flow, nearest first, with the line |
| **Path to…** | The shortest route along the flow, else any |
| **Instruments** | The instruments on the element |

On the sheet: valves to close and lock, and blinds to turn, in red; bleeds to open in amber; branches that cannot be isolated as drawn dashed red; equipment cut off by the isolation outlined amber; a path in green.

## The rules applied

From SOP-OPS-015 (Lockout/Tagout):

| Work | Accepted | Clause |
|---|---|---|
| Confined space entry, hot work | Positive isolation only: a blind or spade | 2.1 |
| Other work | Double block and bleed (two closed, locked valves with an open bleed between), or a blind | 2.2 |
| Any work, hydrocarbon, toxic, sour or steam service | Never a single valve | 2.3 |
| A relief path | Car-sealed-open valves need an isolation certificate | 6, and SOP-INS-025 Clause 5 |

Control, check and relief valves are never isolation points. The answer also names the equipment the isolation cuts off, the instruments on the isolated element, and the control loops lost, including a loop whose measurement and final element sit on either side of it (PT-2101 on the column acting on PV-2104 beyond the drum).

## In a run

Ask in the thread: *"How do we isolate V-2104 for confined space entry?"* The run walks the drawing, records the answer as **T evidence**, tells the model the result, and shows the **Isolation plan** card with the marked sheet. An isolation plan is held for sign-off (`isolation_plan`), and `topology_verification` requires the answer to name every branch: on the live run the model named one of five, and the other four, both non-isolable branches among them, were restored from the graph and marked as added.

## The demonstration drawing

`sample_data/pid/PID-2104-01-crude-overhead.json`, rev B: C-2101's overhead through the wash-water injection and condensers E-2105A/B to V-2104, with its vapour, relief, hydrocarbon and sour-water outlets, pumps P-2106A/B, and 49 elements. It is synthetic and consistent with the corpus (circuit P-2104-OVHD-01, PSV-2104A). Two of V-2104's five branches cannot be isolated for entry as drawn: the relief line has two car-sealed valves and no blind, and the water-boot drain has a single valve in sour-water service.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 3.10 · Keyboard and themes](10-keyboard.md) | [↑ 03 · Using the workbench](README.md) | [04 · Architecture →](../04-architecture/README.md) |

<!-- nav:end -->
