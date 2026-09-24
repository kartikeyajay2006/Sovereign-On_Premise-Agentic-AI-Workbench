"""Skill endpoints: the saved instructions the composer's "/" menu offers.

Reading the list needs only ``task.create``, since a skill is used by
starting a task. Adding one needs ``skill.create``; deleting one needs its
authorship or ``skill.manage``. Running one is ``POST /api/tasks`` with a
``skill_id`` -- there is no separate way to run a skill, so there is no
separate set of controls to keep in step.
"""

from __future__ import annotations

from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, HTTPException, Response, status

from backend.api.dependencies import require_permission
from backend.core.schemas import PolicyDecision, User
from backend.policy.gateway import get_policy_gateway
from backend.skills.registry import Skill, SkillDefinition, SkillError, get_skill_registry

router = APIRouter(prefix="/api", tags=["skills"])


def _refuse(exc: SkillError) -> NoReturn:
    raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/skills", response_model=list[Skill])
def list_skills(user: Annotated[User, Depends(require_permission("task.create"))]) -> list[Skill]:
    return get_skill_registry().list()


@router.post("/skills", response_model=Skill, status_code=status.HTTP_201_CREATED)
def create_skill(
    definition: SkillDefinition,
    user: Annotated[User, Depends(require_permission("skill.create"))],
) -> Skill:
    try:
        return get_skill_registry().create(definition, user)
    except SkillError as exc:
        _refuse(exc)


@router.delete("/skills/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_skill(
    skill_id: str,
    user: Annotated[User, Depends(require_permission("skill.create"))],
) -> Response:
    may_manage = get_policy_gateway().check_permission(user, "skill.manage").decision == PolicyDecision.ALLOW
    try:
        get_skill_registry().delete(skill_id, user, may_manage=may_manage)
    except SkillError as exc:
        _refuse(exc)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
