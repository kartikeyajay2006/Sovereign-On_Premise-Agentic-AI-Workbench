"""An answer is at least as sensitive as what it was built from.

The profile's classification came from the prompt and the attachments alone,
so a question answered out of a Restricted design memo stayed "normal": it
was not held for approval, and a deliverable would have been stamped below
the material inside it. These drive the real run() loop, with the runtime
faked, to prove the evidence now raises the output before the gate reads it.
"""

from __future__ import annotations

import pytest

from backend.core.schemas import EvidenceItem, Sensitivity, TaskStatus
from tests.test_usage_telemetry import (
    STREAM_STATS,
    USER,
    FakeClient,
    blocking_result,
    make_task,
    orchestrator_with,
)


def _passage(id: str, classification: Sensitivity) -> EvidenceItem:
    return EvidenceItem(
        id=id,
        source_document="ENG-DBM-2104 V-2104 replacement design basis",
        excerpt="The replacement shell is specified at 14.0 mm nominal.",
        kind="knowledge_base",
        classification=classification,
        department="general",
    )


def _client() -> FakeClient:
    return FakeClient(
        fragments=["The replacement shell is 14.0 mm [S1]."],
        stats=STREAM_STATS,
        results=[blocking_result(text='{"calculations": []}', prompt_eval_count=500, eval_count=20)],
    )


class TestEvidenceRaisesTheOutput:
    @pytest.mark.asyncio
    async def test_restricted_evidence_makes_a_normal_question_restricted_and_held(self) -> None:
        orchestrator, recorder, _ = orchestrator_with(_client())
        task = make_task(evidence=[_passage("S1", Sensitivity.RESTRICTED)])
        assert task.profile.sensitivity == Sensitivity.NORMAL

        finished = await orchestrator.run(task, USER)

        assert finished.profile.sensitivity == Sensitivity.RESTRICTED
        # The sensitive_classification rule now applies, so a human decides.
        assert finished.status == TaskStatus.AWAITING_APPROVAL
        assert any("sensitive_classification" in reason for reason in finished.approval.reasons)
        raised = [data for data in recorder.named("task.classified") if data.get("raised_from")]
        assert raised and raised[0]["sensitivity"] == "restricted"
        assert raised[0]["raised_from"] == "normal"

    @pytest.mark.asyncio
    async def test_evidence_never_lowers_the_output(self) -> None:
        orchestrator, recorder, _ = orchestrator_with(_client())
        task = make_task(evidence=[_passage("S1", Sensitivity.NORMAL)])
        task.profile = task.profile.model_copy(update={"sensitivity": Sensitivity.CONFIDENTIAL})

        finished = await orchestrator.run(task, USER)

        assert finished.profile.sensitivity == Sensitivity.CONFIDENTIAL
        assert not [data for data in recorder.named("task.classified") if data.get("raised_from")]

    def test_the_highest_level_is_chosen_by_policy_rank(self) -> None:
        orchestrator, _, _ = orchestrator_with(_client())
        level = orchestrator._classification_of_evidence(
            [
                _passage("S1", Sensitivity.NORMAL),
                _passage("S2", Sensitivity.RESTRICTED),
                _passage("S3", Sensitivity.CONFIDENTIAL),
            ]
        )
        assert level == Sensitivity.RESTRICTED

    def test_no_evidence_raises_nothing(self) -> None:
        orchestrator, _, _ = orchestrator_with(_client())
        assert orchestrator._classification_of_evidence([]) is None
