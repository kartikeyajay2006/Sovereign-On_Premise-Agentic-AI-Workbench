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
