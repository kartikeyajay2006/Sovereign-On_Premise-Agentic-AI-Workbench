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

No authentication. The demonstration accounts seeded from `policies/access-control.yaml`, for the sign-in screen's *Demo accounts* list, and **only while `demo.enabled` is true**. Outside demo mode it returns `[]`, whatever rows the database holds.

## Accounts and provisioning

On a production host (`demo.enabled: false`) no account exists until someone makes a decision about it, and every decision is on the audit chain. There are four ways an account comes to exist: owner setup, an invitation, an approved access request, and (demo only) the seed. The logic is in `backend/core/accounts.py`; the routes in `backend/api/routes/accounts.py`. How and why is in [9.1](../09-security/01-access-control.md#how-accounts-come-to-exist).

**The unauthenticated doors** below redeem something an administrator issued, or ask an administrator for something. None grants access on its own. They are throttled like sign-in, on counters of their own: a client that tries ten wrong codes in five minutes is refused for five minutes (**429** with `Retry-After`), and that lockout does not touch sign-in. A wrong, used, expired or revoked code all get the same **400** sentence; the audit record says which.

**The administration routes** all need `users.manage` (the `administrator` role). Without it: **401** unsigned, **403** signed in, and the denial is audited as `policy / permission.users.manage:deny`.

### Owner setup

| Method and path | Auth | Body | Returns |
|---|---|---|---|
| `GET /api/setup/status` | none | | `{"needs_setup": true}`, and nothing else |
| `POST /api/setup/owner` | none (the token) | `{token, username, display_name, password}` | **201** a session, and the cookie |

`needs_setup` is true only when demo mode is off and no active account holds `users.manage`. In that state, each start of the service writes a fresh one-time token to `<storage.root>/setup-token` (mode `0600` where the OS honours it) and prints it on the console; it lapses after **24 hours**, and a restart issues a new one and retires the last. The database keeps only its SHA-256. `POST /api/setup/owner` creates one account in `identity.owner_role` (default `administrator`), department `general`, then deletes the token row and the file. **400** wrong or expired token; **409** the host already has an administrator.

```bash
TOKEN=$(cat storage/setup-token)
curl -s -X POST http://127.0.0.1:8000/api/setup/owner -H 'content-type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"username\":\"r.menon\",\"display_name\":\"R. Menon\",\"password\":\"a-long-passphrase\"}"
```

### Invitations

| Method and path | Auth | Body | Returns |
|---|---|---|---|
| `POST /api/admin/invites` | `users.manage` | `{role, department, display_name?, expires_hours=72}` | **201** `{invite, code, accept_path}` |
| `GET /api/admin/invites` | `users.manage` | | Every invitation, newest first, with `status`: `open`, `used`, `expired` or `revoked` |
| `DELETE /api/admin/invites/{id}` | `users.manage` | | The revoked invitation. **409** if it is not open |
| `POST /api/invites/accept` | none (the code) | `{code, username, password, display_name?}` | **201** a session, and the cookie |

The code looks like `AEGIS-7KQX-M4TD-9HWP`: twelve symbols from a 32-character alphabet without `0`, `O`, `1` or `I`, drawn from `secrets` (60 bits). It is in the creating response **once**; the database stores only its SHA-256. `accept_path` is `/invite#code=…`: the code rides in the fragment, which browsers never send to a server. Accepting is forgiving about case, spaces and dashes. The new account gets exactly the invitation's role and department; `display_name` falls back to the one the administrator entered. `expires_hours` is 1 to 720. The audit record `identity / invite_accepted` names who invited whom, with which role and department.

### Access requests

| Method and path | Auth | Body | Returns |
|---|---|---|---|
| `POST /api/access-requests` | none | `{username, display_name, requested_role, reason, password}` | **201** `{id, status: "pending", created_at, decided_at, reason}` |
| `GET /api/access-requests/{id}/status` | none (the id) | | `{id, status, created_at, decided_at, reason}`; `reason` only on a rejection |
| `GET /api/admin/access-requests` | `users.manage` | | Pending first (oldest first), then decided (newest first) |
| `POST /api/admin/access-requests/{id}/approve` | `users.manage` | `{role, department}` | The request, `status: "approved"` |
| `POST /api/admin/access-requests/{id}/reject` | `users.manage` | `{reason}` | The request, `status: "rejected"` |

A request creates the account at once, **inactive**, least-privileged, holding only the password's hash, so it cannot sign in. `requested_role` is a note for the administrator and is never granted: approval sets the role and department the administrator chooses, and activates the account. Rejection removes the inactive account (the name can be asked for again) and gives the requester the reason. Each submission counts against the client, accepted or not, as a sign-in failure would. **409** a request already decided; **404** an unknown id.

### Users

| Method and path | Auth | Returns |
|---|---|---|
| `GET /api/admin/users` | `users.manage` | Every account: `id, username, display_name, role, department, active, created_at, origin, provisioned_by, pending_request` |
| `POST /api/admin/users/{id}/deactivate` | `users.manage` | The account, inactive; its sessions are deleted at once |
| `POST /api/admin/users/{id}/activate` | `users.manage` | The account, active |
| `POST /api/admin/users/{id}/reset-password` | `users.manage` | `{user_id, username, code, accept_path, expires_at}`; body `{expires_hours=24}` optional, 1 to 168 |
| `POST /api/password-resets/accept` | none (the code) | `{code, password}` → a session; every other session of that account ends |
| `GET /api/admin/directory` | `users.manage` | `{enabled, configured: false, url, base_dn, detail}` |

`origin` is `seed`, `owner`, `invite`, `request` or `register`; accounts made before this was recorded show `null`. Reset codes look like `RESET-…`, follow the invitation rules (shown once, hashed, single use), and a new one retires any open earlier one for the same account. **409** for: deactivating yourself; deactivating the last active administrator; activating, deactivating or resetting an account that is waiting on an access request (decide the request); resetting an inactive account.

## System

| Method and path | Auth | Returns |
|---|---|---|
| `GET /` | none | Headline status: `sovereign`, `external_calls`, `monitor_active`, … |
| `GET /api/status` | none | Containment status, readable before sign-in |
| `GET /api/health` | signed in | `inference_provider`, `inference_reachable`, `models_registered`, `models_available`, `knowledge_documents`, `knowledge_chunks`, `retrieval_mode`, `sandbox_runtime`, `sandbox_ready`, `audit_chain_valid`, `sovereignty_ok`, `uptime_seconds`, `checked_at` |
| `GET /api/models` | signed in | Every registered model with its state, role, capabilities and clearances |
| `GET /api/models/status` | signed in | Residency: what is loaded, loads, evictions, memory |
| `GET /api/routing/rules` | signed in | The rules, stage overrides and scoring from `routing.yaml` |
| `GET /api/policies` | signed in | Roles, departments, approval rules, classification levels and tool permissions, as loaded |
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
