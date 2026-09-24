"""Skills: saved instructions a person calls by name.

A skill is a request template -- "which clause of our SOPs governs {input}?"
-- saved under a short name and called from the composer as ``/name``. The
built-in ones are YAML under ``config/skills/``; the ones people add are rows
in the database beside the tasks they start.

A skill decides only what a run is ASKED, exactly as a harness does. The
rendered request is classified, checked against policy, grounded, verified
and, where the approval rules say so, held -- by the same gates as anything
typed into the thread. So a skill cannot grant a capability, raise a
clearance or skip a check, and adding one needs only the permission to add
one (``skill.create``), not any trust beyond it.

Every skill is hashed over what it would send. The run it starts records the
skill, that hash and the input it was given (``Task.skill``), so a run can be
read back exactly after the skill is changed or deleted.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from backend.core.audit import get_audit_log
from backend.core.config import CONFIG_DIR, ConfigError
from backend.core.database import Database, get_database
from backend.core.schemas import User
from backend.harness.definitions import template_fields

SKILL_DIR = CONFIG_DIR / "skills"
SKILL_ID = r"^[a-z][a-z0-9-]{1,31}$"
#: The one placeholder a skill template may use: what the person typed after it.
INPUT_FIELD = "input"
DeliverableFormat = Literal["docx", "xlsx", "pptx", "md"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


class SkillError(ValueError):
    """A skill that cannot be created, found or deleted, said in words."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


class SkillSource(str, Enum):
    BUILT_IN = "built_in"
    CUSTOM = "custom"


def _check_template(template: str) -> str:
    fields = template_fields(template)
    if INPUT_FIELD not in fields:
        raise ValueError("the template must contain {input}, where the text typed after the skill goes")
    unknown = sorted(set(fields) - {INPUT_FIELD})
    if unknown:
        raise ValueError(
            "the only placeholder a skill may use is {input}; found "
            + ", ".join("{" + name + "}" for name in unknown)
        )
    return template


class SkillDefinition(BaseModel):
    """What a skill says, as written in YAML or sent to create one."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=SKILL_ID)
    name: str = Field(min_length=1, max_length=48)
    summary: str = Field(min_length=1, max_length=160)
    template: str = Field(min_length=8, max_length=1500)
    #: A document the run produces, or None for an answer.
    deliverable_format: DeliverableFormat | None = None
    #: What to type after the skill, shown as the composer's placeholder.
    input_hint: str | None = Field(default=None, max_length=120)

    @field_validator("template")
    @classmethod
    def _template(cls, value: str) -> str:
        return _check_template(value.strip())

    def digest(self) -> str:
        """SHA-256 over what the skill would send and produce, not its wording about itself."""
        canonical = json.dumps(
            {"template": self.template, "deliverable_format": self.deliverable_format},
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class Skill(SkillDefinition):
    source: SkillSource
    author: str | None = None
    author_display_name: str | None = None
    created_at: datetime | None = None
    sha256: str

    def render(self, text: str) -> str:
        return self.template.format(input=text.strip())


def _load_builtin(path: Path) -> Skill:
    try:
        data: Any = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError, UnicodeDecodeError) as exc:
        raise ConfigError(f"Invalid skill file {path.name}: {exc}") from exc
    if not isinstance(data, dict):
        raise ConfigError(f"Skill file {path.name} is not a mapping")
    try:
        definition = SkillDefinition(**data)
    except ValidationError as exc:
        raise ConfigError(f"Skill file {path.name}: {exc.errors()[0]['msg']}") from exc
    if definition.id != path.stem:
        raise ConfigError(f"Skill file {path.name} declares id '{definition.id}'; the file must be named after it")
    return Skill(**definition.model_dump(), source=SkillSource.BUILT_IN, sha256=definition.digest())


class SkillRegistry:
    def __init__(self, database: Database | None = None, directory: Path | None = None) -> None:
        self.db = database or get_database()
        self.directory = directory or SKILL_DIR
        self.audit = get_audit_log()
        with self.db.connect() as connection:
            connection.executescript(SCHEMA)

    # -- reading ------------------------------------------------------------
    def builtins(self) -> dict[str, Skill]:
        """Read from disk on each call: a handful of small files, and edits show at once."""
        found: dict[str, Skill] = {}
        if self.directory.is_dir():
            for path in sorted(self.directory.glob("*.yaml")):
                if path.name.startswith(("_", ".")):
                    continue
                skill = _load_builtin(path)
                found[skill.id] = skill
        return found

    def custom(self) -> list[Skill]:
        with self.db.connect() as connection:
            rows = connection.execute("SELECT payload FROM skills ORDER BY created_at").fetchall()
        return [Skill(**json.loads(row[0])) for row in rows]

    def list(self) -> list[Skill]:
        return [*self.builtins().values(), *self.custom()]

    def get(self, skill_id: str) -> Skill | None:
        builtin = self.builtins().get(skill_id)
        if builtin is not None:
            return builtin
        with self.db.connect() as connection:
            row = connection.execute("SELECT payload FROM skills WHERE id = ?", (skill_id,)).fetchone()
        return Skill(**json.loads(row[0])) if row else None

    # -- changing -----------------------------------------------------------
    def create(self, definition: SkillDefinition, user: User) -> Skill:
        if self.get(definition.id) is not None:
            raise SkillError(f"A skill named /{definition.id} already exists.", status_code=409)
        skill = Skill(
            **definition.model_dump(),
            source=SkillSource.CUSTOM,
            author=user.username,
            author_display_name=user.display_name,
            created_at=datetime.now(timezone.utc),
            sha256=definition.digest(),
        )
        with self.db.connect() as connection:
            connection.execute(
                "INSERT INTO skills (id, payload, created_at) VALUES (?, ?, ?)",
                (skill.id, json.dumps(skill.model_dump(mode="json")), skill.created_at.isoformat()),
            )
        self.audit.record(
            category="skill",
            action="created",
            actor=user.username,
            actor_role=user.role,
            detail={"skill": skill.id, "sha256": skill.sha256, "deliverable_format": skill.deliverable_format},
        )
        return skill

    def delete(self, skill_id: str, user: User, *, may_manage: bool) -> None:
        skill = self.get(skill_id)
        if skill is None:
            raise SkillError(f"No skill named /{skill_id}.", status_code=404)
        if skill.source == SkillSource.BUILT_IN:
            raise SkillError(
                f"/{skill_id} is built in: it is a file under config/skills/, changed through the repository.",
                status_code=403,
            )
        if skill.author != user.username and not may_manage:
            raise SkillError(f"Only its author or an administrator may delete /{skill_id}.", status_code=403)
        with self.db.connect() as connection:
            connection.execute("DELETE FROM skills WHERE id = ?", (skill_id,))
        self.audit.record(
            category="skill",
            action="deleted",
            actor=user.username,
            actor_role=user.role,
            detail={"skill": skill_id, "sha256": skill.sha256, "author": skill.author},
        )


_registry: SkillRegistry | None = None


def get_skill_registry() -> SkillRegistry:
    global _registry
    if _registry is None:
        _registry = SkillRegistry()
    return _registry
