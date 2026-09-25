"""A Merkle tree over audit event hashes, in the shape of RFC 6962.

Leaves and inner nodes are hashed with different one-byte prefixes, so a
leaf can never be passed off as a node. A tree of n leaves splits at the
largest power of two below n, which makes a root over the first k events
reproducible from the log alone for every k -- what lets a signed root
sealed yesterday be checked against today's longer log.
"""

from __future__ import annotations

import hashlib

EMPTY_ROOT = hashlib.sha256(b"").hexdigest()


def _leaf(value: str) -> bytes:
    return hashlib.sha256(b"\x00" + bytes.fromhex(value)).digest()


def _node(left: bytes, right: bytes) -> bytes:
    return hashlib.sha256(b"\x01" + left + right).digest()


def _split(n: int) -> int:
    k = 1
    while k * 2 < n:
        k *= 2
    return k


def _root(leaves: list[bytes]) -> bytes:
    if len(leaves) == 1:
        return leaves[0]
    k = _split(len(leaves))
    return _node(_root(leaves[:k]), _root(leaves[k:]))


def merkle_root(hashes: list[str]) -> str:
    """The root over hex leaf hashes, in order; the empty root for none."""
    if not hashes:
        return EMPTY_ROOT
    return _root([_leaf(value) for value in hashes]).hex()


def inclusion_proof(hashes: list[str], index: int) -> list[list[str]]:
    """The audit path for leaf ``index``: [side, sibling] pairs, leaf upwards."""
    if not 0 <= index < len(hashes):
        raise IndexError(f"leaf {index} is outside a tree of {len(hashes)}")
    path: list[list[str]] = []

    def walk(leaves: list[bytes], position: int) -> None:
        if len(leaves) == 1:
            return
        k = _split(len(leaves))
        if position < k:
            walk(leaves[:k], position)
            path.append(["right", _root(leaves[k:]).hex()])
        else:
            walk(leaves[k:], position - k)
            path.append(["left", _root(leaves[:k]).hex()])

    walk([_leaf(value) for value in hashes], index)
    return path


def verify_inclusion(leaf_hash: str, path: list[list[str]], root: str) -> bool:
    """Whether ``leaf_hash`` sits under ``root`` by ``path``."""
    try:
        current = _leaf(leaf_hash)
        for side, sibling in path:
            other = bytes.fromhex(sibling)
            current = _node(other, current) if side == "left" else _node(current, other)
    except (ValueError, TypeError):
        return False
    return current.hex() == root
