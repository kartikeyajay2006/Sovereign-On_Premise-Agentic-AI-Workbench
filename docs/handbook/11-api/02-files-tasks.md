# 11.2 · Files and tasks

## Files

### `POST /api/files` · `file.upload`

`multipart/form-data` with a `file` field, and optionally `classification`.

```bash
curl -s -X POST http://127.0.0.1:8000/api/files -H "Authorization: Bearer $TOKEN" \
  -F file=@sample_data/inspection/scanned-inspection-report-V-2104.pdf
```

**201**:

```json
{
  "id": "40c91526-…", "filename": "scanned-inspection-report-V-2104.pdf",
  "media_type": "application/pdf", "size_bytes": 482113,
  "sha256": "bf1903d9…", "input_type": "pdf", "classification": "confidential",
  "owner_id": "…", "department": "inspection", "uploaded_at": "…"
}
```

Refused with **400** for a disallowed extension or a file over `storage.max_upload_bytes`.

| Method and path | Permission | Returns |
|---|---|---|
| `GET /api/files` | signed in | Your uploads |
| `GET /api/files/{id}/download` | owner, override role, or same department | The file, after the gateway's file-access and path-confinement checks |

### Sample files

| Method and path | Permission | Returns |
|---|---|---|
| `GET /api/samples` | `file.upload` | The demo's sample files by id, name and size; empty when `demo.enabled` is false |
| `GET /api/samples/{id}` | `file.upload` | The file's bytes, for one of the ids under `demo.samples`, only from `sample_data/` |

A sample is not stored by fetching it: the console uploads it through `POST /api/files`, so it is quarantined, scanned and classified like any other file.

## Tasks

### `POST /api/tasks` · `task.create`

```json
{
  "prompt": "internal inspection of a pressure vessel in corrosive service",
  "file_ids": [],
  "deliverable_format": "answer",
  "preferred_model": null,
  "skill_id": "clause"
}
```

| Field | Meaning |
|---|---|
| `prompt` | Required. With `skill_id`, the text that fills `{input}` |
| `file_ids` | Uploaded file IDs to attach |
| `deliverable_format` | `answer` (no document), `docx`, `xlsx`, `pptx` or `md`. Omit it and the analyzer decides from the wording |
| `preferred_model` | A registry ID. Advisory; see [5.2](../05-models-and-routing/02-router.md#step-6--a-preferred-model) |
| `skill_id` | A skill to render the request with |

**202**: the task, with `status: "received"` and its profile. The work continues in the background.

### `GET /api/tasks?limit=50`

Summaries of your runs, or everyone's with `task.read.all`: `id`, `prompt`, `status`, `task_type`, `sensitivity`, times.

### `GET /api/tasks/{id}`

The full task: `profile`, `routing`, `plan`, `evidence`, `tool_calls`, `answer`, `verification`, `approval`, `deliverables`, `usage`, `status`, `error`, `duration_ms`, `queue_position`, `skill`. **403** unless it is yours or you hold `task.read.all`.

### `POST /api/tasks/{id}/cancel`

Stops a queued or running task at its next safe point. **200** with the task.

## Polling a task to completion

```bash
ID=$(curl -s -X POST http://127.0.0.1:8000/api/tasks -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"prompt":"internal inspection of a pressure vessel in corrosive service","skill_id":"clause","deliverable_format":"answer"}' \
  | jq -r .id)

until curl -s http://127.0.0.1:8000/api/tasks/$ID -H "Authorization: Bearer $TOKEN" \
  | jq -e '.status | IN("delivered","awaiting_approval","rejected","failed","blocked","cancelled")' >/dev/null
do sleep 3; done

curl -s http://127.0.0.1:8000/api/tasks/$ID -H "Authorization: Bearer $TOKEN" \
  | jq '{status, answer, checks: [.verification.checks[] | {name, passed}]}'
```

```json
{
  "status": "delivered",
  "answer": "A pressure vessel in corrosive service shall receive an internal inspection at intervals not exceeding 48 months. [S1]",
  "checks": [
    {"name": "source_verification", "passed": true},
    {"name": "citation_verification", "passed": true},
    {"name": "page_citation_verification", "passed": true},
    {"name": "calculation_verification", "passed": true},
    {"name": "code_verification", "passed": true},
    {"name": "hallucination_check", "passed": true}
  ]
}
```

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 11.1 · Authentication and system](01-auth-system.md) | [↑ 11 · API reference](README.md) | [11.3 · Approvals and deliverables →](03-approvals-deliverables.md) |

<!-- nav:end -->
