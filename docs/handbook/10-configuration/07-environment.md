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

## Hardware-tier profiles: `SOVEREIGN_PROFILE`

`SOVEREIGN_PROFILE=<name>` selects `config/profiles/<name>.yaml`: `laptop-8gb`, `laptop-16gb`, `cpu-server` or `gpu-server`. A profile has two optional sections, `app` and `routing`, deep-merged onto `app.yaml` and `routing.yaml`:

- a mapping merges key by key, so a profile names only what it changes;
- a list or a value replaces the base's;
- `SOVEREIGN_*` variables are applied **after** the profile, so a variable still wins.

Order: `app.yaml` → profile → `SOVEREIGN_*` variables. Unset or empty means no profile and the base files unchanged. An unknown name, or one that looks like a path, stops the boot with the list of profiles. The chosen profile is printed at startup and recorded in the `system/startup` audit event.

| Setting | `laptop-8gb` | `laptop-16gb` | `cpu-server` | `gpu-server` |
|---|---|---|---|---|
| `inference.keep_alive` | 24h | 24h | 24h | 24h |
| `inference.single_model_residency` | true | false | false | false |
| `inference.memory_headroom_mb` | 1024 | 1536 | 4096 | 4096 |
| `inference.max_context_tokens` | 8192 | 8192 | 16384 | 16384 |
| text-stage `stage_context_tokens` | 5120 | 5120 | 8192 | 8192 |
| `stage_context_tokens.vision_extraction` | 8192 | 8192 | 8192 | 8192 |
| `stage_output_tokens.drafting` | 900 | 900 | 2000 | 2000 |
| `agent.worker_count` | 1 | 1 | 3 | 4 |
| `readiness.min_free_memory_mb` | 1024 | 2048 | 4096 | 4096 |

Start Ollama with the matching tier (`scripts/start-ollama.ps1 -Tier …` / `scripts/start-ollama.sh --tier …`), which sets the `OLLAMA_*` variables in the next section.

## Ollama's variables

Read by `ollama serve` when it starts, not by AEGIS. `scripts/start-ollama.*` sets them per tier; `scripts/warmup.py` prints the ones its own shell can see.

| Variable | `laptop-8gb` | `laptop-16gb` | `cpu-server` | `gpu-server` | Why |
|---|---|---|---|---|---|
| `OLLAMA_HOST` | 127.0.0.1:11434 | same | same | same | Loopback only; the API refuses any other inference endpoint |
| `OLLAMA_KEEP_ALIVE` | 24h | 24h | 24h | 24h | A reload costs 7–14 s on the laptop; a duration, not -1, so a model can still be evicted |
| `OLLAMA_MAX_LOADED_MODELS` | 2 | 3 | 4 | 3 | The 3B + Nomic on 8 GB; add the vision model with 16 GB |
| `OLLAMA_NUM_PARALLEL` | 1 | 1 | 3 | 4 | Matches `agent.worker_count`; each slot multiplies the KV cache |
| `OLLAMA_FLASH_ATTENTION` | – | – | 1 | 1 | Servers only |
| `OLLAMA_KV_CACHE_TYPE` | – | – | q8_0 | q8_0 | Halves the KV cache; servers only |

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
