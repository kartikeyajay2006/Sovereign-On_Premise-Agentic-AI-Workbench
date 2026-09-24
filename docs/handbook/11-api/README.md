# 11 · API reference

> Everything the console does, you can do with `curl`.

The API is FastAPI on `http://127.0.0.1:8000`. Every route is under `/api`, except the root status. Interactive OpenAPI documentation is served by the API itself at **`/docs`**, and the schema at `/openapi.json`.

| Page | Endpoints |
|---|---|
| [11.1 Authentication and system](01-auth-system.md) | Sign-in, sessions, status, health, models, routing, policies, tools |
| [11.2 Files and tasks](02-files-tasks.md) | Uploads, creating and reading runs, cancelling |
| [11.3 Approvals and deliverables](03-approvals-deliverables.md) | The review queue, decisions, downloads |
| [11.4 Skills and harnesses](04-skills-harnesses.md) | Skills; harness catalogue, preview, runs, reports |
| [11.5 Knowledge, sandbox, audit and sovereignty](05-knowledge-sandbox-audit.md) | Documents, search, ingestion; sandbox; audit; egress |
| [11.6 The event stream and a worked session](06-events-session.md) | `/api/events`, and an end-to-end script |

## Authentication

Sign in once and send the token on every request:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"engineer","password":"workbench"}' | jq -r .token)

curl -s http://127.0.0.1:8000/api/auth/me -H "Authorization: Bearer $TOKEN"
```

The API also accepts the `workbench_session` cookie it sets at sign-in, which is how the browser's event stream authenticates.

## Conventions

| Convention | Detail |
|---|---|
| Bodies | JSON, except uploads (`multipart/form-data`) |
| Times | ISO 8601, UTC |
| IDs | UUIDs for tasks, files, users, harness runs; the command name for skills |
| Long work | `POST /api/tasks` and `POST /api/harness-runs` answer **202 Accepted** at once; follow progress with `GET` or the event stream |
| Permissions | Each endpoint names its permission below. A missing permission is **403**, and the denial is audited |

## Errors

| Status | Meaning |
|---|---|
| 400 | Invalid input, with a sentence saying what (*the only placeholder a skill may use is {input}*) |
| 401 | No valid session |
| 403 | Signed in, but not permitted, or not entitled to this record |
| 404 | No such record, or one you may not know exists |
| 409 | Conflict (a skill with that name exists; a harness run still in progress) |
| 410 | A deliverable is recorded but its file is gone from storage |
| 503 | The inference endpoint is not loopback, and was refused |

Errors are JSON: `{"detail": "…"}`.

## Unauthenticated endpoints

| Endpoint | Returns |
|---|---|
| `GET /` | `{name, status, sovereign, external_calls, monitor_active, monitored_since, docs, checked_at}` |
| `GET /api/status` | Containment status for the sign-in page |
| `GET /api/auth/directory` | The user list, for the demo account cards |
| `POST /api/auth/login`, `POST /api/auth/register` | Sessions |

> [!WARNING]
> `GET /api/auth/directory` returns **every** account's username, display name, role and department, not only the seeded demo accounts, and needs no sign-in. On a shared network that is user enumeration. See [9.6](../09-security/06-threat-model.md).

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 10.7 · Environment variables](../10-configuration/07-environment.md) | [↑ The AEGIS Handbook](../README.md) | [11.1 · Authentication and system →](01-auth-system.md) |

<!-- nav:end -->
