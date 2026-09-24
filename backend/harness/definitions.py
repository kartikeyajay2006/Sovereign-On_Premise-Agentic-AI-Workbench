"""Harness definitions: declarative, validated, hashed.

A harness is described in YAML under ``config/harnesses/``: what it asks the
person for, how those inputs expand into ordinary task prompts, how finished
children are aggregated, and whether the aggregate report needs a human
signature before it may leave the workbench.

The YAML decides what each child is ASKED. It cannot decide how a child is
classified, which model runs it, what it may retrieve or whether it is held:
every child goes through the task service and meets the same gates as a
request typed into the thread. Nothing here can grant a capability, so this
module validates shape and refuses anything it cannot account for.

Loading follows ``backend/core/config.py`` -- a missing, malformed or
non-mapping file is a :class:`ConfigError` naming the file -- with one
deliberate difference. A broken definition is reported beside the valid ones
instead of taking every harness down, because this registry is read on
demand by the interface, and "requirements-register.yaml: unknown placeholder
{sectoin}" is something a person can fix while a 500 is not.
"""

from __future__ import annotations

import hashlib
import re
import string
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from backend.core.config import CONFIG_DIR, ConfigError

HARNESS_DIR = CONFIG_DIR / "harnesses"

HARNESS_ID = r"^[a-z][a-z0-9-]{1,47}$"
INPUT_ID = r"^[a-z][a-z0-9_]{0,31}$"
BARE_NAME = re.compile(r"[a-z][a-z0-9_]*")

# Placeholders every template may use, whatever it fans out over.
POSITION_FIELDS = frozenset({"index", "total"})
# What each expansion source contributes per child.
SOURCE_FIELDS: dict[str, frozenset[str]] = {
    "input_lines": frozenset({"item"}),
    "knowledge_sections": frozenset({"document", "document_code", "section"}),
}

_FORMATTER = string.Formatter()


class InputKind(str, Enum):
    TEXT = "text"
    LINES = "lines"
    CHOICE = "choice"


class ExpansionSource(str, Enum):
    INPUT_LINES = "input_lines"
    KNOWLEDGE_SECTIONS = "knowledge_sections"


class AggregationKind(str, Enum):
    ANSWER_MATRIX = "answer_matrix"
    REQUIREMENTS_REGISTER = "requirements_register"


def template_fields(template: str) -> list[str]:
    """The placeholder names a template uses, refusing anything but bare names.

    ``str.format`` will happily evaluate ``{item.__class__}`` or ``{0}``, and a
    format spec can pad a value to any width. None of that belongs in a prompt
    template, and allowing attribute access in a file an operator edits would
    make the template a small expression language. Only ``{name}`` passes.
    """
    names: list[str] = []
    try:
        parsed = list(_FORMATTER.parse(template))
    except ValueError as exc:
        # Unbalanced braces: "Single '}' encountered in format string".
        raise ValueError(f"template is not a valid format string ({exc})") from exc
    for _literal, name, spec, conversion in parsed:
        if name is None:
            continue
        if not BARE_NAME.fullmatch(name) or spec or conversion:
            shown = name + (f"!{conversion}" if conversion else "") + (f":{spec}" if spec else "")
            raise ValueError(
                f"placeholder {{{shown}}} is not allowed; use a bare name such as {{item}}"
            )
        names.append(name)
    return names


class ChoiceOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=80)


class HarnessInput(BaseModel):
    """One thing the person supplies before a run starts."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=INPUT_ID)
    kind: InputKind
    label: str = Field(min_length=1, max_length=80)
    help: str | None = Field(default=None, max_length=400)
    placeholder: str | None = Field(default=None, max_length=600)
    required: bool = True
    # text: the whole value. lines: each line. A value over the limit is
    # refused, never truncated -- a question silently cut short would be run
    # and reported as if it were the question that was asked.
    max_chars: int = Field(default=400, ge=1, le=4000)
    # lines only.
    min_items: int = Field(default=1, ge=0, le=100)
    max_items: int = Field(default=25, ge=1, le=100)
    # choice only: a fixed list, or one read from policy at request time.
    options: list[ChoiceOption] = Field(default_factory=list)
    options_from: Literal["departments"] | None = None
    default: str | None = None
    default_from: Literal["user_department"] | None = None
    # How a text or choice value appears inside a child prompt, e.g.
    # "Context: {value}". Omitted entirely when an optional value is empty.
    render: str | None = Field(default=None, max_length=400)

    @model_validator(mode="after")
    def _kind_rules(self) -> "HarnessInput":
        if self.kind == InputKind.LINES:
            if self.min_items > self.max_items:
                raise ValueError(
                    f"input '{self.id}': min_items {self.min_items} exceeds max_items {self.max_items}"
                )
            if self.render is not None:
                raise ValueError(
                    f"input '{self.id}': a lines input fans out into children and cannot be rendered"
                )
        if self.kind == InputKind.CHOICE:
            if bool(self.options) == bool(self.options_from):
                raise ValueError(
                    f"input '{self.id}': a choice needs exactly one of 'options' or 'options_from'"
                )
            if self.default is not None and self.options:
                if self.default not in {option.value for option in self.options}:
                    raise ValueError(
                        f"input '{self.id}': default '{self.default}' is not one of its options"
                    )
            if self.default_from and self.options_from != "departments":
                raise ValueError(
                    f"input '{self.id}': default_from 'user_department' needs options_from 'departments'"
                )
        elif self.options or self.options_from or self.default_from:
            raise ValueError(f"input '{self.id}': options belong only to a choice input")
        if self.render is not None:
            names = template_fields(self.render)
            if names != ["value"]:
                raise ValueError(
                    f"input '{self.id}': render must use {{value}} exactly once and nothing else"
                )
        return self


class HarnessExpansion(BaseModel):
    """How inputs become child prompts: one child per line or per section."""

    model_config = ConfigDict(extra="forbid")

    source: ExpansionSource
    # input_lines: the lines input to fan out over.
    input: str | None = None
    # knowledge_sections: a choice input naming the department, and an
    # optional text input narrowing documents by title.
    department_input: str | None = None
    document_filter_input: str | None = None
    template: str = Field(min_length=1, max_length=4000)
    label: str = Field(default="{item}", min_length=1, max_length=400)


class HarnessReportSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=120)
    # Whether the aggregate report is held until someone holding
    # approval.decide releases it. Data-classification policy can also
    # require it; this flag can add the requirement, never remove it.
    requires_approval: bool = False
    # Limitations particular to this harness, stated in every report beside
    # the ones every harness report carries.
    limitations: list[str] = Field(default_factory=list)


class HarnessLimits(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # A run is sequential and one child takes roughly 135-200 s on a CPU-only
    # host, so 25 children is already over an hour of the only worker.
    max_items: int = Field(default=25, ge=1, le=100)
    # A child still running after this long is stopped by the harness and
    # recorded as such. It bounds a stuck child, not a slow one: measured runs
    # sit near 200 s, and this default is nine times that.
    child_timeout_seconds: int = Field(default=1800, ge=60, le=86400)


class HarnessDefinition(BaseModel):
    """One harness, exactly as its YAML file declares it."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=HARNESS_ID)
    version: int = Field(default=1, ge=1)
    name: str = Field(min_length=1, max_length=80)
    summary: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    inputs: list[HarnessInput] = Field(min_length=1)
    expansion: HarnessExpansion
    aggregation: AggregationKind
    report: HarnessReportSpec
    limits: HarnessLimits = Field(default_factory=HarnessLimits)

    def input(self, input_id: str) -> HarnessInput | None:
        return next((spec for spec in self.inputs if spec.id == input_id), None)

    @model_validator(mode="after")
    def _cross_references(self) -> "HarnessDefinition":
        ids = [spec.id for spec in self.inputs]
        duplicates = sorted({name for name in ids if ids.count(name) > 1})
        if duplicates:
            raise ValueError(f"duplicate input id(s): {', '.join(duplicates)}")
        reserved = (POSITION_FIELDS | SOURCE_FIELDS["input_lines"]
                    | SOURCE_FIELDS["knowledge_sections"])
        clashing = sorted(set(ids) & reserved)
        if clashing:
            raise ValueError(
                f"input id(s) {', '.join(clashing)} clash with reserved placeholders"
            )

        expansion = self.expansion
        if expansion.source == ExpansionSource.INPUT_LINES:
            source = self.input(expansion.input or "")
            if source is None or source.kind != InputKind.LINES:
                raise ValueError(
                    "expansion.input must name a lines input for source 'input_lines'"
                )
            if expansion.department_input or expansion.document_filter_input:
                raise ValueError(
                    "department_input and document_filter_input apply only to 'knowledge_sections'"
                )
        else:
            if expansion.input is not None:
                raise ValueError("expansion.input applies only to 'input_lines'")
            if expansion.department_input is not None:
                department = self.input(expansion.department_input)
                if department is None or department.kind != InputKind.CHOICE:
                    raise ValueError("expansion.department_input must name a choice input")
            if expansion.document_filter_input is not None:
                narrowing = self.input(expansion.document_filter_input)
                if narrowing is None or narrowing.kind != InputKind.TEXT:
                    raise ValueError("expansion.document_filter_input must name a text input")

        # Every lines input must be the one being fanned out; a second list
        # has no defined meaning inside a single prompt.
        for spec in self.inputs:
            if spec.kind == InputKind.LINES and spec.id != expansion.input:
                raise ValueError(
                    f"lines input '{spec.id}' is not the expansion input, so nothing would use it"
                )

        renderable = {spec.id for spec in self.inputs if spec.kind != InputKind.LINES}
        allowed = POSITION_FIELDS | SOURCE_FIELDS[expansion.source.value] | renderable
        for name, template in (("template", expansion.template), ("label", expansion.label)):
            for placeholder in template_fields(template):
                if placeholder not in allowed:
                    raise ValueError(
                        f"expansion.{name} uses unknown placeholder {{{placeholder}}}; "
                        f"allowed here: {', '.join('{' + item + '}' for item in sorted(allowed))}"
                    )
        per_child = SOURCE_FIELDS[expansion.source.value]
        if not per_child & set(template_fields(expansion.template)):
            raise ValueError(
                "expansion.template never uses the per-child value "
                f"({', '.join('{' + item + '}' for item in sorted(per_child))}), "
                "so every child would be asked the same thing"
            )
        return self


# ------------------------------------------------------------------ loading
@dataclass(frozen=True)
class LoadedHarness:
    """A definition plus the facts needed to prove which file it came from."""

    definition: HarnessDefinition
    source: str
    # sha256 of the file's bytes. The same bytes are parsed, so the hash
    # describes exactly what was validated, and a run records it: if the YAML
    # is edited later, an old run still says which definition it ran under.
    sha256: str


@dataclass(frozen=True)
class DefinitionError:
    source: str
    message: str


@dataclass
class HarnessCatalog:
    harnesses: dict[str, LoadedHarness] = field(default_factory=dict)
    errors: list[DefinitionError] = field(default_factory=list)

    def get(self, harness_id: str) -> LoadedHarness | None:
        return self.harnesses.get(harness_id)


def _relative(path: Path) -> str:
    try:
        return path.relative_to(CONFIG_DIR.parent).as_posix()
    except ValueError:
        return path.name


def parse_definition(raw: bytes, source: str) -> LoadedHarness:
    """Validate one definition from its file bytes, or raise ConfigError."""
    try:
        data: Any = yaml.safe_load(raw.decode("utf-8"))
    except (yaml.YAMLError, UnicodeDecodeError) as exc:
        raise ConfigError(f"Invalid YAML in {source}: {exc}") from exc
    if not isinstance(data, dict):
        raise ConfigError(f"Harness definition root must be a mapping: {source}")
    try:
        definition = HarnessDefinition.model_validate(data)
    except ValidationError as exc:
        problems = "; ".join(
            f"{'.'.join(str(part) for part in error['loc']) or 'definition'}: {error['msg']}"
            for error in exc.errors()
        )
        raise ConfigError(f"Invalid harness definition {source}: {problems}") from exc
    return LoadedHarness(
        definition=definition,
        source=source,
        sha256=hashlib.sha256(raw).hexdigest(),
    )


def load_catalog(directory: Path | None = None) -> HarnessCatalog:
    """Read every definition in the harness directory.

    Files beginning with ``_`` or ``.`` are skipped, which is how a draft is
    kept beside the live definitions without being offered to anyone.
    """
    root = directory or HARNESS_DIR
    catalog = HarnessCatalog()
    if not root.is_dir():
        catalog.errors.append(
            DefinitionError(source=_relative(root), message="harness directory does not exist")
        )
        return catalog

    paths = sorted(
        path
        for path in root.iterdir()
        if path.is_file()
        and path.suffix.lower() in {".yaml", ".yml"}
        and not path.name.startswith(("_", "."))
    )
    declared_in: dict[str, str] = {}
    for path in paths:
        source = _relative(path)
        try:
            loaded = parse_definition(path.read_bytes(), source)
        except ConfigError as exc:
            catalog.errors.append(DefinitionError(source=source, message=str(exc)))
            continue
        except OSError as exc:
            catalog.errors.append(DefinitionError(source=source, message=f"unreadable: {exc}"))
            continue
        harness_id = loaded.definition.id
        if harness_id in declared_in:
            # No copy is served: picking one silently would make which
            # workflow runs depend on the order files happen to sort in.
            catalog.harnesses.pop(harness_id, None)
            catalog.errors.append(
                DefinitionError(
                    source=source,
                    message=(
                        f"harness id '{harness_id}' is also declared in "
                        f"{declared_in[harness_id]}; neither is offered"
                    ),
                )
            )
            continue
        declared_in[harness_id] = source
        catalog.harnesses[harness_id] = loaded
    return catalog
