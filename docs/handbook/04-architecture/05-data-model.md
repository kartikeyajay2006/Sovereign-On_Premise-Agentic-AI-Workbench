# 4.5 · The data model

Everything AEGIS keeps lives under `storage/`, set by `storage.root` in `config/app.yaml`. Paths in configuration are resolved against the project root, never the current directory.

```text
storage/
├── workbench.db            SQLite database (WAL mode)
├── uploads/                attachments, as uploaded
├── deliverables/
│   ├── <task-id>/          DOCX / XLSX / PPTX / MD for each run
│   └── harness/<run-id>/   versioned harness reports (.md, .json)
├── workspaces/
│   ├── <task-id>/          per-run working directory: rendered pages, scripts
│   └── run-<id>/           per-execution sandbox directories
├── index/
│   └── staging/            documents being ingested
└── logs/
    ├── audit.jsonl         the hash-chained audit log
    ├── api.log, web.log, build.log   written by scripts/run.sh
```

Everything in `storage/` except the `.gitkeep` placeholders is ignored by git.

## SQLite tables

`backend/core/database.py` opens the database in **WAL** mode, so reads do not block the writer. The harness and skill registries add their own tables to the same file.

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `username` | TEXT UNIQUE | A lowercase name, or an e-mail address |
| `display_name` | TEXT | |
| `role` | TEXT | `operator`, `engineer`, `reviewer`, `auditor`, `administrator` |
| `department` | TEXT | One of the departments in `access-control.yaml` |
| `password_hash` | TEXT | `pbkdf2_sha256$<iterations>$<salt hex>$<digest hex>` |
| `active` | INTEGER | 1 or 0 |
| `created_at` | TEXT | ISO 8601 |

### `sessions`

| Column | Type | Notes |
|---|---|---|
| `token` | TEXT PK | The bearer token |
| `user_id` | TEXT FK → users | Cascades on delete |
| `issued_at`, `expires_at` | TEXT | 12-hour lifetime by default |

> [!WARNING]
> Session tokens are stored **as issued**, not hashed. Anyone who can read `workbench.db` can use a live session. Protect the file with operating-system permissions. Hashing tokens at rest is on the list of security fixes in [9.6 Threat model](../09-security/06-threat-model.md).

### `files`

| Column | Notes |
|---|---|
| `id`, `task_id`, `filename`, `stored_path`, `media_type`, `size_bytes` | What and where |
| `sha256` | The uploaded bytes' hash |
| `input_type` | From the extension: `pdf`, `image`, `spreadsheet`, … |
| `classification` | The file's class |
| `owner_id`, `department` | Who uploaded it; used by the file-access rules |
| `quarantine_passed`, `quarantine_notes` | Reserved for file-screening results. Every upload is recorded as passed today: magic-byte, archive and macro screening is on the roadmap |
| `uploaded_at` | |

### `tasks`

| Column | Notes |
|---|---|
| `id`, `user_id`, `department`, `prompt`, `status` | Indexed by user and by status |
| `payload` | The whole `Task` as JSON: profile, routing, plan, evidence, tool calls, answer, verification, approval, deliverables, usage |
| `created_at`, `updated_at`, `completed_at` | |

Storing the run as one JSON document keeps the record self-contained: what the model saw, what it said, what was checked and who decided are in one place, persisted at every stage.

### `knowledge_documents`

| Column | Notes |
|---|---|
| `id`, `title`, `source_path` | |
| `department`, `classification`, `version` | Read from the document's header when seeded |
| `sha256`, `media_type`, `size_bytes` | |
| `chunk_count`, `ingested_at` | |

### `knowledge_chunks`

| Column | Notes |
|---|---|
| `id`, `document_id` (FK, cascades), `ordinal` | |
| `location` | The section, page, sheet or slide, e.g. `section: 2.2`, `page 3`, `section: 5, part 2` |
| `content` | The passage text |
| `token_estimate` | |
| `embedding` | 768 float32 values packed as a BLOB, or NULL when indexed for lexical search only |
| `embedding_model` | Which model produced the vector |

### `skills` and `harness_runs`

| Table | Columns |
|---|---|
| `skills` | `id` (the command name), `payload` (the skill as JSON, with its author and hash), `created_at` |
| `harness_runs` | `id`, `harness_id`, `user_id`, `status`, `payload` (inputs, items, children, report versions), `created_at`, `updated_at`, `completed_at`. Indexed by user and status |

## The audit log

The audit log is **not** in the database. It is a separate append-only JSON-lines file, so that it can be verified, exported and archived on its own, and so that a database restore cannot quietly rewrite history. Its format is described in [2.6 The audit chain](../02-concepts/06-audit.md).

## Backups

Stop the API, then copy `storage/` as a whole. The database, the files it points to and the audit log must be restored together, or a run's record and its deliverable can disagree. A download of a deliverable whose file is missing says so plainly (*recorded for this task but no longer in deliverable storage*, HTTP 410) rather than pretending it was never there. See [12.4 Backup and restore](../12-operations/04-backup-restore.md).

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 4.4 · The frontend](04-frontend.md) | [↑ 04 · Architecture](README.md) | [4.6 · The live event stream →](06-events.md) |

<!-- nav:end -->
