"""The workbench never silently chooses between conflicting sources.

Merging used to keep whichever record came first. A contractor sheet that
re-measured shell course 2 at 9.9 mm, against the plant scan's 9.4 mm, was
dropped without a word, and the decision was computed as if the two agreed.
Now the disagreement is a conflict object: every figure that depends on it
is withheld, the run is held, and a named person chooses. Their choice is H
evidence, and the formulas recompute from it exactly as from any input.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path

import pytest

from backend.agents.orchestrator import AgentOrchestrator, EvidenceLedger
from backend.agents.verifier import get_verification_engine
from backend.core.analyzer import get_task_analyzer
from backend.core.schemas import (
    ApprovalRecord,
    EvidenceItem,
    Sensitivity,
    StoredFile,
    Task,
    TaskStatus,
    User,
)
from backend.engineering.extraction import reading_field, vessel_inputs
from backend.engineering.stage import assess_from_evidence, assess_with_conflicts, prompt_block, revision_conflicts
from backend.policy.gateway import get_policy_gateway
from tests.test_engineering import V2104_TRANSCRIPTION
from tests.test_engineering_pipeline import ENGINEER

ROOT = Path(__file__).resolve().parents[1]
FIELD_SHEET = (ROOT / "sample_data" / "conflict" / "V-2104-contractor-field-sheet.md").read_text()
CSV = (ROOT / "sample_data" / "datasets" / "V-2104-thickness-survey.csv").read_text()
REVIEWER = User(id="u-rev", username="reviewer", display_name="Senior Reviewer", role="reviewer",
                department="engineering", max_data_classification=Sensitivity.RESTRICTED)
PROMPT = "Calculate the corrosion rate and remaining life of V-2104 and state the severity."


def _scan(item_id: str = "V1", text: str = V2104_TRANSCRIPTION) -> EvidenceItem:
    return EvidenceItem(id=item_id, source_document="scanned-inspection-report-V-2104.pdf", excerpt=text,
                        kind="vision_extraction", classification=Sensitivity.CONFIDENTIAL)


def _file(item_id: str, name: str, text: str) -> EvidenceItem:
    return EvidenceItem(id=item_id, source_document=name, excerpt=text, kind="uploaded_file",
                        classification=Sensitivity.CONFIDENTIAL)


def _sheet(item_id: str = "F1") -> EvidenceItem:
    return _file(item_id, "V-2104-contractor-field-sheet.md", FIELD_SHEET)


# ----------------------------------------------------------------- detection
def test_agreeing_sources_raise_no_conflict() -> None:
    # The plant scan and the survey CSV state the same readings and limits.
    result = assess_with_conflicts([_scan(), _file("F1", "V-2104-thickness-survey.csv", CSV)])
    records, assessment, conflicts = result
    assert conflicts == []
    assert assessment.status == "calculated" and assessment.remaining_life_years == 6.18


def test_a_disagreeing_reading_is_a_conflict_naming_both_sources() -> None:
    inputs = vessel_inputs([_scan(), _sheet()])
    assert [c.field for c in inputs.conflicts] == [reading_field("Shell course 2 (mid)", "current")]
    conflict = inputs.conflicts[0]
    assert conflict.impact == "high"
    assert [(v.stated, v.evidence_id) for v in conflict.values] == [("9.4 mm", "V1"), ("9.9 mm", "F1")]
    assert "row 'Shell course 2 (mid)'" in conflict.values[1].locator


def test_a_conflicted_input_withholds_every_figure() -> None:
    records, assessment, conflicts = assess_with_conflicts([_scan(), _sheet()])
    assert assessment.status == "conflicted"
    assert records == []
    assert assessment.remaining_life_years is None and assessment.severity is None
    # The old entry point agrees: no figure, not a first-found one.
    assert assess_from_evidence([_scan(), _sheet()])[1].status == "conflicted"


def test_two_vessels_are_a_tag_conflict_and_choosing_one_drops_the_other() -> None:
    other = V2104_TRANSCRIPTION.replace("V-2104", "V-2107").replace("| 9.4 |", "| 10.4 |")
    inputs = vessel_inputs([_scan(), _file("F2", "V-2107.txt", other)])
    assert {c.field for c in inputs.conflicts} >= {"tag"}
    from backend.engineering.formulas import BoundValue

    chosen = vessel_inputs([_scan(), _file("F2", "V-2107.txt", other)],
                           {"tag": BoundValue("V-2104", stated="V-2104", evidence_id="H1")})
    assert chosen.conflicts == [] and chosen.source_evidence_ids == ["V1"]


def test_the_model_is_told_both_values_and_told_not_to_choose() -> None:
    task, _ = _run()
    block = prompt_block(task.assessment, task.calculations, task.conflicts)
    assert "CONFLICTED" in block and "do not choose between them" in block
    assert "9.4 mm in [V1]" in block and "9.9 mm in [F1]" in block


def test_a_superseded_procedure_reference_is_reconciled_in_favour_of_the_revision_in_force() -> None:
    records = revision_conflicts([_sheet()], {"SOP-INS-014": ("4.3", "SOP-INS-014 — Pressure Vessel")}, [])
    assert len(records) == 1
    record = records[0]
    assert record.kind == "revision" and record.status == "auto_resolved"
    assert [c.stated for c in record.candidates] == ["SOP-INS-014 Rev 4.1", "SOP-INS-014 Rev 4.3 (in force)"]
    assert "applies Rev 4.3" in record.note
    # A reference to the revision in force is no conflict.
    assert revision_conflicts([_sheet()], {"SOP-INS-014": ("4.1", "x")}, []) == []


# -------------------------------------------------------------- verification
def test_an_answer_that_picks_a_side_fails_and_one_that_withholds_passes() -> None:
    task, _ = _run()
    engine = get_verification_engine()
    picked = engine.check_engineering(
        "Shell course 2 governs at 0.55 mm/year, a remaining life of 6.18 years.", task.assessment, task.calculations)
    assert picked.passed is False and "0.55 mm/year" in picked.detail
    honest = engine.check_engineering(
        "The plant scan reads 9.4 mm [V1] and the contractor sheet 9.9 mm [F1] at shell course 2, so the "
        "remaining life is withheld until a reviewer resolves the conflict.", task.assessment, task.calculations)
    assert honest.passed is True, honest.detail


def test_claims_on_disputed_evidence_are_conflicted() -> None:
    task, _ = _run()
    engine = get_verification_engine()
    text = (
        "The current thickness at shell course 2 is 9.9 mm [F1]. "
        "The sources disagree at shell course 2: 9.4 mm [V1] against 9.9 mm [F1], so the conclusion is withheld. "
        "V-2104 may continue in service until the next shutdown."
    )
    verdicts = engine.claim_verdicts(text, task.evidence, assessment=task.assessment,
                                     records=task.calculations, conflicts=task.conflicts)
    assert [v.verdict for v in verdicts] == ["CONFLICTED", "SUPPORTED", "REQUIRES_HUMAN_DECISION"]
    assert verdicts[0].evidence_ids == ["V1", "F1"] and "K" in verdicts[0].reason
    assert engine.check_claims(verdicts).passed is False


def test_the_gateway_holds_a_run_with_an_open_conflict_or_a_disposition() -> None:
    task, _ = _run()
    gateway = get_policy_gateway()
    required, reasons, approvers = gateway.approval_requirement(
        task.profile, prompt="What is the remaining life?", unresolved_conflicts=1)
    assert required and any(reason.startswith("unresolved_conflict") for reason in reasons)
    required, reasons, _ = gateway.approval_requirement(
        task.profile, prompt="What is the remaining life?", decision_claims=1)
    assert required and any(reason.startswith("human_decision") for reason in reasons)


# ---------------------------------------------------------------- resolution
def _run(extra: list[EvidenceItem] | None = None):
    now = datetime.now(timezone.utc)
    stored = StoredFile(id="f1", filename="scanned-inspection-report-V-2104.pdf", stored_path="/dev/null",
                        media_type="application/pdf", size_bytes=1, sha256="0" * 64, input_type="document",
                        classification=Sensitivity.CONFIDENTIAL, owner_id=ENGINEER.id, department="inspection",
                        uploaded_at=now)
    profile = get_task_analyzer().analyze(PROMPT, [stored], requested_format="docx")
    task = Task(id="t-conflict", prompt=PROMPT, status=TaskStatus.EXECUTING, user_id=ENGINEER.id,
                created_at=now, updated_at=now, files=[stored], profile=profile)
    ledger = EvidenceLedger(task.evidence)
    ledger.add(_scan("pending"))
    for item in extra if extra is not None else [_sheet("pending")]:
        ledger.add(item)
    orchestrator = AgentOrchestrator()
    orchestrator._persist = None
    orchestrator._active_revisions = lambda evidence: {"SOP-INS-014": ("4.3", "SOP-INS-014 Rev 4.3")}
    engineered = asyncio.run(orchestrator._engineering_stage(task, ENGINEER, ledger, profile))
    task.answer = "The sources disagree at shell course 2, so the remaining life is withheld."
    task.status = TaskStatus.AWAITING_APPROVAL
    task.approval = ApprovalRecord(
        required=True, approver_roles=["reviewer", "administrator"], decision="pending",
        reasons=["unresolved_conflict: sources disagree", "released_deliverable: sign-off"],
    )
    return task, orchestrator


def test_the_stage_records_input_and_revision_conflicts() -> None:
    task, _ = _run()
    assert [(c.id, c.kind, c.status) for c in task.conflicts] == [
        ("K1", "revision", "auto_resolved"),
        ("K2", "input", "unresolved"),
    ]
    assert task.assessment.status == "conflicted" and task.assessment.conflicts == ["K2"]


def _resolve(task: Task, orchestrator: AgentOrchestrator, **choice) -> Task:
    options = {"candidate": None, "value": None, "reason": "Plant inspector's grid point is the reference location."}
    options.update(choice)
    return asyncio.run(orchestrator.resolve_conflict(task, REVIEWER, "K2", **options))


def test_choosing_the_plant_reading_recomputes_the_registry_decision() -> None:
    task, orchestrator = _run()
    _resolve(task, orchestrator, candidate=0)
    human = next(item for item in task.evidence if item.kind == "human")
    assert human.id == "H1" and "accepted 9.4 mm" in human.excerpt and "9.9 mm in F1" in human.excerpt
    conflict = next(c for c in task.conflicts if c.id == "K2")
    assert conflict.status == "resolved" and conflict.resolution.evidence_id == "H1"
    assert conflict.resolution.resolved_by == "reviewer"
    assessment = task.assessment
    assert assessment.status == "calculated"
    assert (assessment.governing_rate_mm_yr, assessment.remaining_life_years) == (0.55, 6.18)
    rate = next(r for r in task.calculations if r.formula_id == "corrosion.short_term_rate"
                and r.subject == "V-2104 · Shell course 2 (mid)")
    current = next(i for i in rate.inputs if i.name == "t_current")
    assert current.evidence_id == "H1" and current.locator == "human resolution K2"
    assert "[H1]" in task.answer and "6.18 years" in task.answer
    assert not any(reason.startswith("unresolved_conflict") for reason in task.approval.reasons)


def test_choosing_the_contractor_reading_gives_its_own_decision() -> None:
    task, orchestrator = _run()
    _resolve(task, orchestrator, candidate=1)
    assert task.assessment.governing_rate_mm_yr == 0.425
    assert task.assessment.remaining_life_years == 9.18


def test_a_re_measured_value_may_be_entered_but_must_be_a_thickness() -> None:
    task, orchestrator = _run()
    with pytest.raises(ValueError, match="different kind of quantity"):
        _resolve(task, orchestrator, value="9.6 bar")
    _resolve(task, orchestrator, value="9.6 mm")
    assert task.assessment.status == "calculated"
    assert task.conflicts[1].resolution.stated == "9.6 mm"
    assert task.conflicts[1].resolution.value == 9.6


def test_verification_is_rerun_after_the_resolution() -> None:
    task, orchestrator = _run()
    task.verification = get_verification_engine().compile_report([], text=task.answer, evidence=task.evidence)
    _resolve(task, orchestrator, candidate=0)
    names = {check.name: check.passed for check in task.verification.checks}
    assert names["engineering_verification"] is True
    assert names["claim_verification"] is True
    assert any(claim.verdict == "CALCULATED" for claim in task.verification.claims)


def test_a_reason_the_resolution_answered_leaves_the_approval() -> None:
    # Live: the withheld answer failed claim_verification, the run was held
    # for it, and after the resolution every check passed -- but the
    # approval still said "verification_failure".
    task, orchestrator = _run()
    task.verification = get_verification_engine().compile_report([], text=task.answer, evidence=task.evidence)
    task.approval.reasons.append("verification_failure: Failed verification cannot be auto-delivered.")
    _resolve(task, orchestrator, candidate=0)
    assert task.verification.valid
    assert [reason.split(":")[0] for reason in task.approval.reasons] == ["released_deliverable"]


def test_a_conflict_cannot_be_resolved_twice() -> None:
    task, orchestrator = _run()
    _resolve(task, orchestrator, candidate=0)
    with pytest.raises(ValueError, match="not open"):
        _resolve(task, orchestrator, candidate=1)


# ------------------------------------------------------------------ service
class TestTheServiceHoldsTheDecision:
    """Resolution is held to the rules of approval, because it decides what approval releases."""

    def _held(self, owner: User) -> Task:
        import uuid

        from backend.api.task_service import get_task_service

        task, _ = _run()
        task.id = str(uuid.uuid4())
        task.user_id = owner.id
        get_task_service()._persist(task)
        return task

    @staticmethod
    def _account(username: str) -> User:
        from backend.core.identity import get_identity_service

        identity = get_identity_service()
        identity.ensure_seed_users()
        return identity.authenticate(username, "workbench").user

    def test_approval_is_refused_while_a_conflict_is_open(self) -> None:
        from backend.api.task_service import TaskError, get_task_service

        task = self._held(self._account("engineer"))
        with pytest.raises(TaskError, match="Resolve K2"):
            asyncio.run(get_task_service().decide_approval(task.id, self._account("reviewer"), "approve", None))
        # Rejecting releases nothing, so it stays possible.
        rejected = asyncio.run(get_task_service().decide_approval(task.id, self._account("admin"), "reject", "no"))
        assert rejected.status == TaskStatus.REJECTED

    def test_the_account_that_ran_the_task_cannot_resolve_it(self) -> None:
        from backend.api.task_service import TaskError, get_task_service

        reviewer = self._account("reviewer")
        task = self._held(reviewer)
        with pytest.raises(TaskError, match="cannot resolve"):
            asyncio.run(get_task_service().resolve_conflict(
                task.id, "K2", reviewer, candidate=0, value=None, reason="the plant grid point governs"))

    def test_a_reviewer_resolves_and_the_task_can_then_be_approved(self) -> None:
        from backend.api.task_service import get_task_service

        task = self._held(self._account("engineer"))
        reviewer = self._account("reviewer")
        resolved = asyncio.run(get_task_service().resolve_conflict(
            task.id, "K2", reviewer, candidate=0, value=None, reason="the plant grid point governs"))
        assert resolved.assessment.status == "calculated"
        stored = get_task_service().get_task(task.id)
        assert stored.conflicts[1].resolution.resolved_by == "reviewer"
        approved = asyncio.run(get_task_service().decide_approval(task.id, reviewer, "approve", None))
        assert approved.status == TaskStatus.DELIVERED

    def test_the_route_requires_approval_authority(self) -> None:
        from fastapi.testclient import TestClient

        from backend.api.main import create_app

        task = self._held(self._account("reviewer"))
        with TestClient(create_app()) as client:
            token = client.post("/api/auth/login", json={"username": "engineer", "password": "workbench"}).json()["token"]
            response = client.post(
                f"/api/tasks/{task.id}/conflicts/K2/resolve",
                headers={"Authorization": f"Bearer {token}"},
                json={"candidate": 0, "reason": "the plant grid point governs"},
            )
        assert response.status_code == 403
