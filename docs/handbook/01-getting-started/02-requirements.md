# 1.2 · Requirements

## Software

| Software | Version | Why |
|---|---|---|
| **Python** | 3.11 or newer | The API, the agent pipeline, the sandbox and the scripts |
| **Node.js** | 20 or newer (22 LTS works) | Building and serving the web console |
| **npm** | Comes with Node | Installing frontend packages |
| **Ollama** | Current release | The local model runtime, reached on `127.0.0.1:11434` |
| **Tesseract OCR** | Any recent | Optional. The fallback when the vision model returns nothing for a scanned page |
| **git** | Any | Cloning the repository |

The Python dependencies are pinned in `requirements.txt`: FastAPI 0.115, Uvicorn 0.34, Pydantic 2.10, httpx, psutil, pypdf, PyMuPDF, python-docx, openpyxl, python-pptx, Pillow, NumPy and pandas. The frontend uses Next.js 16, React 19, TypeScript 5.7 and Tailwind CSS 4, and has 66 packages in total.

## Operating systems

| OS | Status | Sandbox enforcement |
|---|---|---|
| **Linux** | Primary. `scripts/run.sh` is written for it | POSIX `setrlimit`: CPU, address space, file size, processes, core dumps |
| **macOS** | Supported | POSIX limits, with a resident-memory watchdog in place of the address-space limit |
| **Windows 10/11** | Supported; services started by hand | A kernel Job Object, probed on the host before any code may run |

## Hardware

AEGIS is designed to run on an ordinary workstation or laptop with **no GPU**. Everything is sized so that one generation model is in memory at a time (`inference.single_model_residency: true`).

| | Minimum | Comfortable | Notes |
|---|---|---|---|
| **CPU** | 4 cores, x86-64 or Apple silicon | 8+ cores | Inference speed on a CPU is roughly proportional to cores and memory bandwidth |
| **RAM** | 8 GB | 16 GB or more | A 3B model needs about 3 GB resident; the 8B model about 5–6 GB. The browser, the IDE and the OS need the rest |
| **Disk** | 15 GB free | 25 GB free | About 11 GB for the four core models, plus packages and storage |
| **GPU** | None | Any Ollama-supported GPU | Changes latency dramatically; nothing in the design depends on it |

> [!WARNING]
> Memory is the constraint that matters. If the host starts swapping, a model call that took seventy seconds can take twenty-five minutes, because the model's cache is being paged in and out. Close heavy applications before a demonstration, or shorten `inference.keep_alive` so idle models are released sooner. See [12.5 Performance tuning](../12-operations/05-performance.md).

### What to expect for latency

Measured on this repository's own runs, on CPU-only laptops:

| Run | Typical time | What dominates |
|---|---|---|
| A greeting ("thanks") | 1–8 s | One short model call, no retrieval |
| A cited procedure answer | 15–40 s | Drafting the answer |
| A calculation with generated code | 1–3 min | Writing the code, then drafting |
| A drafted approval note from a scanned report | 4–10 min | Reading each page with the vision model, then drafting the document |

The first call after a model has been evicted also pays its load time, typically 7–14 s for a 3B model. `inference.prewarm: true` loads the everyday model when the server starts so the first question does not pay it.

## Models

The model registry, `config/models.yaml`, declares six models. You do not need all of them.

| Model | Size on disk | Role | Needed for |
|---|---|---|---|
| `qwen2.5:3b` | 1.9 GB | Reasoning | **Everything.** The router prefers it on a CPU host |
| `nomic-embed-text` | 0.3 GB | Embedding | **Retrieval.** Without it retrieval falls back to lexical BM25, and seeding stops unless told otherwise |
| `qwen2.5vl:3b` | 3.2 GB | Vision | Scanned PDFs, photographs and drawings |
| `qwen3:8b` | 5.2 GB | Reasoning | Optional deeper reasoning where memory allows |
| `qwen2.5-coder:7b` | ≈4.7 GB | Coding | Optional dedicated coding model |
| `moondream` | ≈1.7 GB | Vision | Optional lightweight vision fallback |

A declared model that is not installed is shown as **unavailable** and never routed to. An installed model that is not declared is **unregistered** and refused by policy. [1.5 Install the models](05-models.md) covers this in detail.

## Network

AEGIS needs the network **only while you install it**: pip, npm and `ollama pull` all download. Once installed it makes no outbound connections, and the Assurance screen measures that continuously.

| Port | Service | Bound to |
|---|---|---|
| 8000 | API (Uvicorn) | `127.0.0.1` |
| 3000 | Web console (Next.js) | All interfaces by default; see the warning below |
| 11434 | Ollama | `127.0.0.1` |

> [!WARNING]
> `next start` listens on every interface by default, and the web console proxies `/api/*` to the API. That means the API is reachable from the network *through port 3000* even though Uvicorn itself is bound to loopback. On a shared network, start the console with `npx next start -H 127.0.0.1`, or firewall port 3000. See [9.6 Threat model](../09-security/06-threat-model.md).

## Next

Install on **[Linux or macOS](03-install-linux-macos.md)**, or on **[Windows](04-install-windows.md)**.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 1.1 · What AEGIS is](01-overview.md) | [↑ 01 · Getting started](README.md) | [1.3 · Install on Linux and macOS →](03-install-linux-macos.md) |

<!-- nav:end -->
