"""Only the revision in force answers a question, unless history is asked for.

Before revision control, SOP-INS-014 Rev 4.1 and Rev 4.3 sat side by side in
the index. A question about corrosive service could be answered with 4.1's
36-month thickness survey, which 4.2 shortened to 24 months, and nothing on
the answer would say the clause had been replaced.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from backend.agents.orchestrator import _revision_note
from backend.core.database import Database
from backend.core.schemas import EvidenceItem, Sensitivity
from backend.knowledge.revisions import HISTORY_REQUEST, parse_identity, resolve
from backend.rag.knowledge_base import KnowledgeBase

ROOT = Path(__file__).resolve().parents[1]
CURRENT = ROOT / "sample_data" / "sop" / "SOP-INS-014-pressure-vessel-inspection.md"
ARCHIVED = ROOT / "sample_data" / "sop" / "archive" / "SOP-INS-014-rev-4.1-pressure-vessel-inspection.md"
QUERY = "thickness survey interval for a pressure vessel in corrosive service"


class _Lexical(KnowledgeBase):
    async def _embed(self, texts):  # no inference server in tests
        return None, None


def _knowledge_base(tmp_path: Path) -> KnowledgeBase:
    return _Lexical(database=Database(tmp_path / "kb.db"))


def _ingest(knowledge_base: KnowledgeBase, *paths: Path) -> list:
    async def run():
        return [
            await knowledge_base.ingest_file(path, department="inspection", classification=Sensitivity.CONFIDENTIAL)
            for path in paths
        ]
    return asyncio.run(run())


def _search(knowledge_base: KnowledgeBase, **options):
    results, _, _ = asyncio.run(knowledge_base.search(QUERY, top_k=8, min_score=0.0, **options))
    return results


def test_identity_is_read_from_the_document_header() -> None:
    identity = parse_identity(ARCHIVED.read_text())
    assert identity.code == "SOP-INS-014"
    assert identity.revision == "4.1"
    assert identity.effective_date == "2023-03-01"
    assert identity.supersedes == "SOP-INS-014 Rev 4.0"
    assert not identity.withdrawn


def test_the_highest_revision_not_withdrawn_is_in_force() -> None:
    family = [
        {"id": "a", "version": "4.1", "document_code": "SOP-INS-014", "ingested_at": "2"},
        {"id": "b", "version": "4.3", "document_code": "SOP-INS-014", "ingested_at": "1"},
        {"id": "c", "version": "4.4", "document_code": "SOP-INS-014", "revision_status": "withdrawn"},
    ]
    status = resolve(family)
    assert status["b"] == ("active", None)
    assert status["a"] == ("superseded", "SOP-INS-014 Rev 4.3")
    assert status["c"][0] == "withdrawn"


def test_a_re_issued_revision_names_its_replacement() -> None:
    family = [
        {"id": "old", "version": "4.3", "document_code": "SOP-INS-014", "ingested_at": "1"},
        {"id": "new", "version": "4.3", "document_code": "SOP-INS-014", "ingested_at": "2"},
    ]
    status = resolve(family)
    assert status["new"] == ("active", None)
    assert status["old"] == ("superseded", "SOP-INS-014 Rev 4.3 (re-issued)")


@pytest.mark.parametrize("order", ["archive first", "archive last"])
def test_ingestion_order_does_not_decide_which_revision_is_in_force(tmp_path: Path, order: str) -> None:
    knowledge_base = _knowledge_base(tmp_path)
    paths = (ARCHIVED, CURRENT) if order == "archive first" else (CURRENT, ARCHIVED)
    _ingest(knowledge_base, *paths)
    documents = {document.version: document for document in knowledge_base.list_documents()}
    assert documents["4.3"].revision_status == "active"
    assert documents["4.1"].revision_status == "superseded"
    assert documents["4.1"].superseded_by and "Rev 4.3" in documents["4.1"].superseded_by


def test_a_question_is_answered_from_the_revision_in_force(tmp_path: Path) -> None:
    knowledge_base = _knowledge_base(tmp_path)
    current, archived = _ingest(knowledge_base, CURRENT, ARCHIVED)
    results = _search(knowledge_base)
    assert results, "the revision in force should match the query"
    assert {item.revision_status for item in results} == {"active"}
    assert archived.id not in {item.document_id for item in results}
    assert current.id in {item.document_id for item in results}


def test_history_is_searched_only_when_asked_for_and_is_labelled(tmp_path: Path) -> None:
    knowledge_base = _knowledge_base(tmp_path)
    _ingest(knowledge_base, CURRENT, ARCHIVED)
    results = _search(knowledge_base, include_history=True)
    superseded = [item for item in results if item.revision_status == "superseded"]
    assert superseded, "the archived revision should be searchable when history is requested"
    note = _revision_note(superseded[0])
    assert "SUPERSEDED" in note and "not in force" in note and "Rev 4.3" in note


def test_a_passage_in_force_carries_no_label() -> None:
    item = EvidenceItem(id="S1", source_document="SOP", excerpt="text", classification=Sensitivity.NORMAL)
    assert _revision_note(item) == ""


@pytest.mark.parametrize(
    ("prompt", "history"),
    [
        ("What did SOP-INS-014 Rev 4.1 require for corrosive service?", True),
        ("Show the superseded interval for corrosive vessels", True),
        ("What changed between the revisions of SOP-INS-014?", True),
        ("Calculate the corrosion rate and remaining life for V-2104", False),
        ("What is the thickness survey interval for corrosive service?", False),
    ],
)
def test_history_is_requested_only_in_so_many_words(prompt: str, history: bool) -> None:
    assert bool(HISTORY_REQUEST.search(prompt)) is history


def test_a_document_indexed_before_revision_control_joins_its_family(tmp_path: Path) -> None:
    # An index built before this change has no document code on its rows.
    # Ingesting an archived revision next to it must not make the archive the
    # "only" member of the family, and so the revision in force.
    knowledge_base = _knowledge_base(tmp_path)
    (current,) = _ingest(knowledge_base, CURRENT)
    with knowledge_base.db.connect() as connection:
        connection.execute(
            "UPDATE knowledge_documents SET document_code = NULL, revision_status = 'active' WHERE id = ?",
            (current.id,),
        )
    _ingest(knowledge_base, ARCHIVED)
    documents = {document.version: document for document in knowledge_base.list_documents()}
    assert documents["4.3"].document_code == "SOP-INS-014"
    assert documents["4.3"].revision_status == "active"
    assert documents["4.1"].revision_status == "superseded"


def test_reconciling_an_old_index_settles_every_family(tmp_path: Path) -> None:
    knowledge_base = _knowledge_base(tmp_path)
    current, archived = _ingest(knowledge_base, CURRENT, ARCHIVED)
    with knowledge_base.db.connect() as connection:
        connection.execute("UPDATE knowledge_documents SET document_code = NULL, revision_status = 'active'")
    assert knowledge_base.reconcile_revisions() == 2
    documents = {document.id: document for document in knowledge_base.list_documents()}
    assert documents[current.id].revision_status == "active"
    assert documents[archived.id].revision_status == "superseded"
    assert knowledge_base.reconcile_revisions() == 0
