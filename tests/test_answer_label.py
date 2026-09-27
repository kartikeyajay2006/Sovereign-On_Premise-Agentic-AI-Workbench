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
