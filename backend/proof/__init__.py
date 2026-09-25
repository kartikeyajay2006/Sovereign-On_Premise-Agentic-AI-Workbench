"""Signed, independently checkable proof of what a run did.

The audit chain shows that no event was changed *relative to the events
around it*. Anyone able to write the log can still rewrite history and
recompute every hash after the edit, and the chain will verify. This package
adds what a chain cannot: a Merkle root over the log, signed with this
host's Ed25519 key, so an edit made after sealing breaks a signature nobody
without the key can re-make; and a per-run certificate binding a run's
prompt, evidence, calculations, verification, approval and deliverables to
that root, checkable offline with the public key alone.
"""
