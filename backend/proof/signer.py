"""This host's Ed25519 signing key.

Generated on first use and kept under the storage root with owner-only
permissions; it never leaves the host and is never logged. The public key is
published (GET /api/proof/key) and written beside the private key, so a
certificate can be checked by anyone holding it, offline. The key id is the
first 16 hex characters of the SHA-256 of the raw public key.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import threading
from pathlib import Path
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey


def canonical(payload: Any) -> bytes:
    """The one byte string a payload is signed and hashed as."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")


def key_id(public: Ed25519PublicKey) -> str:
    raw = public.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return hashlib.sha256(raw).hexdigest()[:16]


def public_key_from_b64(value: str) -> Ed25519PublicKey:
    return Ed25519PublicKey.from_public_bytes(base64.b64decode(value))


def verify(payload: Any, signature_b64: str, public_key_b64: str) -> bool:
    try:
        public_key_from_b64(public_key_b64).verify(base64.b64decode(signature_b64), canonical(payload))
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


class HostSigner:
    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.private_path = directory / "proof-ed25519.pem"
        self.public_path = directory / "proof-ed25519.pub"
        self._lock = threading.Lock()
        self._private: Ed25519PrivateKey | None = None

    def _load(self) -> Ed25519PrivateKey:
        with self._lock:
            if self._private is not None:
                return self._private
            self.directory.mkdir(parents=True, exist_ok=True)
            if self.private_path.exists():
                private = serialization.load_pem_private_key(self.private_path.read_bytes(), password=None)
                assert isinstance(private, Ed25519PrivateKey)
            else:
                private = Ed25519PrivateKey.generate()
                pem = private.private_bytes(
                    serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
                )
                descriptor = os.open(self.private_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(descriptor, "wb") as handle:
                    handle.write(pem)
                self.public_path.write_text(self.public_key_b64_of(private) + "\n")
            self._private = private
            return private

    @staticmethod
    def public_key_b64_of(private: Ed25519PrivateKey) -> str:
        raw = private.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        return base64.b64encode(raw).decode("ascii")

    @property
    def public_key_b64(self) -> str:
        return self.public_key_b64_of(self._load())

    @property
    def key_id(self) -> str:
        return key_id(self._load().public_key())

    def sign(self, payload: Any) -> dict[str, str]:
        signature = self._load().sign(canonical(payload))
        return {
            "algorithm": "Ed25519",
            "key_id": self.key_id,
            "public_key": self.public_key_b64,
            "value": base64.b64encode(signature).decode("ascii"),
        }


_signer: HostSigner | None = None


def get_signer() -> HostSigner:
    global _signer
    if _signer is None:
        from backend.core.config import get_config

        _signer = HostSigner(get_config().settings.storage_root / "keys")
    return _signer
