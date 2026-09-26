"""The offline bundle installs nothing it has not checked.

An air-gapped host has no registry to re-download from, so the bundle carried
to it is the only copy, and the installer is the last point at which a
corrupted or substituted file can be caught. These tests build bundles in a
temporary directory from a fake Ollama store and fake downloads -- nothing is
fetched, no real model is exported -- and check that every altered, missing,
unlisted or mis-pinned file refuses the install before anything is written.
"""

from __future__ import annotations

import hashlib
import io
import json
import tarfile
from pathlib import Path
from typing import Any

import pytest

from scripts import offline_bundle as ob
from scripts.offline_bundle import BundleError

ROOT = Path(__file__).resolve().parents[1]


# ----------------------------------------------------------------- helpers
def _blob(store: Path, content: bytes) -> str:
    digest = hashlib.sha256(content).hexdigest()
    path = store / "blobs" / f"sha256-{digest}"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return f"sha256:{digest}"


def _model(store: Path, model_id: str, weights: bytes) -> str:
    """Put a small model into a fake Ollama store; return its manifest digest (what models.yaml pins)."""
    config = _blob(store, b'{"model_format":"gguf"}' + model_id.encode())
    layer = _blob(store, weights)
    manifest = json.dumps({"schemaVersion": 2, "config": {"digest": config, "size": 1},
                           "layers": [{"mediaType": "application/vnd.ollama.image.model", "digest": layer,
                                       "size": len(weights)}]}).encode()
    path = store / ob.model_manifest_path(model_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(manifest)
    return hashlib.sha256(manifest).hexdigest()


def _models_yaml(pins: dict[str, str | None]) -> str:
    lines = ["models:"]
    for model_id, digest in pins.items():
        lines += [f"  - id: {model_id}", "    serving:", "      provider: ollama", f"      model: {model_id}"]
        if digest:
            lines.append(f"    expected_digest: {digest}")
    return "\n".join(lines) + "\n"


def _source_tar(path: Path, models_yaml: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(path, "w") as archive:
        for name, text in (("config/models.yaml", models_yaml), ("requirements.txt", "PyYAML==6.0.2\n"),
                           ("frontend/package.json", "{}")):
            data = text.encode()
            info = tarfile.TarInfo(name)
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))


class FakeRunner:
    """Stands in for pip, npm, git and docker: records the command, writes what it would have written."""

    def __init__(self, models_yaml: str = "") -> None:
        self.commands: list[list[str]] = []
        self.models_yaml = models_yaml

    def __call__(self, command: list[str], **kwargs: Any) -> None:
        self.commands.append([str(part) for part in command])
        if command[:2] == ["git", "archive"]:
            _source_tar(Path(command[command.index("-o") + 1]), self.models_yaml)
        elif "download" in command:
            wheels = Path(command[command.index("-d") + 1])
            wheels.mkdir(parents=True, exist_ok=True)
            (wheels / "fake_package-1.0-py3-none-any.whl").write_bytes(b"wheel bytes")
        elif command[1:2] == ["ci"] and "--offline" not in command:
            cache = Path(command[command.index("--cache") + 1]) / "_cacache" / "content-v2"
            cache.mkdir(parents=True, exist_ok=True)
            (cache / "package.tgz").write_bytes(b"npm tarball")


def _no_docker(name: str) -> str | None:
    return None if name == "docker" else name


@pytest.fixture()
def built(tmp_path: Path) -> dict[str, Any]:
    """A complete bundle with two pinned models, built without touching the network."""
    store = tmp_path / "ollama-build"
    pins = {"tiny:1b": _model(store, "tiny:1b", b"weights one"), "vision:2b": _model(store, "vision:2b", b"weights two")}
    config = _models_yaml({**pins, "optional:7b": None})
    bundle = tmp_path / "bundle"
    runner = FakeRunner(config)
    meta = ob.build(bundle, ollama_dir=store, models_config=config, runner=runner, which=_no_docker)
    return {"bundle": bundle, "config": config, "pins": pins, "meta": meta, "runner": runner, "tmp": tmp_path}


# ----------------------------------------------------------------- manifest
def test_a_manifest_lists_every_file_with_its_hash_and_verifies(tmp_path: Path) -> None:
    (tmp_path / "wheels").mkdir()
    (tmp_path / "wheels" / "a.whl").write_bytes(b"a")
    (tmp_path / "b.txt").write_bytes(b"bb")
    ob.write_manifest(tmp_path, {"note": "test"})
    manifest = ob.load_manifest(tmp_path)
    assert [(e["path"], e["size"]) for e in manifest["files"]] == [("b.txt", 2), ("wheels/a.whl", 1)]
    assert manifest["files"][1]["sha256"] == hashlib.sha256(b"a").hexdigest()
    assert ob.verify_manifest(tmp_path) == []


@pytest.mark.parametrize("damage, expected", [
    (lambda root: (root / "wheels" / "a.whl").write_bytes(b"b"), "hash differs: wheels/a.whl"),
    (lambda root: (root / "wheels" / "a.whl").write_bytes(b"longer"), "hash differs: wheels/a.whl (6 bytes, manifest says 1)"),
    (lambda root: (root / "wheels" / "a.whl").unlink(), "missing: wheels/a.whl"),
    (lambda root: (root / "wheels" / "evil.whl").write_bytes(b"x"), "not in manifest: wheels/evil.whl"),
])
def test_an_altered_missing_or_unlisted_file_is_a_problem(tmp_path: Path, damage: Any, expected: str) -> None:
    (tmp_path / "wheels").mkdir()
    (tmp_path / "wheels" / "a.whl").write_bytes(b"a")
    ob.write_manifest(tmp_path)
    damage(tmp_path)
    assert expected in ob.verify_manifest(tmp_path)


@pytest.mark.parametrize("path", ["../outside", "/etc/passwd", "C:/Windows/x", "wheels\\a.whl", ""])
def test_a_manifest_path_that_leaves_the_bundle_is_refused(tmp_path: Path, path: str) -> None:
    manifest = {"format": ob.FORMAT, "files": [{"path": path, "sha256": "0" * 64, "size": 0}]}
    assert ob.verify_manifest(tmp_path, manifest) == [f"unsafe path in manifest: {path!r}"]


def test_a_missing_or_foreign_manifest_is_refused(tmp_path: Path) -> None:
    with pytest.raises(BundleError, match="not a bundle"):
        ob.load_manifest(tmp_path)
    (tmp_path / ob.MANIFEST).write_text(json.dumps({"format": 99, "files": []}))
    with pytest.raises(BundleError, match="format 99"):
        ob.load_manifest(tmp_path)


# ----------------------------------------------------------------- models
def test_the_pins_are_read_from_the_real_models_config() -> None:
    pins = ob.pinned_models((ROOT / "config" / "models.yaml").read_text(encoding="utf-8"))
    assert pins["qwen2.5:3b"] == "357c53fb659c5076de1d65ccb0b397446227b71a42be9d1603d46168015c9e4b"
    assert "nomic-embed-text:latest" in pins
    # Declared without a digest: optional, never bundled as if pinned.
    assert "moondream:latest" not in pins and "qwen2.5-coder:7b" not in pins


def test_model_names_map_to_ollamas_store_layout() -> None:
    assert ob.model_manifest_path("qwen2.5:3b").as_posix() == "manifests/registry.ollama.ai/library/qwen2.5/3b"
    assert ob.model_manifest_path("nomic-embed-text").as_posix().endswith("library/nomic-embed-text/latest")
    assert ob.model_manifest_path("team/model:v1").as_posix() == "manifests/registry.ollama.ai/team/model/v1"
    with pytest.raises(BundleError):
        ob.model_manifest_path("../../etc:passwd")


def test_a_model_that_drifted_from_its_pin_is_not_exported(tmp_path: Path) -> None:
    store = tmp_path / "store"
    _model(store, "tiny:1b", b"weights")
    with pytest.raises(BundleError, match="pins " + "a" * 64):
        ob.export_model(store, "tiny:1b", "a" * 64, tmp_path / "out")
    assert not (tmp_path / "out").exists()


def test_a_model_not_installed_or_with_a_corrupt_blob_is_not_exported(tmp_path: Path) -> None:
    store = tmp_path / "store"
    with pytest.raises(BundleError, match="ollama pull tiny:1b"):
        ob.export_model(store, "tiny:1b", "a" * 64, tmp_path / "out")
    digest = _model(store, "tiny:1b", b"weights")
    blob = store / "blobs" / f"sha256-{hashlib.sha256(b'weights').hexdigest()}"
    blob.write_bytes(b"rotted")
    with pytest.raises(BundleError, match="does not hash to its name"):
        ob.export_model(store, "tiny:1b", digest, tmp_path / "out")


def test_bundled_models_are_checked_against_the_pins(built: dict[str, Any]) -> None:
    models = built["bundle"] / "models"
    problems, absent = ob.verify_models(models, built["pins"])
    assert problems == [] and absent == []
    # A pin the bundle does not carry is reported as not bundled, not as installed.
    problems, absent = ob.verify_models(models, {**built["pins"], "extra:3b": "b" * 64})
    assert problems == [] and absent == ["extra:3b"]
    # A different pin for a bundled model refuses it.
    problems, _ = ob.verify_models(models, {**built["pins"], "tiny:1b": "c" * 64})
    assert any("tiny:1b: bundled manifest hashes to" in p for p in problems)
    # A bundled model nobody pinned is refused too.
    problems, _ = ob.verify_models(models, {"vision:2b": built["pins"]["vision:2b"]})
    assert "bundled model tiny:1b is not pinned in config/models.yaml" in problems


# ----------------------------------------------------------------- build
def test_build_gathers_every_component_and_records_what_it_skipped(built: dict[str, Any]) -> None:
    bundle, meta = built["bundle"], built["meta"]
    assert (bundle / "source" / "aegis-source.tar").is_file()
    assert (bundle / "wheels" / "fake_package-1.0-py3-none-any.whl").is_file()
    assert any((bundle / "npm-cache").rglob("package.tgz"))
    assert [m["id"] for m in meta["models"]] == ["tiny:1b", "vision:2b"]
    assert meta["components"]["docker"] == "not bundled (docker was not found on the build host)"
    for name in ob.INSTALLER_FILES:
        assert (bundle / name).is_file()
    assert ob.verify_manifest(bundle) == []
    commands = built["runner"].commands
    assert any("download" in c and "-r" in c for c in commands)
    assert any(c[1:2] == ["ci"] and "--cache" in c for c in commands)


def test_build_refuses_a_non_empty_output(tmp_path: Path) -> None:
    (tmp_path / "old").write_text("x")
    with pytest.raises(BundleError, match="not empty"):
        ob.build(tmp_path, ollama_dir=tmp_path, runner=FakeRunner(), which=_no_docker)


def test_wheels_for_another_platform_are_binary_only(tmp_path: Path) -> None:
    runner = FakeRunner(_models_yaml({}))
    ob.build(tmp_path / "b", ollama_dir=tmp_path, pip_platform="manylinux2014_x86_64", python_version="3.11",
             skip={"frontend", "models"}, runner=runner, which=_no_docker)
    download = next(c for c in runner.commands if "download" in c)
    assert download[-5:] == ["--only-binary=:all:", "--platform", "manylinux2014_x86_64", "--python-version", "3.11"]


# ----------------------------------------------------------------- install
def test_install_verifies_then_installs_every_component(built: dict[str, Any]) -> None:
    target, ollama = built["tmp"] / "aegis", built["tmp"] / "ollama-target"
    runner = FakeRunner()
    ob.install(built["bundle"], target, ollama_dir=ollama, runner=runner, which=_no_docker)
    assert (target / "config" / "models.yaml").is_file()
    commands = [" ".join(c) for c in runner.commands]
    assert any("-m venv" in c for c in commands)
    assert any("--no-index" in c and "--find-links" in c for c in commands)
    assert any(" ci --offline --cache" in c for c in commands)
    assert any(c.endswith("next build") for c in commands)
    for model_id, digest in built["pins"].items():
        manifest = ollama / ob.model_manifest_path(model_id)
        assert hashlib.sha256(manifest.read_bytes()).hexdigest() == digest
    assert ob.verify_models(ollama, built["pins"]) == ([], [])


def _refused_before_anything(built: dict[str, Any], match: str) -> None:
    target, ollama = built["tmp"] / "aegis", built["tmp"] / "ollama-target"
    runner = FakeRunner()
    with pytest.raises(BundleError, match=match):
        ob.install(built["bundle"], target, ollama_dir=ollama, runner=runner, which=_no_docker)
    assert runner.commands == [] and not target.exists() and not ollama.exists()


def test_a_tampered_wheel_refuses_the_whole_install(built: dict[str, Any]) -> None:
    (built["bundle"] / "wheels" / "fake_package-1.0-py3-none-any.whl").write_bytes(b"trojan")
    _refused_before_anything(built, "hash differs: wheels/fake_package")


def test_a_substituted_model_refuses_the_whole_install_even_with_a_rewritten_manifest(built: dict[str, Any]) -> None:
    # The attacker swaps the model and regenerates MANIFEST.json so every
    # file hash agrees. The pin in the bundled source's config/models.yaml
    # still does not.
    bundle = built["bundle"]
    models = bundle / "models"
    for path in list(models.rglob("*")):
        if path.is_file():
            path.unlink()
    _model(models, "tiny:1b", b"different weights")
    _model(models, "vision:2b", b"weights two")
    ob.write_manifest(bundle, {"components": {}})
    _refused_before_anything(built, "tiny:1b: bundled manifest hashes to")


def test_an_install_target_that_is_not_empty_is_refused(built: dict[str, Any]) -> None:
    target = built["tmp"] / "aegis"
    target.mkdir()
    (target / "keep.txt").write_text("existing install")
    with pytest.raises(BundleError, match="not empty"):
        ob.install(built["bundle"], target, ollama_dir=built["tmp"] / "o", runner=FakeRunner(), which=_no_docker)
    assert sorted(p.name for p in target.iterdir()) == ["keep.txt"]


def test_a_source_archive_entry_outside_the_target_is_refused(tmp_path: Path) -> None:
    archive = tmp_path / "evil.tar"
    with tarfile.open(archive, "w") as tar:
        info = tarfile.TarInfo("../escaped.txt")
        info.size = 1
        tar.addfile(info, io.BytesIO(b"x"))
    with pytest.raises(BundleError, match="refusing a source archive entry"):
        ob._extract(archive, tmp_path / "target")
    assert not (tmp_path / "escaped.txt").exists()


def test_verify_command_reports_and_installs_nothing(built: dict[str, Any], capsys: pytest.CaptureFixture[str]) -> None:
    assert ob.main(["verify", "--bundle", str(built["bundle"])]) == 0
    assert "VALID" in capsys.readouterr().out
    (built["bundle"] / "source" / "aegis-source.tar").write_bytes(b"not the source")
    assert ob.main(["verify", "--bundle", str(built["bundle"])]) == 1
    assert "hash differs: source/aegis-source.tar" in capsys.readouterr().out
