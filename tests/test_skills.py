"""Skills: saved instructions that change only what a run is asked.

A skill is called from the composer as /name. These hold what makes that
safe to hand to anyone: a template can carry nothing but {input}; the
built-in ones are worded so every run retrieves and none is made sensitive
by the template alone; adding one needs `skill.create` and deleting another
person's needs `skill.manage`; and a run started from a skill records which
skill, at which hash, from what input -- then meets every gate a typed
request meets, because by then it is one.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.api.main import create_app
from backend.core.analyzer import get_task_analyzer
from backend.core.audit import get_audit_log
from backend.core.database import Database
from backend.core.schemas import Sensitivity
from backend.skills import registry as skills_module
from backend.skills.registry import SKILL_DIR, SkillDefinition, SkillRegistry, SkillSource

#: Neutral inputs, so a classification comes from the template, not the input.
NEUTRAL_INPUT = "vessel V-2104"


@pytest.fixture
def fresh_registry(tmp_path: Path) -> Iterator[SkillRegistry]:
    """The routes' registry on an empty database, restored afterwards."""
    previous = skills_module._registry
    skills_module._registry = SkillRegistry(Database(path=tmp_path / "skills.sqlite"))
    try:
        yield skills_module._registry
    finally:
        skills_module._registry = previous


def sign_in(client: TestClient, username: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"username": username, "password": "workbench"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def definition(**overrides) -> dict:
    body = {
        "id": "psv-interval",
        "name": "PSV test interval",
        "summary": "The bench-test interval the SOPs set for a relief valve.",
        "template": "What bench-test interval do our SOPs set for {input}?",
    }
    body.update(overrides)
    return body


class TestTheBuiltInSkills:
    def test_every_file_loads_under_its_own_name(self) -> None:
        files = sorted(path.stem for path in SKILL_DIR.glob("*.yaml"))
        loaded = skills_module.get_skill_registry().builtins()
        assert sorted(loaded) == files
        assert all(skill.source == SkillSource.BUILT_IN for skill in loaded.values())
        assert all(len(skill.sha256) == 64 for skill in loaded.values())

    @pytest.mark.parametrize("skill_id", sorted(path.stem for path in SKILL_DIR.glob("*.yaml")))
    def test_every_run_retrieves(self, skill_id: str) -> None:
        skill = skills_module.get_skill_registry().get(skill_id)
        assert skill is not None
        profile = get_task_analyzer().analyze(skill.render(NEUTRAL_INPUT), requested_format=skill.deliverable_format)
        assert profile.requires_retrieval, f"/{skill_id} would answer without reading the SOPs"

    @pytest.mark.parametrize(
        "skill_id",
        # An approval note is sensitive under config/classification.yaml by
        # what it is, typed or not, so that one skill is the exception.
        sorted(path.stem for path in SKILL_DIR.glob("*.yaml") if path.stem != "approval-note"),
    )
    def test_no_template_makes_every_run_sensitive(self, skill_id: str) -> None:
        skill = skills_module.get_skill_registry().get(skill_id)
        assert skill is not None
        profile = get_task_analyzer().analyze(skill.render(NEUTRAL_INPUT), requested_format=skill.deliverable_format)
        assert profile.sensitivity == Sensitivity.NORMAL


class TestWhatATemplateMayCarry:
    def test_it_must_say_where_the_input_goes(self) -> None:
        with pytest.raises(ValidationError, match=r"\{input\}"):
            SkillDefinition(**definition(template="What bench-test interval do our SOPs set?"))

    @pytest.mark.parametrize(
        "template",
        [
            "Answer {input} about {vessel}",
            "Answer {input.__class__}",
            "Answer {input!r}",
            "Answer {input:>900}",
            "Answer {0} and {input}",
        ],
    )
    def test_nothing_but_a_bare_input_placeholder(self, template: str) -> None:
        with pytest.raises(ValidationError):
            SkillDefinition(**definition(template=template))

    def test_the_hash_follows_what_is_sent_not_the_label(self) -> None:
        a = SkillDefinition(**definition())
        renamed = SkillDefinition(**definition(name="Relief valve interval", summary="Same request."))
        reworded = SkillDefinition(**definition(template="Which bench-test interval applies to {input}?"))
        assert a.digest() == renamed.digest()
        assert a.digest() != reworded.digest()


class TestWhoMayAddAndRemove:
    def test_anyone_who_can_run_work_can_list_them(self, fresh_registry) -> None:
        with TestClient(create_app()) as client:
            response = client.get("/api/skills", headers=sign_in(client, "operator"))
        assert response.status_code == 200
        assert {"clause", "severity"} <= {skill["id"] for skill in response.json()}

    def test_an_operator_cannot_add_one(self, fresh_registry) -> None:
        with TestClient(create_app()) as client:
            response = client.post("/api/skills", json=definition(), headers=sign_in(client, "operator"))
        assert response.status_code == 403

    def test_an_engineer_adds_one_and_it_is_audited(self, fresh_registry) -> None:
        with TestClient(create_app()) as client:
            response = client.post("/api/skills", json=definition(), headers=sign_in(client, "engineer"))
            assert response.status_code == 201, response.text
            listed = client.get("/api/skills", headers=sign_in(client, "operator")).json()
        created = response.json()
        assert created["source"] == "custom" and created["author"] == "engineer"
        assert "psv-interval" in {skill["id"] for skill in listed}
        events = [e for e in get_audit_log().query(category="skill") if e.action == "created"]
        assert events and events[-1].detail["sha256"] == created["sha256"]

    @pytest.mark.parametrize("taken", ["clause", "psv-interval"])
    def test_a_name_in_use_is_refused(self, fresh_registry, taken: str) -> None:
        with TestClient(create_app()) as client:
            headers = sign_in(client, "engineer")
            client.post("/api/skills", json=definition(), headers=headers)
            response = client.post("/api/skills", json=definition(id=taken), headers=headers)
        assert response.status_code == 409

    def test_only_the_author_or_an_administrator_deletes_one(self, fresh_registry) -> None:
        with TestClient(create_app()) as client:
            client.post("/api/skills", json=definition(), headers=sign_in(client, "engineer"))
            by_reviewer = client.delete("/api/skills/psv-interval", headers=sign_in(client, "reviewer"))
            by_admin = client.delete("/api/skills/psv-interval", headers=sign_in(client, "admin"))
        assert by_reviewer.status_code == 403
        assert by_admin.status_code == 204

    def test_a_built_in_skill_is_not_deleted_over_http(self, fresh_registry) -> None:
        with TestClient(create_app()) as client:
            response = client.delete("/api/skills/clause", headers=sign_in(client, "admin"))
        assert response.status_code == 403
        assert "config/skills/" in response.json()["detail"]


class TestARunFromASkill:
    @pytest.fixture
    def tasks(self):
        """A task service whose worker never starts, so nothing is inferred."""
        from backend.agents.orchestrator import get_orchestrator
        from backend.api.task_service import TaskService

        orchestrator = get_orchestrator()
        previous = orchestrator._is_cancelled
        try:
            yield TaskService()
        finally:
            orchestrator._is_cancelled = previous

    async def test_it_records_the_skill_the_hash_and_the_input(self, tasks) -> None:
        from tests.test_harness_fixtures import make_user

        engineer = make_user("engineer", role="engineer", department="inspection", clearance=Sensitivity.RESTRICTED)
        skill = skills_module.get_skill_registry().get("clause")
        assert skill is not None

        task = await tasks.create_task(engineer, "internal inspection in corrosive service", [], skill_id="clause")

        assert task.prompt == skill.render("internal inspection in corrosive service")
        assert task.skill is not None
        assert (task.skill.id, task.skill.sha256, task.skill.input) == (
            "clause",
            skill.sha256,
            "internal inspection in corrosive service",
        )
        # Classified as the request it became, like anything typed.
        assert task.profile is not None and task.profile.requires_retrieval
        received = [e for e in get_audit_log().query(task_id=task.id) if e.action == "received"]
        assert received and received[0].detail["skill_sha256"] == skill.sha256

    async def test_a_document_skill_asks_for_its_document(self, tasks) -> None:
        from tests.test_harness_fixtures import make_user

        engineer = make_user("engineer", role="engineer", department="inspection", clearance=Sensitivity.RESTRICTED)
        task = await tasks.create_task(engineer, "continued operation of V-2104", [], skill_id="approval-note")
        assert task.profile is not None and task.profile.deliverable_format == "docx"
        # Held for sign-off like the same request typed by hand.
        assert task.approval is not None and task.approval.required

    async def test_an_unknown_skill_is_refused(self, tasks) -> None:
        from backend.api.task_service import TaskError
        from tests.test_harness_fixtures import make_user

        with pytest.raises(TaskError, match="No skill named /nope"):
            await tasks.create_task(make_user(), "anything", [], skill_id="nope")
