# 11.1 · Authentication and system

## Sessions

### `POST /api/auth/login`

No authentication.

```json
{ "username": "engineer", "password": "workbench" }
```

**200**: a session, and the `workbench_session` cookie:

```json
{
  "token": "…",
  "user": {
    "id": "…", "username": "engineer", "display_name": "Integrity Engineer",
    "role": "engineer", "department": "inspection",
    "max_data_classification": "restricted", "permissions": ["task.create", "…"]
  },
  "issued_at": "…", "expires_at": "…"
}
```

**401** *That username and password do not match an account on this host.* Both outcomes are audited.

### `POST /api/auth/register`

No authentication; refused unless `security.self_registration_enabled`.

```json
{ "username": "a.kumar", "display_name": "A. Kumar", "password": "at-least-8-chars", "department": "operations" }
```

Usernames are lowercase: a letter, then 2–63 of letters, digits, `_`, `.` or `-`; or an e-mail address. Display names are 2–80 characters; passwords 8 or more. The account gets the `operator` role. **201** with a session; **400** with the reason.

### `POST /api/auth/logout`

Deletes the session. **204**.

### `GET /api/auth/me`

The signed-in user. **401** without a session.

### `GET /api/auth/directory`

No authentication. All users (see the warning in [11](README.md)).

## System

| Method and path | Auth | Returns |
|---|---|---|
| `GET /` | none | Headline status: `sovereign`, `external_calls`, `monitor_active`, … |
| `GET /api/status` | none | Containment status, readable before sign-in |
| `GET /api/health` | signed in | `inference_provider`, `inference_reachable`, `models_registered`, `models_available`, `knowledge_documents`, `knowledge_chunks`, `retrieval_mode`, `sandbox_runtime`, `sandbox_ready`, `audit_chain_valid`, `sovereignty_ok`, `uptime_seconds`, `checked_at` |
| `GET /api/models` | signed in | Every registered model with its state, role, capabilities and clearances |
| `GET /api/models/status` | signed in | Residency: what is loaded, loads, evictions, memory |
| `GET /api/routing/rules` | signed in | The rules, stage overrides and scoring from `routing.yaml` |
| `GET /api/policies` | signed in | Roles, approval rules, classification levels and tool permissions, as loaded |
| `GET /api/tools` | signed in | The tool catalogue: name, description, side effects, allowed roles, ceiling |

### Example: is this host ready?

```bash
curl -s http://127.0.0.1:8000/api/health -H "Authorization: Bearer $TOKEN" | jq
```

```json
{
  "api": true,
  "inference_provider": "ollama",
  "inference_reachable": true,
  "models_registered": 6,
  "models_available": 4,
  "knowledge_documents": 15,
  "knowledge_chunks": 207,
  "retrieval_mode": "hybrid",
  "sandbox_runtime": "subprocess",
  "sandbox_ready": true,
  "audit_chain_valid": true,
  "sovereignty_ok": true,
  "uptime_seconds": 5310.4,
  "checked_at": "…"
}
```

That is the checklist for a demonstration: runtime reachable, the models you need available, the corpus indexed with embeddings, the sandbox ready, the chain valid, egress zero.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 11 · API reference](README.md) | [↑ 11 · API reference](README.md) | [11.2 · Files and tasks →](02-files-tasks.md) |

<!-- nav:end -->
