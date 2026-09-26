# 1.9 · Install on an air-gapped host

An air-gapped host cannot `pip install`, `npm ci` or `ollama pull`. `scripts/offline_bundle.py` gathers everything those would download into one directory on a connected machine, and installs it on the air-gapped one, after checking every byte.

## What a bundle holds

| Path | What it is | Made by |
|---|---|---|
| `source/aegis-source.tar` | The repository at `HEAD` | `git archive` |
| `wheels/` | A wheel for every package in `requirements.txt` | `pip download` |
| `npm-cache/` | The npm cache holding exactly `frontend/package-lock.json`'s packages | `npm ci --cache` |
| `models/` | Ollama's manifest and blobs for every model `config/models.yaml` pins with an `expected_digest` | copied from the Ollama store |
| `docker/images.tar` | The images the compose file names, when `docker` is on the build host | `docker save` |
| `offline_bundle.py`, `.sh`, `.ps1` | The installer itself | |
| `MANIFEST.json` | SHA-256 and size of every other file, the source commit, the build host, and what was not bundled | |

A model declared without an `expected_digest` (`qwen2.5-coder:7b`, `moondream:latest`) is optional and not bundled. A part that could not be bundled, such as the images on a build host without docker, is recorded in the manifest as *not bundled*, and the installer says so and skips it.

## 1. Build, on a connected machine

Use the same operating system, CPU architecture and Python minor version as the target: wheels and npm packages are platform-specific. Pull the pinned models first.

```bash
ollama pull qwen3:8b && ollama pull qwen2.5:3b && ollama pull qwen2.5vl:3b && ollama pull nomic-embed-text
.venv/bin/python scripts/offline_bundle.py build --out dist/aegis-offline
```

```powershell
./.venv/Scripts/python.exe scripts/offline_bundle.py build --out dist\aegis-offline
```

The build refuses a model whose installed manifest does not hash to its pin in `config/models.yaml`, so a bundle is never built from a model that has drifted. It ends by printing the SHA-256 of `MANIFEST.json`: write it down and carry it separately from the bundle, to check the manifest itself on arrival.

| Option | Use |
|---|---|
| `--pip-platform manylinux2014_x86_64 --python-version 3.11` | Wheels for a different target (binary wheels only) |
| `--ollama-models PATH` | The Ollama store, if not `$OLLAMA_MODELS` or `~/.ollama/models` |
| `--docker-image NAME` | Save these images instead of the compose file's (repeatable) |
| `--skip wheels frontend models docker` | Leave parts out; the manifest records them as not bundled |

The source is `HEAD`. Uncommitted changes are not in it, and the manifest records whether there were any.

## 2. Carry it across

Copy the whole directory. Nothing in it may be added, removed or edited: the installer refuses a file that is not in the manifest as firmly as one that is altered.

## 3. Verify and install, on the air-gapped host

The host needs Python 3.11+, Node.js 20+ and Ollama installed beforehand; the bundle carries packages, not runtimes.

```bash
cd /media/usb/aegis-offline
sha256sum MANIFEST.json                                   # compare with the value from step 1
./offline_bundle.sh verify                                # checks everything, installs nothing
./offline_bundle.sh install --target /opt/aegis
```

```powershell
cd E:\aegis-offline
Get-FileHash MANIFEST.json                                # compare with the value from step 1
.\offline_bundle.ps1 verify
.\offline_bundle.ps1 install --target C:\aegis
```

Before it writes anything, `install` checks that:

1. every file hashes to its entry in `MANIFEST.json`, and no file is missing or unlisted;
2. every bundled model's manifest hashes to the `expected_digest` pinned in the bundled source's `config/models.yaml`, and every blob it names hashes to its own name. A regenerated `MANIFEST.json` cannot hide a substituted model, because the pin is inside the source archive.

Any failure refuses the whole install and lists every problem. Only then does it unpack the source into the target (which must be new or empty), create `.venv` and install the wheels with `pip --no-index`, run `npm ci --offline` from the bundled cache and `next build`, copy the model files into Ollama's store (`--ollama-models`, default `$OLLAMA_MODELS` or `~/.ollama/models`), and `docker load` the images if docker is present.

Restart Ollama so it reads the new models, then `ollama list`. The workbench's model registry compares the same digests again at runtime (`backend/models_layer/registry.py`; [5.1](../05-models-and-routing/01-registry.md)). Then seed and run as in [1.6](06-seed-and-run.md). `--skip` takes the same parts as `build`.

## What it does not do

- It carries no runtimes: Python, Node.js, Ollama, docker and Tesseract are installed separately.
- The compose file's API and frontend images are built, not pulled, so they are not in `docker/images.tar` unless you build and name them with `--docker-image`.
- The manifest is not signed. Its hash, carried separately, is what ties it to the machine that built it.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 1.8 · Installation troubleshooting](08-install-troubleshooting.md) | [↑ 01 · Getting started](README.md) | [02 · Core concepts →](../02-concepts/README.md) |

<!-- nav:end -->
