"""A cache of vision extractions, keyed so it cannot serve the wrong reading.

Reading a scanned page is the slowest thing the workbench does on a CPU host:
a repeated V-2104 demo spent most of its six minutes re-reading pages it had
already read. The same image, shown to the same weights with the same
instructions, is the same question; answering it from the earlier answer is
safe, and saying so is required.

The key is the SHA-256 over:

* the SHA-256 of every image in the call, in order (the uploaded image, or
  the page image rendered from a scan);
* the runtime digest of the vision model's weights -- not its name, which can
  be re-pulled to different weights;
* the prompt library version and the SHA-256 of the exact system prompt and
  prompt sent, so any edit to the instructions is a different question.

A model with no runtime digest is never cached: without one there is nothing
to prove the weights are the same. A stored entry is re-checked against the
digest and prompt hashes it was stored under before it is served, so a key
collision or a hand-edited file cannot cross models or prompts.

Entries are JSON files, one per key, under ``<storage.root>/vision-cache`` by
default (``vision_cache.path`` in config/app.yaml).
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.proof.signer import canonical


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


@dataclass(frozen=True)
class CacheIdentity:
    """Everything a cached reading must match to be served."""

    image_sha256: tuple[str, ...]
    model_digest: str
    prompts_version: Any
    system_sha256: str
    prompt_sha256: str

    @property
    def key(self) -> str:
        return hashlib.sha256(canonical({
            "images": list(self.image_sha256),
            "model_digest": self.model_digest,
            "prompts_version": self.prompts_version,
            "system_sha256": self.system_sha256,
            "prompt_sha256": self.prompt_sha256,
        })).hexdigest()


def identity(images: list[Path], model_digest: str, prompts_version: Any,
             system_prompt: str, prompt: str) -> CacheIdentity:
    return CacheIdentity(
        image_sha256=tuple(file_sha256(path) for path in images),
        model_digest=model_digest,
        prompts_version=prompts_version,
        system_sha256=_sha(system_prompt),
        prompt_sha256=_sha(prompt),
    )


class VisionCache:
    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def _path(self, key: str) -> Path:
        return self.directory / f"{key}.json"

    def get(self, ident: CacheIdentity) -> dict[str, Any] | None:
        """The stored entry for this identity, or None. An unreadable entry is a miss."""
        path = self._path(ident.key)
        if not path.exists():
            return None
        try:
            entry = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        # Served only when every part of the identity it was stored under
        # is this identity: never across weights or instructions.
        if not isinstance(entry, dict) or not isinstance(entry.get("text"), str) or any((
            entry.get("key") != ident.key,
            entry.get("model_digest") != ident.model_digest,
            entry.get("prompts_version") != ident.prompts_version,
            entry.get("system_sha256") != ident.system_sha256,
            entry.get("prompt_sha256") != ident.prompt_sha256,
            entry.get("image_sha256") != list(ident.image_sha256),
        )):
            return None
        return entry

    def put(self, ident: CacheIdentity, *, text: str, model: str, task_id: str) -> dict[str, Any]:
        entry = {
            "key": ident.key,
            "model": model,
            "model_digest": ident.model_digest,
            "prompts_version": ident.prompts_version,
            "system_sha256": ident.system_sha256,
            "prompt_sha256": ident.prompt_sha256,
            "image_sha256": list(ident.image_sha256),
            "extracted_at": datetime.now(timezone.utc).isoformat(),
            "extracted_for_task": task_id,
            "text": text,
        }
        self.directory.mkdir(parents=True, exist_ok=True)
        # Written whole and renamed into place, so a reader never sees half
        # an entry and a crash never leaves one.
        handle, temporary = tempfile.mkstemp(dir=self.directory, suffix=".tmp")
        try:
            with os.fdopen(handle, "w", encoding="utf-8") as stream:
                json.dump(entry, stream, ensure_ascii=False)
            os.replace(temporary, self._path(ident.key))
        except BaseException:
            Path(temporary).unlink(missing_ok=True)
            raise
        return entry
