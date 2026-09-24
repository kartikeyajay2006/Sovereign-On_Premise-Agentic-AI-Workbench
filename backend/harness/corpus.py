"""The part of the knowledge base a person can actually retrieve.

Two harness features read the corpus: the requirements register, which fans
out over indexed sections, and the scope line every preview shows before a
run starts. Both must describe exactly what a child task will be able to
retrieve. Otherwise a harness queues twenty runs against documents the
person's own retrieval never returns, and each one answers "no evidence" and
is held -- forty minutes later.

The rules mirror ``ToolRegistry._knowledge_search`` in
``backend/tools/registry.py``: a role outside ``file_access.override_roles``
searches its own department plus ``general``, and a passage classified above
the person's clearance is never returned. If those rules change there they
must change here; ``tests/test_harness_expansion.py`` pins the pairing.

This module only reads. It lists what is indexed; it grants nothing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from backend.core.config import ConfigError, get_config
from backend.core.database import Database, get_database
from backend.core.schemas import Sensitivity, User

# A long section is chunked as "section: 4. Assessment, part 2"; the register
# wants the section once.
PART_SUFFIX = re.compile(r",\s*part\s+\d+\s*$", re.IGNORECASE)
SECTION_PREFIX = "section: "
# Markdown text before the first heading. It carries no clause.
PREAMBLE = "preamble"


@dataclass(frozen=True)
class RetrievalScope:
    """What a person's knowledge_search can return."""

    # None means every department: the role holds cross-department read.
    departments: tuple[str, ...] | None
    max_classification: Sensitivity

    def includes(self, department: str) -> bool:
        return self.departments is None or department in self.departments


@dataclass(frozen=True)
class KnowledgeSection:
    key: str
    document_id: str
    document_title: str
    document_code: str
    department: str
    classification: str
    section: str
    ordinal: int


@dataclass(frozen=True)
class ScopeSummary:
    scope: RetrievalScope
    documents: int
    sections: int


def retrieval_scope(user: User) -> RetrievalScope:
    config = get_config()
    overrides = config.access_control.get("file_access", {}).get("override_roles") or []
    departments = None if user.role in overrides else (user.department, "general")
    return RetrievalScope(departments=departments, max_classification=user.max_data_classification)


def document_code(title: str) -> str:
    """The short reference a register row leads with: "SOP-INS-014".

    Titles here read "SOP-INS-014 — Pressure Vessel ...", so the part before
    the dash is the document's own reference. A title with no such part is
    used whole, shortened only for display.
    """
    for separator in (" — ", " – ", " - "):
        if separator in title:
            head = title.split(separator, 1)[0].strip()
            if head:
                return head
    return title if len(title) <= 40 else title[:39].rstrip() + "…"


def section_name(location: str | None) -> str:
    text = PART_SUFFIX.sub("", (location or "").strip())
    if text.lower().startswith(SECTION_PREFIX):
        text = text[len(SECTION_PREFIX):]
    return text.strip()


def _permitted(classification: str, ceiling: Sensitivity) -> bool:
    config = get_config()
    try:
        return config.classification_rank(classification) <= config.classification_rank(
            ceiling.value
        )
    except ConfigError:
        # An unknown level cannot be shown to be within clearance.
        return False


def _rows(
    database: Database, departments: tuple[str, ...] | list[str] | None
) -> list[dict[str, Any]]:
    query = (
        "SELECT d.id AS document_id, d.title, d.department, d.classification,"
        " c.location, c.ordinal"
        " FROM knowledge_chunks c JOIN knowledge_documents d ON d.id = c.document_id"
    )
    params: list[Any] = []
    if departments is not None:
        if not departments:
            return []
        query += f" WHERE d.department IN ({','.join('?' for _ in departments)})"
        params.extend(departments)
    query += " ORDER BY d.title COLLATE NOCASE, d.id, c.ordinal"
    with database.connect() as connection:
        return [dict(row) for row in connection.execute(query, params).fetchall()]


def list_sections(
    scope: RetrievalScope,
    *,
    department: str | None = None,
    title_filter: str | None = None,
    database: Database | None = None,
) -> list[KnowledgeSection]:
    """Every indexed section inside the scope, in document order.

    A document's title block is skipped: its first heading is the title
    itself, and the text under it is revision metadata rather than a clause.
    """
    if department is not None and not scope.includes(department):
        return []
    wanted = [department] if department is not None else scope.departments
    needle = (title_filter or "").strip().lower()

    sections: list[KnowledgeSection] = []
    seen: set[str] = set()
    for row in _rows(database or get_database(), wanted):
        if not _permitted(str(row["classification"]), scope.max_classification):
            continue
        title = str(row["title"])
        if needle and needle not in title.lower():
            continue
        name = section_name(row.get("location"))
        if not name or name.lower() == PREAMBLE or name == title.strip():
            continue
        key = f"{row['document_id']}#{name}"
        if key in seen:
            continue
        seen.add(key)
        sections.append(
            KnowledgeSection(
                key=key,
                document_id=str(row["document_id"]),
                document_title=title,
                document_code=document_code(title),
                department=str(row["department"]),
                classification=str(row["classification"]),
                section=name,
                ordinal=int(row["ordinal"]),
            )
        )
    return sections


def summarise_scope(scope: RetrievalScope, *, database: Database | None = None) -> ScopeSummary:
    """How much of the corpus this scope can see, counted, not estimated."""
    db = database or get_database()
    documents = {
        str(row["document_id"])
        for row in _rows(db, scope.departments)
        if _permitted(str(row["classification"]), scope.max_classification)
    }
    return ScopeSummary(
        scope=scope,
        documents=len(documents),
        sections=len(list_sections(scope, database=db)),
    )
