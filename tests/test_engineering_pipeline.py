"""The engineering stage inside a run, and the check that holds answers to it.

The headline failure this exists for: a scanned V-2104 report was read
correctly, but the model wrote "approximately 0.8 mm/year" and "Severe", no
code ran, and every check passed. With the registry in the pipeline the
figures are computed from the transcription, handed to the model, and any
answer that contradicts them fails engineering_verification.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from backend.agents.orchestrator import AgentOrchestrator, EvidenceLedger
from backend.agents.verifier import get_verification_engine
from backend.core.analyzer import get_task_analyzer
from backend.core.schemas import EvidenceItem, Sensitivity, StoredFile, Task, TaskStatus, User
from backend.engineering.stage import prompt_block
from tests.test_engineering import V2104_TRANSCRIPTION

ENGINEER = User(id="u-eng", username="engineer", display_name="Integrity Engineer", role="engineer",
                department="inspection", max_data_classification=Sensitivity.RESTRICTED)

WRONG_ANSWER = (
    "The corrosion rate at shell course 2 is approximately 0.8 mm/year (9.4 mm over 12 years). "
    "Severity classification: Severe [S1]."
)
RIGHT_ANSWER = (
    "Shell course 2 (mid) governs, with a corrosion rate of 0.55 mm/year and a remaining life of "
    "6.18 years [C6]. This is a Medium severity finding under SOP-MNT-022 Clause 4.1 [C8]."
)


def _run(prompt: str, text: str = V2104_TRANSCRIPTION):
    now = datetime.now(timezone.utc)
    stored = StoredFile(id="f1", filename="scanned-inspection-report-V-2104.png", stored_path="/dev/null",
                        media_type="image/png", size_bytes=1, sha256="0" * 64, input_type="image",
                        classification=Sensitivity.CONFIDENTIAL, owner_id=ENGINEER.id, department="inspection",
                        uploaded_at=now)
    profile = get_task_analyzer().analyze(prompt, [stored], requested_format="docx")
    task = Task(id="t-eng", prompt=prompt, status=TaskStatus.EXECUTING, user_id=ENGINEER.id,
                created_at=now, updated_at=now, files=[stored], profile=profile)
    ledger = EvidenceLedger(task.evidence)
    ledger.add(EvidenceItem(id="pending", source_document=stored.filename, document_id=stored.id,
                            excerpt=text, kind="vision_extraction", classification=Sensitivity.CONFIDENTIAL))
    orchestrator = AgentOrchestrator()
    orchestrator._persist = None
    engineered = asyncio.run(orchestrator._engineering_stage(task, ENGINEER, ledger, profile))
    return task, engineered


def test_the_stage_computes_the_decision_from_the_scan() -> None:
    task, engineered = _run("Calculate the corrosion rate and remaining life of V-2104 and state the severity.")
    assert engineered is True
    assessment = task.assessment
    assert assessment.governing_location == "Shell course 2 (mid)"
    assert assessment.governing_rate_mm_yr == 0.55 and assessment.remaining_life_years == 6.18
    assert assessment.severity == "medium"
    # Every calculation is carried by a C item, and every input names its source.
    computation = [item for item in task.evidence if item.kind == "computation"]
    assert computation and all(item.id.startswith("C") for item in computation)
    assert all(record.evidence_id for record in task.calculations)
    rate = next(r for r in task.calculations if r.formula_id == "corrosion.short_term_rate"
                and r.subject == "V-2104 · Shell course 2 (mid)")
    assert {i.evidence_id for i in rate.inputs if i.name in ("t_previous", "t_current")} == {"V1"}
    assert computation[0].classification == Sensitivity.CONFIDENTIAL


def test_the_model_is_told_the_figures_and_told_not_to_recompute() -> None:
    task, _ = _run("Calculate the remaining life of V-2104.")
    block = prompt_block(task.assessment, task.calculations)
    assert "0.55 mm/year" in block and "6.18 years" in block
    assert "Severity Medium" in block and "Head of Inspection" in block
    assert "never recompute" in block
    assert "2028-02-18" in block


def test_the_live_wrong_answer_fails_engineering_verification() -> None:
    task, _ = _run("Calculate the corrosion rate and remaining life of V-2104 and state the severity.")
    check = get_verification_engine().check_engineering(WRONG_ANSWER, task.assessment, task.calculations)
    assert check.passed is False
    assert "0.8 mm/year" in check.detail and "0.55 mm/year" in check.detail
    assert "Severe" in check.detail


def test_an_answer_stating_the_registry_figures_passes() -> None:
    task, _ = _run("Calculate the corrosion rate and remaining life of V-2104 and state the severity.")
    check = get_verification_engine().check_engineering(RIGHT_ANSWER, task.assessment, task.calculations)
    assert check.passed is True, check.detail


def test_missing_inputs_become_cannot_calculate_and_no_figure_may_be_invented() -> None:
    text = V2104_TRANSCRIPTION.replace("Previous Inspection: 20 February 2022", "")
    task, engineered = _run("Calculate the remaining life of V-2104.", text)
    assert engineered is False
    assert task.assessment.status == "cannot_calculate"
    block = prompt_block(task.assessment, task.calculations)
    assert "CANNOT CALCULATE" in block and "do not estimate" in block
    invented = get_verification_engine().check_engineering(
        "The remaining life is about 7 years.", task.assessment, task.calculations)
    assert invented.passed is False
    honest = get_verification_engine().check_engineering(
        "The remaining life cannot be calculated: the previous inspection date is missing.",
        task.assessment, task.calculations)
    assert honest.passed is True


def test_a_question_without_files_or_a_calculation_skips_the_stage() -> None:
    now = datetime.now(timezone.utc)
    prompt = "What is the external inspection interval for a vessel in corrosive service?"
    profile = get_task_analyzer().analyze(prompt, [], requested_format="answer")
    task = Task(id="t-q", prompt=prompt, status=TaskStatus.EXECUTING, user_id=ENGINEER.id,
                created_at=now, updated_at=now, profile=profile)
    orchestrator = AgentOrchestrator()
    orchestrator._persist = None
    assert asyncio.run(orchestrator._engineering_stage(task, ENGINEER, EvidenceLedger(task.evidence), profile)) is False
    assert task.assessment is None and task.calculations == []
