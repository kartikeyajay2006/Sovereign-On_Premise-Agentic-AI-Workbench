"""Harness definitions are validated before anyone can run them.

A definition decides what every child task of a run is asked, so a typo in
it is multiplied by the number of children. These tests pin that a broken
file is refused with a message naming the file and the problem, that it
does not take the valid definitions down with it, and that the shipped
definitions are themselves valid.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from backend.core.config import ConfigError
from backend.harness.definitions import (
    HARNESS_DIR,
    AggregationKind,
    ExpansionSource,
    load_catalog,
    parse_definition,
    template_fields,
)

VALID: dict = {
    "id": "demo-sweep",
    "name": "Demo sweep",
    "summary": "A small valid harness.",
    "description": "Used by the tests.",
    "inputs": [
        {"id": "questions", "kind": "lines", "label": "Questions"},
        {
            "id": "context",
            "kind": "text",
            "label": "Context",
            "required": False,
            "render": "Context: {value}",
        },
    ],
    "expansion": {
        "source": "input_lines",
        "input": "questions",
        "template": "{item}\n{context}\nAnswer from our SOPs.",
    },
    "aggregation": "answer_matrix",
    "report": {"title": "Demo"},
}


def variant(**changes: object) -> dict:
    data = yaml.safe_load(yaml.safe_dump(VALID))
    for dotted, value in changes.items():
        cursor = data
        parts = dotted.split("__")
        for part in parts[:-1]:
            cursor = cursor[part]
        cursor[parts[-1]] = value
    return data


def parse(data: dict) -> object:
    return parse_definition(yaml.safe_dump(data).encode("utf-8"), "test.yaml")


class TestShippedDefinitions:
    def test_every_shipped_definition_loads_without_error(self) -> None:
        catalog = load_catalog()
        assert catalog.errors == [], catalog.errors
        assert set(catalog.harnesses) == {
            "sop-question-sweep",
            "requirements-register",
            "obligation-coverage-check",
        }

    def test_each_records_the_hash_of_its_own_bytes(self) -> None:
        import hashlib

        for loaded in load_catalog().harnesses.values():
            path = HARNESS_DIR.parent.parent / loaded.source
            assert loaded.sha256 == hashlib.sha256(path.read_bytes()).hexdigest()

    def test_the_register_fans_out_over_the_corpus_and_needs_sign_off(self) -> None:
        register = load_catalog().get("requirements-register")
        assert register is not None
        definition = register.definition
        assert definition.expansion.source == ExpansionSource.KNOWLEDGE_SECTIONS
        assert definition.aggregation == AggregationKind.REQUIREMENTS_REGISTER
        assert definition.report.requires_approval is True


class TestValidation:
    def test_the_reference_definition_is_valid(self) -> None:
        loaded = parse(VALID)
        assert loaded.definition.id == "demo-sweep"  # type: ignore[attr-defined]

    def test_an_unknown_placeholder_is_named(self) -> None:
        with pytest.raises(ConfigError, match=r"\{questoin\}"):
            parse(variant(expansion__template="{questoin} from our SOPs"))

    def test_attribute_access_in_a_placeholder_is_refused(self) -> None:
        with pytest.raises(ConfigError, match="not allowed"):
            parse(variant(expansion__template="{item.__class__} {item}"))

    def test_a_format_spec_is_refused(self) -> None:
        with pytest.raises(ConfigError, match="not allowed"):
            parse(variant(expansion__template="{item:>400}"))

    def test_unbalanced_braces_are_refused(self) -> None:
        with pytest.raises(ConfigError, match="format string"):
            parse(variant(expansion__template="{item} and }"))

    def test_a_template_that_ignores_the_item_would_ask_everyone_the_same_thing(self) -> None:
        with pytest.raises(ConfigError, match="same thing"):
            parse(variant(expansion__template="What does SOP-INS-014 require? {context}"))

    def test_duplicate_input_ids_are_refused(self) -> None:
        data = variant()
        data["inputs"].append({"id": "context", "kind": "text", "label": "Again", "required": False})
        with pytest.raises(ConfigError, match="duplicate input"):
            parse(data)

    def test_an_input_may_not_shadow_a_reserved_placeholder(self) -> None:
        data = variant()
        data["inputs"].append({"id": "index", "kind": "text", "label": "Index", "required": False})
        with pytest.raises(ConfigError, match="reserved"):
            parse(data)

    def test_expansion_must_name_a_lines_input(self) -> None:
        with pytest.raises(ConfigError, match="lines input"):
            parse(variant(expansion__input="context"))

    def test_a_choice_needs_options(self) -> None:
        data = variant()
        data["inputs"].append({"id": "unit", "kind": "choice", "label": "Unit"})
        with pytest.raises(ConfigError, match="exactly one of"):
            parse(data)

    def test_a_choice_default_must_be_an_option(self) -> None:
        data = variant()
        data["inputs"].append(
            {
                "id": "unit",
                "kind": "choice",
                "label": "Unit",
                "options": [{"value": "cdu", "label": "Crude unit"}],
                "default": "fcc",
            }
        )
        with pytest.raises(ConfigError, match="not one of its options"):
            parse(data)

    def test_render_must_use_value_exactly(self) -> None:
        data = variant()
        data["inputs"][1]["render"] = "Context: {item}"
        with pytest.raises(ConfigError, match=r"\{value\}"):
            parse(data)

    def test_unknown_keys_are_refused_rather_than_ignored(self) -> None:
        # A misspelt "requires_aproval" silently ignored would release a
        # report the author meant to hold.
        data = variant()
        data["report"]["requires_aproval"] = True
        with pytest.raises(ConfigError, match="requires_aproval"):
            parse(data)

    def test_a_second_list_input_has_no_meaning(self) -> None:
        data = variant()
        data["inputs"].append({"id": "more", "kind": "lines", "label": "More"})
        with pytest.raises(ConfigError, match="nothing would use it"):
            parse(data)

    def test_limits_are_bounded(self) -> None:
        with pytest.raises(ConfigError, match="max_items"):
            parse(variant(limits={"max_items": 1000}))

    def test_bare_names_only(self) -> None:
        assert template_fields("{item} for {index} of {total}") == ["item", "index", "total"]
        assert template_fields("literal {{braces}} stay") == []


class TestCatalog:
    def test_a_broken_file_is_reported_beside_the_valid_ones(self, tmp_path: Path) -> None:
        (tmp_path / "good.yaml").write_text(yaml.safe_dump(VALID), encoding="utf-8")
        (tmp_path / "broken.yaml").write_text(
            yaml.safe_dump(variant(id="broken-one", expansion__template="{nope}")),
            encoding="utf-8",
        )
        (tmp_path / "not-yaml.yaml").write_text("id: [unclosed", encoding="utf-8")
        catalog = load_catalog(tmp_path)
        assert set(catalog.harnesses) == {"demo-sweep"}
        sources = sorted(error.source for error in catalog.errors)
        assert len(sources) == 2
        assert any("{nope}" in error.message for error in catalog.errors)

    def test_a_duplicated_id_offers_neither_copy(self, tmp_path: Path) -> None:
        (tmp_path / "a.yaml").write_text(yaml.safe_dump(VALID), encoding="utf-8")
        (tmp_path / "b.yaml").write_text(yaml.safe_dump(VALID), encoding="utf-8")
        catalog = load_catalog(tmp_path)
        assert catalog.harnesses == {}
        assert "also declared" in catalog.errors[0].message

    def test_drafts_prefixed_with_underscore_are_not_offered(self, tmp_path: Path) -> None:
        (tmp_path / "_draft.yaml").write_text(yaml.safe_dump(VALID), encoding="utf-8")
        catalog = load_catalog(tmp_path)
        assert catalog.harnesses == {} and catalog.errors == []
