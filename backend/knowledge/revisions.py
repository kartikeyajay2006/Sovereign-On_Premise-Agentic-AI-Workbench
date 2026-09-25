"""Which revision of a procedure is in force.

A document's identity is its code (``SOP-INS-014``), not the file it arrived
in. Several revisions of one code can be in the index at once, but only one
is **active**: the highest revision that has not been withdrawn. The others
are **superseded** and name what replaced them. Retrieval uses active
revisions by default, so a question is answered from the instruction in force
rather than from whichever copy happens to be semantically closest; a
superseded revision is read only when history is asked for, and is then
labelled as superseded, never silently mixed in.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from backend.engineering.extraction import parse_date

DOC_CODE = re.compile(r"\b(SOP-[A-Z]{3}-\d{3}|ENG-DBM-\d{4}|INV-\d{4}-\d{3}|INS-\d{4}-\d{4})\b")
_FIELD = re.compile(r"^\*\*([A-Za-z][A-Za-z ]*):\*\*\s*(.+?)\s*$", re.M)

# A request that asks for history, not for the instruction in force.
HISTORY_REQUEST = re.compile(
    r"\b(superseded|previous\s+revision|earlier\s+revision|older\s+revision|historical|history\s+of|"
    r"rev(?:ision)?\s*\d+\.\d+|what\s+changed|as\s+it\s+was)\b",
    re.IGNORECASE,
)

ACTIVE = "active"
SUPERSEDED = "superseded"
WITHDRAWN = "withdrawn"


@dataclass
class DocumentIdentity:
    code: str | None = None
    revision: str | None = None
    effective_date: str | None = None
    supersedes: str | None = None
    withdrawn: bool = False


def parse_identity(text: str, title: str | None = None) -> DocumentIdentity:
    """Read a document's identity from its own header."""
    fields = {name.strip().lower(): value.strip() for name, value in _FIELD.findall(text[:4000])}
    identity = DocumentIdentity()
    code_source = fields.get("document") or title or text[:400]
    match = DOC_CODE.search(code_source or "")
    identity.code = match.group(1) if match else None
    revision = fields.get("revision")
    if revision:
        number = re.match(r"(\d+(?:\.\d+)*)", revision)
        identity.revision = number.group(1) if number else revision
    effective = fields.get("effective date")
    if effective:
        parsed = parse_date(effective)
        identity.effective_date = parsed.isoformat() if parsed else effective
    identity.supersedes = fields.get("supersedes")
    status = (fields.get("revision status") or "").lower()
    identity.withdrawn = "withdrawn" in status
    return identity


def revision_key(revision: str | None) -> tuple[int, ...]:
    if not revision:
        return (0,)
    return tuple(int(part) for part in re.findall(r"\d+", revision)) or (0,)


def resolve(documents: list[dict]) -> dict[str, tuple[str, str | None]]:
    """Status for every document of one code: {id: (status, superseded_by)}.

    The highest revision that is not withdrawn is active. Two uploads of the
    same revision are resolved in favour of the later ingestion, and the
    earlier one records that it was re-issued rather than silently vanishing.
    """
    candidates = [d for d in documents if d.get("revision_status") != WITHDRAWN]
    if not candidates:
        return {d["id"]: (WITHDRAWN, d.get("superseded_by")) for d in documents}
    active = max(candidates, key=lambda d: (revision_key(d.get("version")), d.get("ingested_at") or ""))
    label = f"{active.get('document_code') or active.get('title')} Rev {active.get('version')}"
    result: dict[str, tuple[str, str | None]] = {}
    for document in documents:
        if document["id"] == active["id"]:
            result[document["id"]] = (ACTIVE, None)
        elif document.get("revision_status") == WITHDRAWN:
            result[document["id"]] = (WITHDRAWN, document.get("superseded_by"))
        else:
            same = revision_key(document.get("version")) == revision_key(active.get("version"))
            result[document["id"]] = (SUPERSEDED, f"{label} (re-issued)" if same else label)
    return result
