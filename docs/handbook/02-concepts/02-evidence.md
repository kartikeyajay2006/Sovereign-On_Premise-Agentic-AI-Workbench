# 2.2 · Evidence and citations

The model is never asked to answer from memory. Everything it may rely on is first registered as a numbered **evidence item**, and the answer must cite those numbers.

## Evidence kinds

| Prefix | Kind | Where it comes from |
|---|---|---|
| **S** | `knowledge_base` | A passage retrieved from the indexed procedures and records |
| **F** | `uploaded_file` | Text read from a file attached to the run |
| **V** | `vision_extraction` | What the vision model (or OCR) read from an image or a scanned page |
| **C** | `computation` | The output of code executed in the sandbox, or a figure recomputed during verification |

IDs are unique across the whole run. They used to be assigned at each collection site, so two attachments both started at `F1` and became indistinguishable in the finished document. Now one **evidence ledger** per run hands out every ID: `S1…S6`, `V1…V4`, `C1…`, in the order the evidence arrived.

## What every evidence item knows

| Field | Example | Why it matters |
|---|---|---|
| `id` | `S1` | What a citation points at |
| `source_document` | `SOP-INS-014 Pressure Vessel External and Internal Inspection` | The document, by name |
| `location` | `§2.2` | The section or clause |
| `page_number` | `3` | For PDFs and scans: the exact page |
| `excerpt` | *A pressure vessel in corrosive service shall…* | The text the model was shown |
| `source_sha256` | `bf1903d9…` | The hash of the source file, so the excerpt can be tied to exact bytes |
| `classification` | `confidential` | The class of the source; the run's class rises to the highest of these |
| `department` | `inspection` | Used for department isolation |
| `version` | `4.3` | The document's revision |
| `score` | `0.716` | For retrieved passages: how well it matched |
| `extraction_method` / `extraction_model` | `vision` / `qwen2.5vl:3b` | For read evidence: how it was read, and by which model |

## Citations in an answer

The model writes citations in square brackets: `[S1]`, `[V2]`, `[S3] [S5]`. The Thread renders them as chips, and clicking one opens the exact excerpt with its document, section, page and hash.

A citation is only worth something if it is checked. Three checks guard them:

1. **Every cited ID must exist.** A citation to `[S9]` in a run that recorded only six passages is a fabricated source. *citation_verification* fails.
2. **Page citations must match their pages.** If an answer attributes a `[V…]` citation to page 4 but that evidence came from page 2, *page_citation_verification* fails.
3. **Material claims must be traceable.** A sentence carrying a number, a limit, a directive or a citation must share its figures or enough of its words with the evidence it cites. *source_verification* counts how many do.

## Visual evidence, page by page

A PDF is inspected page by page. Pages with a text layer are read directly. Pages without one, such as a scan or a photographed report, are rasterised and read by the vision model in batches of three. A page the vision model returns empty falls back to Tesseract OCR.

Every page becomes its own evidence item, with its own page number and the source file's hash. A finding on page 7 gets its own `V` number and records *page 7* and the file it came from. It is never an anonymous blob attributed to "the attachment".

## The ledger survives failure

Evidence is bound to the run as it is gathered, and saved at every stage. If a run fails at drafting, everything it read and retrieved before that is still on the run, so a failed run shows what it found rather than looking as if it found nothing.

## Related

- How passages are retrieved and filtered: [6.4 Retrieval and clearance](../06-knowledge-and-retrieval/04-retrieval-and-clearance.md)
- How pages are read: [6.2 Parsing, pages and vision](../06-knowledge-and-retrieval/02-parsing-and-vision.md)
- Exactly how claims are traced: [8.2 Material claims](../08-verification/02-claims.md)

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 2.1 · Runs](01-runs.md) | [↑ 02 · Core concepts](README.md) | [2.3 · Classification and clearance →](03-classification.md) |

<!-- nav:end -->
