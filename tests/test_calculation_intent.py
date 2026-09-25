"""A calculation is something the request asks to compute, not a noun it mentions.

Every calculation now writes and runs code, and fails verification when no
recomputable expression comes back (config/classification.yaml,
code_execution.always_for_task_types). That is the right control for
"calculate the remaining life". It is the wrong one for "what minimum
thickness applies to shell course 2?": the word "thickness" alone scored 3,
the question became a calculation, and a plain lookup would have written a
script and then been held for producing no arithmetic.
"""

from __future__ import annotations

import pytest

from backend.core.analyzer import get_task_analyzer
from backend.core.schemas import TaskType


def task_type(prompt: str) -> TaskType:
    return get_task_analyzer().analyze(prompt, [], requested_format="answer").task_type


@pytest.mark.parametrize(
    "prompt",
    [
        "What minimum thickness applies to shell course 2?",
        "Thickness measurements shall be recorded and retained for the life of the vessel.",
        "How much notice must be given before a hot work permit is issued?",
        "Which clause of our SOPs covers the flow rate of the wash-water injection?",
    ],
)
def test_a_quantity_mentioned_in_a_lookup_is_not_a_calculation(prompt: str) -> None:
    assert task_type(prompt) != TaskType.CALCULATION


@pytest.mark.parametrize(
    "prompt",
    [
        "Calculate the corrosion rate and remaining life for shell course 2.",
        "Compute the average wall loss across the CMLs.",
        "What is the remaining life of V-2104?",
        "What is the corrosion rate at CML-03?",
    ],
)
def test_a_request_to_compute_is_a_calculation(prompt: str) -> None:
    assert task_type(prompt) == TaskType.CALCULATION


def test_a_calculation_still_runs_code() -> None:
    profile = get_task_analyzer().analyze(
        "Calculate the remaining life of V-2104 at shell course 2.", [], requested_format="answer"
    )
    assert profile.requires_code_execution


def test_a_weak_signal_is_still_reported_in_the_profile() -> None:
    # Falling below the threshold must not make the signal disappear: the
    # transcript should still show that "thickness" was seen and outweighed.
    profile = get_task_analyzer().analyze(
        "What minimum thickness applies to shell course 2?", [], requested_format="answer"
    )
    assert any(s.value == "calculation" for s in profile.signals if s.dimension == "task_type")
