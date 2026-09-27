"""The answer never opens with the prompt's placeholder.

The reasoning prompt showed the cited lede as `"<answer> [S2]."`. qwen2.5:3b
copied the placeholder: every run after that change opened "[answer] ...",
one of them "[answer] [C9]" and then the answer on a new line, and the thread
set that label in large type as the lede. The prompt now describes the lede
without a token to copy, and the orchestrator removes such a label if a model
writes one anyway.
"""

from __future__ import annotations

import pytest

from backend.agents.orchestrator import strip_answer_label
from backend.core.config import get_config


def test_the_reasoning_prompt_has_no_answer_placeholder_to_copy() -> None:
    system = get_config().system_prompt("reasoning")
    assert "<answer>" not in system
    # The lede instruction itself is still there.
    assert "The first sentence is the answer: one direct sentence" in system


@pytest.mark.parametrize(
    ("written", "kept"),
    [
        ("[answer] PSV-2104A failed its as-received test [S3].", "PSV-2104A failed its as-received test [S3]."),
        ("<answer> The interval is 48 months [S1].", "The interval is 48 months [S1]."),
        ("Answer: The interval is 48 months [S1].", "The interval is 48 months [S1]."),
        ("[ANSWER]The interval is 48 months [S1].", "The interval is 48 months [S1]."),
        # The label and a bare citation on their own line, then the answer.
        ("[answer] [C9]\n\nThe governing location is Shell course 2 (mid) [C4].",
         "The governing location is Shell course 2 (mid) [C4]."),
    ],
)
def test_a_leading_answer_label_is_removed(written: str, kept: str) -> None:
    assert strip_answer_label(written) == kept


@pytest.mark.parametrize(
    "text",
    [
        "The interval is 48 months [S1].",
        "An answer to this needs the survey date [F1].",
        "[S1] states the interval is 48 months.",
    ],
)
def test_an_answer_without_a_label_is_untouched(text: str) -> None:
    assert strip_answer_label(text) == text


def test_the_model_is_told_which_identifiers_exist() -> None:
    # A conflict run holding only F1 and F2 answered "... [S1].[S2]": the
    # prompt's examples all say [S2], and nothing named what this run holds.
    from backend.agents.orchestrator import citable_ids_line
    from backend.core.schemas import EvidenceItem

    evidence = [EvidenceItem(id=i, source_document="x", excerpt="y", kind=k)
                for i, k in (("F1", "uploaded_file"), ("F2", "uploaded_file"), ("C1", "computation"))]
    line = citable_ids_line(evidence)
    assert "F1, F2, C1" in line and "[S" not in line
    assert citable_ids_line([]) == ""


def test_the_drafted_document_is_told_which_identifiers_exist(monkeypatch) -> None:
    # The approval note for V-2104 cited [S9] where the run held C9: the
    # drafting prompt showed the evidence but never said which ids exist.
    import asyncio
    from datetime import datetime, timezone
    from types import SimpleNamespace

    from backend.agents.orchestrator import AgentOrchestrator
    from backend.core.analyzer import get_task_analyzer
    from backend.core.schemas import EvidenceItem, Task, TaskStatus

    now = datetime.now(timezone.utc)
    prompt = "Prepare an approval note for V-2104."
    task = Task(id="t-draft", prompt=prompt, status=TaskStatus.EXECUTING, user_id="u", created_at=now,
                updated_at=now, profile=get_task_analyzer().analyze(prompt, [], requested_format="docx"))
    evidence = [EvidenceItem(id="V1", source_document="scan.png", excerpt="readings", kind="vision_extraction"),
                EvidenceItem(id="C9", source_document="formula registry", excerpt="severity", kind="computation")]
    agent = AgentOrchestrator()
    seen: list[str] = []

    async def fake_generate(_task, _user, **kwargs):
        seen.append(kwargs["prompt"])
        return '{"title": "Approval note", "summary": "x", "sections": []}', SimpleNamespace(selected_model="local")

    monkeypatch.setattr(agent, "_generate", fake_generate)
    asyncio.run(agent._draft(task, SimpleNamespace(username="engineer", role="engineer"), "analysis", evidence, []))
    assert seen and "Identifiers you may cite in this run: V1, C9." in seen[0]
