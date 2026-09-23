"""Inputs become child prompts exactly, and children stay governed.

Two groups of guarantees:

* Expansion is faithful. A question is run as typed -- never truncated,
  never re-formatted -- an optional input left blank leaves no trace, and a
  register lists only sections the person's own retrieval could return.
* The shipped templates do not steer governance. Run through the real
  analyzer and approval rules, a neutral item retrieves, writes no document
  and is not held by the template's own wording; an item that does warrant
  review is still held. A template that quietly avoided the gates, or one
  that tripped them for every child, would fail here.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest

from backend.core.database import Database
from backend.core.schemas import Sensitivity
from backend.harness.corpus import (
    document_code,
    list_sections,
    retrieval_scope,
    section_name,
    summarise_scope,
)
from backend.harness.definitions import load_catalog, parse_definition
from backend.harness.expansion import (
    HarnessInputError,
    expand,
    normalise_inputs,
    render_template,
)
from tests.test_harness_definitions import VALID, variant
from tests.test_harness_fixtures import make_user, now

import yaml


def definition(data: dict | None = None):
    return parse_definition(yaml.safe_dump(data or VALID).encode("utf-8"), "test.yaml").definition


def shipped(harness_id: str):
    loaded = load_catalog().get(harness_id)
    assert loaded is not None
    return loaded.definition


OPERATOR = make_user("operator", role="operator", department="operations")
ENGINEER = make_user(
    "engineer", role="engineer", department="inspection", clearance=Sensitivity.RESTRICTED
)
REVIEWER = make_user(
    "reviewer", role="reviewer", department="engineering", clearance=Sensitivity.RESTRICTED
)


class TestLines:
    def test_blank_lines_are_ignored_and_order_is_kept(self) -> None:
        values, warnings = normalise_inputs(
            definition(), {"questions": "  First?\n\n   \nSecond?  "}, user=OPERATOR
        )
        assert values["questions"] == ["First?", "Second?"]
        assert warnings == []

    def test_repeats_run_once_and_the_person_is_told(self) -> None:
        values, warnings = normalise_inputs(
            definition(), {"questions": ["Same question?", "same   QUESTION?", "Other?"]}, user=OPERATOR
        )
        assert values["questions"] == ["Same question?", "Other?"]
        assert "1 repeated line was dropped" in warnings[0]

    def test_an_overlong_line_is_refused_not_truncated(self) -> None:
        long_line = "x" * 401
        with pytest.raises(HarnessInputError, match="line 2 is 401 characters"):
            normalise_inputs(definition(), {"questions": ["ok?", long_line]}, user=OPERATOR)

    def test_the_run_limit_applies(self) -> None:
        data = variant(limits={"max_items": 3})
        with pytest.raises(HarnessInputError, match="4 entries given; one run takes at most 3"):
            normalise_inputs(definition(data), {"questions": ["a", "b", "c", "d"]}, user=OPERATOR)

    def test_a_required_list_cannot_be_empty(self) -> None:
        with pytest.raises(HarnessInputError, match="at least 1"):
            normalise_inputs(definition(), {"questions": "\n\n"}, user=OPERATOR)

    def test_unknown_inputs_are_refused(self) -> None:
        with pytest.raises(HarnessInputError, match="'priority'"):
            normalise_inputs(definition(), {"questions": "a", "priority": "high"}, user=OPERATOR)


class TestRendering:
    def test_an_empty_optional_input_leaves_no_line(self) -> None:
        values, _ = normalise_inputs(definition(), {"questions": "What is the interval?"}, user=OPERATOR)
        items, _ = expand(definition(), values, user=OPERATOR)
        assert items[0].prompt == "What is the interval?\nAnswer from our SOPs."

    def test_a_given_optional_input_is_rendered_through_its_template(self) -> None:
        values, _ = normalise_inputs(
            definition(), {"questions": "Q?", "context": "Vessel V-2104"}, user=OPERATOR
        )
        items, _ = expand(definition(), values, user=OPERATOR)
        assert items[0].prompt == "Q?\nContext: Vessel V-2104\nAnswer from our SOPs."

    def test_braces_in_a_question_reach_the_model_as_typed(self) -> None:
        question = "What does {index} mean in the {item} register?"
        values, _ = normalise_inputs(definition(), {"questions": question}, user=OPERATOR)
        items, _ = expand(definition(), values, user=OPERATOR)
        assert items[0].prompt.startswith(question)
        assert items[0].label == question

    def test_keys_are_stable_for_the_same_inputs(self) -> None:
        values, _ = normalise_inputs(definition(), {"questions": "A?\nB?"}, user=OPERATOR)
        first, _ = expand(definition(), values, user=OPERATOR)
        second, _ = expand(definition(), values, user=OPERATOR)
        assert [item.key for item in first] == [item.key for item in second] == ["line-1", "line-2"]

    def test_positions_are_available_to_a_template(self) -> None:
        data = variant(expansion__template="{item} ({index} of {total})")
        values, _ = normalise_inputs(definition(data), {"questions": "A?\nB?"}, user=OPERATOR)
        items, _ = expand(definition(data), values, user=OPERATOR)
        assert [item.prompt for item in items] == ["A? (1 of 2)", "B? (2 of 2)"]

    def test_a_line_of_literal_text_is_kept_even_beside_placeholders(self) -> None:
        assert render_template("A\n\nB {x}", {"x": ""}) == "A\n\nB"


class TestChoice:
    def test_the_department_defaults_to_the_persons_own(self) -> None:
        values, _ = normalise_inputs(shipped("requirements-register"), {}, user=ENGINEER)
        assert values["department"] == "inspection"

    def test_a_department_not_in_policy_is_refused(self) -> None:
        with pytest.raises(HarnessInputError, match="'moon-base' is not one of"):
            normalise_inputs(
                shipped("requirements-register"), {"department": "moon-base"}, user=ENGINEER
            )


# --------------------------------------------------------------- the corpus
def seeded(tmp_path: Path) -> Database:
    db = Database(path=tmp_path / "corpus.sqlite")

    def document(doc_id: str, title: str, department: str, level: str, locations: list[str]) -> None:
        db.upsert_document(
            {
                "id": doc_id,
                "title": title,
                "source_path": f"{doc_id}.md",
                "department": department,
                "classification": level,
                "version": "1.0",
                "sha256": "0" * 64,
                "media_type": "text/markdown",
                "size_bytes": 1,
                "chunk_count": len(locations),
                "ingested_at": now().isoformat(),
            }
        )
        db.insert_chunks(
            [
                {
                    "id": str(uuid.uuid4()),
                    "document_id": doc_id,
                    "ordinal": ordinal,
                    "location": location,
                    "content": "text",
                    "token_estimate": 1,
                    "embedding": None,
                    "embedding_model": None,
                }
                for ordinal, location in enumerate(locations)
            ]
        )

    ins = "SOP-INS-014 — Pressure Vessel External and Internal Inspection"
    document(
        "d-ins",
        ins,
        "inspection",
        "confidential",
        [
            f"section: {ins}",
            "section: 1. Purpose and Scope",
            "section: 2. Inspection Intervals",
            "section: 4. Corrosion Rate and Remaining Life, part 1",
            "section: 4. Corrosion Rate and Remaining Life, part 2",
        ],
    )
    ops = "SOP-OPS-008 — Approval Authority and Delegation Matrix"
    document("d-ops", ops, "operations", "confidential", [f"section: {ops}", "section: 2. Authority Matrix"])
    document("d-gen", "GEN-001 — Site Glossary", "general", "normal", ["section: preamble", "section: 1. Terms"])
    document("d-res", "DEF-002 — Restricted Design Basis", "inspection", "restricted", ["section: 1. Scope"])
    return db


class TestCorpus:
    def test_scope_mirrors_knowledge_search(self) -> None:
        # backend/tools/registry.py _knowledge_search: roles outside
        # override_roles search their department plus 'general'.
        assert retrieval_scope(OPERATOR).departments == ("operations", "general")
        assert retrieval_scope(REVIEWER).departments is None

    def test_title_blocks_and_repeated_parts_are_not_sections(self, tmp_path: Path) -> None:
        db = seeded(tmp_path)
        sections = list_sections(retrieval_scope(ENGINEER), department="inspection", database=db)
        names = [(section.document_code, section.section) for section in sections]
        assert names == [
            ("DEF-002", "1. Scope"),
            ("SOP-INS-014", "1. Purpose and Scope"),
            ("SOP-INS-014", "2. Inspection Intervals"),
            ("SOP-INS-014", "4. Corrosion Rate and Remaining Life"),
        ]

    def test_a_department_outside_the_scope_lists_nothing(self, tmp_path: Path) -> None:
        db = seeded(tmp_path)
        assert list_sections(retrieval_scope(OPERATOR), department="inspection", database=db) == []

    def test_nothing_above_clearance_is_listed(self, tmp_path: Path) -> None:
        db = seeded(tmp_path)
        cleared_to_confidential = make_user(
            "engineer2", role="engineer", department="inspection", clearance=Sensitivity.CONFIDENTIAL
        )
        codes = {
            section.document_code
            for section in list_sections(
                retrieval_scope(cleared_to_confidential), department="inspection", database=db
            )
        }
        assert codes == {"SOP-INS-014"}

    def test_the_title_filter_narrows_documents(self, tmp_path: Path) -> None:
        db = seeded(tmp_path)
        sections = list_sections(
            retrieval_scope(REVIEWER), department="inspection", title_filter="ins-014", database=db
        )
        assert {section.document_code for section in sections} == {"SOP-INS-014"}

    def test_scope_summary_counts_what_the_person_can_reach(self, tmp_path: Path) -> None:
        db = seeded(tmp_path)
        operator = summarise_scope(retrieval_scope(OPERATOR), database=db)
        assert (operator.documents, operator.sections) == (2, 2)  # ops + glossary
        reviewer = summarise_scope(retrieval_scope(REVIEWER), database=db)
        assert reviewer.documents == 4

    def test_the_register_expands_to_one_prompt_per_section(self, tmp_path: Path) -> None:
        db = seeded(tmp_path)
        register = shipped("requirements-register")
        values, _ = normalise_inputs(register, {"department": "inspection"}, user=ENGINEER)
        items, warnings = expand(register, values, user=ENGINEER, database=db)
        assert warnings == []
        assert [item.label for item in items][1] == "SOP-INS-014 · 1. Purpose and Scope"
        assert (
            'SOP-INS-014 — Pressure Vessel External and Internal Inspection, section '
            '"2. Inspection Intervals"'
        ) in items[2].prompt
        assert items[2].group.startswith("SOP-INS-014")

    def test_the_register_explains_an_out_of_scope_department(self, tmp_path: Path) -> None:
        db = seeded(tmp_path)
        register = shipped("requirements-register")
        values, _ = normalise_inputs(register, {"department": "inspection"}, user=OPERATOR)
        items, warnings = expand(register, values, user=OPERATOR, database=db)
        assert items == []
        assert "outside that scope" in warnings[0]

    def test_helpers(self) -> None:
        assert document_code("SOP-MNT-022 — Management of CUI") == "SOP-MNT-022"
        assert section_name("section: 4. Assessment, part 3") == "4. Assessment"
        assert section_name("page 4") == "page 4"


# --------------------------------------------------- governance of children
def classify(prompt: str):
    from backend.core.analyzer import get_task_analyzer
    from backend.policy.gateway import get_policy_gateway

    profile = get_task_analyzer().analyze(prompt, [], requested_format="answer")
    required, reasons, _ = get_policy_gateway().approval_requirement(profile, prompt=prompt)
    return profile, required, reasons


NEUTRAL = {
    "sop-question-sweep": {"questions": "What is the external inspection interval for a vessel in corrosive service?"},
    "obligation-coverage-check": {
        "obligations": "Thickness measurements shall be recorded and retained for the life of the vessel."
    },
}


class TestChildrenStayGoverned:
    @pytest.mark.parametrize("harness_id", sorted(NEUTRAL))
    def test_a_neutral_item_retrieves_and_is_not_held_by_the_template(self, harness_id: str) -> None:
        harness = shipped(harness_id)
        values, _ = normalise_inputs(harness, NEUTRAL[harness_id], user=ENGINEER)
        items, _ = expand(harness, values, user=ENGINEER)
        profile, required, reasons = classify(items[0].prompt)
        assert profile.requires_retrieval, profile.reasons
        assert not profile.produces_deliverable
        assert not profile.requires_code_execution
        assert profile.sensitivity == Sensitivity.NORMAL
        assert not required, reasons

    def test_a_register_prompt_retrieves_and_is_not_held_by_the_template(self, tmp_path: Path) -> None:
        db = seeded(tmp_path)
        register = shipped("requirements-register")
        values, _ = normalise_inputs(register, {"department": "inspection"}, user=ENGINEER)
        items, _ = expand(register, values, user=ENGINEER, database=db)
        interval = next(item for item in items if "Inspection Intervals" in item.prompt)
        profile, required, reasons = classify(interval.prompt)
        assert profile.requires_retrieval
        assert not profile.produces_deliverable
        assert profile.sensitivity == Sensitivity.NORMAL
        assert not required, reasons

    def test_an_item_that_warrants_review_is_still_held(self) -> None:
        # The template must not dilute the item: a question about a
        # shutdown is sensitive, and that child alone is held.
        harness = shipped("sop-question-sweep")
        values, _ = normalise_inputs(
            harness,
            {"questions": "Which safety checks precede a unit shutdown?"},
            user=ENGINEER,
        )
        items, _ = expand(harness, values, user=ENGINEER)
        profile, required, _ = classify(items[0].prompt)
        assert profile.sensitivity == Sensitivity.SENSITIVE
        assert required

    def test_a_question_that_mentions_a_memo_still_writes_no_document(self) -> None:
        harness = shipped("sop-question-sweep")
        values, _ = normalise_inputs(
            harness, {"questions": "Which memo format does SOP-OPS-008 require?"}, user=ENGINEER
        )
        items, _ = expand(harness, values, user=ENGINEER)
        profile, _, _ = classify(items[0].prompt)
        assert not profile.produces_deliverable
