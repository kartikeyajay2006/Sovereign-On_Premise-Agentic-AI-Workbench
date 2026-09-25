#!/usr/bin/env python3
"""Check an AEGIS run certificate.

    .venv/bin/python scripts/verify_certificate.py certificate.json --public-key KEY
    .venv/bin/python scripts/verify_certificate.py certificate.json --online

Offline (the default) needs only the certificate and the host's public key,
given with --public-key (base64, from GET /api/proof/key) or read from
storage/keys/proof-ed25519.pub. It checks the content hash, the Ed25519
signature, that the signer is the trusted key, the signed audit root, and a
Merkle inclusion proof for each of the run's audit events.

--online, run on the host, also re-reads the audit log and the deliverable
store: the log must still produce the certified root, and each deliverable
must still hash to its certified value. Exit code 0 only when every check
passes.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.proof.certificate import verify_certificate  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("certificate", type=Path)
    parser.add_argument("--public-key", help="base64 Ed25519 public key to trust")
    parser.add_argument("--online", action="store_true", help="also check the local audit log and deliverables")
    arguments = parser.parse_args()

    certificate = json.loads(arguments.certificate.read_text())
    audit = deliverables = None
    trusted = arguments.public_key
    if arguments.online or trusted is None:
        from backend.core.config import get_config

        settings = get_config().settings
        if trusted is None:
            key_file = settings.storage_root / "keys" / "proof-ed25519.pub"
            if not key_file.exists():
                print("No --public-key given and no local key file: nothing to trust.", file=sys.stderr)
                return 2
            trusted = key_file.read_text().strip()
        if arguments.online:
            from backend.core.audit import AuditLog

            audit = AuditLog()
            deliverables = settings.path("deliverables")

    result = verify_certificate(certificate, trusted_key_b64=trusted, audit=audit, deliverables_dir=deliverables)
    print(f"  run {result['task_id']} · key {result['key_id']}")
    for check in result["checks"]:
        print(f"  {'✓' if check['passed'] else '✗'} {check['name']:<28} {check['detail']}")
    print(f"\n  {'VALID' if result['valid'] else 'NOT VALID'}")
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
