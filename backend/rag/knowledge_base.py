"""Industrial knowledge base: ingestion, embedding, retrieval.

Documents are parsed into addressable segments, chunked with overlap, embedded
by the local embedding model, and stored in SQLite alongside their provenance
(document, version, location, department, classification, ingestion date).
Retrieval returns :class:`EvidenceItem` objects carrying that provenance, so a
final answer can show *where* each claim came from.

Retrieval has two real modes:

* ``embedding`` - cosine similarity over locally computed vectors.
* ``lexical``   - BM25 over the same chunks, used when no embedding model is
  installed. Lower quality, but real retrieval rather than a stub.
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
from typing import Any, Iterable, Literal

from backend.core.config import get_config
from backend.core.database import Database, get_database
from backend.core.schemas import EvidenceItem, KnowledgeDocument, Sensitivity
from backend.models_layer.client import InferenceError, get_inference_client
from backend.models_layer.registry import get_model_registry
from backend.rag.parsing import ParsedDocument, extract_title, parse_document

TOKEN_PATTERN = re.compile(r"[a-z0-9][a-z0-9\-_/.]*")
BM25_K1 = 1.5
BM25_B = 0.75


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

    async def retrieval_mode(self) -> Literal["embedding", "lexical", "unavailable"]:
        descriptor = await self.registry.embedding_model()
        if descriptor is not None:
            return "embedding"
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

        record = {
            "id": document_id,
            "title": (
                title
                or extract_title(path)
                or path.stem.replace("_", " ").replace("-", " ").title()
            ),
            "source_path": str(path),
            "department": department,
            "classification": classification.value,
            "version": version,
            "sha256": sha,
            "media_type": parsed.media_type,
            "size_bytes": len(raw),
            "chunk_count": len(rows),
            "ingested_at": datetime.now(timezone.utc).isoformat(),
        }
        self.db.upsert_document(record)
        self.db.insert_chunks(rows)

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
        )

    async def ingest_directory(
        self,
        directory: Path,
        *,
        department: str = "general",
        classification: Sensitivity = Sensitivity.NORMAL,
    ) -> list[KnowledgeDocument]:
        supported = {
            str(suffix).lower()
            for suffix in self._kb_config.get("supported_ingest_extensions", [])
        }
        ingested: list[KnowledgeDocument] = []
        for path in sorted(directory.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in supported:
                continue
            try:
                ingested.append(
                    await self.ingest_file(
                        path, department=department, classification=classification
                    )
                )
            except Exception:
                continue
        return ingested

    # -- retrieval ---------------------------------------------------------
    def _to_evidence(
        self, row: dict[str, Any], score: float, index: int
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
    ) -> tuple[list[EvidenceItem], Literal["embedding", "lexical"], int]:
        started = time.perf_counter()
        limit = int(top_k or self._kb_config.get("default_top_k", 6))
        floor = float(min_score if min_score is not None else self._kb_config.get("min_score", 0.15))
        rows = self.db.iter_chunks(departments)
        if not rows:
            return [], "lexical", int((time.perf_counter() - started) * 1000)

        mode: Literal["embedding", "lexical"] = "lexical"
        scored: list[tuple[dict[str, Any], float]] = []

        embedded_rows = [row for row in rows if row.get("embedding")]
        if embedded_rows:
            vectors, _ = await self._embed([query])
            if vectors:
                mode = "embedding"
                query_vector = vectors[0]
                for row in embedded_rows:
                    similarity = _cosine(query_vector, _unpack(row["embedding"]))
                    if similarity > 0:
                        scored.append((row, similarity))

        if not scored:
            mode = "lexical"
            scored = self._bm25(query, rows)

        scored.sort(key=lambda item: item[1], reverse=True)
        results = [
            self._to_evidence(row, score, index)
            for index, (row, score) in enumerate(
                [item for item in scored if item[1] >= floor][:limit], start=1
            )
        ]
        return results, mode, int((time.perf_counter() - started) * 1000)

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
