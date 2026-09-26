"""A remaining-life question with its values in the request is computed by the registry.

The case from the demo: 12.0 mm to 9.4 mm over 4 years, t-min 6.0 mm. The
formula gives 0.65 mm/year and 5.23 years; a model once answered 13.8. The
model now only proposes which number is which, and a proposal is bound only
when the question writes that number with a unit of the right dimension.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from backend.engineering.stated import assess_stated, bind_stated

QUESTION = (
    "Wall thickness went from 12.0 to 9.4 mm over 4 years. The minimum allowable "
    "thickness is 6.0 mm. What is the remaining life?"
)
PROPOSAL = {"t_previous": "12.0 mm", "t_current": "9.4 mm", "years_between": "4 years", "t_min": "6.0 mm", "rate": None}


def _life(question: str, proposal: dict) -> tuple:
    stated = bind_stated(question, proposal, "H1")
    result = assess_stated(stated)
    assert result is not None
    return stated, *result


def test_the_demo_case_is_the_formula_not_the_model() -> None:
    stated, records, assessment = _life(QUESTION, PROPOSAL)
    assert stated.refused == {}
    assert assessment.status == "calculated"
    assert assessment.governing_rate_mm_yr == 0.65
    assert assessment.remaining_life_years == 5.23
    assert [r.formula_id for r in records] == [
        "corrosion.short_term_rate", "integrity.remaining_life", "integrity.below_t_min",
    ]
    # Every input cites the request it was read from.
    assert {i.evidence_id for r in records for i in r.inputs if i.name != "rate"} == {"H1"}


@pytest.mark.parametrize(
    "question",
    [
        "Thickness 12.0→9.4 mm over 4 y, min 6.0 mm. Remaining life?",
        "Thickness 12.0-9.4mm in 4 years; t-min 6.0 mm. Remaining life?",
        "Readings: 12.0 mm then 9.4 mm, 4 years apart. Retirement thickness 6.0 mm.",
    ],
    ids=["arrow-range", "dash-range", "separate-units"],
)
def test_ways_of_writing_it_bind_the_same(question: str) -> None:
    # A bare number in the proposal takes the unit the question writes.
    proposal = {"t_previous": "12.0", "t_current": "9.4", "years_between": "4", "t_min": "6.0"}
    stated, _, assessment = _life(question, proposal)
    assert stated.refused == {}
    assert assessment.remaining_life_years == 5.23


def test_a_value_the_question_does_not_state_is_refused() -> None:
    stated, _, assessment = _life(QUESTION, {**PROPOSAL, "years_between": "5 years"})
    assert "not written in the question" in stated.refused["years_between"]
    assert assessment.status == "cannot_calculate"
    assert assessment.remaining_life_years is None
    assert "years_between" in assessment.missing


def test_a_value_of_the_wrong_dimension_is_refused() -> None:
    stated, _, assessment = _life(QUESTION, {**PROPOSAL, "years_between": "4 mm"})
    assert "is a time" in stated.refused["years_between"]
    assert assessment.status == "cannot_calculate"


def test_a_stated_rate_is_used_directly() -> None:
    question = "Current thickness 9.4 mm, corrosion rate 0.65 mm/year, t-min 6.0 mm. Remaining life?"
    proposal = {"t_current": "9.4 mm", "rate": "0.65 mm/year", "t_min": "6.0 mm"}
    _, records, assessment = _life(question, proposal)
    assert [r.formula_id for r in records] == ["integrity.remaining_life", "integrity.below_t_min"]
    assert assessment.remaining_life_years == 5.23
    assert assessment.governing_rate_is == "stated"


def test_below_t_min_has_no_life_left() -> None:
    question = "Wall went from 12.0 mm to 5.8 mm over 4 years; t-min is 6.0 mm. Remaining life?"
    proposal = {"t_previous": "12.0 mm", "t_current": "5.8 mm", "years_between": "4 years", "t_min": "6.0 mm"}
    _, _, assessment = _life(question, proposal)
    assert assessment.remaining_life_years is not None and assessment.remaining_life_years < 0
    assert assessment.locations_below_t_min == ["stated thickness"]


def test_no_thickness_is_nothing_to_assess() -> None:
    assert assess_stated(bind_stated(QUESTION, {"years_between": "4 years"}, "H1")) is None


# ---------------------------------------------------------- the run's stage
def _task(prompt: str):
    from backend.core.analyzer import TaskAnalyzer
    from backend.core.schemas import Task, TaskStatus

    now = datetime.now(timezone.utc)
    return Task(
        id="stated-stage-test", prompt=prompt, status=TaskStatus.CLASSIFIED, user_id="user-1",
        created_at=now, updated_at=now, profile=TaskAnalyzer().analyze(prompt, []),
    )


@pytest.fixture
def agent(monkeypatch: pytest.MonkeyPatch):
    from backend.agents.orchestrator import AgentOrchestrator

    instance = AgentOrchestrator()
    instance.model_calls = []

    async def fake_generate(_task, _user, **kwargs):
        instance.model_calls.append(kwargs["prompt"])
        return json.dumps(PROPOSAL), SimpleNamespace(selected_model="local")

    async def quiet(*_args, **_kwargs):
        return None

    monkeypatch.setattr(instance, "_generate", fake_generate)
    monkeypatch.setattr(instance, "_emit", quiet)
    monkeypatch.setattr(instance, "audit", SimpleNamespace(record=lambda **_: None))
    return instance


async def test_the_stage_computes_a_stated_question_and_cites_it(agent) -> None:
    from backend.agents.orchestrator import EvidenceLedger
    from backend.core.schemas import TaskType, User
    from backend.engineering.stage import prompt_block

    task = _task(QUESTION)
    assert task.profile.task_type == TaskType.CALCULATION
    user = User(id="user-1", username="engineer", display_name="Engineer", role="engineer", department="inspection")
    ledger = EvidenceLedger([])

    assert await agent._engineering_stage(task, user, ledger, task.profile) is True
    assert len(agent.model_calls) == 1
    assert task.assessment.kind == "stated"
    assert task.assessment.remaining_life_years == 5.23

    request = next(item for item in ledger.items if item.kind == "human")
    assert request.id.startswith("H")
    assert request.extraction_data["bound"]["t_min"] == "6.0 mm"
    computed = next(item for item in ledger.items if item.kind == "computation")
    assert request.id in computed.extraction_data["inputs_from"]

    block = prompt_block(task.assessment, task.calculations, task.conflicts)
    assert "5.23 years" in block and "0.65 mm/year" in block
    assert "location" not in block

    # The wrong figure the model once gave fails verification against the registry.
    check = agent.verifier.check_engineering(
        f"The remaining life is 13.8 years [{computed.id}].", task.assessment, task.calculations
    )
    assert not check.passed
    check = agent.verifier.check_engineering(
        f"At 0.65 mm/year the remaining life is 5.23 years [{computed.id}].", task.assessment, task.calculations
    )
    assert check.passed, check.detail


async def test_arithmetic_without_a_thickness_does_not_ask_the_model(agent) -> None:
    from backend.agents.orchestrator import EvidenceLedger
    from backend.core.schemas import User

    task = _task("What is 15% of 2400 kg plus 350 kg?")
    user = User(id="user-1", username="engineer", display_name="Engineer", role="engineer", department="inspection")
    assert await agent._assess_stated(task, user, EvidenceLedger([])) is None
    assert agent.model_calls == []
