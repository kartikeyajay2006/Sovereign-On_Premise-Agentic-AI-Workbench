# 11.7 · Engineering, conflicts, drawings and proof

All routes take the bearer token from `POST /api/auth/login`.

## Formula registry

| Method | Route | Permission | Does |
|---|---|---|---|
| GET | `/api/engineering/formulas` | signed in | The versioned, clause-cited catalogue |
| POST | `/api/engineering/evaluate` | `task.create` | `{formula_id, inputs: {name: {value, evidence_id?, locator?}}, subject?}` → a calculation record: `calculated`, `cannot_calculate` (with `missing`) or `refused` (with `reason`), and its hashes |
| POST | `/api/engineering/assess` | `task.create` | `{text, source?}` → `{assessment, calculations}`, exactly as a run would assess that record |

```bash
curl -s -X POST http://127.0.0.1:8000/api/engineering/evaluate -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"formula_id":"integrity.remaining_life",
  "inputs":{"t_current":{"value":"9.4 mm"},"t_min":{"value":"6.0 mm"},"rate":{"value":"0.55 mm/yr"}}}'
```

## Conflicts and review

| Method | Route | Permission | Does |
|---|---|---|---|
| POST | `/api/tasks/{id}/conflicts/{cid}/resolve` | `approval.decide`, not the submitter | `{candidate: 0}` or `{value: "9.6 mm"}`, and `reason` (8+ characters) → the task, recomputed, with the H evidence |
| POST | `/api/tasks/{id}/approve` | `approval.decide` | `{decision: approve \| reject \| request_revision, comment, review_digest}`. A `review_digest` the run no longer has is refused; `request_revision` needs a comment; approve is refused while a high-impact conflict is open |

## Drawings

| Method | Route | Does |
|---|---|---|
| GET | `/api/pid` | Drawings this user is cleared for |
| GET | `/api/pid/{id}` | The graph: nodes (with coordinates) and edges |
| POST | `/api/pid/{id}/query` | `{kind: isolation \| upstream \| downstream \| path \| instruments, tag, to?, purpose: confined_space \| hot_work \| maintenance}` → the answer and its sentences |

## Proof

| Method | Route | Permission | Does |
|---|---|---|---|
| GET | `/api/proof/key` | signed in | `{algorithm, key_id, public_key}` |
| GET | `/api/tasks/{id}/certificate` | the submitter, or `task.read.all` | The run's signed certificate (issued on first request for runs that finished earlier) |
| POST | `/api/proof/verify` | signed in | A certificate as the body → each check, against this host's key, log and deliverables |
| GET | `/api/runs/{id}/proof` | the submitter, or `task.read.all` | Proof Mode: the run's ten links (request, classification, policy, model routing, evidence, formula, claim, verification, approval, signed certificate), each with `tone`, `summary`, `facts` and `entries`, or `empty` with the reason. The stored certificate is verified read-only; nothing is issued or audited |
| POST | `/api/runs/{id}/rerun` | `task.create`, and read access to the run | 202 and the new task, created through the same path as `POST /api/tasks` from the run's record (prompt or skill input, files, format, model choice), with `parent_task_id` set. 400 while the run is still in progress |
| GET | `/api/runs/compare?a=&b=` | read access to both runs | `{a, b, linked, changed, changes[], evidence}`: each `change` is `{group: Configuration \| Outcome, label, a, b, changed, note}`; a property a run did not record reads `not recorded` |
| GET | `/api/measurements` | signed in | Every dashboard metric: `status` `measured` (with `value`, `display`, `sample`, `verdict`) or `skipped` (with `reason`, no value), and its `source` (`kind`, `name`, `path`, `sha256`, `at`, `href`, `run_ids`). Runs figures cover all runs with `task.read.all`, your own otherwise (`scope`) |
| GET | `/api/measurements/reports/{name}` | signed in | A red-team report file from `storage/reports`, as written; only `red-team-<UTC>.json` names are served |
| POST | `/api/audit/seal` | `audit.read.all` | Seal the log now; 409 if the chain is broken |
| GET | `/api/audit/seals` | `audit.read.all` | Every seal checked, and the chain |

Downloads (`GET /api/deliverables/{task}/{file}`) are re-hashed: 409 if the bytes changed, `X-Content-SHA256` when served. Uploads (`POST /api/files`) answer 400 with every quarantine reason ([9.7](../09-security/07-ingestion-guard.md)); sign-in answers 429 with `Retry-After` when throttled.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 11.6 · The event stream and a worked session](06-events-session.md) | [↑ 11 · API reference](README.md) | [12 · Operations →](../12-operations/README.md) |

<!-- nav:end -->
