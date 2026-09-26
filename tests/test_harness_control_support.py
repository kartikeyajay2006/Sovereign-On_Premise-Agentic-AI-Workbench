"""The record Harness Control draws from, pinned.

Harness Control shows a run's children as stage lanes on one time axis, a
claim -> evidence graph and a sealed report. Every figure there must come
from something the backend measured or emitted, so what is pinned here is
that the backend emits and keeps it:

* A released child carries its claims, their verdicts and the passages each
  rests on, so the graph of a reopened run is rebuilt from the record. A
  held child carries none of that text.
* The runner says when it is aggregating -- every child settled, the report
  not yet written -- and then that the report is written, with the file
  hashes and the audit chain head, which is also kept on the report record
  and is the report_generated record's own sequence and hash.
* The task record keeps a timestamped mark for every stage entered, and a
  tool's completion carries the tool's own start, so a settled child's lanes
  replay from the same timestamps the live ones used.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from backend.core.database import Database
from backend.core.events import EventBus
from backend.core.schemas import (
    ClaimVerdict,
    PolicyDecision,
    Task,
    TaskStatus,
    ToolCall,
)
from backend.harness.models import HarnessStartRequest
from backend.harness.service import HarnessService
from backend.harness.store import HarnessStore
from tests.test_harness_fixtures import (
    FakeTasks,
    delivered,
    evidence,
    held,
    make_user,
)

OPERATOR = make_user("operator", role="operator", department="operations")
REVIEWER = make_user("reviewer", role="reviewer", department="engineering")


@pytest.fixture
def store(tmp_path: Path) -> HarnessStore:
    return HarnessStore(Database(path=tmp_path / "harness.sqlite"))


def service_for(fake: FakeTasks, store: HarnessStore) -> HarnessService:
    return HarnessService(tasks=fake, store=store, events=EventBus(), poll_interval=0.005)


def sweep(questions: list[str]) -> HarnessStartRequest:
    return HarnessStartRequest(harness_id="sop-question-sweep", inputs={"questions": questions})


async def finish(service: HarnessService, run_id: str) -> None:
    runner = service._runners.get(run_id)
    if runner is not None:
        await asyncio.wait_for(runner, timeout=10)


def with_claims(settle):
    """A delivered script whose verifier also recorded per-claim verdicts."""

    def script(task: Task) -> None:
        settle(task)
        task.evidence = [
            evidence("S1"),
            evidence(
                "S2",
                document="SOP-INS-021 — Relief Valve Testing",
                location="section: 4. Test Intervals",
                excerpt="Relief valves are bench tested every 24 months.",
            ),
        ]
        assert task.verification is not None
        task.verification.claims = [
            ClaimVerdict(
                id="C1",
                text="External inspection is every 12 months in corrosive service.",
                kind="procedural",
                verdict="SUPPORTED",
                evidence_ids=["S1"],
                reason="Matches the cited passage.",
            ),
            ClaimVerdict(
                id="C2",
                text="Relief valves are tested every 24 months.",
                kind="procedural",
                verdict="SUPPORTED",
                # S2 is not cited by a marker in the answer; S9 was never
                # retrieved at all.
                evidence_ids=["S2", "S9"],
                reason="Matches a retrieved passage.",
            ),
        ]

    return script


class TestClaimsOnTheChildView:
    async def test_a_released_child_carries_claims_and_every_passage_they_name(
        self, store: HarnessStore
    ) -> None:
        fake = FakeTasks([with_claims(delivered(2, 2))])
        service = service_for(fake, store)
        run = await service.start(sweep(["Q1?"]), OPERATOR)
        await finish(service, run.id)

        [child] = service.run_view(run.id, OPERATOR).children
        assert [claim.id for claim in child.claims] == ["C1", "C2"]
        assert child.claims[0].verdict == "SUPPORTED"
        assert child.claims[1].evidence_ids == ["S2", "S9"]
        # S1 is cited by the answer's marker; S2 only by a claim, so it is
        # carried beside the citations rather than dropped.
        assert [c.id for c in child.citations] == ["S1"]
        assert [c.id for c in child.claim_evidence] == ["S2"]
        assert child.claim_evidence[0].location == "section: 4. Test Intervals"
        # An id the run never retrieved resolves to nothing: no invented passage.
        assert "S9" not in {c.id for c in [*child.citations, *child.claim_evidence]}

    async def test_a_held_child_carries_no_claim_text(self, store: HarnessStore) -> None:
        def held_with_claims(task: Task) -> None:
            held()(task)
            assert task.verification is not None
            task.verification.claims = [
                ClaimVerdict(
                    id="C1",
                    text="DRAFT THAT MUST NOT LEAK",
                    kind="factual",
                    verdict="UNSUPPORTED",
                    evidence_ids=["S1"],
                    reason="No passage says this.",
                )
            ]

        fake = FakeTasks([held_with_claims])
        service = service_for(fake, store)
        run = await service.start(sweep(["Q1?"]), OPERATOR)
        await finish(service, run.id)

        [child] = service.run_view(run.id, OPERATOR).children
        assert child.claims == [] and child.claim_evidence == []
        assert "DRAFT THAT MUST NOT LEAK" not in child.model_dump_json()


class TestAggregationAndSeal:
    async def test_the_runner_says_it_is_aggregating_then_that_the_report_is_written(
        self, store: HarnessStore
    ) -> None:
        fake = FakeTasks([delivered(), delivered()])
        service = service_for(fake, store)
        run = await service.start(sweep(["Q1?", "Q2?"]), OPERATOR)
        await finish(service, run.id)

        published = service.events.replay(limit=400)
        names = [event.event for event in published]
        aggregating = names.index("harness.aggregating")
        written = names.index("harness.report_written")
        last_child = max(i for i, name in enumerate(names) if name == "harness.child")
        assert last_child < aggregating < written < names.index("harness.finished")

        # Run-level: no task to scope it by, so ids, hashes and counts only.
        agg = published[aggregating]
        assert agg.task_id is None
        assert (agg.data["settled"], agg.data["total"]) == (2, 2)

        seal = published[written].data
        stored = store.get(run.id)
        assert stored is not None and stored.report is not None
        report = stored.report
        assert seal["report_version"] == report.version == 1
        assert seal["files"] == [{"filename": f.filename, "sha256": f.sha256} for f in report.files]
        assert seal["released"] is report.released
        assert seal["audit_seq"] == report.audit_seq
        assert seal["audit_hash"] == report.audit_hash

    async def test_the_audit_head_on_the_record_is_the_report_generated_record(
        self, store: HarnessStore
    ) -> None:
        fake = FakeTasks([delivered()])
        service = service_for(fake, store)
        run = await service.start(sweep(["Q1?"]), OPERATOR)
        await finish(service, run.id)

        stored = store.get(run.id)
        assert stored is not None and stored.report is not None
        generated = next(
            event
            for event in service.audit.query(search=run.id, limit=500)
            if event.action == "report_generated"
        )
        assert stored.report.audit_seq == generated.sequence
        assert stored.report.audit_hash == generated.hash
        # That record carries the file hashes the seal names.
        on_chain = {f["filename"]: f["sha256"] for f in generated.detail["files"]}
        assert on_chain == {f.filename: f.sha256 for f in stored.report.files}
        assert service.audit.verify_chain().valid

    async def test_a_regenerated_report_is_announced_with_its_own_head(
        self, store: HarnessStore
    ) -> None:
        fake = FakeTasks([held()])
        service = service_for(fake, store)
        run = await service.start(sweep(["Q1?"]), OPERATOR)
        await finish(service, run.id)
        first = store.get(run.id)
        assert first is not None and first.report is not None

        # A reviewer releases the held child since, so the report is stale.
        task = fake.tasks[fake.created[0]]
        delivered()(task)
        await service.regenerate_report(run.id, OPERATOR)

        stored = store.get(run.id)
        assert stored is not None and stored.report is not None
        assert stored.report.version == 2
        assert stored.report.audit_seq is not None and first.report.audit_seq is not None
        assert stored.report.audit_seq > first.report.audit_seq

        announced = [
            event.data
            for event in service.events.replay(limit=400)
            if event.event == "harness.report_written"
        ]
        assert [data["report_version"] for data in announced] == [1, 2]
        assert announced[-1]["audit_hash"] == stored.report.audit_hash

    async def test_a_record_written_before_the_head_was_kept_still_loads(self) -> None:
        from backend.harness.models import HarnessReportRecord

        legacy: dict[str, Any] = {
            "version": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "generated_by": "operator",
            "reason": "finished",
            "files": [],
            "classification": "normal",
            "approval": {"required": False},
            "released": True,
            "tally": {"total": 0, "settled": 0, "delivered": 0, "counts": {}},
        }
        record = HarnessReportRecord(**legacy)
        assert record.audit_seq is None and record.audit_hash is None


# ------------------------------------------------------ replayable timings
class _Tools:
    async def invoke(self, name: str, arguments: dict[str, Any], context: Any) -> ToolCall:
        return ToolCall(
            id="t1",
            tool=name,
            ok=True,
            output_summary="2 passages",
            started_at=datetime(2026, 9, 27, 10, 0, 0, tzinfo=timezone.utc),
            duration_ms=840,
            policy_decision=PolicyDecision.ALLOW,
        )


class TestReplayableTimings:
    def orchestrator(self):
        from tests.test_usage_telemetry import FakeClient, orchestrator_with

        orchestrator, recorder, _ = orchestrator_with(FakeClient())
        orchestrator.tools = _Tools()  # type: ignore[assignment]
        return orchestrator, recorder

    async def test_every_stage_entered_is_kept_on_the_record_with_its_time(self) -> None:
        from tests.test_usage_telemetry import make_task

        orchestrator, recorder = self.orchestrator()
        task = make_task()
        await orchestrator._stage(task, TaskStatus.PLANNED, "Planning", phase="planning")
        await orchestrator._stage(task, TaskStatus.RETRIEVING, "Searching", phase="retrieval")
        await orchestrator._stage(
            task, TaskStatus.EXECUTING, "Drawing unreadable", {"skipped": True}, phase="engineering"
        )

        assert [(m.status, m.phase, m.skipped) for m in task.stage_log] == [
            ("planned", "planning", False),
            ("retrieving", "retrieval", False),
            ("executing", "engineering", True),
        ]
        assert task.stage_log[0].at <= task.stage_log[1].at <= task.stage_log[2].at
        # The same stages were announced live.
        assert [data["phase"] for data in recorder.named("task.stage")] == [
            "planning",
            "retrieval",
            "engineering",
        ]
        # And the mark survives the record's round trip.
        assert Task(**task.model_dump(mode="json")).stage_log == task.stage_log

    async def test_a_tool_completion_carries_the_tools_own_start(self) -> None:
        from tests.test_usage_telemetry import USER, make_task
        from backend.tools.registry import ToolContext

        orchestrator, recorder = self.orchestrator()
        task = make_task()
        context = ToolContext.__new__(ToolContext)
        context.user = USER  # type: ignore[misc]
        await orchestrator._call_tool(task, context, "knowledge_search", {"query": "x"})

        [completed] = recorder.named("task.tool_completed")
        assert completed["started_at"] == "2026-09-27T10:00:00+00:00"
        assert completed["duration_ms"] == 840
        assert task.tool_calls[0].started_at.isoformat() == completed["started_at"]

    def test_a_record_written_before_the_stage_log_still_loads(self) -> None:
        from tests.test_usage_telemetry import make_task

        legacy = make_task().model_dump(mode="json")
        legacy.pop("stage_log")
        assert Task(**legacy).stage_log == []
