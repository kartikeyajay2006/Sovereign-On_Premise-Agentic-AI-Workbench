"""A greeting is answered in one short model call, and says so.

"Hi" went through the whole pipeline -- retrieval, a 1,236-token drafting
prompt, a verification call -- and ended held for a reviewer: 140 seconds on
the demo host to answer a greeting. These pin the fast path: what counts as
conversation (the whole message, from config/classification.yaml), that it
costs one model call, and that its record says plainly nothing was checked.

They also pin the gate in front of calculation extraction, which asked a
model for 15 to 37 seconds whether "24 months" was arithmetic.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from backend.agents.orchestrator import AgentOrchestrator, get_orchestrator
from backend.core.analyzer import get_task_analyzer
from backend.core.schemas import (
    Sensitivity,
    Task,
    TaskStatus,
    TaskType,
)
from tests.test_harness_fixtures import make_user

OPERATOR = make_user("operator", role="operator", department="operations")


class TestWhatCountsAsConversation:
    @pytest.mark.parametrize(
        "message",
        ["Hi", "hello!", "Hey there", "Good morning", "Thanks", "thank you so much",
         "yes", "No.", "ok", "Got it", "What can you do?", "who are you", "help"],
    )
    def test_the_whole_message_is_conversation(self, message: str) -> None:
        profile = get_task_analyzer().analyze(message)
        assert profile.task_type == TaskType.CONVERSATION
        assert profile.sensitivity == Sensitivity.NORMAL
        assert not profile.requires_retrieval
        assert not profile.produces_deliverable
        assert not profile.requires_code_execution

    @pytest.mark.parametrize(
        "message",
        [
            # Starts like conversation, then asks for something.
            "Yes, and what about clause 5?",
            "Hi, what is the inspection interval for vessel V-101?",
            "thanks -- now summarise the incident report",
            # Plainly a task.
            "What is the maximum interval between internal inspections?",
            "help me calculate the corrosion rate",
        ],
    )
    def test_anything_that_asks_for_something_takes_the_full_pipeline(self, message: str) -> None:
        assert get_task_analyzer().analyze(message).task_type != TaskType.CONVERSATION

    def test_an_attachment_is_never_conversation(self, tmp_path) -> None:
        from backend.core.schemas import StoredFile

        attached = StoredFile(
            id="f1",
            filename="scan.png",
            stored_path=str(tmp_path / "scan.png"),
            media_type="image/png",
            size_bytes=10,
            sha256="0" * 64,
            input_type="image",
            classification="normal",
            owner_id="u1",
            department="operations",
            quarantine_passed=True,
            uploaded_at="2026-09-24T00:00:00Z",
        )
        assert get_task_analyzer().analyze("hi", [attached]).task_type != TaskType.CONVERSATION


def _task(prompt: str) -> Task:
    now = datetime.now(timezone.utc)
    return Task(
        id="t-conversation",
        prompt=prompt,
        status=TaskStatus.CLASSIFIED,
        user_id=OPERATOR.id,
        created_at=now,
        updated_at=now,
        profile=get_task_analyzer().analyze(prompt),
    )


@pytest.fixture
def orchestrator(monkeypatch):
    """The shared orchestrator with its model call replaced by a recorder."""
    instance: AgentOrchestrator = get_orchestrator()
    calls: list[dict] = []

    async def fake_generate(task, user, **kwargs):
        calls.append(kwargs)
        # The routing decision is discarded by the caller.
        return "Hello -- ask me about your procedures and I will cite each answer.", None

    events: list[tuple[str, dict]] = []

    async def fake_emit(task, event, data=None):
        events.append((event, data or {}))

    monkeypatch.setattr(instance, "_generate", fake_generate)
    monkeypatch.setattr(instance, "_emit", fake_emit)
    instance.test_calls = calls  # type: ignore[attr-defined]
    instance.test_events = events  # type: ignore[attr-defined]
    return instance


class TestTheFastPath:
    async def test_a_greeting_costs_one_model_call_and_is_delivered(self, orchestrator) -> None:
        task = await orchestrator.run(_task("Hi"), OPERATOR)

        assert task.status == TaskStatus.DELIVERED
        assert len(orchestrator.test_calls) == 1
        call = orchestrator.test_calls[0]
        assert call["stage"] == "drafting"
        assert call["stream_to_user"] is True
        # The drafting stage's own system prompt, so one cache serves both.
        assert call["system_prompt"] == orchestrator.config.system_prompt("reasoning")
        assert "it is conversation" in call["prompt"]
        assert call["prompt"].rstrip().endswith("Message: Hi")
        assert task.answer and task.answer.startswith("Hello")

    async def test_nothing_is_retrieved_checked_or_held(self, orchestrator) -> None:
        task = await orchestrator.run(_task("thanks"), OPERATOR)

        assert task.evidence == []
        assert task.tool_calls == []
        assert task.approval is not None and task.approval.required is False
        assert task.verification is not None
        assert task.verification.checks == []
        # Says so, rather than implying a check that never ran.
        assert any("no claims were checked" in note for note in task.verification.limitations)

    async def test_it_reports_its_finish_like_any_run(self, orchestrator) -> None:
        task = await orchestrator.run(_task("ok"), OPERATOR)

        names = [name for name, _ in orchestrator.test_events]
        assert "task.answer" in names
        assert names[-1] == "task.finished"
        assert orchestrator.test_events[-1][1]["status"] == TaskStatus.DELIVERED.value
        assert task.duration_ms is not None


class TestTheCalculationGate:
    @pytest.fixture
    def counting(self, monkeypatch):
        instance = get_orchestrator()
        calls: list[str] = []

        async def fake_generate(task, user, **kwargs):
            calls.append(kwargs["stage"])
            return "[]", None

        monkeypatch.setattr(instance, "_generate", fake_generate)
        return instance, calls

    @pytest.mark.parametrize(
        "text",
        [
            "Internal inspection is due every 24 months [S1].",
            "Wall loss above 20% of nominal is reported as High [S2].",
            "The retention period is 7 years under clause 4.2 [S3].",
        ],
    )
    async def test_a_quoted_figure_is_not_sent_for_extraction(self, counting, text: str) -> None:
        instance, calls = counting
        assert await instance._extract_calculations(_task("q"), OPERATOR, text) == []
        assert calls == []

    @pytest.mark.parametrize(
        "text",
        [
            "Corrosion rate = (12.0 - 10.2) / 6 = 0.3 mm/yr [C1].",
            "Remaining life is 4.2 years at the measured rate [C1].",
            "12.0 - 10.2 leaves 1.8 mm of wall [S1].",
        ],
    )
    async def test_arithmetic_is_still_sent_for_extraction(self, counting, text: str) -> None:
        instance, calls = counting
        await instance._extract_calculations(_task("q"), OPERATOR, text)
        assert calls == ["verification"]
