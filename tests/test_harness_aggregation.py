"""Outcomes and reports are derived from child records, never asserted.

The aggregation is where a harness could most easily lie: fold a held run
into "done", count a refusal as a pass, treat a missing record as a zero, or
copy an unreleased draft into a report that needs no signature. Each of
those is pinned here against fixture child tasks with the held / refused /
failed mixes a real sweep produces.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from backend.core.schemas import ApprovalRecord, Sensitivity, Task, TaskStatus
from backend.harness.aggregate import child_view, derive_outcome, tally
from backend.harness.definitions import AggregationKind
from backend.harness.models import (
    DefinitionSnapshot,
    HarnessItem,
    HarnessOutcome,
    HarnessRun,
    ItemState,
    RunStatus,
    ScopeRecord,
)
from backend.harness.report import LEXICAL_LIMITATION, build_report_data, render_markdown
from tests.test_harness_fixtures import (
    Settle,
    blocked,
    delivered,
    evidence,
    failed,
    held,
)

LEAK = "DRAFT THAT MUST NOT LEAK"


def now() -> datetime:
    return datetime.now(timezone.utc)


def child(script: Settle | None = None, *, status: TaskStatus = TaskStatus.CLASSIFIED) -> Task:
    stamp = now()
    task = Task(
        id=str(uuid.uuid4()),
        prompt="What is the external inspection interval for a vessel in corrosive service?",
        status=status,
        user_id="user-operator",
        created_at=stamp,
        updated_at=stamp,
    )
    if script:
        script(task)
    return task


def item(index: int = 1, task: Task | None = None, *, state: ItemState = ItemState.SETTLED) -> HarnessItem:
    return HarnessItem(
        index=index,
        key=f"line-{index}",
        label=f"Question {index}",
        prompt="What is the external inspection interval?",
        group="SOP-INS-014 — Pressure Vessel External and Internal Inspection",
        state=state,
        task_id=task.id if task else None,
    )


def outcome(script: Settle) -> HarnessOutcome:
    task = child(script)
    return derive_outcome(item(task=task), task)[0]


class TestOutcomes:
    def test_every_claim_traced_is_supported(self) -> None:
        task = child(delivered(3, 3))
        view = child_view(item(task=task), task)
        assert view.outcome == HarnessOutcome.SUPPORTED
        assert view.released
        assert (view.claims_supported, view.claims_total) == (3, 3)
        assert [citation.id for citation in view.citations] == ["S1"]

    def test_a_valid_run_with_untraced_claims_is_not_called_supported(self) -> None:
        # Verification passes at 60%, so "delivered" and "every claim traced"
        # are different facts and are reported apart.
        task = child(delivered(2, 3, untraced=["The interval is 18 months for steam service."]))
        view = child_view(item(task=task), task)
        assert view.outcome == HarnessOutcome.PARTIALLY_SUPPORTED
        assert view.unsupported_claims == ["The interval is 18 months for steam service."]
        assert "1 of 3 material claims untraced" in view.outcome_detail

    def test_no_material_claims_is_not_a_pass(self) -> None:
        assert outcome(delivered(0, 0)) == HarnessOutcome.NO_MATERIAL_CLAIMS

    def test_released_after_review_despite_failed_verification_says_so(self) -> None:
        task = child(delivered(0, 2, valid=False, approved_by="Approving Authority"))
        verdict, detail = derive_outcome(item(task=task), task)
        assert verdict == HarnessOutcome.RELEASED_UNVERIFIED
        assert "did not pass" in detail and "Approving Authority" in detail

    def test_delivered_without_a_verification_record_is_unverified(self) -> None:
        def no_record(task: Task) -> None:
            delivered()(task)
            task.verification = None

        assert outcome(no_record) == HarnessOutcome.RELEASED_UNVERIFIED

    def test_held_is_not_delivered_and_carries_no_draft(self) -> None:
        task = child(held())
        view = child_view(item(task=task), task)
        assert view.outcome == HarnessOutcome.HELD
        assert not view.released
        assert view.citations == [] and view.unsupported_claims == []
        assert LEAK not in view.model_dump_json()
        # Why it was held is not content, and is shown.
        assert view.approval_reasons and view.checks

    def test_rejected_names_the_reviewer_and_their_reason(self) -> None:
        def rejected(task: Task) -> None:
            held()(task)
            task.status = TaskStatus.REJECTED
            task.approval = ApprovalRecord(
                required=True,
                decision="rejected",
                reviewer_name="Approving Authority",
                comment="Cites the wrong table row.",
            )

        task = child(rejected)
        verdict, detail = derive_outcome(item(task=task), task)
        assert verdict == HarnessOutcome.REJECTED
        assert "Approving Authority" in detail and "wrong table row" in detail

    def test_a_policy_refusal_is_refused_with_its_reason(self) -> None:
        task = child(blocked("model 'x' is not approved for 'restricted' data"))
        view = child_view(item(task=task), task)
        assert view.outcome == HarnessOutcome.REFUSED
        assert view.error == "model 'x' is not approved for 'restricted' data"

    def test_a_failure_keeps_its_reason(self) -> None:
        task = child(failed("Local inference failed: timed out"))
        assert child_view(item(task=task), task).error == "Local inference failed: timed out"

    def test_cancelled(self) -> None:
        def stop(task: Task) -> None:
            task.status = TaskStatus.CANCELLED
            task.error = "Stopped at your request."

        assert outcome(stop) == HarnessOutcome.CANCELLED

    def test_progress_states_come_from_the_record(self) -> None:
        queued = child(status=TaskStatus.CLASSIFIED)
        view = child_view(
            item(task=queued, state=ItemState.SUBMITTED),
            queued,
            queue={"position": 3, "ahead": 2},
        )
        assert view.outcome == HarnessOutcome.QUEUED
        assert (view.queue_position, view.queue_ahead) == (3, 2)

        running = child(status=TaskStatus.RETRIEVING)
        assert (
            derive_outcome(item(task=running, state=ItemState.SUBMITTED), running)[0]
            == HarnessOutcome.RUNNING
        )
        assert derive_outcome(item(state=ItemState.PENDING), None)[0] == HarnessOutcome.PENDING

    def test_a_never_submitted_item_is_not_a_failure(self) -> None:
        never = item(state=ItemState.NOT_SUBMITTED)
        never.note = "Not submitted: the run was cancelled before this item's turn."
        verdict, detail = derive_outcome(never, None)
        assert verdict == HarnessOutcome.NOT_SUBMITTED
        assert "cancelled" in detail

    def test_a_missing_record_is_reported_missing(self) -> None:
        ghost = item(state=ItemState.SUBMITTED)
        ghost.task_id = "no-such-task"
        verdict, detail = derive_outcome(ghost, None)
        assert verdict == HarnessOutcome.FAILED
        assert "could not be read back" in detail

    def test_a_citation_to_an_unretrieved_passage_is_flagged(self) -> None:
        task = child(delivered(answer="Interval is 12 months [S1], per clause 2 [S9]."))
        view = child_view(item(task=task), task)
        assert [c.id for c in view.citations] == ["S1"]
        assert view.unretrieved_citations == ["S9"]


class TestTally:
    def test_counts_every_outcome_including_zeros(self) -> None:
        outcomes = [
            HarnessOutcome.SUPPORTED,
            HarnessOutcome.PARTIALLY_SUPPORTED,
            HarnessOutcome.HELD,
            HarnessOutcome.REFUSED,
            HarnessOutcome.FAILED,
            HarnessOutcome.RUNNING,
            HarnessOutcome.PENDING,
        ]
        counts = tally(outcomes)
        assert counts.total == 7
        assert counts.settled == 5
        assert counts.delivered == 2
        assert counts.counts[HarnessOutcome.CANCELLED] == 0
        assert len(counts.counts) == len(HarnessOutcome)


# ------------------------------------------------------------------ report
def make_run(
    items: list[HarnessItem], *, aggregation: AggregationKind = AggregationKind.ANSWER_MATRIX
) -> HarnessRun:
    stamp = now()
    return HarnessRun(
        id=str(uuid.uuid4()),
        harness=DefinitionSnapshot(
            id="sop-question-sweep",
            version=1,
            name="SOP question sweep",
            source="config/harnesses/sop-question-sweep.yaml",
            sha256="a" * 64,
            aggregation=aggregation,
            report_title="SOP question sweep",
            report_requires_approval=False,
            limitations=["Definition-specific limitation."],
            template="{item}",
            child_timeout_seconds=1800,
        ),
        user_id="user-operator",
        username="operator",
        user_display_name="Plant Operator",
        role="operator",
        department="operations",
        inputs={"questions": ["q"]},
        inputs_sha256="b" * 64,
        scope=ScopeRecord(
            departments=["operations", "general"],
            max_classification=Sensitivity.CONFIDENTIAL,
            documents=4,
            sections=26,
        ),
        status=RunStatus.FINISHED,
        created_at=stamp,
        updated_at=stamp,
        finished_at=stamp,
        items=items,
    )


def mixed_rows() -> list[tuple[HarnessItem, Task | None]]:
    scripts: list[Settle] = [
        delivered(2, 2),
        delivered(1, 2, untraced=["An untraced sentence about intervals."]),
        held(),
        blocked(),
        failed(),
    ]
    rows: list[tuple[HarnessItem, Task | None]] = []
    for index, script in enumerate(scripts, start=1):
        task = child(script)
        rows.append((item(index, task), task))
    never = item(6, state=ItemState.NOT_SUBMITTED)
    never.note = "Not submitted: the run was cancelled before this item's turn."
    rows.append((never, None))
    return rows


def build(rows, **kwargs):
    run = make_run([row_item for row_item, _ in rows], **kwargs)
    data, counts, classification = build_report_data(
        run, rows, version=1, generated_at=now(), generated_by="operator", reason="finished"
    )
    return data, counts, classification


class TestReport:
    def test_counts_match_the_rows(self) -> None:
        data, counts, _ = build(mixed_rows())
        assert counts.counts[HarnessOutcome.SUPPORTED] == 1
        assert counts.counts[HarnessOutcome.PARTIALLY_SUPPORTED] == 1
        assert counts.counts[HarnessOutcome.HELD] == 1
        assert counts.counts[HarnessOutcome.REFUSED] == 1
        assert counts.counts[HarnessOutcome.FAILED] == 1
        assert counts.counts[HarnessOutcome.NOT_SUBMITTED] == 1
        assert data["tally"]["counts"]["supported"] == 1

    def test_only_released_answers_are_in_the_report(self) -> None:
        data, _, _ = build(mixed_rows())
        markdown = render_markdown(data, json_sha256="c" * 64)
        assert LEAK not in json.dumps(data)
        assert LEAK not in markdown
        held_row = data["rows"][2]
        assert held_row["answer"] is None
        assert held_row["citations"] == [] and held_row["untraced_claims"] == []
        assert "not part of this report" in held_row["answer_withheld"]
        assert data["rows"][0]["answer"].startswith("External inspection")

    def test_the_lexical_limit_of_the_verifier_is_stated(self) -> None:
        data, _, _ = build(mixed_rows())
        markdown = render_markdown(data, json_sha256="c" * 64)
        assert LEXICAL_LIMITATION in data["limitations"]
        assert "wrong row of" in markdown
        assert "Definition-specific limitation." in markdown

    def test_the_markdown_binds_the_json_by_hash(self) -> None:
        data, _, _ = build(mixed_rows())
        assert "c" * 64 in render_markdown(data, json_sha256="c" * 64)

    def test_classification_follows_released_content_only(self) -> None:
        _, _, classification = build(mixed_rows())
        # The cited passage is confidential and it is in the report.
        assert classification == Sensitivity.CONFIDENTIAL

        only_held = [(row_item, task) for row_item, task in mixed_rows()[2:3]]
        _, _, classification = build(only_held)
        assert classification == Sensitivity.NORMAL

    def test_restricted_passages_raise_the_classification(self) -> None:
        task = child(delivered(items=[evidence(classification=Sensitivity.RESTRICTED)]))
        _, _, classification = build([(item(1, task), task)])
        assert classification == Sensitivity.RESTRICTED

    def test_a_register_groups_rows_by_document(self) -> None:
        rows = mixed_rows()
        for row_item, _ in rows:
            row_item.label = "SOP-INS-014 · 2. Inspection Intervals"
        data, _, _ = build(rows, aggregation=AggregationKind.REQUIREMENTS_REGISTER)
        markdown = render_markdown(data, json_sha256="c" * 64)
        assert "## Register" in markdown
        assert "### SOP-INS-014 — Pressure Vessel External and Internal Inspection" in markdown
        assert "| 1 | SOP-INS-014 | 2. Inspection Intervals |" in markdown

    def test_table_cells_cannot_break_the_table(self) -> None:
        rows = mixed_rows()[:1]
        rows[0][0].label = "Interval | with a pipe\nand a newline"
        data, _, _ = build(rows)
        markdown = render_markdown(data, json_sha256="c" * 64)
        assert "Interval \\| with a pipe and a newline" in markdown
