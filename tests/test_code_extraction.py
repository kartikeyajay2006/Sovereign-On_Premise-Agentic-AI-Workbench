"""The code handed to the sandbox is the script the model wrote, and it parses.

Each case is a reply shape a small local model really produces. Before this,
anything but a lowercase ```python fence closed on its own line ran the raw
reply, fences and prose included, and failed on a syntax error the model
never wrote.
"""

from __future__ import annotations

import pytest

from backend.agents.code_extraction import extract_python

SCRIPT = "rate = (12.0 - 9.4) / 4.0\nprint(f'{rate:.2f}')"
FENCE = "```"


@pytest.mark.parametrize(
    "reply",
    [
        f"{FENCE}python\n{SCRIPT}\n{FENCE}",
        f"{FENCE}Python\n{SCRIPT}\n{FENCE}",
        f"{FENCE}python3\n{SCRIPT}\n{FENCE}",
        f"{FENCE}py\n{SCRIPT}\n{FENCE}",
        f"{FENCE}\n{SCRIPT}\n{FENCE}",
        f"Here is the script:\n\n{FENCE}python\n{SCRIPT}\n{FENCE}\n\nIt prints the rate.",
        # The token limit took the closing fence.
        f"{FENCE}python\n{SCRIPT}\n",
        # The closing fence on the last line of code.
        f"{FENCE}python\n{SCRIPT}{FENCE}",
    ],
    ids=["python", "Python", "python3", "py", "untagged", "prose-around", "unclosed", "inline-close"],
)
def test_fenced_scripts_are_found(reply: str) -> None:
    extraction = extract_python(reply)
    assert extraction.code == SCRIPT
    assert extraction.method == "fenced"


def test_a_shell_block_first_is_skipped_not_run() -> None:
    # The old pattern matched the bash block's closing fence as an opening
    # one and captured the prose between the two blocks as the "script".
    reply = (
        f"Install it first:\n{FENCE}bash\npip install pandas\n{FENCE}\n\n"
        f"Then run:\n{FENCE}python\n{SCRIPT}\n{FENCE}"
    )
    assert extract_python(reply).code == SCRIPT


def test_the_script_is_chosen_over_a_short_usage_example() -> None:
    reply = f"{FENCE}python\n{SCRIPT}\n{FENCE}\nUsage:\n{FENCE}python\nprint(1)\n{FENCE}"
    assert extract_python(reply).code == SCRIPT


def test_a_parsing_block_is_chosen_over_a_broken_one() -> None:
    broken = "print('unterminated"
    reply = f"{FENCE}python\n{broken}\n{FENCE}\n{FENCE}python\n{SCRIPT}\n{FENCE}"
    assert extract_python(reply).code == SCRIPT


def test_bare_code_is_used_as_is() -> None:
    extraction = extract_python(SCRIPT)
    assert extraction.code == SCRIPT
    assert extraction.method == "bare"


def test_bare_code_with_a_sentence_either_side_is_trimmed() -> None:
    extraction = extract_python(f"Sure, here it is:\n{SCRIPT}\nThis prints 0.65.")
    assert extraction.code == SCRIPT
    assert extraction.method == "trimmed"


@pytest.mark.parametrize(
    ("reply", "says"),
    [
        ("", "empty"),
        ("The remaining life is 5.23 years.", "not valid Python"),
        ("Hello", "not valid Python"),
        (f"{FENCE}bash\npip install pandas\n{FENCE}", "other languages"),
        (f"{FENCE}python\nprint('cut off by the tok", "cut off"),
    ],
    ids=["empty", "prose", "one-word", "only-shell", "truncated-mid-string"],
)
def test_nothing_runnable_says_why(reply: str, says: str) -> None:
    extraction = extract_python(reply)
    assert extraction.code is None
    assert extraction.method == "none"
    assert says in extraction.problem


# ------------------------------------------------------ the code stage's loop
async def test_an_unrunnable_reply_is_retried_without_a_sandbox_run(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from datetime import datetime, timezone
    from types import SimpleNamespace

    from backend.agents.orchestrator import AgentOrchestrator, EvidenceLedger
    from backend.core.analyzer import TaskAnalyzer
    from backend.core.schemas import Sensitivity, Task, TaskStatus, User
    from backend.tools.registry import ToolContext

    prompt = "Corrosion rate from 12.0 mm to 9.4 mm over 4 years?"
    now = datetime.now(timezone.utc)
    task = Task(
        id="code-stage-test", prompt=prompt, status=TaskStatus.CLASSIFIED,
        user_id="user-1", created_at=now, updated_at=now,
        profile=TaskAnalyzer().analyze(prompt, []),
    )
    user = User(id="user-1", username="engineer", display_name="Engineer", role="engineer", department="inspection")
    context = ToolContext(user=user, task_id=task.id, sensitivity=Sensitivity.NORMAL, files=[], workspace=tmp_path)

    agent = AgentOrchestrator()
    replies = iter(["I would compute the rate as the loss over time.", f"{FENCE}Python\n{SCRIPT}\n{FENCE}"])
    prompts: list[str] = []
    ran: list[str] = []
    events: list[tuple[str, dict]] = []

    async def fake_generate(_task, _user, **kwargs):
        prompts.append(kwargs["prompt"])
        return next(replies), SimpleNamespace(selected_model="local")

    async def fake_call_tool(_task, _context, name, arguments):
        ran.append(arguments["code"])
        return SimpleNamespace(output={"result": {
            "ok": True, "exit_code": 0, "stdout": "0.65\n", "stderr": "", "duration_ms": 5,
            "memory_limit_mb": 512, "static_validation_passed": True,
        }})

    async def fake_emit(_task, event, data=None):
        events.append((event, data or {}))

    monkeypatch.setattr(agent, "_generate", fake_generate)
    monkeypatch.setattr(agent, "_call_tool", fake_call_tool)
    monkeypatch.setattr(agent, "_emit", fake_emit)
    monkeypatch.setattr(agent, "audit", SimpleNamespace(record=lambda **_: None))
    monkeypatch.setitem(agent.config.approval_rules.setdefault("verification", {}), "max_replans", 2)

    result = await agent._run_code_stage(task, user, context, EvidenceLedger([]))

    assert result is not None and result.ok
    # The prose reply never reached the sandbox; the fenced script did.
    assert ran == [SCRIPT]
    assert "not valid Python" in prompts[1]
    retry = [data for event, data in events if event == "task.code_retry"]
    assert len(retry) == 1 and "not valid Python" in retry[0]["problem"]
    generated = [data for event, data in events if event == "task.code_generated"]
    assert generated == [{"code": SCRIPT, "attempt": 2, "extraction": "fenced"}]
