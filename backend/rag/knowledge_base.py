"""Industrial knowledge base: ingestion, embedding, retrieval.

Documents are parsed into addressable segments, chunked with overlap, embedded
by the local embedding model, and stored in SQLite alongside their provenance
(document, version, location, department, classification, ingestion date).
Retrieval returns :class:`EvidenceItem` objects carrying that provenance, so a
final answer can show *where* each claim came from.

Retrieval has two real modes:

* ``hybrid``  - cosine similarity over locally computed vectors *and* BM25
  over the same chunks, fused by Reciprocal Rank Fusion. Each ranker covers
  the other's blind spot: embeddings find a paraphrase, BM25 finds an exact
  identifier ("SOP-INS-014 Clause 4.4") that a vector blurs into its
  neighbours.
* ``lexical`` - BM25 alone, used when no embedding model is installed (or the
  query cannot be embedded). Lower quality, but real retrieval, not a stub.

Every hit records its ranks in ``extraction_data["retrieval"]``, so the
evidence shows why it was retrieved.
"""

from __future__ import annotations

import hashlib
import math
import re
import struct
import time
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from backend.core.config import get_config
from backend.core.database import Database, get_database
from backend.core.schemas import EvidenceItem, KnowledgeDocument, Sensitivity
from backend.models_layer.client import InferenceError, get_inference_client
from backend.models_layer.registry import get_model_registry
from backend.knowledge.revisions import ACTIVE, DOC_CODE, parse_identity, resolve
from backend.rag.parsing import ParsedDocument, extract_title, parse_document

TOKEN_PATTERN = re.compile(r"[a-z0-9][a-z0-9\-_/.]*")
BM25_K1 = 1.5
BM25_B = 0.75
# The constant of Reciprocal Rank Fusion (Cormack et al., 2009). 60 is the
# published default: large enough that rank 1 and rank 2 in one list do not
# outweigh a passage both rankers placed well.
RRF_K = 60


def rrf_fuse(
    rankings: dict[str, list[str]], k: int = RRF_K
) -> list[tuple[str, float, dict[str, int]]]:
    """Fuse ranked lists of keys by Reciprocal Rank Fusion.

    Returns ``(key, fused score, {ranker: 1-based rank})`` best first. A key
    earns ``1 / (k + rank)`` from every list it appears in. Ties are broken by
    the best rank the key reached, then by the key itself, so the same inputs
    always give the same order.
    """
    ranks: dict[str, dict[str, int]] = {}
    for ranker, keys in rankings.items():
        for position, key in enumerate(keys, start=1):
            ranks.setdefault(key, {}).setdefault(ranker, position)
    fused = [
        (key, sum(1.0 / (k + rank) for rank in by_ranker.values()), by_ranker)
        for key, by_ranker in ranks.items()
    ]
    fused.sort(key=lambda entry: (-entry[1], min(entry[2].values()), entry[0]))
    return fused


def _pack(vector: list[float]) -> bytes:
    return struct.pack(f"<{len(vector)}f", *vector)


def _unpack(blob: bytes) -> list[float]:
    count = len(blob) // 4
    return list(struct.unpack(f"<{count}f", blob))


def _tokenize(text: str) -> list[str]:
    return TOKEN_PATTERN.findall(text.lower())


def _cosine(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    return dot / (left_norm * right_norm)


class KnowledgeBase:
    """Local, provenance-preserving document store and retriever."""

    def __init__(self, database: Database | None = None) -> None:
        self.config = get_config()
        self.db = database or get_database()
        self.client = get_inference_client()
        self.registry = get_model_registry()

    @property
    def _kb_config(self) -> dict[str, Any]:
        return self.config.settings.knowledge_base

    # -- chunking ----------------------------------------------------------
    def _chunk(self, parsed: ParsedDocument) -> list[tuple[str, str]]:
        """Split parsed segments into overlapping chunks of ``(text, location)``."""
        size = int(self._kb_config.get("chunk_size_chars", 1200))
        overlap = int(self._kb_config.get("chunk_overlap_chars", 180))
        minimum = int(self._kb_config.get("min_chunk_chars", 120))
        chunks: list[tuple[str, str]] = []

        for segment in parsed.segments:
            text = segment.text.strip()
            if not text:
                continue
            if len(text) <= size:
                if len(text) >= minimum or len(parsed.segments) == 1:
                    chunks.append((text, segment.location))
                continue

            start = 0
            part = 1
            while start < len(text):
                end = min(len(text), start + size)
                # Prefer a paragraph or sentence boundary near the end.
                if end < len(text):
                    window = text[start:end]
                    for boundary in ("\n\n", "\n", ". "):
                        cut = window.rfind(boundary)
                        if cut > size * 0.5:
                            end = start + cut + len(boundary)
                            break
                piece = text[start:end].strip()
                if len(piece) >= minimum:
                    chunks.append((piece, f"{segment.location}, part {part}"))
                    part += 1
                if end >= len(text):
                    break
                start = max(start + 1, end - overlap)
        return chunks

    # -- embeddings --------------------------------------------------------
    async def _embed(self, texts: list[str]) -> tuple[list[list[float]] | None, str | None]:
        descriptor = await self.registry.embedding_model()
        if descriptor is None:
            return None, None
        try:
            vectors = await self.client.embed(model=descriptor.provider_model, texts=texts)
        except InferenceError:
            return None, None
        return vectors, descriptor.id

    async def retrieval_mode(self) -> Literal["hybrid", "lexical", "unavailable"]:
        """What a search will do on this host: fuse both rankers, or BM25 alone."""
        descriptor = await self.registry.embedding_model()
        if descriptor is not None:
            return "hybrid"
        if bool(self._kb_config.get("lexical_fallback_enabled", True)):
            return "lexical"
        return "unavailable"

    # -- ingestion ---------------------------------------------------------
    async def ingest_file(
        self,
        path: Path,
        *,
        department: str = "general",
        classification: Sensitivity = Sensitivity.NORMAL,
        version: str = "1.0",
        title: str | None = None,
    ) -> KnowledgeDocument:
        parsed = parse_document(path)
        chunks = self._chunk(parsed)
        if not chunks:
            raise ValueError(
                f"'{path.name}' produced no indexable text. "
                + (" ".join(parsed.warnings) if parsed.warnings else "")
            )

        raw = path.read_bytes()
        sha = hashlib.sha256(raw).hexdigest()
        document_id = hashlib.sha256(f"{path.name}:{sha}".encode()).hexdigest()[:24]

        vectors, embedding_model = await self._embed([text for text, _ in chunks])

        self.db.delete_document_chunks(document_id)
        rows: list[dict[str, Any]] = []
        for ordinal, (text, location) in enumerate(chunks):
            vector = vectors[ordinal] if vectors else None
            rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "document_id": document_id,
                    "ordinal": ordinal,
                    "location": location,
                    "content": text,
                    "token_estimate": max(1, len(text) // 4),
                    "embedding": _pack(vector) if vector else None,
                    "embedding_model": embedding_model,
                }
            )

        resolved_title = (
            title
            or extract_title(path)
            or path.stem.replace("_", " ").replace("-", " ").title()
        )
        identity = parse_identity("\n".join(segment.text for segment in parsed.segments[:3]), resolved_title)
        if identity.revision and version in ("", "1.0"):
            version = identity.revision
        record = {
            "id": document_id,
            "title": resolved_title,
            "source_path": str(path),
            "department": department,
            "classification": classification.value,
            "version": version,
            "sha256": sha,
            "media_type": parsed.media_type,
            "size_bytes": len(raw),
            "chunk_count": len(rows),
            "ingested_at": datetime.now(timezone.utc).isoformat(),
            "document_code": identity.code,
            "revision_status": "withdrawn" if identity.withdrawn else ACTIVE,
            "effective_date": identity.effective_date,
            "supersedes": identity.supersedes,
            "superseded_by": None,
        }
        self.db.upsert_document(record)
        self.db.insert_chunks(rows)

        # Which revision of each code is in force, now that one more exists.
        self.reconcile_revisions()
        stored = self.db.get_document(document_id) or {}
        record["revision_status"] = stored.get("revision_status") or record["revision_status"]
        record["superseded_by"] = stored.get("superseded_by")

        return KnowledgeDocument(
            id=document_id,
            title=record["title"],
            source_path=record["source_path"],
            department=department,
            classification=classification,
            version=version,
            chunk_count=len(rows),
            sha256=sha,
            ingested_at=datetime.fromisoformat(record["ingested_at"]),
            media_type=parsed.media_type,
            size_bytes=len(raw),
            document_code=identity.code,
            revision_status=record["revision_status"],
            effective_date=identity.effective_date,
            supersedes=identity.supersedes,
            superseded_by=record["superseded_by"],
        )

    def reconcile_revisions(self) -> int:
        """Give every indexed document an identity; settle which revision is in force.

        Rows indexed before revision control carry no document code, so they
        sat outside their own family: ingesting an archived revision beside
        one made the archive the family's only member, and so "active". The
        code is read from the title, which the corpus begins with, and every
        family is resolved again. Returns how many documents changed.
        """
        rows = self.db.list_documents()
        changed: set[str] = set()
        for row in rows:
            if not row.get("document_code"):
                match = DOC_CODE.search(row.get("title") or "")
                if match:
                    self.db.set_document_code(row["id"], match.group(1))
                    row["document_code"] = match.group(1)
                    changed.add(row["id"])
        for code in sorted({row["document_code"] for row in rows if row.get("document_code")}):
            family = [row for row in rows if row.get("document_code") == code]
            for doc_id, (status, superseded_by) in resolve(family).items():
                row = next(r for r in family if r["id"] == doc_id)
                if ((row.get("revision_status") or ACTIVE), row.get("superseded_by")) != (status, superseded_by):
                    self.db.set_revision_status(doc_id, status, superseded_by)
                    changed.add(doc_id)
        return len(changed)

    # -- retrieval ---------------------------------------------------------
    def _to_evidence(
        self, row: dict[str, Any], score: float, index: int, retrieval: dict[str, Any]
    ) -> EvidenceItem:
        return EvidenceItem(
            id=f"S{index}",
            source_document=row["title"],
            document_id=row["document_id"],
            location=row.get("location"),
            excerpt=row["content"],
            score=round(float(score), 4),
            department=row.get("department"),
            classification=Sensitivity(row.get("classification", "normal")),
            version=row.get("version"),
            ingested_at=(
                datetime.fromisoformat(row["ingested_at"])
                if row.get("ingested_at")
                else None
            ),
            kind="knowledge_base",
            document_code=row.get("document_code"),
            revision_status=row.get("revision_status") or ACTIVE,
            superseded_by=row.get("superseded_by"),
            extraction_method=f"{retrieval['mode']} retrieval",
            extraction_data={"retrieval": retrieval},
        )

    @staticmethod
    def _bm25(query: str, rows: list[dict[str, Any]]) -> list[tuple[dict[str, Any], float]]:
        query_terms = _tokenize(query)
        if not query_terms:
            return []
        documents = [_tokenize(row["content"]) for row in rows]
        lengths = [len(doc) for doc in documents]
        avg_length = (sum(lengths) / len(lengths)) if lengths else 0.0
        document_frequency: Counter[str] = Counter()
        for doc in documents:
            for term in set(doc):
                document_frequency[term] += 1

        total = len(documents)
        scored: list[tuple[dict[str, Any], float]] = []
        for row, doc, length in zip(rows, documents, lengths):
            counts = Counter(doc)
            score = 0.0
            for term in query_terms:
                frequency = counts.get(term, 0)
                if frequency == 0:
                    continue
                df = document_frequency.get(term, 0)
                idf = math.log(1 + (total - df + 0.5) / (df + 0.5))
                denominator = frequency + BM25_K1 * (
                    1 - BM25_B + BM25_B * (length / avg_length if avg_length else 1)
                )
                score += idf * (frequency * (BM25_K1 + 1)) / denominator
            if score > 0:
                scored.append((row, score))
        if not scored:
            return []
        highest = max(score for _, score in scored)
        return [(row, score / highest) for row, score in scored]

    async def search(
        self,
        query: str,
        *,
        top_k: int | None = None,
        departments: list[str] | None = None,
        min_score: float | None = None,
        max_classification: str | None = None,
        include_history: bool = False,
    ) -> tuple[list[EvidenceItem], Literal["hybrid", "lexical"], int]:
        started = time.perf_counter()
        limit = int(top_k or self._kb_config.get("default_top_k", 6))
        floor = float(min_score if min_score is not None else self._kb_config.get("min_score", 0.15))
        rows = self.db.iter_chunks(departments)
        # The instruction in force, unless history was asked for. Like
        # clearance, this is applied before ranking: a superseded clause must
        # not take a slot from the active one it was replaced by.
        if not include_history:
            rows = [row for row in rows if (row.get("revision_status") or ACTIVE) == ACTIVE]
        # Clearance is applied before ranking, not after. Filtering the top k
        # afterwards gave an operator three passages where an engineer got six,
        # because Restricted passages had taken the other slots and were then
        # removed: less context for the answer, and a count that told the
        # operator something above their clearance had matched.
        if max_classification is not None:
            ceiling = self.config.classification_rank(max_classification)
            rows = [
                row
                for row in rows
                if self.config.classification_rank(row.get("classification") or "normal") <= ceiling
            ]
        if not rows:
            return [], "lexical", int((time.perf_counter() - started) * 1000)

        rrf_k = int(self._kb_config.get("rrf_k", RRF_K))

        def key(row: dict[str, Any]) -> str:
            # Stable across runs, unlike the order SQLite happens to return.
            return f"{row['document_id']}:{int(row.get('ordinal') or 0):06d}"

        # Each ranker keeps only what clears the floor on its own scale -- the
        # rule each mode applied before fusion -- so a passage BM25 matched on
        # one common word does not ride into the results on its fused rank.
        lexical = sorted(
            ((row, score) for row, score in self._bm25(query, rows) if score >= floor),
            key=lambda item: (-item[1], key(item[0])),
        )
        vector: list[tuple[dict[str, Any], float]] = []
        embedded_rows = [row for row in rows if row.get("embedding")]
        if embedded_rows:
            vectors, _ = await self._embed([query])
            if vectors:
                query_vector = vectors[0]
                for row in embedded_rows:
                    similarity = _cosine(query_vector, _unpack(row["embedding"]))
                    if similarity > 0 and similarity >= floor:
                        vector.append((row, similarity))
                vector.sort(key=lambda item: (-item[1], key(item[0])))

        results: list[EvidenceItem] = []
        if not vector:
            # No embedding model, no stored vectors, or nothing similar
            # enough: BM25 alone, and every hit says so rather than implying
            # a fusion that did not happen.
            for index, (row, score) in enumerate(lexical[:limit], start=1):
                results.append(self._to_evidence(row, score, index, {
                    "mode": "lexical",
                    "lexical_rank": index,
                    "lexical_score": round(score, 4),
                    "vector_rank": None,
                    "vector_similarity": None,
                    "fused_score": None,
                    "note": "no embedding model or query vector was available; BM25 only",
                }))
            return results, "lexical", int((time.perf_counter() - started) * 1000)

        by_key = {key(row): row for row, _ in [*vector, *lexical]}
        similarity = {key(row): score for row, score in vector}
        lexical_score = {key(row): score for row, score in lexical}
        fused = rrf_fuse(
            {"vector": [key(row) for row, _ in vector], "lexical": [key(row) for row, _ in lexical]},
            rrf_k,
        )
        # The reported score is the fused score over the most a passage could
        # earn (first in both lists), so it reads on 0..1 like the other
        # mode's. It ranks the passages; it is not a similarity.
        best = 2.0 / (rrf_k + 1)
        for index, (chunk, score, ranks) in enumerate(fused[:limit], start=1):
            results.append(self._to_evidence(by_key[chunk], score / best, index, {
                "mode": "hybrid",
                "vector_rank": ranks.get("vector"),
                "vector_similarity": round(similarity[chunk], 4) if chunk in similarity else None,
                "lexical_rank": ranks.get("lexical"),
                "lexical_score": round(lexical_score[chunk], 4) if chunk in lexical_score else None,
                "fused_score": round(score, 6),
                "rrf_k": rrf_k,
            }))
        return results, "hybrid", int((time.perf_counter() - started) * 1000)

    # -- management --------------------------------------------------------
    def list_documents(self) -> list[KnowledgeDocument]:
        documents: list[KnowledgeDocument] = []
        for row in self.db.list_documents():
            documents.append(
                KnowledgeDocument(
                    id=row["id"],
                    title=row["title"],
                    source_path=row["source_path"],
                    department=row["department"],
                    classification=Sensitivity(row["classification"]),
                    version=row["version"],
                    chunk_count=int(row["chunk_count"]),
                    sha256=row["sha256"],
                    ingested_at=datetime.fromisoformat(row["ingested_at"]),
                    media_type=row["media_type"],
                    size_bytes=int(row["size_bytes"]),
                    document_code=row.get("document_code"),
                    revision_status=row.get("revision_status") or ACTIVE,
                    effective_date=row.get("effective_date"),
                    supersedes=row.get("supersedes"),
                    superseded_by=row.get("superseded_by"),
                )
            )
        return documents

    def delete_document(self, document_id: str) -> bool:
        if self.db.get_document(document_id) is None:
            return False
        self.db.delete_document_chunks(document_id)
        self.db.delete_document(document_id)
        return True

    def stats(self) -> dict[str, int]:
        return {
            "documents": len(self.db.list_documents()),
            "chunks": self.db.count_chunks(),
        }


_knowledge_base: KnowledgeBase | None = None


def get_knowledge_base() -> KnowledgeBase:
    global _knowledge_base
    if _knowledge_base is None:
        _knowledge_base = KnowledgeBase()
    return _knowledge_base
