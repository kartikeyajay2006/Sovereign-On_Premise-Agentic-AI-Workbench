# 6.3 · Chunking and embedding

## Chunking

Retrieval returns **passages**, not documents. `KnowledgeBase._chunk` turns each parsed segment into one or more passages, using three settings under `knowledge_base` in `config/app.yaml`:

| Setting | Default | Meaning |
|---|--:|---|
| `chunk_size_chars` | 1200 | The longest passage |
| `chunk_overlap_chars` | 180 | How much consecutive passages of one segment share |
| `min_chunk_chars` | 120 | Shorter pieces are dropped, unless the document has only one segment |

The algorithm:

```text
for each segment:
    if it fits in 1200 characters:
        keep it whole, as one passage, with the segment's location
    else:
        cut a 1200-character window
        move the cut back to the last paragraph break, line break or ". "
          in the second half of the window, if there is one
        keep the piece as "<location>, part N"
        start the next window 180 characters before the cut
```

Two things follow from this:

- **A section that fits is never split.** A numbered clause shorter than 1,200 characters is always one passage, so a citation to it points at the whole clause.
- **Long sections are split on natural boundaries**, and their parts overlap, so a sentence at a boundary is not lost from both.

On the demonstration corpus this produces **207 passages from 15 documents**.

## Embedding

Each passage is embedded by the installed embedding model (Nomic Embed Text: 768 dimensions) through the runtime's `/api/embed`, in the same process, over loopback. Vectors are stored as packed float32 BLOBs beside the text, with the name of the model that produced them.

| When | What is embedded |
|---|---|
| Ingestion | Every passage of the document |
| Retrieval | The query, once per search |

Embedding models are exempt from the residency manager's eviction: they are small, and retrieval needs one alongside whichever generation model is loaded.

## When there is no embedding model

If no embedding model is installed:

- ingestion stores passages **without vectors** (the seed script refuses unless `--allow-lexical`);
- retrieval uses **BM25**, a lexical ranker, over all passages;
- the Retrieval test and every run's transcript say `lexical`.

If you install an embedding model later, passages ingested without vectors are still found only lexically. Re-ingest them (re-run the seed script, or re-upload) to give them vectors.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 6.2 · Parsing, pages and vision](02-parsing-and-vision.md) | [↑ 06 · Knowledge and retrieval](README.md) | [6.4 · Retrieval and clearance →](04-retrieval-and-clearance.md) |

<!-- nav:end -->
