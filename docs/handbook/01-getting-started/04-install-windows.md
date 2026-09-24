# 1.4 · Install on Windows

Windows is fully supported. The only differences from Linux are the paths, how you start the two services, and how the sandbox enforces its limits.

## 1. Install the prerequisites

| Software | Where to get it | Notes |
|---|---|---|
| Python 3.11+ | [python.org](https://www.python.org/downloads/windows/) | Tick **Add python.exe to PATH** |
| Node.js 22 LTS | [nodejs.org](https://nodejs.org) | npm is included |
| Git | [git-scm.com](https://git-scm.com) | |
| Ollama | [ollama.com/download](https://ollama.com/download) | Runs as a tray application on `127.0.0.1:11434` |
| Tesseract | The UB Mannheim installer | Optional OCR fallback. Add its folder to `PATH` |

## 2. Clone and create the environment

In PowerShell:

```powershell
git clone https://github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench.git
cd Sovereign-On_Premise-Agentic-AI-Workbench

python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

cd frontend
npm ci
cd ..
```

If PowerShell refuses to run the activation script, allow local scripts for your user once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## 3. The sandbox on Windows

POSIX resource limits do not exist on Windows. There, generated code runs inside a kernel **Job Object** that caps committed memory, CPU time and the number of active processes, and kills everything in the job when it closes. The job is assigned *before* the child process runs a single line of user code.

Before the workbench allows any code to run, it **probes** the host to prove that the Job Object really enforces a memory cap. If the probe fails, code execution is refused with an explanation rather than run without limits. The Sandbox screen shows which mechanism is in force.

The Windows sandbox tests (`tests/test_sandbox_windows.py`) run only on a Windows host where that probe passes; elsewhere they are skipped.

## 4. Pull the models and seed the corpus

```powershell
ollama pull qwen2.5:3b
ollama pull qwen2.5vl:3b
ollama pull nomic-embed-text

.\.venv\Scripts\python.exe scripts\seed_demo_data.py --check
.\.venv\Scripts\python.exe scripts\seed_demo_data.py
```

## 5. Start the two services

`scripts/run.sh` is a Bash script. On Windows, start the services yourself in two terminals.

**Terminal 1: the API**

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8000 --timeout-keep-alive 75
```

**Terminal 2: the web console**

```powershell
cd frontend
npm run build
npx next start -H 127.0.0.1
```

Open **http://127.0.0.1:3000**.

> [!TIP]
> `--timeout-keep-alive 75` matters. The console's proxy reuses idle connections, and Uvicorn closes an idle one after 5 seconds by default. A request sent down a connection as it closes fails as "socket hang up", which shows in the console as an error for a request the API never received. 75 seconds outlasts the proxy's reuse window.

## Next

**[Install the models](05-models.md)** in detail, or go straight to **[seeding and running](06-seed-and-run.md)**.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 1.3 · Install on Linux and macOS](03-install-linux-macos.md) | [↑ 01 · Getting started](README.md) | [1.5 · Install the models →](05-models.md) |

<!-- nav:end -->
