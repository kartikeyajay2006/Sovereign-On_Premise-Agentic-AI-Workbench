"""Which requests count as calculations.

Every calculation now runs code in the sandbox so the verifier has an
expression to recompute (config/classification.yaml, code_execution). That
makes a false positive expensive: a lookup or a coverage question classified
as a calculation would start a sandbox run it has no use for. These pin both
sides -- real arithmetic is still a calculation, and a question that only
mentions a measured quantity is not.
"""

from __future__ import annotations

import pytest

from backend.core.analyzer import get_task_analyzer
from backend.core.schemas import TaskType


def analyze(prompt: str):
    return get_task_analyzer().analyze(prompt, [], requested_format="answer")


@pytest.mark.parametrize(
    "prompt",
    [
        "Calculate the corrosion rate and remaining life from these thickness readings.",
        "What is the thickness loss per year on CML-3 if it went from 12.0 mm to 9.4 mm over 4 years?",
        "Is the wall loss on V-2104 below the minimum thickness?",
        "Compute the remaining life of circuit P-2104-OVHD-01.",
    ],
)
def test_arithmetic_is_a_calculation_and_runs_code(prompt: str) -> None:
    profile = analyze(prompt)
    assert profile.task_type == TaskType.CALCULATION, profile.reasons
    assert profile.requires_code_execution


@pytest.mark.parametrize(
    "prompt",
    [
        "Thickness measurements shall be recorded and retained for the life of the vessel. "
        "Does our SOP set cover this obligation?",
        "Which SOP says how long thickness survey records must be kept?",
        "What is the maximum interval between internal inspections of a pressure vessel in corrosive service?",
    ],
)
def test_mentioning_a_quantity_is_not_a_calculation(prompt: str) -> None:
    profile = analyze(prompt)
    assert profile.task_type != TaskType.CALCULATION, profile.reasons
    assert not profile.requires_code_execution
