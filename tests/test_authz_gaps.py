"""Two authorisation gaps found while integrating parallel work.

Each was a rule the product states and did not enforce: the Knowledge search
route could be asked to widen its own scope and filtered nothing by clearance,
and nothing stopped the account that ran a task from approving it -- while the
Approvals screen told engineers that exact separation was in place.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.api.routes import system as system_routes
from backend.api.task_service import TaskError, get_task_service
from backend.core.identity import get_identity_service
from backend.core.schemas import (
    ApprovalRecord,
    Sensitivity,
    EvidenceItem,
    Task,
    TaskStatus,
)


def _item(id: str, classification: str, department: str) -> EvidenceItem:
    return EvidenceItem(
        id=id,
        source_document=f"doc-{id}",
        excerpt=f"passage {id}",
        kind="knowledge_base",
        classification=Sensitivity(classification),
        department=department,
    )


class _RecordingKnowledgeBase:
    """Stands in for the index: records the scope it was asked for."""

    def __init__(self) -> None:
        self.calls: list[list[str] | None] = []
        self.ceilings: list[str | None] = []

    async def search(
        self, query, *, top_k=None, departments=None, min_score=None, max_classification=None
    ):
        self.calls.append(departments)
        self.ceilings.append(max_classification)
        return (
            [
                _item("S1", "normal", "operations"),
                _item("S2", "confidential", "operations"),
                _item("S3", "restricted", "general"),
            ],
            "lexical",
            1,
        )


@pytest.fixture
def operator_client(monkeypatch):
    """operator: department operations, clearance confidential, not an override role."""
    kb = _RecordingKnowledgeBase()
    monkeypatch.setattr(system_routes, "get_knowledge_base", lambda: kb)
    get_identity_service().ensure_seed_users()
    with TestClient(create_app()) as client:
        login = client.post("/api/auth/login", json={"username": "operator", "password": "workbench"})
        assert login.status_code == 200
        client.headers["Authorization"] = f"Bearer {login.json()['token']}"
        yield client, kb


class TestSearchCannotWidenScope:
    def test_naming_another_department_does_not_reach_it(self, operator_client):
        client, kb = operator_client
        response = client.post(
            "/api/knowledge/search", json={"query": "interval", "departments": ["inspection"]}
        )
        assert response.status_code == 200
        assert response.json()["results"] == []
        # The index was never asked about a department outside the caller's scope.
        assert kb.calls == []

    def test_a_mixed_request_is_narrowed_to_what_is_allowed(self, operator_client):
        client, kb = operator_client
        client.post(
            "/api/knowledge/search",
            json={"query": "interval", "departments": ["inspection", "operations"]},
        )
        assert kb.calls == [["operations"]]

    def test_an_unscoped_request_gets_own_department_and_general(self, operator_client):
        client, kb = operator_client
        client.post("/api/knowledge/search", json={"query": "interval"})
        assert kb.calls and set(kb.calls[0]) == {"operations", "general"}


class TestSearchRespectsClearance:
    def test_passages_above_clearance_are_withheld(self, operator_client):
        client, _ = operator_client
        response = client.post("/api/knowledge/search", json={"query": "interval"})
        returned = {item["id"] for item in response.json()["results"]}
        # confidential clearance: normal and confidential only.
        assert returned == {"S1", "S2"}

    def test_the_index_ranks_only_what_the_caller_is_cleared_for(self, operator_client):
        # The ceiling goes to the index itself, so passages above it never
        # occupy a top-k slot; the filter above is the second check.
        client, kb = operator_client
        client.post("/api/knowledge/search", json={"query": "interval"})
        assert kb.ceilings == ["confidential"]


def _account(username: str):
    """A seeded account, resolved the way a login resolves it."""
    identity = get_identity_service()
    identity.ensure_seed_users()
    return identity.authenticate(username, "workbench").user


class TestSeparationOfDuties:
    def _held_task_owned_by(self, user) -> Task:
        now = datetime.now(timezone.utc)
        task = Task(
            id=str(uuid.uuid4()),
            prompt="What severity applies?",
            status=TaskStatus.AWAITING_APPROVAL,
            user_id=user.id,
            user_display_name=user.display_name,
            department=user.department,
            created_at=now,
            updated_at=now,
            approval=ApprovalRecord(
                required=True,
                reasons=["verification_failure"],
                approver_roles=["reviewer", "administrator"],
                decision="pending",
            ),
        )
        get_task_service()._persist(task)
        return task

    def test_the_account_that_ran_a_task_cannot_approve_it(self):
        reviewer = _account("reviewer")
        task = self._held_task_owned_by(reviewer)

        with pytest.raises(TaskError, match="cannot approve or reject"):
            asyncio.run(get_task_service().decide_approval(task.id, reviewer, "approve", None))

        still = get_task_service().get_task(task.id)
        assert still.status == TaskStatus.AWAITING_APPROVAL
        assert still.approval.decision == "pending"

    def test_a_different_approving_account_can(self):
        reviewer = _account("reviewer")
        admin = _account("admin")
        task = self._held_task_owned_by(reviewer)

        decided = asyncio.run(get_task_service().decide_approval(task.id, admin, "approve", None))
        assert decided.approval.decision == "approved"
        assert decided.approval.reviewer_id == admin.id


class TestCatalogueRespectsScope:
    """The document list must not announce what search would refuse."""

    def test_titles_outside_scope_or_clearance_are_not_listed(self, monkeypatch):
        from datetime import datetime, timezone

        from backend.core.schemas import KnowledgeDocument

        def doc(title: str, department: str, classification: str) -> KnowledgeDocument:
            return KnowledgeDocument(
                id=title,
                title=title,
                source_path=f"{title}.md",
                department=department,
                classification=Sensitivity(classification),
                version="1.0",
                chunk_count=1,
                sha256="0" * 64,
                ingested_at=datetime.now(timezone.utc),
                media_type="text/markdown",
                size_bytes=10,
            )

        class Catalogue:
            def list_documents(self):
                return [
                    doc("ops-normal", "operations", "normal"),
                    doc("general-restricted", "general", "restricted"),
                    doc("inspection-confidential", "inspection", "confidential"),
                ]

        monkeypatch.setattr(system_routes, "get_knowledge_base", lambda: Catalogue())
        get_identity_service().ensure_seed_users()
        with TestClient(create_app()) as client:
            token = client.post(
                "/api/auth/login", json={"username": "operator", "password": "workbench"}
            ).json()["token"]
            listed = client.get(
                "/api/knowledge/documents", headers={"Authorization": f"Bearer {token}"}
            ).json()
        # operator: operations + general, clearance confidential.
        assert [d["title"] for d in listed] == ["ops-normal"]
