"""The harness runner, end to end, against a scripted task gateway.

What is pinned:

* Children are submitted one at a time, through the gateway, as answers
  rather than documents -- never two in flight.
* Cancelling stops the child in flight through the task service's own
  cancel path and submits nothing further; items never reached are
  "never submitted", not failures.
* Every consequential step is on the audit chain, and each report file on
  disk hashes to the value the chain carries.
* A run abandoned by a stopped process is closed out as interrupted rather
  than displayed as running forever.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from pathlib import Path

import pytest

from backend.api.task_service import TaskError
from backend.core.database import Database
from backend.core.events import EventBus
from backend.core.schemas import ApprovalRecord, Task, TaskStatus
from backend.harness.expansion import HarnessInputError
from backend.harness.models import HarnessOutcome, HarnessStartRequest, ItemState, RunStatus
from backend.harness.service import (
    HarnessConflict,
    HarnessForbidden,
    HarnessService,
)
from backend.harness.store import HarnessStore
from tests.test_harness_fixtures import (
    FakeTasks,
    blocked,
    delivered,
    failed,
    held,
    make_user,
    running,
)

OPERATOR = make_user("operator", role="operator", department="operations")
OTHER_OPERATOR = make_user("operator2", role="operator", department="operations")
REVIEWER = make_user("reviewer", role="reviewer", department="engineering")
AUDITOR = make_user("auditor", role="auditor", department="quality")


@pytest.fixture
def store(tmp_path: Path) -> HarnessStore:
    return HarnessStore(Database(path=tmp_path / "harness.sqlite"))


def service_for(fake: FakeTasks, store: HarnessStore, **kwargs) -> HarnessService:
    return HarnessService(tasks=fake, store=store, events=EventBus(), poll_interval=0.005, **kwargs)


def sweep(questions: list[str], **extra) -> HarnessStartRequest:
    return HarnessStartRequest(
        harness_id="sop-question-sweep", inputs={"questions": questions}, **extra
    )


async def finish(service: HarnessService, run_id: str) -> None:
    runner = service._runners.get(run_id)
    if runner is not None:
        await asyncio.wait_for(runner, timeout=10)


async def until(condition, timeout: float = 5.0) -> None:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while not condition():
        if loop.time() > deadline:
            raise AssertionError("condition not reached")
        await asyncio.sleep(0.005)


def actions(service: HarnessService, run_id: str) -> list[str]:
    return [event.action for event in service.audit.query(search=run_id, limit=500)]


class TestSequencing:
    async def test_a_sweep_runs_children_one_at_a_time_and_reports(self, store: HarnessStore) -> None:
        fake = FakeTasks([delivered(2, 2), held(), blocked(), failed()])
        service = service_for(fake, store)
        run = await service.start(sweep(["Q1?", "Q2?", "Q3?", "Q4?"]), OPERATOR)
        await finish(service, run.id)

        stored = store.get(run.id)
        assert stored is not None and stored.status == RunStatus.FINISHED
        assert not fake.overlapped, "a child was submitted while another was in flight"
        assert fake.formats == ["answer"] * 4
        assert fake.prompts[0].startswith("Q1?\n")

        view = service.view(stored, OPERATOR)
        assert [child.outcome for child in view.children] == [
            HarnessOutcome.SUPPORTED,
            HarnessOutcome.HELD,
            HarnessOutcome.REFUSED,
            HarnessOutcome.FAILED,
        ]
        assert (view.tally.settled, view.tally.total, view.tally.delivered) == (4, 4, 1)
        assert view.current_index is None

    async def test_every_step_is_audited_and_the_files_match_their_hashes(
        self, store: HarnessStore
    ) -> None:
        fake = FakeTasks([delivered(2, 2), held()])
        service = service_for(fake, store)
        run = await service.start(sweep(["Q1?", "Q2?"]), OPERATOR)
        await finish(service, run.id)
        stored = store.get(run.id)
        assert stored is not None and stored.report is not None

        recorded = service.audit.query(search=run.id, limit=500)
        names = [event.action for event in recorded]
        assert "run_started" in names and "run_finished" in names
        assert names.count("child_submitted") == 2
        # Each child_submitted event carries the child's own task id.
        assert {e.task_id for e in recorded if e.action == "child_submitted"} == set(fake.created)

        generated = next(event for event in recorded if event.action == "report_generated")
        on_record = {entry["filename"]: entry["sha256"] for entry in generated.detail["files"]}
        for file in stored.report.files:
            path = service._report_dir(run.id) / file.filename
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            assert digest == file.sha256 == on_record[file.filename]

        markdown = (service._report_dir(run.id) / stored.report.files[0].filename).read_text("utf-8")
        json_sha = next(f.sha256 for f in stored.report.files if f.format == "json")
        assert json_sha in markdown
        assert "DRAFT THAT MUST NOT LEAK" not in markdown

    async def test_progress_events_carry_ids_and_counts_only(self, store: HarnessStore) -> None:
        fake = FakeTasks([delivered(), delivered()])
        service = service_for(fake, store)
        run = await service.start(sweep(["A private question?", "Another?"]), OPERATOR)
        await finish(service, run.id)

        published = service.events.replay(limit=400)
        names = [event.event for event in published]
        assert names[0] == "harness.started" and names[-1] == "harness.finished"
        assert "harness.child" in names
        for event in published:
            if event.event == "harness.child":
                # Scoped to the child, so the stream's ownership check
                # delivers it only to people who may read that task.
                assert event.task_id in fake.created
            else:
                # Run-level events reach every session: ids and counts only.
                assert event.task_id is None
            assert "private question" not in json.dumps(event.data)
            assert "operator" not in json.dumps(event.data).lower()
        finished = published[-1].data
        assert (finished["settled"], finished["total"]) == (2, 2)

    async def test_a_refused_submission_is_recorded_and_the_run_continues(
        self, store: HarnessStore
    ) -> None:
        class Refusing(FakeTasks):
            async def create_task(self, user, prompt, file_ids, deliverable_format=None) -> Task:
                if not self.created and not getattr(self, "refused", False):
                    self.refused = True
                    raise TaskError("Unknown file id: nope")
                return await super().create_task(user, prompt, file_ids, deliverable_format)

        fake = Refusing([delivered()])
        service = service_for(fake, store)
        run = await service.start(sweep(["First?", "Second?"]), OPERATOR)
        await finish(service, run.id)
        stored = store.get(run.id)
        assert stored is not None
        assert [item.state for item in stored.items] == [ItemState.SUBMIT_FAILED, ItemState.SETTLED]
        view = service.view(stored, OPERATOR)
        assert view.children[0].outcome == HarnessOutcome.FAILED
        assert "Unknown file id" in view.children[0].outcome_detail
        assert "child_submit_failed" in actions(service, run.id)

    async def test_the_selection_is_exactly_what_runs(self, store: HarnessStore) -> None:
        fake = FakeTasks([delivered()])
        service = service_for(fake, store)
        run = await service.start(sweep(["Keep?", "Drop?"], selected=["line-1"]), OPERATOR)
        await finish(service, run.id)
        assert fake.prompts[0].startswith("Keep?") and len(fake.prompts) == 1
        assert [entry.label for entry in run.excluded] == ["Drop?"]

    async def test_a_selection_the_inputs_no_longer_produce_is_refused(
        self, store: HarnessStore
    ) -> None:
        service = service_for(FakeTasks(), store)
        with pytest.raises(HarnessInputError, match="Preview again"):
            await service.start(sweep(["Only one?"], selected=["line-1", "line-7"]), OPERATOR)
        assert store.list() == []

    async def test_a_definition_edited_since_the_preview_is_refused(
        self, store: HarnessStore
    ) -> None:
        fake = FakeTasks([delivered()])
        service = service_for(fake, store)
        with pytest.raises(HarnessConflict, match="changed since it was previewed"):
            await service.start(sweep(["One?"], definition_sha256="0" * 64), OPERATOR)
        assert fake.created == [] and store.list() == []

        current = service.catalog().get("sop-question-sweep")
        assert current is not None
        run = await service.start(sweep(["One?"], definition_sha256=current.sha256), OPERATOR)
        await finish(service, run.id)
        assert run.harness.sha256 == current.sha256


class TestPerChildAuthorisation:
    """Each child is authorised on its own, as each thread question is.

    The start request passes require_permission('task.create'), but a run can
    last an hour. A role that loses the grant, or an account deactivated,
    mid-run must stop submitting rather than ride the first check.
    """

    async def test_a_role_without_task_create_submits_nothing(self, store: HarnessStore) -> None:
        fake = FakeTasks()
        service = service_for(fake, store)
        # Stands for a role whose grant was withdrawn after the run started.
        run = await service.start(sweep(["One?", "Two?"]), AUDITOR)
        await finish(service, run.id)

        assert fake.created == []
        stored = store.get(run.id)
        assert stored is not None
        view = service.view(stored, AUDITOR)
        assert [child.outcome for child in view.children] == [
            HarnessOutcome.REFUSED,
            HarnessOutcome.REFUSED,
        ]
        assert "task.create" in view.children[0].outcome_detail
        assert actions(service, run.id).count("child_refused") == 2

    async def test_an_inactive_account_submits_nothing(self, store: HarnessStore) -> None:
        fake = FakeTasks()
        service = service_for(fake, store)
        inactive = make_user("operator9", role="operator", department="operations")
        inactive.active = False
        run = await service.start(sweep(["One?"]), inactive)
        await finish(service, run.id)
        assert fake.created == []
        view = service.view(store.get(run.id), inactive)  # type: ignore[arg-type]
        assert view.children[0].outcome == HarnessOutcome.REFUSED
        assert "no longer active" in view.children[0].outcome_detail


class TestCancellation:
    async def test_cancel_stops_the_child_in_flight_and_submits_nothing_more(
        self, store: HarnessStore
    ) -> None:
        fake = FakeTasks([running()])
        service = service_for(fake, store)
        run = await service.start(sweep(["One?", "Two?", "Three?"]), OPERATOR)
        await until(lambda: run.items[0].started_at is not None)

        await service.cancel(run.id, OPERATOR)
        await finish(service, run.id)

        stored = store.get(run.id)
        assert stored is not None and stored.status == RunStatus.CANCELLED
        assert len(fake.created) == 1
        # Through the task service's own cancel path, exactly once.
        assert fake.cancel_requests == [(fake.created[0], "operator")]
        view = service.view(stored, OPERATOR)
        assert [child.outcome for child in view.children] == [
            HarnessOutcome.CANCELLED,
            HarnessOutcome.NOT_SUBMITTED,
            HarnessOutcome.NOT_SUBMITTED,
        ]
        assert "cancelled by Operator" in (view.children[1].note or "")
        names = actions(service, run.id)
        assert "run_cancel_requested" in names and "run_cancelled" in names
        # A partial report is still written, and says what was not done.
        assert stored.report is not None and stored.report.reason == "cancelled"

    async def test_who_may_cancel(self, store: HarnessStore) -> None:
        fake = FakeTasks([running()])
        service = service_for(fake, store)
        run = await service.start(sweep(["One?", "Two?"]), OPERATOR)
        await until(lambda: run.items[0].task_id is not None)

        for outsider in (OTHER_OPERATOR, AUDITOR):
            with pytest.raises(HarnessForbidden):
                await service.cancel(run.id, outsider)
        assert run.cancel_requested_at is None

        await service.cancel(run.id, REVIEWER)
        await finish(service, run.id)
        assert fake.cancel_requests[0][1] == "reviewer"
        assert store.get(run.id).cancel_requested_by == "Reviewer"  # type: ignore[union-attr]

    async def test_a_finished_run_cannot_be_cancelled(self, store: HarnessStore) -> None:
        service = service_for(FakeTasks([delivered()]), store)
        run = await service.start(sweep(["One?"]), OPERATOR)
        await finish(service, run.id)
        with pytest.raises(HarnessConflict, match="already ended"):
            await service.cancel(run.id, OPERATOR)

    async def test_a_stuck_child_is_stopped_by_the_watchdog_and_the_run_goes_on(
        self, store: HarnessStore
    ) -> None:
        fake = FakeTasks([running(), delivered()])
        service = service_for(fake, store)
        run = await service.start(sweep(["Stuck?", "Fine?"]), OPERATOR)
        # The definition's floor is 60 s; the live snapshot is shortened so
        # the watchdog fires within the test.
        run.harness.child_timeout_seconds = 0
        await finish(service, run.id)

        stored = store.get(run.id)
        assert stored is not None and stored.status == RunStatus.FINISHED
        assert fake.cancel_requests == [(fake.created[0], "operator")]
        assert "Stopped by the harness" in (stored.items[0].note or "")
        assert "child_timeout" in actions(service, run.id)
        view = service.view(stored, OPERATOR)
        assert [c.outcome for c in view.children] == [HarnessOutcome.CANCELLED, HarnessOutcome.SUPPORTED]


class TestReportLifecycle:
    async def test_a_report_that_needs_sign_off_is_held_until_approved(
        self, store: HarnessStore
    ) -> None:
        fake = FakeTasks([delivered()])
        service = service_for(fake, store)
        run = await service.start(
            HarnessStartRequest(
                harness_id="obligation-coverage-check",
                inputs={"obligations": "Records shall be retained for the life of the vessel."},
            ),
            OPERATOR,
        )
        await finish(service, run.id)
        stored = store.get(run.id)
        assert stored is not None and stored.report is not None
        assert stored.report.approval.required and not stored.report.released

        with pytest.raises(HarnessForbidden, match="held pending approval"):
            service.report_file(run.id, "md", OPERATOR)
        # A reviewer may read it in order to decide.
        service.report_file(run.id, "md", REVIEWER)

        with pytest.raises(HarnessForbidden):
            await service.decide_report(run.id, OPERATOR, "approve", None)
        await service.decide_report(run.id, REVIEWER, "approve", "Checked against CIS-07.")
        path, _ = service.report_file(run.id, "md", OPERATOR)
        assert path.exists()
        assert "harness_report_approved" in actions(service, run.id)
        with pytest.raises(HarnessConflict, match="already approved"):
            await service.decide_report(run.id, REVIEWER, "reject", None)

    async def test_a_later_approval_makes_the_report_stale_and_regeneration_catches_up(
        self, store: HarnessStore
    ) -> None:
        fake = FakeTasks([held()])
        service = service_for(fake, store)
        run = await service.start(sweep(["Held one?"]), OPERATOR)
        await finish(service, run.id)
        stored = store.get(run.id)
        assert stored is not None
        view = service.view(stored, OPERATOR)
        assert not view.report.stale  # type: ignore[union-attr]
        assert not view.permissions.can_regenerate_report
        with pytest.raises(HarnessConflict, match="No child has changed"):
            await service.regenerate_report(run.id, OPERATOR)

        # A reviewer releases the child in the ordinary approval queue.
        def approve(task: Task) -> None:
            delivered(answer="Released answer text [S1].", approved_by="Approving Authority")(task)
            task.approval = ApprovalRecord(
                required=True, decision="approved", reviewer_name="Approving Authority"
            )

        fake.settle(fake.created[0], approve)
        view = service.view(stored, OPERATOR)
        assert view.report.stale and view.report.changed_items == [1]  # type: ignore[union-attr]
        assert view.permissions.can_regenerate_report

        await service.regenerate_report(run.id, OPERATOR)
        refreshed = store.get(run.id)
        assert refreshed is not None and refreshed.report is not None
        assert refreshed.report.version == 2
        assert [report.version for report in refreshed.previous_reports] == [1]
        latest = next(f for f in refreshed.report.files if f.format == "md")
        text = (service._report_dir(run.id) / latest.filename).read_text("utf-8")
        assert "Released answer text" in text
        assert not service.view(refreshed, OPERATOR).report.stale  # type: ignore[union-attr]

    async def test_a_tampered_file_is_not_served(self, store: HarnessStore) -> None:
        service = service_for(FakeTasks([delivered()]), store)
        run = await service.start(sweep(["One?"]), OPERATOR)
        await finish(service, run.id)
        path, _ = service.report_file(run.id, "json", OPERATOR)
        path.write_text(path.read_text("utf-8").replace("One?", "Two?"), encoding="utf-8")
        with pytest.raises(HarnessConflict, match="no longer matches"):
            service.report_file(run.id, "json", OPERATOR)
        assert "report_integrity_failure" in actions(service, run.id)

    async def test_only_the_owner_or_download_all_may_fetch(self, store: HarnessStore) -> None:
        service = service_for(FakeTasks([delivered()]), store)
        run = await service.start(sweep(["One?"]), OPERATOR)
        await finish(service, run.id)
        with pytest.raises(HarnessForbidden):
            service.report_file(run.id, "md", OTHER_OPERATOR)
        # The auditor may read the run but holds no deliverable.download.all.
        service.run_view(run.id, AUDITOR)
        with pytest.raises(HarnessForbidden):
            service.report_file(run.id, "md", AUDITOR)


class TestRecovery:
    async def test_a_run_abandoned_by_a_stopped_process_is_closed_as_interrupted(
        self, store: HarnessStore
    ) -> None:
        fake = FakeTasks([running()])
        first = service_for(fake, store)
        run = await first.start(sweep(["One?", "Two?"]), OPERATOR)
        await until(lambda: run.items[0].task_id is not None)
        # The process dies: the runner is torn down mid-run.
        runner = first._runners[run.id]
        runner.cancel()
        with pytest.raises(asyncio.CancelledError):
            await runner
        assert store.get(run.id).status == RunStatus.RUNNING  # type: ignore[union-attr]

        # The child is failed by the task service's own boot recovery.
        fake.settle(fake.created[0], failed("This task was interrupted when the workbench stopped"))
        second = service_for(fake, store)

        stored = store.get(run.id)
        assert stored is not None and stored.status == RunStatus.INTERRUPTED
        assert [item.state for item in stored.items] == [ItemState.SUBMITTED, ItemState.NOT_SUBMITTED]
        assert stored.report is not None and stored.report.reason == "interrupted"
        assert "run_interrupted" in actions(second, run.id)
        view = second.view(stored, OPERATOR)
        assert [c.outcome for c in view.children] == [HarnessOutcome.FAILED, HarnessOutcome.NOT_SUBMITTED]
