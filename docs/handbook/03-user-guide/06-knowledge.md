# 3.6 · Knowledge

<div align="center">
<img src="../../assets/readme/screenshot-knowledge.webp#gh-light-mode-only" alt="The Knowledge screen listing the indexed procedures" width="860">
<img src="../../assets/readme/screenshot-knowledge-dark.webp#gh-dark-mode-only" alt="The Knowledge screen listing the indexed procedures" width="860">
</div>

*What retrieval can cite, the models on this host, and a tester for retrieval itself.* Open it with <kbd>G</kbd> then <kbd>K</kbd>. The old addresses `/knowledge` and `/library` redirect here.

Four tabs, each remembered in the address (`/registry#retrieval`, `#models`, `#uploads`):

## Documents

Every indexed document **you are cleared to retrieve**, so different people see different lists. On the demonstration corpus `engineer` sees 12, `operator` 6 and `reviewer` 15.

| Column | Meaning |
|---|---|
| **Document** | Document code and title, then the source path and revision, e.g. `sample_data/sop/SOP-INS-014-pressure-vessel-inspection.md · v4.3` |
| **Department** | Which department owns it; *General* documents are visible to every department |
| **Class** | Normal, confidential, sensitive or restricted |
| **Chunks** | How many passages it was split into |
| **Size** | Source size |
| **Ingested** | When it was indexed |
| **SHA-256** | The first characters of the source file's hash |

### Adding a document

Requires `knowledge.ingest` (engineer, reviewer, administrator). Click **+ Ingest document** and give:

| Field | Values | Default |
|---|---|---|
| **Document** | A `.txt`, `.md`, `.pdf`, `.docx`, `.csv` or `.xlsx` file | |
| **Department** | Operations, Engineering, Inspection & Integrity, Quality Assurance, Finance, General | General |
| **Classification** | Normal, Confidential, Sensitive, Restricted | Confidential |
| **Version** | Free text | 1.0 |

The document is parsed, chunked, embedded with the local embedding model and stored. The ingestion is audited as `knowledge / document_ingested`.

> [!IMPORTANT]
> A document's identity is the hash of its file name and content. Ingesting the **same** file again re-indexes it in place. A **changed** file is a new document, and the older copy stays in the index, and can still be cited, until an administrator deletes it. (The seed script is stricter: it removes superseded copies by document code, including ones uploaded here.) Revision-aware retrieval that prefers the current version automatically is on the roadmap.

> [!TIP]
> Retrieval cites clauses, so write documents with one numbered requirement per clause and keep each clause under about 500 characters. [6.5 Writing a corpus](../06-knowledge-and-retrieval/05-corpus-authoring.md) explains why.

Deleting a document requires `knowledge.manage` (administrator).

## Retrieval test

Ask the index what a task would ask it, and see exactly what a run would be given. **Your clearance applies**: the tester returns only what you could retrieve in a real run.

| Control | Meaning |
|---|---|
| Query | e.g. *severity for cladding damage over 20%* |
| **Passages to return** | How many results, like a run's `top_k` (default 6) |

Results show:

| Readout | Meaning |
|---|---|
| **Mode** | `embedding` (semantic similarity) or `lexical` (the BM25 fallback), with what its scores mean |
| **Passages** | How many came back |
| **Service** | Time the API measured around the search, including embedding the query |
| **Round trip** | Time your browser measured: request, proxy, service and response |

Each result shows its rank, score, document, section, class and excerpt. A side list keeps this session's queries so you can compare them.

Use it to answer *why did the run cite that?* and *why did it not find this?* before blaming the model.

## Models

The model estate of this host: what the registry declares, what the runtime has installed, and what is loaded now.

| Readout | Meaning |
|---|---|
| **Endpoint**, **Provider**, **Runtime** | Where inference is reached (always loopback) and what serves it |
| **Host memory** | Free and total memory, which the router checks before loading a model |
| **In memory now** | The model currently resident, if any |
| **Loads · evictions** | How many times models were loaded and evicted since start |
| **Available to each routing role** | For reasoning, coding, vision and embedding: which models could serve it |

Each model row shows its display name, role, parameters, quantisation, context window, capabilities, the classifications it is **cleared for**, and whether it is **available**, **unavailable** (declared, not installed) or **unregistered** (installed, not declared, and refused).

## Formulas

The engineering formula registry: every formula with its version, the clause it implements, its expression, its inputs with units, and the hash of its source. These are the formulas that compute a run's figures before the model writes ([8.6](../08-verification/06-engineering.md)).

## Drawings

P&IDs held as graphs, and the questions they answer: isolation plans, flow, paths, instruments. See [3.11 · Drawings](11-drawings.md).

## Uploads

Files you have attached to runs: name, size, classification, when, and SHA-256. Uploads are always readable by their uploader. Other people can read them only under the department rules.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 3.5 · Approvals](05-approvals.md) | [↑ 03 · Using the workbench](README.md) | [3.7 · Assurance →](07-assurance.md) |

<!-- nav:end -->
