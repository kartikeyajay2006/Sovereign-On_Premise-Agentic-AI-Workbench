# 06 · Knowledge and retrieval

> Raw document → traceable evidence.

<div align="center">
<img src="../../assets/readme/flow-understand.svg" alt="Documents are parsed or rasterised and read, normalised, chunked, embedded locally and stored as evidence units with provenance" width="100%">
</div>

Two things happen to documents in AEGIS.

- **Knowledge-base documents** (procedures, manuals, records) are **ingested** once: parsed, cut into passages, embedded and stored, so any later run can **retrieve** them.
- **Attachments** (a scanned report, a survey spreadsheet) are **read** within one run, page by page, and become that run's evidence.

Both end the same way: numbered evidence that knows its document, section, page, classification and source hash.

| Page | Covers |
|---|---|
| [6.1 Ingestion](01-ingestion.md) | How a document enters the knowledge base, and what is stored |
| [6.2 Parsing, pages and vision](02-parsing-and-vision.md) | Each file type's parser; per-page PDF inspection; rasterising; vision batches; OCR fallback |
| [6.3 Chunking and embedding](03-chunking-embedding.md) | How documents become passages and vectors |
| [6.4 Retrieval and clearance](04-retrieval-and-clearance.md) | Cosine search, BM25 fallback, and why clearance is applied before ranking |
| [6.5 Writing a corpus](05-corpus-authoring.md) | How to write documents that retrieve and cite well |

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 5.5 · Adding a model](../05-models-and-routing/05-adding-a-model.md) | [↑ The AEGIS Handbook](../README.md) | [6.1 · Ingestion →](01-ingestion.md) |

<!-- nav:end -->
