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

## Reading the drawing from its image

Attach the drawing itself (a PNG, JPEG or PDF of the sheet, named as a P&ID or drawing, or classified as one on upload) and ask the same question. The run reads the graph off the image instead of using the authored one (`backend/engineering/pid_extraction.py`):

1. The local vision model is shown the image, each page of a PDF separately, with the `task.pid_extract` prompt. It proposes every element it can see, with tag, type, label, bounding box and a confidence, and every line between them, with flow direction and line number.
2. **The proposal is untrusted and checked.**

   | Check | Outcome |
   |---|---|
   | Not a tag (`GV 2104 X`), or a type the graph does not know | Element rejected |
   | A line to an element that was not accepted, from an element to itself, or read twice | Line rejected (no dangling references) |
   | Tag prefix does not fit its type (`GV-2104-5` read as a pump) | Kept, **needs review** |
   | Tag on no authored drawing and not in the equipment register (`sample_data/datasets/inspection-history.csv`) | Kept, needs review |
   | Confidence below 0.80, or none given; no readable position; no line number | Kept, needs review |
   | An instrument measuring or controlling an element that is not there | Reference dropped, needs review |
   | An element joined to nothing | Needs review |

3. What survives is a drawing like any other, walked by **the same query code** as the authored graph. Every element and line keeps its source: the file and its SHA-256, the page, the bounding box, the model and its runtime digest, and the confidence. The confidence is the model's own statement, not a calibrated probability, and the answer says so.
4. If an authored graph of the same drawing exists (matched by the drawing number in the title block, else by at least half the tags shared), the two are **compared, not merged**: elements that agree, are missing, are extra or differ in type; lines that agree, are missing, extra, reversed or carry a different number. The same question is put to the authored graph, and the answer says whether it gives the same one, and if not, what differs.

The answer is **T evidence** read `vision_graph`, carrying the model, its digest, the elements needing review and the comparison. If it rests on an element marked needs review, it says **NEEDS REVIEW** and names them. If the image cannot be read as a graph (the model returns no JSON, or no model is eligible), the stage says so and the run falls back to the authored graph, which its evidence names.

## The demonstration drawing

`sample_data/pid/PID-2104-01-crude-overhead.json`, rev B: C-2101's overhead through the wash-water injection and condensers E-2105A/B to V-2104, with its vapour, relief, hydrocarbon and sour-water outlets, pumps P-2106A/B, and 49 elements. It is synthetic and consistent with the corpus (circuit P-2104-OVHD-01, PSV-2104A). Two of V-2104's five branches cannot be isolated for entry as drawn: the relief line has two car-sealed valves and no blind, and the water-boot drain has a single valve in sour-water service.

`sample_data/pid/PID-2104-01-crude-overhead.png` is the same drawing as an image, rendered from the graph by `python scripts/make_sample_pid_image.py` (deterministic; SYNTHETIC in its title block). Attach it to try the image path. What a live vision model reads from it has not been measured here: the tests use a fixed model reply, and the comparison with the authored graph is what shows how close a real reading comes.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 3.10 · Keyboard and themes](10-keyboard.md) | [↑ 03 · Using the workbench](README.md) | [04 · Architecture →](../04-architecture/README.md) |

<!-- nav:end -->
