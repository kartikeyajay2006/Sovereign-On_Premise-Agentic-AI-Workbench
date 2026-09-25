"""Hybrid retrieval: vector and BM25 rankings fused by Reciprocal Rank Fusion.

The benchmark behind this: embeddings alone put the right passage first 71%
of the time, BM25 alone 100% on questions that reuse corpus wording, and a
judge's paraphrase favours embeddings. An exact identifier such as
"SOP-INS-014 Clause 4.4" is the case a vector blurs: every clause of that
procedure sits close to every other. Fusing the two ranks covers both.

The embedding model is never called: the query vector is supplied by a fake,
and each passage carries a hand-made vector, so what the vector ranker "misses"
is fixed by the fixture, not by a model.
"""

from __future__ import annotations

import pytest

from backend.rag.knowledge_base import KnowledgeBase, _pack, rrf_fuse


def _row(id: str, content: str, vector: list[float] | None, *, status: str = "active",
         classification: str = "normal") -> dict:
    return {
        "id": id,
        "document_id": f"doc-{id}",
        "ordinal": 0,
        "location": "section: 1",
        "content": content,
        "embedding": _pack(vector) if vector else None,
        "embedding_model": "fake-embed" if vector else None,
        "title": f"DOC-{id}",
        "department": "general",
        "classification": classification,
        "version": "1.0",
        "ingested_at": None,
        "source_path": f"{id}.md",
        "revision_status": status,
        "superseded_by": None,
    }


class _Chunks:
    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows

    def iter_chunks(self, departments=None):
        return [row for row in self.rows if not departments or row["department"] in departments]


QUERY = "What does SOP-INS-014 Clause 4.4 require?"
QUERY_VECTOR = [1.0, 0.0, 0.0]

CORPUS = [
    # The clause asked for. Its vector is far from the query's: the fixture's
    # stand-in for a model that blurs one clause into its neighbours.
    _row("CLAUSE44", "SOP-INS-014 Clause 4.4: thickness readings shall be taken on a fixed grid "
                     "and recorded against the previous survey.", [0.2, 1.0, 0.0]),
    # Passages the vector ranker prefers: about inspection in general.
    _row("GENERAL1", "Pressure vessel inspection covers external visual checks and ultrasonic "
                     "testing of the shell.", [1.0, 0.1, 0.0]),
    _row("GENERAL2", "Inspection intervals depend on the service category and corrosion rate.",
         [0.95, 0.2, 0.0]),
    _row("GENERAL3", "Records of each inspection are kept for the life of the vessel.", [0.9, 0.3, 0.1]),
    _row("OTHER", "Hot work permits require a gas test before work starts.", [0.0, 0.0, 1.0]),
]


def _knowledge_base(rows: list[dict], *, embeds: bool = True) -> KnowledgeBase:
    kb = KnowledgeBase(database=_Chunks(rows))  # type: ignore[arg-type]

    async def fake_embed(texts: list[str]):
        return ([QUERY_VECTOR for _ in texts], "fake-embed") if embeds else (None, None)

    kb._embed = fake_embed  # type: ignore[method-assign]
    return kb


# --------------------------------------------------------------------- fusion
def test_rrf_scores_are_the_sum_of_reciprocal_ranks() -> None:
    fused = rrf_fuse({"vector": ["a", "b", "c"], "lexical": ["c", "a"]}, k=60)
    scores = {key: score for key, score, _ in fused}
    assert scores["a"] == pytest.approx(1 / 61 + 1 / 62)
    assert scores["c"] == pytest.approx(1 / 63 + 1 / 61)
    assert scores["b"] == pytest.approx(1 / 62)
    assert [key for key, _, _ in fused] == ["a", "c", "b"]
    assert dict((key, ranks) for key, _, ranks in fused)["b"] == {"vector": 2}


def test_rrf_ties_are_broken_deterministically() -> None:
    # "x" and "y" earn the same score; the best rank reached, then the key, decides.
    first = rrf_fuse({"vector": ["x", "y"], "lexical": ["y", "x"]})
    second = rrf_fuse({"lexical": ["y", "x"], "vector": ["x", "y"]})
    assert [key for key, _, _ in first] == [key for key, _, _ in second] == ["x", "y"]


def test_k_is_configurable() -> None:
    fused = rrf_fuse({"vector": ["a"]}, k=10)
    assert fused[0][1] == pytest.approx(1 / 11)


# ------------------------------------------------------------------ retrieval
def test_vector_ranking_alone_misses_the_exact_clause() -> None:
    # The fixture's premise: by cosine, the clause is not in the top three.
    from backend.rag.knowledge_base import _cosine, _unpack

    by_cosine = sorted(CORPUS, key=lambda r: -_cosine(QUERY_VECTOR, _unpack(r["embedding"])))
    assert "CLAUSE44" not in [r["id"] for r in by_cosine[:3]]


@pytest.mark.asyncio
async def test_hybrid_search_finds_the_exact_clause_id() -> None:
    results, mode, _ = await _knowledge_base(CORPUS).search(QUERY, top_k=3)
    assert mode == "hybrid"
    assert results[0].source_document == "DOC-CLAUSE44"
    retrieval = results[0].extraction_data["retrieval"]
    assert retrieval["mode"] == "hybrid"
    assert retrieval["lexical_rank"] == 1
    assert retrieval["vector_rank"] == 4
    assert retrieval["fused_score"] == pytest.approx(round(1 / 61 + 1 / 64, 6))
    assert retrieval["rrf_k"] == 60
    # The reported score is the fused score over the best possible, 2/(k+1).
    assert results[0].score == pytest.approx(round((1 / 61 + 1 / 64) / (2 / 61), 4))


@pytest.mark.asyncio
async def test_every_hit_records_both_ranks_or_says_which_is_missing() -> None:
    results, _, _ = await _knowledge_base(CORPUS).search(QUERY, top_k=5)
    for item in results:
        retrieval = item.extraction_data["retrieval"]
        assert retrieval["vector_rank"] is not None or retrieval["lexical_rank"] is not None
        assert (retrieval["vector_similarity"] is None) == (retrieval["vector_rank"] is None)
        assert (retrieval["lexical_score"] is None) == (retrieval["lexical_rank"] is None)
    # A passage only the vector ranker found says so.
    general = next(i for i in results if i.source_document == "DOC-GENERAL3")
    assert general.extraction_data["retrieval"]["lexical_rank"] is None


@pytest.mark.asyncio
async def test_the_fused_order_is_deterministic() -> None:
    orders = []
    for rows in (CORPUS, list(reversed(CORPUS))):
        results, _, _ = await _knowledge_base(rows).search(QUERY, top_k=5)
        orders.append([item.source_document for item in results])
    assert orders[0] == orders[1]


@pytest.mark.asyncio
async def test_without_an_embedding_model_search_is_lexical_and_says_so() -> None:
    results, mode, _ = await _knowledge_base(CORPUS, embeds=False).search(QUERY, top_k=3)
    assert mode == "lexical"
    assert results[0].source_document == "DOC-CLAUSE44"
    retrieval = results[0].extraction_data["retrieval"]
    assert retrieval["mode"] == "lexical"
    assert retrieval["vector_rank"] is None and retrieval["fused_score"] is None
    assert "BM25 only" in retrieval["note"]
    assert results[0].score == 1.0
    assert results[0].extraction_method == "lexical retrieval"


@pytest.mark.asyncio
async def test_a_corpus_without_vectors_is_lexical_even_with_a_model() -> None:
    rows = [_row(r["id"], r["content"], None) for r in CORPUS]
    _, mode, _ = await _knowledge_base(rows).search(QUERY, top_k=3)
    assert mode == "lexical"


@pytest.mark.asyncio
async def test_superseded_revisions_stay_out_unless_history_is_asked_for() -> None:
    old = _row("CLAUSE44OLD", "SOP-INS-014 Clause 4.4 (Rev 4.1): readings may be taken anywhere on "
                              "the course.", [0.2, 1.0, 0.0], status="superseded")
    kb = _knowledge_base([*CORPUS, old])
    results, _, _ = await kb.search(QUERY, top_k=6)
    assert "DOC-CLAUSE44OLD" not in [item.source_document for item in results]
    results, _, _ = await kb.search(QUERY, top_k=6, include_history=True)
    assert "DOC-CLAUSE44OLD" in [item.source_document for item in results]


@pytest.mark.asyncio
async def test_clearance_is_still_applied_before_fusion() -> None:
    secret = _row("SECRET", "SOP-INS-014 Clause 4.4 restricted annex.", [1.0, 0.0, 0.0],
                  classification="restricted")
    results, _, _ = await _knowledge_base([*CORPUS, secret]).search(
        QUERY, top_k=6, max_classification="confidential")
    assert "DOC-SECRET" not in [item.source_document for item in results]
