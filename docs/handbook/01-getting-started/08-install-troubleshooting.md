# 1.8 · Installation troubleshooting

Problems you are likely to meet on a first install, what causes them, and the fix. Runtime problems (a run that fails, a slow model) are in [12.6 Runtime troubleshooting](../12-operations/06-troubleshooting.md).

## The run script

<details>
<summary><b>"Python environment missing. Run: python3 -m venv .venv …"</b></summary>

`run.sh` looks for `.venv/bin/python` in the repository root. Create the environment there, not elsewhere:

```bash
python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt
```
</details>

<details>
<summary><b>"Frontend dependencies missing. Run: cd frontend && npm install"</b></summary>

`frontend/node_modules` does not exist. Run `npm ci` (or `npm install`) inside `frontend/`.
</details>

<details>
<summary><b>"Ollama is not reachable on 11434"</b></summary>

The workbench will start, but every model call fails. Start the runtime:

```bash
ollama serve                 # Linux, in its own terminal or as a service
systemctl start ollama       # if it was installed as a systemd service
```

On macOS and Windows, start the Ollama application. Then check `curl http://127.0.0.1:11434/api/tags`.
</details>

<details>
<summary><b>"an API process is still running and would process jobs with stale code"</b></summary>

A previous API process survived the stop. Find and stop it:

```bash
pgrep -af "uvicorn backend.api.main"
kill <pid>
```

The script refuses to continue on purpose: two API processes share one job queue, and the stale one would execute tasks with old code.
</details>

<details>
<summary><b>"build failed — see storage/logs/build.log"</b></summary>

The last 25 lines of the build log are printed. The usual causes are a TypeScript error after editing frontend code (run `npx tsc --noEmit` in `frontend/` to see it) or running out of memory during the build. Close other applications and retry.
</details>

<details>
<summary><b>The script prints nothing after "Starting the web console" and never returns</b></summary>

When `run.sh` is itself run inside a pipe (`./scripts/run.sh | tail`), the pipe stays open because the background services inherit it. Run the script directly, or redirect its output to a file.
</details>

## Python

<details>
<summary><b><code>pip install</code> fails building PyMuPDF or NumPy</b></summary>

You are probably on a Python version that has no prebuilt wheel yet. Use Python 3.11 or 3.12 for the environment, even if the system default is newer:

```bash
python3.11 -m venv .venv
```
</details>

<details>
<summary><b>The tests fail with "address already in use" or touch my data</b></summary>

They should not do either. `tests/conftest.py` redirects every storage path, the database and the audit log into a temporary directory, and turns off model preloading, before anything loads. If a test writes to `storage/`, that is a bug. Please report it.
</details>

## Frontend

<details>
<summary><b>Pages load, but every API call fails with 500 "socket hang up"</b></summary>

The API was started without `--timeout-keep-alive 75`. The console's proxy reuses idle connections, and Uvicorn closes them after 5 seconds by default. Restart the API with the flag, or use `run.sh`, which sets it.
</details>

<details>
<summary><b>The console talks to the wrong API address</b></summary>

`WORKBENCH_API_URL` is read when the console is **built**, not when it starts. Set it, then rebuild:

```bash
cd frontend
WORKBENCH_API_URL=http://127.0.0.1:8100 npm run build
npx next start -H 127.0.0.1
```
</details>

<details>
<summary><b>The browser console shows a red 401 for <code>/api/auth/me</code> on the landing page</b></summary>

That is expected when you are not signed in: the page asks who you are, and the answer is "no one". It is harmless.
</details>

## Models and seeding

<details>
<summary><b>Seeding stops with "no embedding model"</b></summary>

Pull `nomic-embed-text` and rerun, or pass `--allow-lexical` to index for the BM25 fallback only. The script stops by default because passages indexed without vectors are invisible to embedding search.
</details>

<details>
<summary><b>The Knowledge screen shows "4/6 models available"</b></summary>

That is normal. The registry declares six models and you have installed four. Declared-but-missing models are shown as **unavailable** and never routed to.
</details>

<details>
<summary><b>A scanned PDF run ends "blocked"</b></summary>

No installed vision model is approved for that run's classification. Pull `qwen2.5vl:3b`. (Moondream alone is approved only up to *confidential*.)
</details>

<details>
<summary><b>Scanned pages come back empty</b></summary>

The vision model returned nothing, and Tesseract is not installed to fall back on. Install Tesseract (`dnf install tesseract`, `apt install tesseract-ocr`, `brew install tesseract`, or the UB Mannheim installer on Windows).
</details>

## Docker

`Dockerfile` builds the API image, with Tesseract included. `infrastructure/docker-compose.yml` describes three services: Ollama, the API sharing Ollama's network namespace so inference stays on `127.0.0.1`, and the frontend.

> [!WARNING]
> The compose file's `frontend` service builds `frontend/Dockerfile`, which is not in the repository yet, so `docker compose up` fails at that step. Build and run the API image on its own, and run the console on the host, until a frontend image is added. This is on the roadmap as *an offline deployment bundle, with a working frontend container*.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 1.7 · Your first hour](07-first-hour.md) | [↑ 01 · Getting started](README.md) | [02 · Core concepts →](../02-concepts/README.md) |

<!-- nav:end -->
