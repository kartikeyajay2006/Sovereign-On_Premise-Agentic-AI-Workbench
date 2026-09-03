"""SQLite persistence layer.

The reference architecture calls for PostgreSQL; on a single-host deployment
SQLite provides the same relational guarantees we need (users, tasks, files,
sessions, knowledge documents, approvals) without another service to operate.
The access layer below is deliberately narrow so swapping the engine later
means replacing this module, not the callers.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from backend.core.config import get_config

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL,
    department TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issued_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    filename TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    media_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    input_type TEXT NOT NULL,
    classification TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    department TEXT NOT NULL,
    quarantine_passed INTEGER NOT NULL DEFAULT 1,
    quarantine_notes TEXT NOT NULL DEFAULT '[]',
    uploaded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    department TEXT,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS knowledge_documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source_path TEXT NOT NULL,
    department TEXT NOT NULL,
    classification TEXT NOT NULL,
    version TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    media_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    ingested_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    location TEXT,
    content TEXT NOT NULL,
    token_estimate INTEGER NOT NULL,
    embedding BLOB,
    embedding_model TEXT
);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON knowledge_chunks(document_id);
"""


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    """Thin synchronous SQLite wrapper.

    FastAPI handlers call these methods from a worker thread (``run_in_threadpool``
    via ``def`` endpoints or explicit ``asyncio.to_thread``), so a per-call
    connection keeps this safe without a connection pool.
    """

    def __init__(self, path: Path | None = None) -> None:
        config = get_config()
        self.path = path or config.settings.path("database")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialise()

    # -- plumbing ----------------------------------------------------------
    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=30.0)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _initialise(self) -> None:
        with self.connect() as connection:
            connection.executescript(SCHEMA)

    # -- users -------------------------------------------------------------
    def count_users(self) -> int:
        with self.connect() as connection:
            row = connection.execute("SELECT COUNT(*) AS n FROM users").fetchone()
            return int(row["n"])

    def insert_user(self, record: dict[str, Any]) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO users (id, username, display_name, role, department,
                                   password_hash, active, created_at)
                VALUES (:id, :username, :display_name, :role, :department,
                        :password_hash, :active, :created_at)
                """,
                {**record, "created_at": record.get("created_at", _utcnow())},
            )

    def get_user_by_username(self, username: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE username = ?", (username,)
            ).fetchone()
            return dict(row) if row else None

    def get_user(self, user_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE id = ?", (user_id,)
            ).fetchone()
            return dict(row) if row else None

    def list_users(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM users ORDER BY username"
            ).fetchall()
            return [dict(row) for row in rows]

    # -- sessions ----------------------------------------------------------
    def create_session(self, token: str, user_id: str, issued_at: str, expires_at: str) -> None:
        with self.connect() as connection:
            connection.execute(
                "INSERT INTO sessions (token, user_id, issued_at, expires_at) "
                "VALUES (?, ?, ?, ?)",
                (token, user_id, issued_at, expires_at),
            )

    def get_session(self, token: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM sessions WHERE token = ?", (token,)
            ).fetchone()
            return dict(row) if row else None

    def delete_session(self, token: str) -> None:
        with self.connect() as connection:
            connection.execute("DELETE FROM sessions WHERE token = ?", (token,))

    def purge_expired_sessions(self) -> int:
        with self.connect() as connection:
            cursor = connection.execute(
                "DELETE FROM sessions WHERE expires_at < ?", (_utcnow(),)
            )
            return cursor.rowcount

    # -- files -------------------------------------------------------------
    def insert_file(self, record: dict[str, Any]) -> None:
        payload = dict(record)
        payload["quarantine_notes"] = json.dumps(payload.get("quarantine_notes") or [])
        payload["quarantine_passed"] = int(bool(payload.get("quarantine_passed", True)))
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO files (id, task_id, filename, stored_path, media_type,
                                   size_bytes, sha256, input_type, classification,
                                   owner_id, department, quarantine_passed,
                                   quarantine_notes, uploaded_at)
                VALUES (:id, :task_id, :filename, :stored_path, :media_type,
                        :size_bytes, :sha256, :input_type, :classification,
                        :owner_id, :department, :quarantine_passed,
                        :quarantine_notes, :uploaded_at)
                """,
                payload,
            )

    def get_file(self, file_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM files WHERE id = ?", (file_id,)
            ).fetchone()
            if row is None:
                return None
            record = dict(row)
            record["quarantine_notes"] = json.loads(record["quarantine_notes"])
            record["quarantine_passed"] = bool(record["quarantine_passed"])
            return record

    def list_files(self, owner_id: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
        query = "SELECT * FROM files"
        params: tuple[Any, ...] = ()
        if owner_id:
            query += " WHERE owner_id = ?"
            params = (owner_id,)
        query += " ORDER BY uploaded_at DESC LIMIT ?"
        params = params + (limit,)
        with self.connect() as connection:
            rows = connection.execute(query, params).fetchall()
        results = []
        for row in rows:
            record = dict(row)
            record["quarantine_notes"] = json.loads(record["quarantine_notes"])
            record["quarantine_passed"] = bool(record["quarantine_passed"])
            results.append(record)
        return results

    def attach_file_to_task(self, file_id: str, task_id: str) -> None:
        with self.connect() as connection:
            connection.execute(
                "UPDATE files SET task_id = ? WHERE id = ?", (task_id, file_id)
            )

    # -- tasks -------------------------------------------------------------
    def insert_task(self, task_id: str, user_id: str, department: str | None,
                    prompt: str, status: str, payload: dict[str, Any]) -> None:
        now = _utcnow()
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO tasks (id, user_id, department, prompt, status, payload,
                                   created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (task_id, user_id, department, prompt, status,
                 json.dumps(payload, default=str), now, now),
            )

    def update_task(self, task_id: str, status: str, payload: dict[str, Any],
                    completed: bool = False) -> None:
        now = _utcnow()
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE tasks
                   SET status = ?, payload = ?, updated_at = ?,
                       completed_at = CASE WHEN ? THEN ? ELSE completed_at END
                 WHERE id = ?
                """,
                (status, json.dumps(payload, default=str), now, int(completed), now, task_id),
            )

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM tasks WHERE id = ?", (task_id,)
            ).fetchone()
            if row is None:
                return None
            record = dict(row)
            record["payload"] = json.loads(record["payload"])
            return record

    def list_tasks(self, user_id: str | None = None, limit: int = 100,
                   statuses: list[str] | None = None) -> list[dict[str, Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        if user_id:
            clauses.append("user_id = ?")
            params.append(user_id)
        if statuses:
            placeholders = ",".join("?" for _ in statuses)
            clauses.append(f"status IN ({placeholders})")
            params.extend(statuses)
        query = "SELECT * FROM tasks"
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self.connect() as connection:
            rows = connection.execute(query, params).fetchall()
        results = []
        for row in rows:
            record = dict(row)
            record["payload"] = json.loads(record["payload"])
            results.append(record)
        return results

    # -- knowledge base ----------------------------------------------------
    def upsert_document(self, record: dict[str, Any]) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO knowledge_documents
                    (id, title, source_path, department, classification, version,
                     sha256, media_type, size_bytes, chunk_count, ingested_at)
                VALUES (:id, :title, :source_path, :department, :classification,
                        :version, :sha256, :media_type, :size_bytes, :chunk_count,
                        :ingested_at)
                ON CONFLICT(id) DO UPDATE SET
                    title=excluded.title, source_path=excluded.source_path,
                    department=excluded.department,
                    classification=excluded.classification,
                    version=excluded.version, sha256=excluded.sha256,
                    media_type=excluded.media_type, size_bytes=excluded.size_bytes,
                    chunk_count=excluded.chunk_count,
                    ingested_at=excluded.ingested_at
                """,
                record,
            )

    def delete_document_chunks(self, document_id: str) -> None:
        with self.connect() as connection:
            connection.execute(
                "DELETE FROM knowledge_chunks WHERE document_id = ?", (document_id,)
            )

    def insert_chunks(self, chunks: list[dict[str, Any]]) -> None:
        if not chunks:
            return
        with self.connect() as connection:
            connection.executemany(
                """
                INSERT INTO knowledge_chunks
                    (id, document_id, ordinal, location, content, token_estimate,
                     embedding, embedding_model)
                VALUES (:id, :document_id, :ordinal, :location, :content,
                        :token_estimate, :embedding, :embedding_model)
                """,
                chunks,
            )

    def list_documents(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM knowledge_documents ORDER BY ingested_at DESC"
            ).fetchall()
            return [dict(row) for row in rows]

    def get_document(self, document_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM knowledge_documents WHERE id = ?", (document_id,)
            ).fetchone()
            return dict(row) if row else None

    def delete_document(self, document_id: str) -> None:
        with self.connect() as connection:
            connection.execute(
                "DELETE FROM knowledge_documents WHERE id = ?", (document_id,)
            )

    def iter_chunks(self, departments: list[str] | None = None) -> list[dict[str, Any]]:
        query = """
            SELECT c.id, c.document_id, c.ordinal, c.location, c.content,
                   c.embedding, c.embedding_model,
                   d.title, d.department, d.classification, d.version,
                   d.ingested_at, d.source_path
              FROM knowledge_chunks c
              JOIN knowledge_documents d ON d.id = c.document_id
        """
        params: list[Any] = []
        if departments:
            placeholders = ",".join("?" for _ in departments)
            query += f" WHERE d.department IN ({placeholders})"
            params.extend(departments)
        with self.connect() as connection:
            rows = connection.execute(query, params).fetchall()
            return [dict(row) for row in rows]

    def count_chunks(self) -> int:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT COUNT(*) AS n FROM knowledge_chunks"
            ).fetchone()
            return int(row["n"])


_database: Database | None = None


def get_database() -> Database:
    global _database
    if _database is None:
        _database = Database()
    return _database
