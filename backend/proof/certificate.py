"""A signed certificate of one run, checkable offline.

It binds, by hash, everything a reviewer relied on: the request, the answer,
each piece of evidence (with its source file's hash and, for a procedure,
its code and revision), every registered-formula calculation (formula,
inputs and result hashes), each conflict and who resolved it, the
verification verdicts, the approval and the digest it was given against
(which, from review digest version 2, binds the prompt, the evidence set,
the policy files and the model digests as well as the answer), and the
deliverables' bytes. It carries the signed audit root taken when it
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


def _hash(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


#: The review digest written now. Version 1 bound what a reviewer reads (the
#: answer, deliverables, calculation results, conflicts and assessment);
#: version 2 also binds the prompt, the evidence set, the policy files and the
#: model digests. A signature or decision records the version it was given
#: under and is checked under that version's rules, so records written before
#: version 2 keep verifying.
REVIEW_DIGEST_VERSION = 2

#: What each bound input is called when it changes, in the order they are named.
BINDING_CHANGES: dict[str, str] = {
    "content": "the answer, a deliverable, a calculation result or a conflict resolution changed",
    "prompt": "the prompt changed",
    "evidence": "the evidence set changed",
    "policy": "the policy files changed",
    "models": "the model changed",
}


def _content_v1(task: Task) -> dict[str, Any]:
    """What a reviewer reads. Hashed alone, this is the version 1 review digest."""
    return {
        "answer": _sha(task.answer),
        "deliverables": sorted((d.filename, d.sha256) for d in task.deliverables),
        "results": [record.result_hash for record in task.calculations if record.result_hash],
        "conflicts": [
            (c.id, c.status, c.resolution.evidence_id if c.resolution else None) for c in task.conflicts
        ],
        "assessment": task.assessment.status if task.assessment else None,
    }


def _evidence(task: Task) -> list[dict[str, Any]]:
    """The run's evidence as the certificate records it; the binding reads the same entries."""
    return [
        {
            "id": item.id, "kind": item.kind, "source": item.source_document,
            "excerpt_sha256": _sha(item.excerpt), "source_sha256": item.source_sha256,
            "document_code": item.document_code, "revision_status": item.revision_status,
            "page": item.page_number, "classification": getattr(item.classification, "value", item.classification),
        }
        for item in task.evidence
    ]


def _routed_models(task: Task) -> list[str]:
    return sorted({
        str(model) for decision in (task.routing or [])
        if (model := (decision.get("selected_model") if isinstance(decision, dict)
                      else getattr(decision, "selected_model", None)))
    })


def _model_digests(task: Task) -> list[dict[str, Any]]:
    """Each model that served the run, with the digests the runtime reported for it.

    The digests are the ones recorded on the run's usage when each call was
    served, which are the ones the audit log records and the certificate's
    provenance reports. A routed model with no recorded digest is bound by
    name, with an empty digest list: said, never guessed.
    """
    digests: dict[str, set[str]] = {name: set() for name in _routed_models(task)}
    for usage in task.usage:
        entry = digests.setdefault(str(usage.model), set())
        if getattr(usage, "model_digest", None):
            entry.add(str(usage.model_digest))
    return [{"model": name, "digests": sorted(found)} for name, found in sorted(digests.items())]


def review_binding(task: Task) -> dict[str, Any]:
    """Everything a signature binds, part by part, and the version 2 digest over it.

    Each part is a hash of canonical, sorted JSON, so the same run always
    gives the same binding; the parts are kept so that a signature voided
    later can say which of them changed.
    """
    from backend.proof import provenance

    evidence = sorted(
        ((entry["id"], entry["source_sha256"], entry["excerpt_sha256"]) for entry in _evidence(task)),
        key=lambda entry: str(entry[0]),
    )
    policy = provenance.policy_file_hashes()
    models = _model_digests(task)
    parts = {
        "content": _hash(_content_v1(task)),
        # The certificate's prompt_sha256.
        "prompt": _sha(task.prompt),
        "evidence": _hash(evidence),
        "policy": _hash(policy),
        "models": _hash(models),
    }
    binding = {
        "version": REVIEW_DIGEST_VERSION,
        "digest": _hash({"digest_version": REVIEW_DIGEST_VERSION, **parts}),
        "parts": parts,
        "sources": len(evidence),
        "policy_files": len(policy),
        "models": models,
    }
    # For display only; the digest is over the parts.
    binding["summary"] = binding_summary(binding)
    return binding


def review_digest(task: Task, version: int = REVIEW_DIGEST_VERSION) -> str:
    """What a signature is given on, as one hash: an approval is bound to it.

    Version 2 (written now) changes with the answer, a deliverable's bytes, a
    calculation result, a conflict's resolution, the prompt, the evidence set
    or a source's hash, a policy file, or a model's digest. Version 1 covers
    only the first four and the assessment; it is computed for checking
    signatures and decisions recorded under it.
    """
    if version <= 1:
        return _hash(_content_v1(task))
    if version == 2:
        return review_binding(task)["digest"]
    raise ValueError(f"unknown review digest version {version}")


def binding_changes(before: dict[str, Any] | None, after: dict[str, Any]) -> list[str]:
    """The bound inputs that differ between two bindings, in BINDING_CHANGES order.

    Each is a review_binding result (or anything carrying its ``parts``).
    With nothing recorded for before (a version 1 signature), only the
    content can be compared, and it is reported as the content.
    """
    earlier = (before or {}).get("parts")
    if not earlier:
        return ["content"]
    now = after.get("parts") or {}
    return [key for key in BINDING_CHANGES if earlier.get(key) != now.get(key)]


def _short(value: str | None, size: int = 12) -> str:
    if not value:
        return "not recorded"
    return value.split(":", 1)[-1][:size]


def binding_summary(binding: dict[str, Any]) -> list[dict[str, str]]:
    """What a signature binds, as short labelled hashes: prompt · N sources · policy set · model digest."""
    parts = binding.get("parts") or {}
    sources = int(binding.get("sources") or 0)
    policy_files = int(binding.get("policy_files") or 0)
    models = binding.get("models") or []
    digests = sorted({digest for model in models for digest in model.get("digests") or []})
    if len(digests) == 1:
        model_label, model_hash = "model digest", _short(digests[0])
    elif digests:
        model_label, model_hash = f"{len(digests)} model digests", _short(parts.get("models"))
    elif models:
        # Bound by name only: the runtime reported no digest.
        model_label, model_hash = "model (no digest recorded)", _short(parts.get("models"))
    else:
        model_label, model_hash = "no model", _short(parts.get("models"))
    return [
        {"key": "prompt", "label": "prompt", "hash": _short(parts.get("prompt"))},
        {"key": "evidence", "label": f"{sources} source{'' if sources == 1 else 's'}",
         "hash": _short(parts.get("evidence"))},
        {"key": "policy", "label": f"policy set ({policy_files} file{'' if policy_files == 1 else 's'})",
         "hash": _short(parts.get("policy"))},
        {"key": "models", "label": model_label, "hash": model_hash},
    ]


def describe_changes(keys: list[str]) -> str:
    """'the model changed and the policy files changed', or a plain 'the run changed'."""
    phrases = [BINDING_CHANGES[key] for key in keys if key in BINDING_CHANGES]
    if not phrases:
        return "the run changed"
    return phrases[0] if len(phrases) == 1 else ", ".join(phrases[:-1]) + " and " + phrases[-1]


#: The certificate format issued now. Version 1 (no provenance) still
#: verifies: the checks that read provenance run only on version 2 and later.
CERTIFICATE_VERSION = 2


def _body(task: Task, records: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    verification = task.verification
    claims: dict[str, int] = {}
    for claim in verification.claims if verification else []:
        claims[claim.verdict] = claims.get(claim.verdict, 0) + 1
    binding = review_binding(task)
    return {
        "task_id": task.id,
        "status": task.status.value if hasattr(task.status, "value") else str(task.status),
        "submitted_by": task.user_id,
        "created_at": task.created_at.isoformat(),
        "prompt_sha256": _sha(task.prompt),
        "answer_sha256": _sha(task.answer),
        "models": _routed_models(task),
        "evidence": _evidence(task),
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
             "bound_digest_version": task.approval.bound_digest_version,
             # Each signature of a multi-signature approval, with the digest
             # it was given on (SOP-OPS-008 Clause 3.5).
             "signatures": [
                 {"authority": s.authority, "capacity": s.capacity, "user_id": s.user_id,
                  "signed_at": s.signed_at.isoformat(), "review_digest": s.review_digest,
                  "digest_version": s.digest_version}
                 for s in task.approval.signatures
             ]}
            if task.approval else None
        ),
        # The digest and, part by part, what it binds: the prompt, the
        # evidence set, the policy files and the model digests alongside
        # what the reviewer read.
        "review_digest": binding["digest"],
        "review_digest_version": binding["version"],
        "review_binding": binding["parts"],
        "review_bound": {"sources": binding["sources"], "policy_files": binding["policy_files"],
                         "models": binding["models"]},
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

    run_part = certificate.get("run") or {}
    binding = run_part.get("review_binding")
    if isinstance(binding, dict):
        # Certificates issued before the binding existed carry no parts and
        # skip this; their digest is a version 1 digest and says so by omission.
        version_stated = int(run_part.get("review_digest_version") or 1)
        recomputed = _hash({"digest_version": version_stated, **binding})
        check("review binding", recomputed == run_part.get("review_digest"),
              "the review digest is the hash of the prompt, evidence, policy, model and content parts it states"
              if recomputed == run_part.get("review_digest")
              else "the stated review digest is not the hash of the parts the certificate lists")

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
