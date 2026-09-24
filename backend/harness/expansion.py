"""Inputs into child prompts.

Expansion is deterministic and side-effect free: the same inputs, against the
same corpus, produce the same items with the same keys. That is what lets the
preview a person approves be the run that starts -- the start request names
the keys it saw, and the server refuses to start if expansion no longer
produces them.

Values are substituted by ``str.format`` over a template whose placeholders
were checked at load time. Substituted text is never re-parsed, so a question
containing ``{index}`` or a brace reaches the model exactly as typed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Mapping

from backend.core.config import get_config
from backend.core.database import Database
from backend.core.schemas import User
from backend.harness.corpus import list_sections, retrieval_scope
from backend.harness.definitions import (
    ChoiceOption,
    ExpansionSource,
    HarnessDefinition,
    HarnessInput,
    InputKind,
    template_fields,
)

InputValues = dict[str, str | list[str]]


class HarnessInputError(ValueError):
    """The person's inputs cannot be run as given. Maps to HTTP 400."""


@dataclass(frozen=True)
class ExpandedItem:
    key: str
    index: int
    label: str
    prompt: str
    group: str | None = None


def resolve_options(spec: HarnessInput) -> list[ChoiceOption]:
    """A choice's options, read from policy when the definition says so.

    Departments come from ``policies/access-control.yaml`` at request time,
    so a department added there appears here without editing any harness.
    """
    if spec.options_from == "departments":
        departments = get_config().access_control.get("departments") or []
        return [
            ChoiceOption(value=str(entry["id"]), label=str(entry.get("label") or entry["id"]))
            for entry in departments
            if isinstance(entry, dict) and entry.get("id")
        ]
    return list(spec.options)


def _collapse(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def _as_lines(value: Any, label: str) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        candidates = value.splitlines()
    elif isinstance(value, list):
        candidates = []
        for entry in value:
            if not isinstance(entry, str):
                raise HarnessInputError(f"{label}: every entry must be text")
            candidates.extend(entry.splitlines())
    else:
        raise HarnessInputError(f"{label}: expected text, one entry per line")
    return [line.strip() for line in candidates if line.strip()]


def normalise_inputs(
    definition: HarnessDefinition, raw: Mapping[str, Any], *, user: User
) -> tuple[InputValues, list[str]]:
    """Check the person's inputs against the definition and tidy them.

    Returns the normalised values and plain warnings about anything changed
    (only duplicate lines are ever dropped). A value that breaks a limit is
    refused rather than cut to fit.
    """
    known = {spec.id for spec in definition.inputs}
    unknown = sorted(set(raw) - known)
    if unknown:
        raise HarnessInputError(
            f"This harness takes no input named {', '.join(repr(name) for name in unknown)}."
        )

    values: InputValues = {}
    warnings: list[str] = []
    for spec in definition.inputs:
        value = raw.get(spec.id)

        if spec.kind == InputKind.LINES:
            lines = _as_lines(value, spec.label)
            unique: list[str] = []
            seen: set[str] = set()
            for line in lines:
                marker = _collapse(line)
                if marker in seen:
                    continue
                seen.add(marker)
                unique.append(line)
            dropped = len(lines) - len(unique)
            if dropped:
                warnings.append(
                    f"{spec.label}: {dropped} repeated line{'s were' if dropped != 1 else ' was'} "
                    "dropped, so each runs once."
                )
            for number, line in enumerate(unique, start=1):
                if len(line) > spec.max_chars:
                    raise HarnessInputError(
                        f"{spec.label}: line {number} is {len(line)} characters; "
                        f"the limit is {spec.max_chars}."
                    )
            limit = min(spec.max_items, definition.limits.max_items)
            if len(unique) > limit:
                raise HarnessInputError(
                    f"{spec.label}: {len(unique)} entries given; one run takes at most {limit}."
                )
            floor = max(spec.min_items, 1 if spec.required else 0)
            if len(unique) < floor:
                raise HarnessInputError(
                    f"{spec.label}: at least {floor} entr{'ies are' if floor != 1 else 'y is'} needed."
                )
            values[spec.id] = unique

        elif spec.kind == InputKind.TEXT:
            if value is not None and not isinstance(value, str):
                raise HarnessInputError(f"{spec.label}: expected text")
            text = (value or "").strip()
            if spec.required and not text:
                raise HarnessInputError(f"{spec.label} is required.")
            if len(text) > spec.max_chars:
                raise HarnessInputError(
                    f"{spec.label}: {len(text)} characters given; the limit is {spec.max_chars}."
                )
            values[spec.id] = text

        else:  # choice
            if value is not None and not isinstance(value, str):
                raise HarnessInputError(f"{spec.label}: expected one option")
            options = resolve_options(spec)
            chosen = (value or "").strip()
            if not chosen:
                if spec.default_from == "user_department":
                    chosen = user.department
                elif spec.default is not None:
                    chosen = spec.default
            if not chosen:
                if spec.required:
                    raise HarnessInputError(f"{spec.label} is required.")
                values[spec.id] = ""
                continue
            if chosen not in {option.value for option in options}:
                raise HarnessInputError(
                    f"{spec.label}: '{chosen}' is not one of "
                    f"{', '.join(option.value for option in options)}."
                )
            values[spec.id] = chosen
    return values, warnings


def render_template(template: str, values: Mapping[str, str]) -> str:
    """Fill a template line by line.

    A line whose placeholders all rendered empty is dropped, so an optional
    input left blank leaves no stray blank line in the prompt. Its literal
    wording belongs in the input's ``render`` ("Context: {value}"), which is
    only applied when there is a value.
    """
    lines: list[str] = []
    for line in template.splitlines():
        names = template_fields(line)
        rendered = line.format(**{name: values.get(name, "") for name in names})
        if names and not rendered.strip():
            continue
        lines.append(rendered.rstrip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _rendered_inputs(definition: HarnessDefinition, values: InputValues) -> dict[str, str]:
    rendered: dict[str, str] = {}
    for spec in definition.inputs:
        if spec.kind == InputKind.LINES:
            continue
        raw = values.get(spec.id)
        text = raw if isinstance(raw, str) else ""
        if spec.kind == InputKind.CHOICE and text:
            # A department reads better as "Inspection & Integrity" than as
            # "inspection" inside a sentence the model will act on.
            text = next(
                (option.label for option in resolve_options(spec) if option.value == text), text
            )
        if text and spec.render:
            text = spec.render.format(value=text)
        rendered[spec.id] = text
    return rendered


@dataclass(frozen=True)
class PlannedRow:
    """One child before numbering: its stable key and per-child values."""

    key: str
    values: dict[str, str]
    group: str | None = None


def plan_rows(
    definition: HarnessDefinition,
    values: InputValues,
    *,
    user: User,
    database: Database | None = None,
) -> tuple[list[PlannedRow], list[str]]:
    """Every child the inputs call for, unnumbered, plus plain warnings.

    Kept apart from rendering so a selection can be applied first: {index}
    and {total} then count the items that actually run, not the ones the
    person deselected.
    """
    expansion = definition.expansion
    warnings: list[str] = []
    rows: list[PlannedRow] = []

    if expansion.source == ExpansionSource.INPUT_LINES:
        lines = values.get(expansion.input or "") or []
        assert isinstance(lines, list)
        for number, line in enumerate(lines, start=1):
            rows.append(PlannedRow(key=f"line-{number}", values={"item": line}))
    else:
        scope = retrieval_scope(user)
        department = None
        if expansion.department_input:
            chosen = values.get(expansion.department_input)
            department = chosen if isinstance(chosen, str) and chosen else None
        title_filter = None
        if expansion.document_filter_input:
            narrowing = values.get(expansion.document_filter_input)
            title_filter = narrowing if isinstance(narrowing, str) and narrowing else None

        if department is not None and not scope.includes(department):
            searchable = ", ".join(scope.departments or ())
            warnings.append(
                f"Your role retrieves from {searchable} only. Documents indexed under "
                f"'{department}' are outside that scope, so none of their sections is listed: "
                "a run over them would retrieve nothing."
            )
        sections = list_sections(
            scope, department=department, title_filter=title_filter, database=database
        )
        if not sections and (department is None or scope.includes(department)):
            warnings.append(
                "No indexed section was found"
                + (f" for '{department}'" if department else "")
                + (f" in a document whose title contains '{title_filter}'" if title_filter else "")
                + " within your retrieval scope and clearance."
            )
        for section in sections:
            rows.append(
                PlannedRow(
                    key=section.key,
                    values={
                        "document": section.document_title,
                        "document_code": section.document_code,
                        "section": section.section,
                    },
                    group=section.document_title,
                )
            )
    return rows, warnings


def render_items(
    definition: HarnessDefinition, values: InputValues, rows: list[PlannedRow]
) -> list[ExpandedItem]:
    """Number the rows and fill the prompt and label templates."""
    expansion = definition.expansion
    shared = _rendered_inputs(definition, values)
    total = len(rows)
    items: list[ExpandedItem] = []
    for index, row in enumerate(rows, start=1):
        context = {**shared, **row.values, "index": str(index), "total": str(total)}
        items.append(
            ExpandedItem(
                key=row.key,
                index=index,
                label=render_template(expansion.label, context) or f"Item {index}",
                prompt=render_template(expansion.template, context),
                group=row.group,
            )
        )
    return items


def expand(
    definition: HarnessDefinition,
    values: InputValues,
    *,
    user: User,
    database: Database | None = None,
) -> tuple[list[ExpandedItem], list[str]]:
    """Every child item the inputs call for, rendered, plus plain warnings."""
    rows, warnings = plan_rows(definition, values, user=user, database=database)
    return render_items(definition, values, rows), warnings
