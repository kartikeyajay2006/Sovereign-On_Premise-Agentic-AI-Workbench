# 10.1 · `config/app.yaml`

Every value here can be overridden by an environment variable: `SOVEREIGN_` + the path in capitals, with `__` between levels. See [10.7](07-environment.md).

## `app`

| Key | Default | | Meaning |
|---|---|:--:|---|
| `name` | Sovereign On-Premise Agentic AI Workbench | ✅ | The API title, and the name in audit records |
| `environment` | `on_premise` | ⚠️ | Not read |
| `api_host`, `api_port` | `0.0.0.0`, `8000` | ⚠️ | Not read. The bind address and port come from the Uvicorn command line (`--host 127.0.0.1 --port 8000`) |
| `cors_origins` | `http://localhost:3000`, `http://127.0.0.1:3000` | ✅ | Origins allowed to call the API directly. The console uses a same-origin proxy, so this matters only for other clients |

## `storage`

| Key | Default | | Meaning |
|---|---|:--:|---|
| `root` | `storage` | ✅ | The storage root. Path confinement checks against it |
| `uploads`, `deliverables`, `index`, `logs`, `workspaces` | `storage/…` | ✅ | Subdirectories, created at startup |
| `database` | `storage/workbench.db` | ✅ | The SQLite file |
| `max_upload_bytes` | `52428800` (50 MB) | ✅ | Largest upload |
| `allowed_upload_extensions` | `.txt .md .log .pdf .docx .doc .xlsx .xls .csv .pptx .png .jpg .jpeg .webp .bmp .tiff .tif .py .js .ts .json .yaml .yml` | ✅ | Uploads with any other extension are refused |

## `inference`

| Key | Default | | Meaning |
|---|---|:--:|---|
| `provider` | `ollama` | ✅ | Recorded in the boot audit and status |
| `base_url` | `http://127.0.0.1:11434` | ✅ | Must be loopback, or every model call fails with HTTP 503 |
| `request_timeout_seconds` | `600` | ✅ | Longest a single model call may take |
| `connect_timeout_seconds` | `10` | ✅ | |
| `keep_alive` | `30m` | ✅ | How long the runtime keeps a model after its last use. See [5.3](../05-models-and-routing/03-residency.md#keep-alive) |
| `prewarm` | `true` | ✅ | Load the everyday model at startup |
| `max_context_tokens` | `8192` | ✅ | Cap on the context window sent, and in the memory estimate |
| `max_image_edge_px` | `1100` | ✅ | Images are downscaled so their long edge fits |
| `registry_refresh_seconds` | `30` | ✅ | How long model availability is cached |
| `max_concurrent_requests` | `2` | ⚠️ | Not read. The single task worker already serialises runs |
| `single_model_residency` | `true` | ✅ | One generation model in memory at a time |
| `memory_headroom_mb` | `1536` | ✅ | Free memory to keep beyond a model's footprint |

## `knowledge_base`

| Key | Default | | Meaning |
|---|---|:--:|---|
| `chunk_size_chars` | `1200` | ✅ | Longest passage |
| `chunk_overlap_chars` | `180` | ✅ | Overlap between parts of a long section |
| `min_chunk_chars` | `120` | ✅ | Shorter pieces are dropped |
| `embedding_model_role` | `embedding` | ⚠️ | Not read; the embedding model is found by its registry role |
| `lexical_fallback_enabled` | `true` | ✅ | Use BM25 when no embedding model is installed |
| `default_top_k` | `6` | ✅ | Passages returned per search |
| `min_score` | `0.15` | ✅ | Floor below which a passage is left out of a ranking, on that ranker's own scale |
| `rrf_k` | `60` | ✅ | Reciprocal Rank Fusion constant: each ranking contributes `1 / (rrf_k + rank)` |
| `supported_ingest_extensions` | `.txt .md .pdf .docx .csv .xlsx` | ⚠️ | Not read; the parsers decide what can be ingested |

## `sandbox`

| Key | Default | | Meaning |
|---|---|:--:|---|
| `enabled` | `true` | ✅ | When false, no code runs |
| `runtime` | `subprocess` | ✅ | `subprocess`, `podman` or `docker`. A container runtime is used only when its binary exists and the startup probe proves isolation holds; see [9.3](../09-security/03-sandbox.md#the-container-runtime). Any other value is reported as *config requests '…', not implemented* |
| `timeout_seconds` | `45` | ✅ | Wall-clock limit |
| `max_memory_mb` | `1024` | ✅ | Address space (Linux), resident memory (macOS watchdog), or committed memory (Windows Job Object) |
| `max_cpu_seconds` | `30` | ✅ | CPU time |
| `max_output_bytes` | `262144` | ✅ | stdout/stderr captured |
| `max_written_file_bytes` | `26214400` | ✅ | Largest file the code may write |
| `process_headroom` | `64` | ✅ | Processes allowed above the user's current count |
| `network_enabled` | `false` | ✅ | Reported on the Sandbox screen. The shim blocks sockets regardless |
| `container_image` | `localhost/aegis-sandbox:1` | ✅ | Built by `infrastructure/sandbox/build.sh`. Never pulled: a missing image fails the probe |
| `container_fallback` | `subprocess` | ✅ | When the container runtime fails its probe: `subprocess` (labelled fallback) or `refuse`. Any other value means `refuse` |
| `container_require_rootless` | `true` | ✅ | A runtime that is not rootless (or cannot say) fails the probe |
| `container_cpus`, `container_pids_limit`, `container_tmpfs_mb` | `1.0`, `64`, `64` | ✅ | `--cpus`, `--pids-limit`, size of the `noexec` `/tmp` tmpfs |
| `container_probe_timeout_seconds` | `90` | ✅ | Wall limit for the probe container |
| `denied_imports` | 19 modules | ✅ | See [9.3](../09-security/03-sandbox.md#layer-1--static-validation) |
| `denied_calls` | 12 names | ✅ | Including `open_host` |
| `denied_attributes` | 5 dunders | ✅ | |
| `allowed_imports` | 27 modules | ✅ | Only these may be imported |

## `agent`

| Key | Default | | Meaning |
|---|---|:--:|---|
| `default_step_budget` | `8` | ✅ | Step budget when the complexity class has none |
| `max_step_budget` | `20` | ✅ | Cap on any step budget |
| `max_replans` | `2` | ⚠️ | Not read. Code retries use `verification.max_replans` in `policies/approval-rules.yaml` |
| `template_plan_min_confidence` | `0.6` | ✅ | When a run needs a plan, it is taken from the task shape (no model call) if code is already required, or if the classification is at least this confident and no CSV/XLSX is attached ([7.3](../07-agents/03-planning-prompts.md#who-makes-the-plan)). Above 1.0 always asks the model |
| `step_timeout_seconds` | `600` | ⚠️ | Not read; model calls are bounded by `inference.request_timeout_seconds` |
| `stream_tokens` | `true` | ⚠️ | Not read; answers always stream |

## `vision_cache`

| Key | Default | | Meaning |
|---|---|:--:|---|
| `enabled` | `true` | ✅ | Reuse a vision reading of the same image by the same model weights with the same prompt ([6.2](../06-knowledge-and-retrieval/02-parsing-and-vision.md#the-vision-cache)). Tests run with it off (`SOVEREIGN_VISION_CACHE__ENABLED=false` in `tests/conftest.py`) |
| `path` | `vision-cache` | ✅ | Where entries are kept. A relative path is under `storage.root`, so the default is `storage/vision-cache` |

## `sovereignty`

| Key | Default | | Meaning |
|---|---|:--:|---|
| `monitor_enabled` | `true` | ✅ | Run the egress monitor |
| `poll_interval_seconds` | `2` | ✅ | Sampling interval |
| `allowed_cidrs` | `127.0.0.0/8`, `::1/128` | ✅ | Remote addresses that count as local |
| `known_local_ports` | `8000, 3000, 11434, 5432, 6379` | ⚠️ | Not read |
| `violation_action` | `record_and_alert` | ⚠️ | Not read; violations are always recorded and published |
| `firewall.enabled` | `true` | ✅ | Read the nftables egress table back into the status |
| `firewall.family`, `firewall.table` | `inet`, `aegis_egress` | ✅ | The table `infrastructure/firewall/aegis.nft` loads |
| `firewall.nft_command` | `[nft]` | ✅ | Reading needs CAP_NET_ADMIN; `[sudo, -n, /usr/sbin/nft]` with `infrastructure/firewall/aegis-nft-read.sudoers` for an unprivileged service account |
| `firewall.poll_interval_seconds`, `firewall.timeout_seconds` | `10`, `5` | ✅ | How often the counters are read, and how long `nft` may take |

## `audit`

| Key | Default | | Meaning |
|---|---|:--:|---|
| `enabled` | `true` | ✅ | Keep it on |
| `log_file` | `storage/logs/audit.jsonl` | ✅ | |
| `hash_algorithm` | `sha256` | ✅ | Any `hashlib` name; the browser check assumes SHA-256 |
| `verify_on_startup` | `true` | ✅ | Verify the chain at every start |

## `security`

| Key | Default | | Meaning |
|---|---|:--:|---|
| `session_ttl_minutes` | `720` | ✅ | Session lifetime (12 h) |
| `password_hash_rounds` | `12` | ✅ | × 10,000 PBKDF2 iterations (120,000) |
| `self_registration_enabled` | `true` | ✅ | Allow `POST /api/auth/register`. **Set false outside a demo machine** |
| `self_registration_default_role` | `operator` | ✅ | Role given to self-registered accounts |
| `self_registration_default_department` | `operations` | ✅ | Their department, if none is given |
| `secret_key` | `""` | ⚠️ | Not read; sessions are random tokens stored in the database |
| `seed_user_password` | `workbench` | ✅ | Password given to a seed account when it is created: on first start, and for any declared seed account that does not exist yet (the Head of Inspection and Plant Manager on an older install). **Change before first start** |

## `demo`

| Key | Default | | Meaning |
|---|---|:--:|---|
| `enabled` | `true` | ✅ | Serve the sample files the console's golden-demo cards attach (`GET /api/samples`). **Set false on a production install** |
| `samples` | four ids | ✅ | Id → path of each sample, under `sample_data/` only; a path outside it is never served ([11.2](../11-api/02-files-tasks.md#sample-files)) |

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 10 · Configuration reference](README.md) | [↑ 10 · Configuration reference](README.md) | [10.2 · `config/models.yaml` →](02-models-yaml.md) |

<!-- nav:end -->
