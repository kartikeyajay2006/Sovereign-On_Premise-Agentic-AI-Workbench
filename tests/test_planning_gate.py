"""When a run is worth paying for a plan.

Planning was unconditional and was the most expensive stage of every run --
79 seconds of a measured 200-second run, producing JSON that no client
renders and that one membership test consumed. These pin the condition so it
cannot quietly go back to planning everything.
"""

from backend.agents.orchestrator import _needs_plan
from backend.core.schemas import TaskProfile


def _profile(**overrides) -> TaskProfile:
    """A plain retrieval question, as the classifier actually returns one."""
    base = dict(
        input_type="text",
        task_type="question_answering",
        complexity="simple",
        sensitivity="normal",
        confidence=0.8,
        # 14 is what the classifier returns for a one-sentence question. It is
        # a ceiling it permits, not an estimate of steps required, which is
        # why the gate must not read it.
        step_budget=14,
        requires_retrieval=True,
        requires_vision=False,
        requires_code_execution=False,
        produces_deliverable=False,
    )
    base.update(overrides)
    return TaskProfile(**base)


class TestWhenPlanningIsSkipped:
    def test_a_plain_retrieval_question_needs_no_plan(self):
        assert _needs_plan(_profile(), []) is False

    def test_a_generous_step_budget_alone_does_not_trigger_planning(self):
        """The regression this gate exists to avoid.

        Any test against step_budget would keep planning for everything,
        because a one-step question is handed a budget of 14.
        """
        assert _needs_plan(_profile(step_budget=99), []) is False


class TestWhenPlanningIsWorthIt:
    def test_code_execution_needs_a_plan(self):
        assert _needs_plan(_profile(requires_code_execution=True), []) is True

    def test_vision_needs_a_plan(self):
        assert _needs_plan(_profile(requires_vision=True), []) is True

    def test_producing_a_deliverable_needs_a_plan(self):
        assert _needs_plan(_profile(produces_deliverable=True), []) is True

    def test_attachments_need_a_plan(self, tmp_path):
        """Handling depends on what the attachment turns out to be."""
        from backend.core.schemas import StoredFile

        stored = StoredFile(
            id="f1",
            filename="drawing.pdf",
            stored_path=str(tmp_path / "drawing.pdf"),
            media_type="application/pdf",
            size_bytes=1024,
            sha256="0" * 64,
            input_type="document",
            classification="normal",
            owner_id="u1",
            department="inspection",
            quarantine_passed=True,
            uploaded_at="2026-09-23T00:00:00Z",
        )
        assert _needs_plan(_profile(), [stored]) is True


# ------------------------------------------------ plans from the task shape
def _stored(tmp_path, filename: str):
    from backend.core.schemas import StoredFile

    return StoredFile(
        id="f1", filename=filename, stored_path=str(tmp_path / filename),
        media_type="application/octet-stream", size_bytes=1024, sha256="0" * 64,
        input_type="document", classification="normal", owner_id="u1",
        department="inspection", quarantine_passed=True, uploaded_at="2026-09-23T00:00:00Z",
    )


class TestWhenThePlanComesFromTheTaskShape:
    """A model plan's one effect on a run is adding code the profile lacks."""

    def test_required_code_needs_no_model_plan_even_when_unsure(self):
        from backend.agents.orchestrator import _template_plan_reason

        profile = _profile(task_type="calculation", requires_code_execution=True, confidence=0.2)
        assert _template_plan_reason(profile, [], 0.6) == "code execution is already required"

    def test_a_confident_deliverable_needs_no_model_plan(self):
        from backend.agents.orchestrator import _template_plan_reason

        profile = _profile(task_type="document_generation", produces_deliverable=True, confidence=1.0)
        assert "confidence 1.00" in _template_plan_reason(profile, [], 0.6)

    def test_an_unsure_classification_still_asks_the_model(self):
        from backend.agents.orchestrator import _template_plan_reason

        profile = _profile(task_type="analysis", produces_deliverable=True, confidence=0.38)
        assert _template_plan_reason(profile, [], 0.6) is None

    def test_a_spreadsheet_still_asks_the_model(self, tmp_path):
        """It may want code the classifier did not see a need for."""
        from backend.agents.orchestrator import _template_plan_reason

        profile = _profile(task_type="analysis", confidence=1.0)
        assert _template_plan_reason(profile, [_stored(tmp_path, "cml.xlsx")], 0.6) is None
        assert _template_plan_reason(profile, [_stored(tmp_path, "report.pdf")], 0.6) is not None


async def test_a_template_plan_makes_no_model_call(monkeypatch):
    from datetime import datetime, timezone
    from types import SimpleNamespace

    from backend.agents.orchestrator import AgentOrchestrator
    from backend.core.schemas import Task, TaskStatus, User

    now = datetime.now(timezone.utc)
    profile = _profile(task_type="calculation", requires_code_execution=True, requires_retrieval=False)
    task = Task(id="plan-test", prompt="Remaining life?", status=TaskStatus.CLASSIFIED,
                user_id="u1", created_at=now, updated_at=now, profile=profile)
    user = User(id="u1", username="engineer", display_name="Engineer", role="engineer", department="inspection")

    agent = AgentOrchestrator()
    events, audits = [], []

    async def no_model(*_args, **_kwargs):
        raise AssertionError("a template plan must not call the model")

    async def record(_task, event, data=None):
        events.append((event, data))

    monkeypatch.setattr(agent, "_generate", no_model)
    monkeypatch.setattr(agent, "_emit", record)
    monkeypatch.setattr(agent, "audit", SimpleNamespace(record=lambda **kw: audits.append(kw)))

    plan = await agent._plan(task, user, template_reason="code execution is already required")
    assert [step.action for step in plan.steps] == ["python_exec", "reason"]
    assert events[-1][0] == "task.planned" and events[-1][1]["source"] == "template"
    assert audits[-1]["detail"]["source"] == "template"
    assert audits[-1]["detail"]["reason"] == "code execution is already required"
