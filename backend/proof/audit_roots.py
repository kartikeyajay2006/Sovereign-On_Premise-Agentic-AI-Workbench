"""Signed Merkle roots over the audit log.

A seal records how many events the log held, the chain's head hash, and the
Merkle root over every event hash, signed with this host's key, in an
append-only file beside the log. Verifying recomputes each sealed root from
the current log's first n events: an event edited after a seal changes that
root even when every later chain hash was recomputed to match, which is the
edit the chain alone cannot see (red team AUDIT-02).

A broken chain is never sealed: signing it would certify the damage.
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.core.audit import AuditLog
from backend.proof.merkle import merkle_root
from backend.proof.signer import HostSigner, verify


class SealRefused(RuntimeError):
    pass


def _event_hashes(audit: AuditLog) -> list[str]:
    return [str(record.get("hash")) for record in audit._iter_raw()]


class AuditSeal:
    def __init__(self, audit: AuditLog, signer: HostSigner, path: Path | None = None) -> None:
        self.audit = audit
        self.signer = signer
        self.path = path or audit.path.with_name("audit-roots.jsonl")
        self._lock = threading.Lock()

    def seal(self, reason: str) -> dict[str, Any]:
        with self._lock:
            chain = self.audit.verify_chain()
            if not chain.valid:
                raise SealRefused(
                    f"the audit chain is broken at event {chain.broken_at}; a broken chain is not sealed"
                )
            hashes = _event_hashes(self.audit)
            payload = {
                "type": "aegis.audit-root",
                "version": 1,
                "events": len(hashes),
                "head_hash": chain.head_hash,
                "merkle_root": merkle_root(hashes),
                "sealed_at": datetime.now(timezone.utc).isoformat(),
                "reason": reason,
            }
            entry = {**payload, "signature": self.signer.sign(payload)}
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(entry) + "\n")
        self.audit.record(
            category="audit", action="sealed", actor="system",
            detail={"events": payload["events"], "merkle_root": payload["merkle_root"],
                    "key_id": entry["signature"]["key_id"], "reason": reason},
        )
        return entry

    def roots(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        roots = []
        for line in self.path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                try:
                    roots.append(json.loads(line))
                except json.JSONDecodeError:
                    roots.append({"malformed": line[:200]})
        return roots

    def verify(self) -> dict[str, Any]:
        """Every sealed root: its signature, and whether today's log still produces it."""
        hashes = _event_hashes(self.audit)
        chain = self.audit.verify_chain()
        results = []
        for root in self.roots():
            if "malformed" in root:
                results.append({"valid": False, "problem": "unreadable seal line"})
                continue
            payload = {key: value for key, value in root.items() if key != "signature"}
            signature = root.get("signature") or {}
            signed = verify(payload, signature.get("value", ""), signature.get("public_key", ""))
            known_key = signature.get("key_id") == self.signer.key_id
            count = int(root.get("events", 0))
            present = len(hashes) >= count
            recomputed = merkle_root(hashes[:count]) if present else None
            matches = recomputed == root.get("merkle_root")
            problem = None
            if not signed:
                problem = "the seal's signature does not verify"
            elif not known_key:
                problem = "the seal was signed by a key this host does not hold"
            elif not present:
                problem = f"the log now holds {len(hashes)} events, fewer than the {count} sealed"
            elif not matches:
                problem = f"the first {count} events no longer produce the sealed root: history was rewritten"
            results.append({
                "events": count, "sealed_at": root.get("sealed_at"), "merkle_root": root.get("merkle_root"),
                "signature_valid": signed, "key_known": known_key, "reproduced": matches,
                "valid": problem is None, "problem": problem,
            })
        return {
            "valid": chain.valid and all(result["valid"] for result in results),
            "chain_valid": chain.valid,
            "chain_broken_at": chain.broken_at,
            "roots": len(results),
            "events_now": len(hashes),
            "key_id": self.signer.key_id,
            "results": results,
        }


_seal: AuditSeal | None = None


def get_audit_seal() -> AuditSeal:
    global _seal
    if _seal is None:
        from backend.core.audit import get_audit_log
        from backend.proof.signer import get_signer

        _seal = AuditSeal(get_audit_log(), get_signer())
    return _seal
