# 1.3 · Install on Linux and macOS

This page installs everything except the models, which have [their own page](05-models.md).

## 1. Install the prerequisites

<details open>
<summary><b>Fedora / RHEL</b></summary>

```bash
sudo dnf install python3.11 nodejs git tesseract
curl -fsSL https://ollama.com/install.sh | sh
```
</details>

<details>
<summary><b>Ubuntu / Debian</b></summary>

```bash
sudo apt update
sudo apt install python3.11 python3.11-venv nodejs npm git tesseract-ocr
curl -fsSL https://ollama.com/install.sh | sh
```

If your distribution ships a Node older than 20, install Node 22 from [nodejs.org](https://nodejs.org) or with a version manager such as `nvm`.
</details>

<details>
<summary><b>macOS</b></summary>

```bash
brew install python@3.11 node git tesseract
brew install --cask ollama
```

Start the Ollama app once so its server is listening on `127.0.0.1:11434`.
</details>

Check the versions:

```bash
python3.11 --version     # 3.11 or newer
node --version           # v20 or newer
ollama --version
curl -s http://127.0.0.1:11434/api/tags | head -c 200   # the runtime answers
```

## 2. Clone the repository

```bash
git clone https://github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench.git
cd Sovereign-On_Premise-Agentic-AI-Workbench
```

## 3. Create the Python environment

The run script expects the environment at `.venv` in the repository root.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip check                 # "No broken requirements found."
```

> [!NOTE]
> `.venv/` is in `.gitignore`. Nothing in the environment is committed.

## 4. Install the frontend packages

```bash
cd frontend
npm ci          # exact versions from package-lock.json; `npm install` also works
cd ..
```

`npm ci` runs a `postinstall` step, `next telemetry disable`, which turns off the anonymous usage telemetry Next.js otherwise sends on build. The product says nothing leaves the host, so the opt-out runs for every developer automatically. It is a local configuration write and works offline.

## 5. Optional: point the console at a different API

The web console never talks to the API directly from the browser. Next.js proxies every `/api/*` request to `WORKBENCH_API_URL`, which defaults to `http://127.0.0.1:8000`. To use another address:

```bash
cp frontend/.env.example frontend/.env.local
# edit WORKBENCH_API_URL in frontend/.env.local
```

> [!IMPORTANT]
> The proxy target is fixed **when the frontend is built**. Set `WORKBENCH_API_URL` before `npm run build`, and rebuild after changing it.

## 6. Verify the installation

Run the backend test suite. It uses a throwaway storage tree, so it never touches your database or audit log.

```bash
.venv/bin/python -m pytest -q
```

Expect about 435 tests: all passing, with the Windows Job Object tests skipped on Linux and macOS. Then type-check and build the console:

```bash
cd frontend
npx tsc --noEmit        # no output means no errors
npm run build           # 13 routes, prerendered
cd ..
```

## Next

**[Install the models](05-models.md)**.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 1.2 · Requirements](02-requirements.md) | [↑ 01 · Getting started](README.md) | [1.4 · Install on Windows →](04-install-windows.md) |

<!-- nav:end -->
