"""The formula registry over HTTP: list it, evaluate one formula, assess a report.

Every evaluation is audited with its formula version and result hash, so a
figure computed here can be matched to the record later.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.api.dependencies import CurrentUser, require_permission
from backend.core.audit import get_audit_log
from backend.core.schemas import CalculationRecord, EvidenceItem, IntegrityAssessment, User
from backend.engineering.extraction import parse_date
from backend.engineering.formulas import FORMULAS, BoundValue, catalogue, evaluate
from backend.engineering.stage import assess_from_evidence
from backend.engineering.units import UnitError, parse_quantity

router = APIRouter(prefix="/api", tags=["engineering"])


class InputValue(BaseModel):
    """A value as a person would write it: "11.6 mm", "18 February 2026", "Corrosive", 1.0."""

    value: Any
    evidence_id: str | None = Field(default=None, max_length=32)
    locator: str | None = Field(default=None, max_length=200)


class EvaluateRequest(BaseModel):
    formula_id: str = Field(min_length=1, max_length=64)
    inputs: dict[str, InputValue] = Field(default_factory=dict)
    subject: str | None = Field(default=None, max_length=120)


class AssessRequest(BaseModel):
    """Text of an inspection record, e.g. a transcription or a pasted report."""

    text: str = Field(min_length=1, max_length=40_000)
    source: str = Field(default="submitted text", max_length=200)


class AssessResponse(BaseModel):
    assessment: IntegrityAssessment | None
    calculations: list[CalculationRecord]


def _bind(formula_id: str, name: str, raw: InputValue) -> BoundValue:
    formula = FORMULAS[formula_id]
    parameter = next((p for p in formula.parameters if p.name == name), None)
    if parameter is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{formula_id} has no input named {name!r}")
    value: Any = raw.value
    if parameter.kind == "quantity":
        try:
            value = parse_quantity(str(raw.value))
        except UnitError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{name}: {exc}") from exc
    elif parameter.kind == "date":
        value = parse_date(str(raw.value))
        if value is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{name}: not a date: {raw.value!r}")
    return BoundValue(value, stated=str(raw.value), evidence_id=raw.evidence_id, locator=raw.locator)


@router.get("/engineering/formulas")
def formulas(user: CurrentUser) -> list[dict[str, Any]]:
    """Every registered formula: id, version, clause, expression, inputs, source hash."""
    return catalogue()


@router.post("/engineering/evaluate", response_model=CalculationRecord)
def evaluate_formula(
    payload: EvaluateRequest,
    user: Annotated[User, Depends(require_permission("task.create"))],
) -> CalculationRecord:
    if payload.formula_id not in FORMULAS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no registered formula {payload.formula_id!r}")
    bound = {name: _bind(payload.formula_id, name, raw) for name, raw in payload.inputs.items()}
    record = evaluate(payload.formula_id, bound, subject=payload.subject)
    get_audit_log().record(
        category="engineering",
        action=f"evaluated:{record.status}",
        actor=user.username,
        actor_role=user.role,
        detail={
            "formula": f"{record.formula_id}@{record.formula_version}",
            "status": record.status,
            "missing": record.missing,
            "reason": record.reason,
            "result_hash": record.result_hash,
        },
    )
    return record


@router.post("/engineering/assess", response_model=AssessResponse)
def assess_text(
    payload: AssessRequest,
    user: Annotated[User, Depends(require_permission("task.create"))],
) -> AssessResponse:
    """Assess a submitted inspection record exactly as a run would."""
    item = EvidenceItem(id="T1", source_document=payload.source, excerpt=payload.text, kind="uploaded_file")
    result = assess_from_evidence([item], include_retrieved=False)
    if result is None:
        return AssessResponse(assessment=None, calculations=[])
    records, assessment = result
    get_audit_log().record(
        category="engineering",
        action="assessed" if assessment.status == "calculated" else "cannot_calculate",
        actor=user.username,
        actor_role=user.role,
        detail={
            "subject": assessment.subject,
            "status": assessment.status,
            "missing": assessment.missing,
            "result_hashes": [r.result_hash for r in records if r.result_hash],
        },
    )
    return AssessResponse(assessment=assessment, calculations=records)
