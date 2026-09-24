# 10.7 · Environment variables

## Overriding `app.yaml`

Any value in `config/app.yaml` can be overridden without editing the file:

```text
SOVEREIGN_<SECTION>__<KEY>[__<SUBKEY>…]=value
```

| Variable | Overrides |
|---|---|
| `SOVEREIGN_SANDBOX__TIMEOUT_SECONDS=60` | `sandbox.timeout_seconds` |
| `SOVEREIGN_INFERENCE__KEEP_ALIVE=10m` | `inference.keep_alive` |
| `SOVEREIGN_INFERENCE__PREWARM=false` | `inference.prewarm` |
| `SOVEREIGN_SECURITY__SEED_USER_PASSWORD=…` | `security.seed_user_password` |
| `SOVEREIGN_SECURITY__SELF_REGISTRATION_ENABLED=false` | `security.self_registration_enabled` |
| `SOVEREIGN_STORAGE__DATABASE=/srv/aegis/workbench.db` | `storage.database` |
| `SOVEREIGN_AUDIT__LOG_FILE=/srv/aegis/audit.jsonl` | `audit.log_file` |

Rules:

- The prefix is `SOVEREIGN_`; `__` (two underscores) separates levels; names are case-insensitive.
- Values are converted: `true`/`yes`/`on` → true; `false`/`no`/`off` → false; `null`/`none`/empty → null; integers and floats as numbers; a value starting with `[` or `{` is parsed as YAML (`SOVEREIGN_SOVEREIGNTY__ALLOWED_CIDRS='["127.0.0.0/8"]'`); anything else is a string.
- Overrides apply to **`app.yaml` only**, not to models, routing, classification, prompts or policies.
- They are read at startup.

The test suite uses exactly this mechanism to point every storage path at a temporary directory (`tests/conftest.py`).

## Other variables

| Variable | Read by | Meaning |
|---|---|---|
| `WORKBENCH_API_URL` | The console, **at build time** | Where Next.js proxies `/api/*`. Default `http://127.0.0.1:8000` |
| `API_PORT`, `WEB_PORT`, `LOG_DIR` | `scripts/run.sh` | Ports and log directory |
| `SOVEREIGN_SEED_USER_PASSWORD` | `infrastructure/docker-compose.yml` | Passed to the API container as `SOVEREIGN_SECURITY__SEED_USER_PASSWORD` |
| `SOVEREIGN_SANDBOX`, `SOVEREIGN_NETWORK_ATTEMPT_LOG` | Set **inside** the sandbox | Mark the child as sandboxed, and where it logs refused network attempts |
| `NODE_ENV` | Next.js | `development` adds `'unsafe-eval'` to the CSP for hot reload |

## `frontend/.env.local`

Copy `frontend/.env.example`. Only `WORKBENCH_API_URL` matters today.

> [!NOTE]
> `.env.example` still lists `NEXT_PUBLIC_FIREBASE_*` variables from an earlier version that offered Firebase sign-in as an option. That code has been removed; the workbench authenticates only against local accounts. The variables are ignored and can be deleted.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 10.6 · Policy files](06-policies.md) | [↑ 10 · Configuration reference](README.md) | [11 · API reference →](../11-api/README.md) |

<!-- nav:end -->
