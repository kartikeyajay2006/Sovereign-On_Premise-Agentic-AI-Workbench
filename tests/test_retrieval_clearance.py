"""Clearance is applied before ranking, so it cannot cost a user context.

Retrieval used to rank every passage in scope, keep the top k, and only then
drop what the user was not cleared for. For the Scenario 3 question an
engineer got six passages and an operator three: Restricted passages had
taken the other slots. The operator's answer had half the context, and the
count itself said something above their clearance had matched.
"""

from __future__ import annotations

import pytest

from backend.rag.knowledge_base import KnowledgeBase


def _row(id: str, classification: str, content: str) -> dict:
    return {
        "id": id,
        "document_id": f"doc-{id}",
        "ordinal": 0,
        "location": "section: 1",
        "content": content,
        "embedding": None,
        "embedding_model": None,
        "title": f"DOC-{id}",
        "department": "general",
        "classification": classification,
        "version": "1.0",
        "ingested_at": None,
        "source_path": f"{id}.md",
    }


class _Chunks:
    """The index as rows, without embeddings, so search runs lexically."""

    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows

    def iter_chunks(self, departments=None):
        return [row for row in self.rows if not departments or row["department"] in departments]


ROWS = [
    # Restricted passages that match the query best: they would fill the top
    # three if clearance were applied afterwards.
    _row("R1", "restricted", "installed cost of the replacement vessel, expenditure approval"),
    _row("R2", "restricted", "the replacement vessel installed cost and its expenditure approval"),
    _row("R3", "restricted", "expenditure approval for the installed cost of the replacement vessel"),
    _row("C1", "confidential", "expenditure approval bands in the delegation matrix for plant equipment"),
    _row("C2", "confidential", "installed cost is recorded against the project budget code"),
    _row("N1", "normal", "a replacement vessel is registered before it enters service"),
    _row("X1", "normal", "hot work permit gas test"),
]


@pytest.fixture
def knowledge_base() -> KnowledgeBase:
    return KnowledgeBase(database=_Chunks(ROWS))  # type: ignore[arg-type]


class TestClearanceBeforeRanking:
    @pytest.mark.asyncio
    async def test_a_confidential_user_gets_a_full_set_of_passages_they_may_read(
        self, knowledge_base: KnowledgeBase
    ) -> None:
        results, mode, _ = await knowledge_base.search(
            "installed cost of the replacement vessel expenditure approval",
            top_k=3,
            max_classification="confidential",
        )
        assert mode == "lexical"
        # Evidence ids are allocated per search (S1..), so the document names it.
        assert sorted(item.source_document for item in results) == ["DOC-C1", "DOC-C2", "DOC-N1"]
        assert all(item.classification.value in {"normal", "confidential"} for item in results)

    @pytest.mark.asyncio
    async def test_without_a_ceiling_the_best_matches_win_whatever_their_class(
        self, knowledge_base: KnowledgeBase
    ) -> None:
        results, _, _ = await knowledge_base.search(
            "installed cost of the replacement vessel expenditure approval", top_k=3
        )
        assert [item.classification.value for item in results] == ["restricted"] * 3

    @pytest.mark.asyncio
    async def test_a_restricted_user_still_sees_restricted_passages(
        self, knowledge_base: KnowledgeBase
    ) -> None:
        results, _, _ = await knowledge_base.search(
            "installed cost of the replacement vessel expenditure approval",
            top_k=3,
            max_classification="restricted",
        )
        assert [item.classification.value for item in results] == ["restricted"] * 3
