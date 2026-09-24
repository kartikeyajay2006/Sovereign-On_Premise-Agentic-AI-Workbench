"""Persistence for harness runs.

One table beside ``tasks`` in the same SQLite database, in the same shape: a
few indexed columns for listing and filtering, and the full record as a JSON
payload. The harness owns this table and creates it on first use, so
``backend/core/database.py`` needs no change; everything goes through that
module's ``connect()``, which keeps the per-call connection, WAL journal and
commit-or-rollback behaviour identical to the rest of the workbench.

Child tasks are not copied here. A run stores their ids and reads the task
records back, so there is one record of what each child did, not two that
can drift.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from backend.core.database import Database, get_database
from backend.harness.models import HarnessRun

SCHEMA = """
CREATE TABLE IF NOT EXISTS harness_runs (
    id TEXT PRIMARY KEY,
    harness_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_harness_runs_user ON harness_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_harness_runs_status ON harness_runs(status);
"""


class HarnessStore:
    def __init__(self, database: Database | None = None) -> None:
        self.db = database or get_database()
        with self.db.connect() as connection:
            connection.executescript(SCHEMA)

    def save(self, run: HarnessRun) -> None:
        run.updated_at = datetime.now(timezone.utc)
        payload = json.dumps(run.model_dump(mode="json"), default=str)
        completed = run.finished_at.isoformat() if run.finished_at else None
        with self.db.connect() as connection:
            connection.execute(
                """
                INSERT INTO harness_runs (id, harness_id, user_id, status, payload,
                                          created_at, updated_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    status = excluded.status,
                    payload = excluded.payload,
                    updated_at = excluded.updated_at,
                    completed_at = excluded.completed_at
                """,
                (
                    run.id,
                    run.harness.id,
                    run.user_id,
                    run.status.value,
                    payload,
                    run.created_at.isoformat(),
                    run.updated_at.isoformat(),
                    completed,
                ),
            )

    def get(self, run_id: str) -> HarnessRun | None:
        with self.db.connect() as connection:
            row = connection.execute(
                "SELECT payload FROM harness_runs WHERE id = ?", (run_id,)
            ).fetchone()
        return HarnessRun.model_validate(json.loads(row["payload"])) if row else None

    def list(
        self,
        user_id: str | None = None,
        *,
        limit: int = 50,
        statuses: list[str] | None = None,
    ) -> list[HarnessRun]:
        clauses: list[str] = []
        params: list[object] = []
        if user_id:
            clauses.append("user_id = ?")
            params.append(user_id)
        if statuses:
            clauses.append(f"status IN ({','.join('?' for _ in statuses)})")
            params.extend(statuses)
        query = "SELECT payload FROM harness_runs"
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self.db.connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [HarnessRun.model_validate(json.loads(row["payload"])) for row in rows]
