"""The formula registry over HTTP: list it, evaluate one formula, assess a report.

Every evaluation is audited with its formula version and result hash, so a
figure computed here can be matched to the record later.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.api.dependencies import CurrentUser, require_permission
from backend.core.audit import get_audit_log
from backend.core.config import get_config
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


# --------------------------------------------------------------------- P&ID
class DrawingQuery(BaseModel):
    kind: Literal["isolation", "upstream", "downstream", "path", "instruments"]
    tag: str = Field(min_length=1, max_length=40)
    to: str | None = Field(default=None, max_length=40)
    purpose: Literal["confined_space", "hot_work", "maintenance"] = "maintenance"


def _drawing_for(drawing_id: str, user: User):
    from backend.engineering.pid import get_drawing_library

    drawing = get_drawing_library().drawings.get(drawing_id)
    if drawing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No drawing {drawing_id}")
    config = get_config()
    level = str(drawing.meta.get("classification", "confidential"))
    if config.classification_rank(level) > config.classification_rank(user.max_data_classification.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"{drawing_id} is {level}, above your clearance")
    return drawing


@router.get("/pid")
def list_drawings(user: CurrentUser) -> list[dict[str, Any]]:
    """The P&IDs held as graphs, that this user is cleared to read."""
    from backend.engineering.pid import get_drawing_library

    config = get_config()
    clearance = config.classification_rank(user.max_data_classification.value)
    return [
        {"id": d.id, "title": d.title, "revision": d.revision, "status": d.meta.get("status"),
         "unit": d.meta.get("unit"), "classification": d.meta.get("classification"),
         "elements": len(d.nodes), "lines": len({e["line"] for e in d.edges})}
        for d in get_drawing_library().drawings.values()
        if config.classification_rank(str(d.meta.get("classification", "confidential"))) <= clearance
    ]


@router.get("/pid/{drawing_id}")
def read_drawing(drawing_id: str, user: CurrentUser) -> dict[str, Any]:
    drawing = _drawing_for(drawing_id, user)
    return {**drawing.meta, "id": drawing.id, "title": drawing.title, "revision": drawing.revision,
            "nodes": list(drawing.nodes.values()), "edges": drawing.edges}


@router.post("/pid/{drawing_id}/query")
def query_drawing(drawing_id: str, payload: DrawingQuery, user: CurrentUser) -> dict[str, Any]:
    """Ask the graph: isolation for a purpose, flow either way, a path, or instruments."""
    from backend.engineering.pid import DrawingError, summary_lines

    drawing = _drawing_for(drawing_id, user)
    try:
        if payload.kind == "isolation":
            result = {"kind": "isolation", **drawing.isolation(payload.tag, payload.purpose)}
        elif payload.kind in ("upstream", "downstream"):
            result = {"kind": payload.kind, "drawing": drawing.reference, "tag": payload.tag,
                      "reached": drawing.reach(payload.tag, payload.kind)}
        elif payload.kind == "path":
            if not payload.to:
                raise DrawingError("a path needs a second tag")
            result = {"kind": "path", "drawing": drawing.reference, "from": payload.tag, "to": payload.to,
                      "steps": drawing.path(payload.tag, payload.to)}
        else:
            drawing.require(payload.tag)
            return {"kind": "instruments", "drawing": drawing.reference, "tag": payload.tag,
                    "instruments": drawing.instruments({payload.tag}), "lines": []}
    except DrawingError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    get_audit_log().record(
        category="engineering", action=f"pid_{payload.kind}", actor=user.username, actor_role=user.role,
        detail={"drawing": drawing.reference, "tag": payload.tag, "purpose": payload.purpose,
                "compliant": result.get("compliant")},
    )
    return {**result, "lines": summary_lines(result)}
