#!/usr/bin/env python3
"""Build an offline installer bundle on a connected machine; install it on an air-gapped one.

    python scripts/offline_bundle.py build   --out dist/aegis-offline
    python scripts/offline_bundle.py verify  --bundle dist/aegis-offline
    python scripts/offline_bundle.py install --bundle /media/usb/aegis-offline --target /opt/aegis

An air-gapped host cannot pip install, npm install or ollama pull. `build`
gathers everything those would fetch into one directory:

    source/aegis-source.tar   the repository at HEAD (git archive)
    wheels/                   pip wheels for requirements.txt
    npm-cache/                the npm cache that `npm ci` filled from frontend/package-lock.json
    models/                   Ollama manifests and blobs for every model config/models.yaml pins
    docker/images.tar         docker save of the images, when docker is on the build host
    offline_bundle.py, offline_bundle.sh, offline_bundle.ps1   this installer
    MANIFEST.json             SHA-256 and size of every other file

`install` checks the bundle before it installs anything: every file must
hash to its manifest entry, no file may be missing or unlisted, and every
bundled model's manifest must hash to the `expected_digest` config/models.yaml
pins for it -- the same digest the model registry compares against Ollama at
runtime. Any disagreement refuses the whole install. Only then does it unpack
the source, install the wheels into a new .venv with --no-index, run
`npm ci --offline` from the bundled cache and build the frontend, copy the
model blobs into Ollama's store, and `docker load` the images.

A step that was not bundled (no docker on the build host, say) is recorded in
the manifest as not bundled and skipped on install, never faked. Wheels and
npm packages are platform-specific: build on the same OS, architecture and
Python minor version as the target, or pass --pip-platform and
--python-version for the wheels.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import platform
import shutil
import subprocess
import sys
import tarfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = "MANIFEST.json"
FORMAT = 1
OLLAMA_REGISTRY = "registry.ollama.ai"
INSTALLER_FILES = ("offline_bundle.py", "offline_bundle.sh", "offline_bundle.ps1")

Runner = Callable[..., Any]


class BundleError(Exception):
    """The bundle cannot be built or trusted; the message says why."""


# ------------------------------------------------------------------ hashing
def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _files(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*") if p.is_file() and p.relative_to(root).as_posix() != MANIFEST)


def build_manifest(root: Path, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    """Hash every file under ``root``; paths are POSIX and relative, so the manifest is portable."""
    entries = [
        {"path": path.relative_to(root).as_posix(), "sha256": sha256_file(path), "size": path.stat().st_size}
        for path in _files(root)
    ]
    return {"format": FORMAT, **(meta or {}), "files": entries}


def write_manifest(root: Path, meta: dict[str, Any] | None = None) -> Path:
    manifest = build_manifest(root, meta)
    path = root / MANIFEST
    path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def _safe_relative(value: str) -> bool:
    """A manifest path must stay inside the bundle: relative, no '..', no drive."""
    posix = PurePosixPath(value)
    return bool(value) and not posix.is_absolute() and ".." not in posix.parts and ":" not in value \
        and "\\" not in value


def load_manifest(root: Path) -> dict[str, Any]:
    path = root / MANIFEST
    if not path.is_file():
        raise BundleError(f"{path} does not exist: this is not a bundle, or it is incomplete")
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise BundleError(f"{path} is not valid JSON: {exc}") from exc
    if manifest.get("format") != FORMAT:
        raise BundleError(f"{path} is format {manifest.get('format')!r}; this installer reads format {FORMAT}")
    return manifest


def verify_manifest(root: Path, manifest: dict[str, Any] | None = None) -> list[str]:
    """Every problem with the bundle's files; an empty list means every hash matched.

    Missing, altered and unlisted files are all problems: an unlisted file is
    one nobody hashed, and an installer that ignored it would install what
    it had not checked.
    """
    manifest = manifest if manifest is not None else load_manifest(root)
    problems: list[str] = []
    listed: set[str] = set()
    for entry in manifest.get("files", []):
        relative = str(entry.get("path", ""))
        if not _safe_relative(relative):
            problems.append(f"unsafe path in manifest: {relative!r}")
            continue
        if relative in listed:
            problems.append(f"listed twice: {relative}")
            continue
        listed.add(relative)
        path = root / relative
        if not path.is_file():
            problems.append(f"missing: {relative}")
        elif sha256_file(path) != entry.get("sha256"):
            size = path.stat().st_size
            problems.append(f"hash differs: {relative}"
                            + (f" ({size} bytes, manifest says {entry.get('size')})" if size != entry.get("size") else ""))
    for path in _files(root):
        relative = path.relative_to(root).as_posix()
        if relative not in listed:
            problems.append(f"not in manifest: {relative}")
    return problems


# ------------------------------------------------------------------ models
def _yaml(wheels: Path | None = None) -> Any:
    """PyYAML, from the environment or else from the bundle's own wheels.

    The installer runs on a host with nothing installed yet, before the
    virtual environment exists. PyYAML runs as pure Python when its C
    extension cannot load, so its wheel imports straight from the zip. Only
    wheels the manifest has already verified are put on the path.
    """
    try:
        import yaml
        return yaml
    except ImportError:
        pass
    for wheel in sorted((wheels or Path()).glob("PyYAML-*.whl")) if wheels else []:
        sys.path.insert(0, str(wheel))
        try:
            import yaml
            return yaml
        except ImportError:
            sys.path.remove(str(wheel))
    raise BundleError("PyYAML is needed to read config/models.yaml and is neither installed nor bundled")


def pinned_models(config_text: str, wheels: Path | None = None) -> dict[str, str]:
    """Ollama model id -> expected manifest digest, for every model config/models.yaml pins."""
    config = _yaml(wheels).safe_load(config_text) or {}
    pinned: dict[str, str] = {}
    for model in config.get("models", []):
        serving = model.get("serving") or {}
        digest = str(model.get("expected_digest") or "").strip()
        if digest and serving.get("provider", "ollama") == "ollama":
            pinned[str(serving.get("model") or model["id"])] = digest.lower()
    return pinned


def model_manifest_path(model_id: str) -> PurePosixPath:
    """Where Ollama keeps a model's manifest: manifests/<registry>/<namespace>/<name>/<tag>."""
    name, _, tag = model_id.partition(":")
    tag = tag or "latest"
    parts = name.split("/")
    if len(parts) == 1:
        parts = [OLLAMA_REGISTRY, "library", parts[0]]
    elif len(parts) == 2:
        parts = [OLLAMA_REGISTRY, *parts]
    if not all(_safe_relative(part) and "/" not in part for part in [*parts, tag]):
        raise BundleError(f"not a model name this installer accepts: {model_id!r}")
    return PurePosixPath("manifests", *parts, tag)


def _blob_digests(manifest_bytes: bytes) -> list[str]:
    manifest = json.loads(manifest_bytes)
    layers = [manifest.get("config") or {}, *manifest.get("layers", [])]
    digests = [str(layer["digest"]) for layer in layers if layer.get("digest")]
    for digest in digests:
        algorithm, _, value = digest.partition(":")
        if algorithm != "sha256" or len(value) != 64 or not all(c in "0123456789abcdef" for c in value):
            raise BundleError(f"unexpected blob digest in a model manifest: {digest!r}")
    return digests


def _blob_path(digest: str) -> PurePosixPath:
    return PurePosixPath("blobs", digest.replace(":", "-"))


def export_model(ollama_dir: Path, model_id: str, expected_digest: str, dest: Path) -> dict[str, Any]:
    """Copy one pinned model's manifest and blobs out of an Ollama store, checking both.

    The manifest must hash to the pinned digest before anything is copied: a
    bundle built from a model that drifted would fail its own install.
    """
    relative = model_manifest_path(model_id)
    source = ollama_dir / relative
    if not source.is_file():
        raise BundleError(f"{model_id} is not installed in {ollama_dir} (no {relative}); `ollama pull {model_id}` first")
    manifest_bytes = source.read_bytes()
    actual = hashlib.sha256(manifest_bytes).hexdigest()
    if actual != expected_digest:
        raise BundleError(f"{model_id}: installed manifest hashes to {actual}, config/models.yaml pins {expected_digest}")
    blobs = _blob_digests(manifest_bytes)
    for digest in blobs:
        blob = ollama_dir / _blob_path(digest)
        if not blob.is_file():
            raise BundleError(f"{model_id}: blob {digest} is missing from {ollama_dir}")
        if sha256_file(blob) != digest.split(":", 1)[1]:
            raise BundleError(f"{model_id}: blob {digest} in {ollama_dir} does not hash to its name")
        target = dest / _blob_path(digest)
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            shutil.copyfile(blob, target)
    target = dest / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(manifest_bytes)
    return {"id": model_id, "digest": actual, "manifest": relative.as_posix(), "blobs": blobs,
            "bytes": sum((ollama_dir / _blob_path(d)).stat().st_size for d in blobs)}


def verify_models(models_dir: Path, pinned: dict[str, str]) -> tuple[list[str], list[str]]:
    """(problems, not bundled) for the bundled models against the pinned digests.

    A pinned model whose manifest is absent is *not bundled* and reported;
    one that is present must hash to its pin, and so must every blob it names.
    """
    problems: list[str] = []
    absent: list[str] = []
    for model_id, expected in sorted(pinned.items()):
        manifest = models_dir / model_manifest_path(model_id)
        if not manifest.is_file():
            absent.append(model_id)
            continue
        manifest_bytes = manifest.read_bytes()
        actual = hashlib.sha256(manifest_bytes).hexdigest()
        if actual != expected:
            problems.append(f"{model_id}: bundled manifest hashes to {actual}, config/models.yaml pins {expected}")
            continue
        try:
            blobs = _blob_digests(manifest_bytes)
        except (BundleError, ValueError) as exc:
            problems.append(f"{model_id}: {exc}")
            continue
        for digest in blobs:
            blob = models_dir / _blob_path(digest)
            if not blob.is_file():
                problems.append(f"{model_id}: blob {digest} is not in the bundle")
            elif sha256_file(blob) != digest.split(":", 1)[1]:
                problems.append(f"{model_id}: blob {digest} does not hash to its name")
    if models_dir.is_dir():
        for manifest in (models_dir / "manifests").rglob("*") if (models_dir / "manifests").is_dir() else []:
            parts = manifest.relative_to(models_dir / "manifests").parts
            if manifest.is_file():
                if len(parts) < 4:
                    problems.append(f"unexpected file under models/manifests: {'/'.join(parts)}")
                    continue
                name = parts[-2] if parts[1] == "library" else "/".join(parts[1:-1])
                if f"{name}:{parts[-1]}" not in pinned:
                    problems.append(f"bundled model {name}:{parts[-1]} is not pinned in config/models.yaml")
    return problems, absent


def install_models(models_dir: Path, ollama_dir: Path) -> list[str]:
    """Copy verified blobs and manifests into an Ollama store. Existing, matching blobs are kept."""
    copied: list[str] = []
    for source in sorted(p for p in models_dir.rglob("*") if p.is_file()):
        relative = source.relative_to(models_dir)
        target = ollama_dir / relative
        if relative.parts[0] == "blobs" and target.is_file() and sha256_file(target) == relative.name.split("-", 1)[1]:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        copied.append(relative.as_posix())
    return copied


def default_ollama_dir() -> Path:
    return Path(os.environ.get("OLLAMA_MODELS") or Path.home() / ".ollama" / "models")


def models_config_from_source(bundle: Path) -> str:
    """config/models.yaml as the bundled source carries it, read without unpacking anything."""
    with tarfile.open(bundle / "source" / "aegis-source.tar") as archive:
        member = archive.extractfile("config/models.yaml")
        if member is None:
            raise BundleError("the bundled source has no config/models.yaml")
        return member.read().decode("utf-8")


# ------------------------------------------------------------------ build
def _run(runner: Runner, command: list[str], **kwargs: Any) -> None:
    print("  $ " + " ".join(command), flush=True)
    runner(command, check=True, **kwargs)


def build(
    out: Path,
    *,
    ollama_dir: Path,
    pip_platform: str | None = None,
    python_version: str | None = None,
    skip: set[str] = frozenset(),
    docker_images: list[str] | None = None,
    models_config: str | None = None,
    runner: Runner = subprocess.run,
    which: Callable[[str], str | None] = shutil.which,
) -> dict[str, Any]:
    """Gather everything into ``out`` and write its manifest. Returns the manifest's metadata."""
    if out.exists() and any(out.iterdir()):
        raise BundleError(f"{out} is not empty; give a new --out")
    out.mkdir(parents=True, exist_ok=True)
    commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    dirty = bool(subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True).stdout.strip())
    meta: dict[str, Any] = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_commit": commit or None,
        # The archive is HEAD: uncommitted changes are not in it, and saying so
        # is better than a reader assuming they are.
        "source_had_uncommitted_changes": dirty,
        "build_host": {"system": platform.system(), "machine": platform.machine(),
                       "python": platform.python_version()},
        "wheels_target": {"platform": pip_platform or "build host", "python_version": python_version or "build host"},
        "components": {},
    }
    components = meta["components"]

    print("== source")
    (out / "source").mkdir()
    _run(runner, ["git", "archive", "--format=tar", "-o", str(out / "source" / "aegis-source.tar"), "HEAD"], cwd=ROOT)
    components["source"] = "bundled"

    if "wheels" in skip:
        components["wheels"] = "not bundled (--skip wheels)"
    else:
        print("== wheels")
        command = [sys.executable, "-m", "pip", "download", "-r", str(ROOT / "requirements.txt"),
                   "-d", str(out / "wheels")]
        if pip_platform or python_version:
            command += ["--only-binary=:all:"]
            command += ["--platform", pip_platform] if pip_platform else []
            command += ["--python-version", python_version] if python_version else []
        _run(runner, command)
        components["wheels"] = "bundled"

    if "frontend" in skip:
        components["frontend"] = "not bundled (--skip frontend)"
    elif which("npm") is None:
        raise BundleError("npm is not on PATH; install Node.js, or pass --skip frontend")
    else:
        print("== npm packages")
        # npm ci fills the cache with exactly the lockfile's packages; the
        # air-gapped `npm ci --offline` reads only from it.
        npm = which("npm") or "npm"
        _run(runner, [npm, "ci", "--cache", str(out / "npm-cache"), "--no-audit", "--no-fund"], cwd=ROOT / "frontend")
        components["frontend"] = "bundled (npm cache; built on install)"

    if "models" in skip:
        components["models"] = "not bundled (--skip models)"
        meta["models"] = []
    else:
        print("== models")
        pinned = pinned_models(models_config if models_config is not None
                               else (ROOT / "config" / "models.yaml").read_text(encoding="utf-8"))
        meta["models"] = [export_model(ollama_dir, model_id, digest, out / "models")
                          for model_id, digest in sorted(pinned.items())]
        for record in meta["models"]:
            print(f"  ok {record['id']}  {record['digest'][:12]}  {record['bytes']:,} bytes")
        components["models"] = "bundled"

    if "docker" in skip:
        components["docker"] = "not bundled (--skip docker)"
    elif which("docker") is None:
        components["docker"] = "not bundled (docker was not found on the build host)"
    else:
        print("== docker images")
        images = docker_images or _compose_images()
        (out / "docker").mkdir()
        for image in images:
            _run(runner, ["docker", "pull", image])
        _run(runner, ["docker", "save", "-o", str(out / "docker" / "images.tar"), *images])
        components["docker"] = "bundled: " + ", ".join(images)
        meta["docker_images"] = images

    for name in INSTALLER_FILES:
        shutil.copyfile(Path(__file__).with_name(name), out / name)

    path = write_manifest(out, meta)
    print(f"\n  manifest  {path}")
    print(f"  sha256    {sha256_file(path)}   (carry this separately to check the manifest itself)")
    return meta


def _compose_images() -> list[str]:
    """The prebuilt images infrastructure/docker-compose.yml names (not the ones it builds)."""
    compose = _yaml().safe_load((ROOT / "infrastructure" / "docker-compose.yml").read_text(encoding="utf-8"))
    return sorted({str(s["image"]) for s in (compose.get("services") or {}).values() if s.get("image")})


# ------------------------------------------------------------------ install
def verify(bundle: Path, models_config: str | None = None) -> tuple[dict[str, Any], list[str], list[str]]:
    """(manifest, problems, pinned models not bundled). Installs nothing."""
    manifest = load_manifest(bundle)
    problems = verify_manifest(bundle, manifest)
    absent: list[str] = []
    if not problems:
        # Pins come from the bundle's own source unless the caller names a
        # config: the source was just verified, so this is the pin that shipped.
        pinned = pinned_models(models_config if models_config is not None else models_config_from_source(bundle),
                               wheels=bundle / "wheels")
        model_problems, absent = verify_models(bundle / "models", pinned)
        problems += model_problems
    return manifest, problems, absent


def _extract(archive_path: Path, target: Path) -> None:
    with tarfile.open(archive_path) as archive:
        for member in archive.getmembers():
            if not _safe_relative(member.name) or member.issym() or member.islnk():
                raise BundleError(f"refusing a source archive entry: {member.name!r}")
        if hasattr(tarfile, "data_filter"):
            archive.extractall(target, filter="data")
        else:  # pragma: no cover - Python without extraction filters; members were checked above
            archive.extractall(target)


def install(
    bundle: Path,
    target: Path,
    *,
    ollama_dir: Path,
    models_config: str | None = None,
    skip: set[str] = frozenset(),
    runner: Runner = subprocess.run,
    which: Callable[[str], str | None] = shutil.which,
) -> None:
    print("== verifying the bundle")
    manifest, problems, absent = verify(bundle, models_config)
    if problems:
        raise BundleError("the bundle failed verification; nothing was installed:\n  " + "\n  ".join(problems))
    print(f"  ok {len(manifest['files'])} files match MANIFEST.json")
    for model_id in absent:
        print(f"  ! {model_id} is pinned but not bundled: it will be unavailable until installed")
    for name, state in manifest.get("components", {}).items():
        if not str(state).startswith("bundled"):
            print(f"  ! {name}: {state}")

    if target.exists() and any(target.iterdir()):
        raise BundleError(f"{target} is not empty; install into a new directory")
    print(f"== source -> {target}")
    target.mkdir(parents=True, exist_ok=True)
    _extract(bundle / "source" / "aegis-source.tar", target)

    if "wheels" not in skip and (bundle / "wheels").is_dir():
        print("== python environment")
        venv = target / ".venv"
        _run(runner, [sys.executable, "-m", "venv", str(venv)])
        python = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        _run(runner, [str(python), "-m", "pip", "install", "--no-index", "--find-links", str(bundle / "wheels"),
                      "-r", str(target / "requirements.txt")])

    if "frontend" not in skip and (bundle / "npm-cache").is_dir():
        print("== frontend")
        npm = which("npm")
        if npm is None:
            raise BundleError("npm is not on PATH on this host; install Node.js, or pass --skip frontend")
        env = {**os.environ, "NEXT_TELEMETRY_DISABLED": "1"}
        _run(runner, [npm, "ci", "--offline", "--cache", str(bundle / "npm-cache"), "--no-audit", "--no-fund"],
             cwd=target / "frontend", env=env)
        npx = which("npx") or "npx"
        _run(runner, [npx, "next", "build"], cwd=target / "frontend", env=env)

    if "models" not in skip and (bundle / "models").is_dir():
        print(f"== models -> {ollama_dir}")
        copied = install_models(bundle / "models", ollama_dir)
        print(f"  ok {len(copied)} file(s) copied; restart Ollama, then `ollama list` shows the models")

    if "docker" not in skip and (bundle / "docker" / "images.tar").is_file():
        if which("docker") is None:
            print("  ! docker/images.tar is bundled but docker is not on this host; skipped")
        else:
            print("== docker images")
            _run(runner, ["docker", "load", "-i", str(bundle / "docker" / "images.tar")])

    print(f"\n  installed {manifest.get('source_commit') or 'the bundled source'} into {target}")


# ------------------------------------------------------------------ cli
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    parts = ("wheels", "frontend", "models", "docker")

    b = commands.add_parser("build", help="gather everything on a connected machine")
    b.add_argument("--out", type=Path, default=ROOT / "dist" / "aegis-offline")
    b.add_argument("--ollama-models", type=Path, default=None, help="Ollama store (default: $OLLAMA_MODELS or ~/.ollama/models)")
    b.add_argument("--pip-platform", default=None, help="wheel platform tag for the target, e.g. manylinux2014_x86_64")
    b.add_argument("--python-version", default=None, help="target Python for the wheels, e.g. 3.11")
    b.add_argument("--docker-image", action="append", default=None, help="image to save (default: the compose file's)")
    b.add_argument("--skip", nargs="+", choices=parts, default=[])

    v = commands.add_parser("verify", help="check a bundle's hashes and model digests; installs nothing")
    v.add_argument("--bundle", type=Path, default=Path(__file__).resolve().parent)
    v.add_argument("--models-config", type=Path, default=None, help="pins to check against (default: the bundled source's)")

    i = commands.add_parser("install", help="verify, then install on the air-gapped machine")
    i.add_argument("--bundle", type=Path, default=Path(__file__).resolve().parent)
    i.add_argument("--target", type=Path, required=True, help="a new, empty directory for the installation")
    i.add_argument("--ollama-models", type=Path, default=None)
    i.add_argument("--models-config", type=Path, default=None)
    i.add_argument("--skip", nargs="+", choices=parts, default=[])

    arguments = parser.parse_args(argv)
    try:
        if arguments.command == "build":
            build(arguments.out, ollama_dir=arguments.ollama_models or default_ollama_dir(),
                  pip_platform=arguments.pip_platform, python_version=arguments.python_version,
                  skip=set(arguments.skip), docker_images=arguments.docker_image)
        elif arguments.command == "verify":
            config = arguments.models_config.read_text(encoding="utf-8") if arguments.models_config else None
            manifest, problems, absent = verify(arguments.bundle, config)
            for problem in problems:
                print(f"  x  {problem}")
            for model_id in absent:
                print(f"  ! {model_id} is pinned but not bundled")
            print(f"\n  {'NOT VALID' if problems else 'VALID'}: {len(manifest['files'])} files in MANIFEST.json")
            return 1 if problems else 0
        else:
            config = arguments.models_config.read_text(encoding="utf-8") if arguments.models_config else None
            install(arguments.bundle, arguments.target, ollama_dir=arguments.ollama_models or default_ollama_dir(),
                    models_config=config, skip=set(arguments.skip))
    except (BundleError, subprocess.CalledProcessError) as exc:
        print(f"\n  x  {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
