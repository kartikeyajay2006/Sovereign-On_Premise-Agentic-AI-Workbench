# 6.2 · Parsing, pages and vision

`backend/rag/parsing.py` turns a file into **segments**: pieces of text that each know where in the document they came from.

## Parsers by type

| Type | Parser | One segment per | Location label |
|---|---|---|---|
| `.md`, `.txt`, `.log` | Heading-aware text | Markdown heading section (or the whole file if there are none) | `section: <heading>` |
| `.pdf` | PyMuPDF / pypdf | Page with a text layer | `page <n>` |
| `.docx` | python-docx | Heading section; each table separately | `section: <heading>`, `table <n>` |
| `.xlsx` | openpyxl | Sheet, rows as text | `sheet '<name>'` |
| `.csv` | csv | Whole file | `whole file` |
| `.pptx` | python-pptx | Slide | `slide <n>` |
| images | none; read by vision | | |

The location is what a citation shows: **S1** SOP-INS-014 §2.2 comes from a Markdown section, **F3** `page 4` from a PDF.

## PDFs, page by page

A PDF is never treated as one blob. `inspect_pdf_pages` looks at every page:

| Page has | Is treated as | Read by |
|---|---|---|
| 120 or more characters of text | A text page | The PDF parser, directly |
| Fewer than 120 characters | A scanned page | The vision model, after rendering |

So a mixed PDF, with typed pages and a scanned appendix, has both halves read properly: text pages as `F` evidence, scanned pages as `V` evidence.

## Reading scanned pages

<div align="center">
<img src="../../assets/readme/flow-understand.svg" alt="The understand flow" width="90%">
</div>

1. **Render.** `rasterize_pdf` renders only the pages that need vision, with PyMuPDF, scaled so the long edge is **1,100 px**. Rendering is checked: if fewer pages render than were asked for, the run fails with that fact rather than silently reading fewer.
2. **Batch.** Pages are sent to the vision model **three at a time**. A 20-page scan is seven calls (3, 3, 3, 3, 3, 3, 2), not one enormous call or twenty small ones. `tests/test_visual_inputs.py` holds the batching.
3. **Read.** The vision prompt asks for a transcription and structured findings per page. The images are downscaled again if needed (`inference.max_image_edge_px`).
4. **Fall back.** If the model returns nothing for a page, **Tesseract** OCR reads it (`ocr_image`, only if the `tesseract` executable is installed). The evidence then records `extraction_method: ocr`, `extraction_model: tesseract` and an OCR confidence.
5. **Record.** Each page becomes one `V` evidence item: file name, document ID, page number, the transcription, how it was read, by which model, and the source file's SHA-256. A page neither vision nor OCR could read is recorded as *No legible content extracted from this page*, and the run's limitations say which page.

Standalone images (`.png`, `.jpg`, `.webp`, `.bmp`, `.tiff`, `.gif`) are read one per call, and their findings are recorded per location.

## The vision cache

`backend/agents/vision_cache.py`. Reading is the slowest stage, and a repeated demo re-read pages it had already read. The same image shown to the same weights with the same instructions is the same question, so the earlier answer is reused, and the reuse is on the record.

- **Key.** SHA-256 over the SHA-256 of every image in the call (the upload, or the page image rendered from a scan), the vision model's **runtime digest** (the weights, not the name), the prompt library's `prompts_version`, and the SHA-256 of the exact system prompt and prompt sent. Other weights, another prompt version or an edited template is a different key. The page prompt names the file, so the same scan under another file name is read again.
- **Never without a digest.** A model the runtime reports no digest for is never cached.
- **Re-checked before serving.** An entry is served only if the digest, prompt hashes and image hashes stored in it are the call's; an edited or unreadable entry is a miss.
- **Admitted like a model call.** A hit is routed and policy-checked for this run's classification, exactly as the call would have been; only the inference is skipped. A cache is never a way round model policy.
- **Audited.** A hit writes `model / vision_cache_hit` with the cache key, the model and digest, the image hashes, and when (and for which run) the reading was originally made. A fresh reading that is stored writes `model / vision_cache_stored`. The run certificate counts hits under the model that made the reading ([9.9](../09-security/09-proof.md#provenance)).
- **Same evidence, marked.** The evidence's `extraction_model` is the model that originally produced the reading; `extraction_data.vision_cache` carries `hit`, the key, `extracted_at` and the original run.
- **Retries ask the model.** A page whose reading fails validation is asked again with the cache bypassed, and the fresh reading replaces the entry.

Switched by `vision_cache.enabled` and kept under `vision_cache.path` ([10.1](../10-configuration/01-app-yaml.md#vision_cache)); entries are JSON files, one per key. Deleting the directory empties it. `tests/test_vision_cache.py` holds hit, miss, invalidation by digest and prompt, no-digest, edited entry, policy and retry behaviour.

## Why vision before planning

Visual inputs are read **before** the plan is made. On a host that holds one model at a time, planning first would load the reasoning model, evict it for vision, then load it again: a multi-gigabyte round trip. And a plan made after reading the report is a better plan.

## Where visual reading is limited

- **Cost scales with pages.** Reading is the most expensive path. On a CPU laptop, a three-page scan takes minutes.
- **Small vision models misread.** A 3B vision model can transpose digits in a table. That is why figures are recomputed and why deliverables are held.
- **No regions yet.** Evidence knows the page, not the **bounding box**, so a citation cannot highlight where on the page a value came from. Region-level provenance, and P&ID symbol and line extraction, are on the roadmap.
- **No file screening yet.** Uploaded files are checked by extension and size, not by magic bytes, archive structure or embedded macros.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 6.1 · Ingestion](01-ingestion.md) | [↑ 06 · Knowledge and retrieval](README.md) | [6.3 · Chunking and embedding →](03-chunking-embedding.md) |

<!-- nav:end -->
