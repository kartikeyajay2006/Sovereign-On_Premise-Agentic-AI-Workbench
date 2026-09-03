"""Tamper-evident audit trail.

Every event is appended to a JSON-lines file and hash-chained to its
predecessor: ``hash = H(prev_hash || canonical_event_body)``. Rewriting or
deleting any historical event breaks the chain, and ``verify_chain`` reports
exactly which sequence number failed. This is what makes the reference
architecture's "immutable, searchable, exportable, stored locally" claim
checkable rather than merely asserted.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from backend.core.config import get_config
from backend.core.schemas import AuditChainStatus, AuditEvent

GENESIS_HASH = "0" * 64


class AuditLog:
    """Append-only, hash-chained event log."""

    def __init__(self, path: Path | None = None, algorithm: str | None = None) -> None:
        from backend.core.config import PROJECT_ROOT

        config = get_config()
        audit_config = config.settings.audit
        raw_path = path or Path(str(audit_config.get("log_file", "storage/logs/audit.jsonl")))
        # Paths in config are relative to the project root, never the cwd.
        self.path = raw_path if raw_path.is_absolute() else PROJECT_ROOT / raw_path
        self.algorithm = algorithm or str(audit_config.get("hash_algorithm", "sha256"))
        self.enabled = bool(audit_config.get("enabled", True))
        self._lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.touch(exist_ok=True)

    # -- internals ---------------------------------------------------------
    def _digest(self, prev_hash: str, body: dict[str, Any]) -> str:
        canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), default=str)
        hasher = hashlib.new(self.algorithm)
        hasher.update(prev_hash.encode("utf-8"))
        hasher.update(canonical.encode("utf-8"))
        return hasher.hexdigest()

    def _tail(self) -> tuple[int, str]:
        """Return ``(last_sequence, last_hash)`` without loading the whole file."""
        last_sequence = 0
        last_hash = GENESIS_HASH
        if not self.path.exists() or self.path.stat().st_size == 0:
            return last_sequence, last_hash
        with self.path.open("rb") as handle:
            # Read the final non-empty line efficiently.
            handle.seek(0, os.SEEK_END)
            size = handle.tell()
            block = 4096
            buffer = b""
            while size > 0:
                step = min(block, size)
                size -= step
                handle.seek(size)
                buffer = handle.read(step) + buffer
                lines = [line for line in buffer.split(b"\n") if line.strip()]
                if lines:
                    try:
                        record = json.loads(lines[-1].decode("utf-8"))
                    except json.JSONDecodeError:
                        continue
                    return int(record.get("sequence", 0)), str(record.get("hash", GENESIS_HASH))
        return last_sequence, last_hash

    # -- writing -----------------------------------------------------------
    def record(
        self,
        *,
        category: str,
        action: str,
        actor: str,
        actor_role: str | None = None,
        task_id: str | None = None,
        detail: dict[str, Any] | None = None,
    ) -> AuditEvent | None:
        """Append one event and return it, or ``None`` when auditing is off."""
        if not self.enabled:
            return None
        with self._lock:
            sequence, prev_hash = self._tail()
            body = {
                "sequence": sequence + 1,
                "id": str(uuid.uuid4()),
                "at": datetime.now(timezone.utc).isoformat(),
                "actor": actor,
                "actor_role": actor_role,
                "task_id": task_id,
                "category": category,
                "action": action,
                "detail": detail or {},
                "prev_hash": prev_hash,
            }
            body["hash"] = self._digest(prev_hash, body)
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(body, default=str) + "\n")
                handle.flush()
                os.fsync(handle.fileno())
        return AuditEvent(**body)

    # -- reading -----------------------------------------------------------
    def _iter_raw(self) -> Iterator[dict[str, Any]]:
        if not self.path.exists():
            return
        with self.path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue

    def query(
        self,
        *,
        task_id: str | None = None,
        category: str | None = None,
        actor: str | None = None,
        search: str | None = None,
        limit: int = 500,
    ) -> list[AuditEvent]:
        events: list[AuditEvent] = []
        for record in self._iter_raw():
            if task_id and record.get("task_id") != task_id:
                continue
            if category and record.get("category") != category:
                continue
            if actor and record.get("actor") != actor:
                continue
            if search:
                haystack = json.dumps(record, default=str).lower()
                if search.lower() not in haystack:
                    continue
            try:
                events.append(AuditEvent(**record))
            except Exception:  # malformed historical line, keep going
                continue
        events.sort(key=lambda event: event.sequence, reverse=True)
        return events[:limit]

    def verify_chain(self) -> AuditChainStatus:
        """Recompute every hash and report the first divergence, if any."""
        prev_hash = GENESIS_HASH
        count = 0
        head_hash: str | None = None
        for record in self._iter_raw():
            count += 1
            stored_hash = record.get("hash")
            body = {key: value for key, value in record.items() if key != "hash"}
            if body.get("prev_hash") != prev_hash:
                return AuditChainStatus(
                    valid=False,
                    events=count,
                    broken_at=int(record.get("sequence", count)),
                    head_hash=head_hash,
                    checked_at=datetime.now(timezone.utc),
                )
            expected = self._digest(prev_hash, body)
            if expected != stored_hash:
                return AuditChainStatus(
                    valid=False,
                    events=count,
                    broken_at=int(record.get("sequence", count)),
                    head_hash=head_hash,
                    checked_at=datetime.now(timezone.utc),
                )
            prev_hash = str(stored_hash)
            head_hash = prev_hash
        return AuditChainStatus(
            valid=True,
            events=count,
            broken_at=None,
            head_hash=head_hash,
            checked_at=datetime.now(timezone.utc),
        )

    def export(self) -> str:
        """Return the full log as JSON lines for offline archival."""
        if not self.path.exists():
            return ""
        return self.path.read_text(encoding="utf-8")

    def count(self) -> int:
        return sum(1 for _ in self._iter_raw())


_audit_log: AuditLog | None = None


def get_audit_log() -> AuditLog:
    global _audit_log
    if _audit_log is None:
        _audit_log = AuditLog()
    return _audit_log
