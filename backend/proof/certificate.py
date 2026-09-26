"""A signed certificate of one run, checkable offline.

It binds, by hash, everything a reviewer relied on: the request, the answer,
each piece of evidence (with its source file's hash and, for a procedure,
its code and revision), every registered-formula calculation (formula,
inputs and result hashes), each conflict and who resolved it, the
verification verdicts, the approval and the digest it was given against,
and the deliverables' bytes. It carries the signed audit root taken when it
was issued and a Merkle inclusion proof for each of the run's audit events,
so a holder of the public key alone can show the events existed under a
root this host signed. From version 2 it also carries the run's provenance
(proof/provenance.py): the digest of every model that served it, the config
and policy files it ran under, the prompt library version, what the egress
monitor and the sandbox measured, and the formula sources behind its figures.
Online, verification also re-reads the log and the
deliverable files, and says which of them no longer match.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.core.audit import AuditLog
from backend.core.schemas import Task
from backend.proof.audit_roots import AuditSeal
from backend.proof.merkle import inclusion_proof, merkle_root, verify_inclusion
from backend.proof.provenance import from_audit, run_provenance
from backend.proof.signer import HostSigner, canonical, verify


def _sha(text: str | None) -> str | None:
    return hashlib.sha256(text.encode("utf-8")).hexdigest() if text else None


def review_digest(task: Task) -> str:
    """What a reviewer sees, as one hash: the approval is bound to it.

    Any change to the answer, a deliverable's bytes, a calculation result or
    a conflict's resolution changes it, so an approval given against one
    version cannot be applied to another.
    """
    body = {
        "answer": _sha(task.answer),
        "deliverables": sorted((d.filename, d.sha256) for d in task.deliverables),
        "results": [record.result_hash for record in task.calculations if record.result_hash],
        "conflicts": [
            (c.id, c.status, c.resolution.evidence_id if c.resolution else None) for c in task.conflicts
        ],
        "assessment": task.assessment.status if task.assessment else None,
    }
    return hashlib.sha256(canonical(body)).hexdigest()


#: The certificate format issued now. Version 1 (no provenance) still
#: verifies: the checks that read provenance run only on version 2 and later.
CERTIFICATE_VERSION = 2


def _body(task: Task, records: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    verification = task.verification
    claims: dict[str, int] = {}
    for claim in verification.claims if verification else []:
        claims[claim.verdict] = claims.get(claim.verdict, 0) + 1
    return {
        "task_id": task.id,
        "status": task.status.value if hasattr(task.status, "value") else str(task.status),
        "submitted_by": task.user_id,
        "created_at": task.created_at.isoformat(),
        "prompt_sha256": _sha(task.prompt),
        "answer_sha256": _sha(task.answer),
        "models": sorted({
            str(model) for decision in (task.routing or [])
            if (model := (decision.get("selected_model") if isinstance(decision, dict)
                          else getattr(decision, "selected_model", None)))
        }),
        "evidence": [
            {
                "id": item.id, "kind": item.kind, "source": item.source_document,
                "excerpt_sha256": _sha(item.excerpt), "source_sha256": item.source_sha256,
                "document_code": item.document_code, "revision_status": item.revision_status,
                "page": item.page_number, "classification": getattr(item.classification, "value", item.classification),
            }
            for item in task.evidence
        ],
        "calculations": [
            {"formula": f"{r.formula_id}@{r.formula_version}", "subject": r.subject, "status": r.status,
             "formula_hash": r.formula_hash, "input_hash": r.input_hash, "result_hash": r.result_hash,
             "evidence_id": r.evidence_id}
            for r in task.calculations
        ],
        "conflicts": [
            {"id": c.id, "kind": c.kind, "status": c.status, "label": c.label,
             "resolved_by": c.resolution.resolved_by if c.resolution else None,
             "resolution_evidence": c.resolution.evidence_id if c.resolution else None}
            for c in task.conflicts
        ],
        "verification": {
            "valid": verification.valid if verification else None,
            "checks": {check.name: check.passed for check in verification.checks} if verification else {},
            "claims": claims,
        },
        "approval": (
            {"required": task.approval.required, "decision": task.approval.decision,
             "reviewer_id": task.approval.reviewer_id,
             "decided_at": task.approval.decided_at.isoformat() if task.approval.decided_at else None,
             "bound_digest": getattr(task.approval, "bound_digest", None),
             # Each signature of a multi-signature approval, with the digest
             # it was given on (SOP-OPS-008 Clause 3.5).
             "signatures": [
                 {"authority": s.authority, "capacity": s.capacity, "user_id": s.user_id,
                  "signed_at": s.signed_at.isoformat(), "review_digest": s.review_digest}
                 for s in task.approval.signatures
             ]}
            if task.approval else None
        ),
        "review_digest": review_digest(task),
        "deliverables": [{"filename": d.filename, "sha256": d.sha256, "released": d.released}
                         for d in task.deliverables],
        "policy_events": len(task.policy_events),
        # Inside the run body, so it is under the content hash and the
        # signature: an edited digest or config hash fails both.
        **({"provenance": run_provenance(task, records)} if records is not None else {}),
    }


def issue_certificate(task: Task, audit: AuditLog, seal: AuditSeal, signer: HostSigner) -> dict[str, Any]:
    root = seal.seal(reason=f"certificate for task {task.id}")
    records = list(audit._iter_raw())[: root["events"]]
    hashes = [str(record.get("hash")) for record in records]
    events = [
        {"sequence": int(record.get("sequence", 0)), "hash": hashes[index], "proof": inclusion_proof(hashes, index)}
        for index, record in enumerate(records)
        if record.get("task_id") == task.id
    ]
    content = {
        "type": "aegis.run-certificate",
        "version": CERTIFICATE_VERSION,
        "issued_at": datetime.now(timezone.utc).isoformat(),
        "run": _body(task, records),
        "audit": {"root": root, "events": events},
    }
    content_sha256 = hashlib.sha256(canonical(content)).hexdigest()
    signed = {**content, "content_sha256": content_sha256}
    return {**signed, "signature": signer.sign(signed)}


def verify_certificate(
    certificate: dict[str, Any],
    *,
    trusted_key_b64: str | None = None,
    audit: AuditLog | None = None,
    deliverables_dir: Path | None = None,
) -> dict[str, Any]:
    """Check a certificate. Offline checks always run; online ones when given the log and store."""
    checks: list[dict[str, Any]] = []

    def check(name: str, passed: bool | None, detail: str) -> None:
        checks.append({"name": name, "passed": passed, "detail": detail})

    signature = certificate.get("signature") or {}
    signed = {key: value for key, value in certificate.items() if key != "signature"}
    content = {key: value for key, value in signed.items() if key != "content_sha256"}
    check("content hash", hashlib.sha256(canonical(content)).hexdigest() == certificate.get("content_sha256"),
          "the certificate body hashes to the value it states")
    check("signature", verify(signed, signature.get("value", ""), signature.get("public_key", "")),
          f"Ed25519 signature by key {signature.get('key_id')}")
    if trusted_key_b64 is not None:
        check("trusted key", signature.get("public_key") == trusted_key_b64,
              "signed by the key this verifier trusts, not merely by the key the certificate carries")

    audit_part = certificate.get("audit") or {}
    root = audit_part.get("root") or {}
    root_payload = {key: value for key, value in root.items() if key != "signature"}
    root_signature = root.get("signature") or {}
    check("audit root signature",
          verify(root_payload, root_signature.get("value", ""), root_signature.get("public_key", "")),
          f"root over {root.get('events')} events, sealed {root.get('sealed_at')}")
    events = audit_part.get("events") or []
    included = [verify_inclusion(e["hash"], e["proof"], root.get("merkle_root", "")) for e in events]
    check("audit inclusion", bool(events) and all(included),
          f"{sum(included)} of {len(events)} run events proven under the signed root")

    version = int(certificate.get("version") or 1)
    provenance = (certificate.get("run") or {}).get("provenance")
    if version >= 2:
        check("provenance present", isinstance(provenance, dict),
              "the run's model digests, config hashes, egress and sandbox record are in the signed body"
              if isinstance(provenance, dict) else f"a version {version} certificate must carry provenance")

    if audit is not None:
        # The leaves are the events' stored hashes, so the root alone cannot
        # see an event whose content was edited and whose hash was left be;
        # recomputing the chain can.
        chain = audit.verify_chain()
        check("audit chain intact", chain.valid,
              f"all {chain.events} events hash to their stored values" if chain.valid
              else f"event {chain.broken_at} no longer hashes to its stored value")
        records = list(audit._iter_raw())
        hashes = [str(record.get("hash")) for record in records]
        count = int(root.get("events", 0))
        reproduced = len(hashes) >= count and merkle_root(hashes[:count]) == root.get("merkle_root")
        check("log reproduces the root", reproduced,
              "the current log's first events still produce the certified root" if reproduced
              else "the log no longer produces the certified root: it was rewritten or truncated")
        if version >= 2 and isinstance(provenance, dict):
            # The audit-derived provenance is a function of the certified
            # events alone, so the log must still produce exactly it.
            task_id = (certificate.get("run") or {}).get("task_id", "")
            derived = from_audit(task_id, records[:count])
            stated = {"models": provenance.get("models"), "config": provenance.get("config"),
                      "egress_monitor": (provenance.get("egress") or {}).get("monitor")}
            differing = [key for key in stated if canonical(stated[key]) != canonical(derived[key])]
            check("provenance matches the log", not differing,
                  "model digests, config snapshot and egress reading are what the log recorded"
                  if not differing else f"the log records different {', '.join(differing)}")
    if version >= 2 and isinstance(provenance, dict) and provenance.get("formulas"):
        from backend.engineering.formulas import FORMULAS

        changed = [
            f"{item['formula']}@{item['version']}" for item in provenance["formulas"]
            if (current := FORMULAS.get(item["formula"])) is not None
            and current.version == item["version"] and current.source_hash != item["source_sha256"]
        ]
        # A newer version is a legitimate supersession; the same version with
        # a different source is a formula edited without a version bump.
        check("formula sources", not changed,
              "each certified formula version still has the certified source on this host"
              if not changed else f"changed without a version bump: {', '.join(changed)}")
    if deliverables_dir is not None:
        task_id = (certificate.get("run") or {}).get("task_id", "")
        for deliverable in (certificate.get("run") or {}).get("deliverables", []):
            path = deliverables_dir / task_id / deliverable["filename"]
            if not path.exists():
                check(f"deliverable {deliverable['filename']}", False, "the file is no longer in the store")
                continue
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
            check(f"deliverable {deliverable['filename']}", actual == deliverable["sha256"],
                  "the file's bytes are the certified bytes" if actual == deliverable["sha256"]
                  else f"the file now hashes to {actual[:16]}…, not the certified {deliverable['sha256'][:16]}…")

    return {
        "valid": all(item["passed"] for item in checks),
        "task_id": (certificate.get("run") or {}).get("task_id"),
        "key_id": signature.get("key_id"),
        "checks": checks,
    }


def write_certificate(certificate: dict[str, Any], directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{certificate['run']['task_id']}.json"
    path.write_text(json.dumps(certificate, indent=2, default=str))
    return path
