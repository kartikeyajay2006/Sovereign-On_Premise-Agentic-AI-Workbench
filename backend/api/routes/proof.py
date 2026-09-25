"""Signed proof: the host's public key, audit seals, and certificate verification."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, status

from backend.api.dependencies import CurrentUser, require_permission
from backend.core.audit import get_audit_log
from backend.core.config import get_config
from backend.core.schemas import User
from backend.proof.audit_roots import SealRefused, get_audit_seal
from backend.proof.certificate import verify_certificate
from backend.proof.signer import get_signer

router = APIRouter(prefix="/api", tags=["proof"])


@router.get("/proof/key")
def proof_key(user: CurrentUser) -> dict[str, str]:
    """The public half of this host's signing key, to check certificates with offline."""
    signer = get_signer()
    return {"algorithm": "Ed25519", "key_id": signer.key_id, "public_key": signer.public_key_b64}


@router.post("/proof/verify")
def proof_verify(user: CurrentUser, certificate: Annotated[dict[str, Any], Body()]) -> dict[str, Any]:
    """Check a certificate against this host's key, its audit log and its deliverable store."""
    result = verify_certificate(
        certificate,
        trusted_key_b64=get_signer().public_key_b64,
        audit=get_audit_log(),
        deliverables_dir=get_config().settings.path("deliverables"),
    )
    get_audit_log().record(
        category="proof", action="certificate_verified", actor=user.username, actor_role=user.role,
        task_id=result.get("task_id"),
        detail={"valid": result["valid"], "failed": [c["name"] for c in result["checks"] if not c["passed"]]},
    )
    return result


@router.post("/audit/seal")
def audit_seal(user: Annotated[User, Depends(require_permission("audit.read.all"))]) -> dict[str, Any]:
    """Sign the Merkle root of the audit log as it stands now."""
    try:
        return get_audit_seal().seal(reason=f"sealed on request by {user.username}")
    except SealRefused as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("/audit/seals")
def audit_seals(user: Annotated[User, Depends(require_permission("audit.read.all"))]) -> dict[str, Any]:
    """Every seal, each checked: signature, key, and whether today's log still produces it."""
    return get_audit_seal().verify()
