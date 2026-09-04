"""Security tests: sandbox containment, policy enforcement, audit integrity.

These are the claims the platform is sold on, so they are tested adversarially
— by trying to break them — rather than by confirming the happy path.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from backend.core.audit import AuditLog
from backend.core.config import get_config
from backend.core.schemas import (
    PolicyDecision,
    Sensitivity,
    StoredFile,
    InputType,
    User,
)
from backend.policy.gateway import PolicyGateway
from backend.tools.sandbox import Sandbox, StaticValidator


# --------------------------------------------------------------------- setup
def make_user(role: str = "engineer", department: str = "inspection") -> User:
    config = get_config()
    return User(
        id=f"user-{role}",
        username=role,
        display_name=role.title(),
        role=role,
        department=department,
        permissions=sorted(config.role_permissions(role)),
        max_data_classification=Sensitivity(config.role_max_classification(role)),
    )


def make_file(
    *,
    owner_id: str = "someone-else",
    department: str = "inspection",
    classification: Sensitivity = Sensitivity.NORMAL,
) -> StoredFile:
    return StoredFile(
        id="file-1",
        filename="report.pdf",
        stored_path="/tmp/report.pdf",
        media_type="application/pdf",
        size_bytes=1024,
        sha256="0" * 64,
        input_type=InputType.PDF,
        classification=classification,
        owner_id=owner_id,
        department=department,
        uploaded_at=datetime.now(timezone.utc),
    )


# ------------------------------------------------------- static code review
class TestStaticValidation:
    """Code must be rejected before it ever runs."""

    @pytest.fixture
    def validator(self) -> StaticValidator:
        return StaticValidator()

    @pytest.mark.parametrize(
        "source",
        [
            "import socket",
            "import requests",
            "from urllib.request import urlopen",
            "import subprocess",
            "import os\nos.system('id')",
            "import os\nos.popen('ls')",
            "eval('1+1')",
            "exec('x = 1')",
            "__import__('socket')",
            "(). __class__.__bases__",
            "x = ().__class__.__subclasses__()",
        ],
    )
    def test_rejects_dangerous_source(self, validator: StaticValidator, source: str) -> None:
        result = validator.validate(source)
        assert not result.passed, f"should have been rejected: {source!r}"
        assert result.violations

    @pytest.mark.parametrize(
        "source",
        [
            "print(2 + 2)",
            "import math\nprint(math.sqrt(16))",
            "import json\nprint(json.dumps({'a': 1}))",
            "rate = (12.0 - 9.4) / 4.0\nprint(f'{rate:.4f}')",
        ],
    )
    def test_allows_legitimate_source(self, validator: StaticValidator, source: str) -> None:
        result = validator.validate(source)
        assert result.passed, f"should have been allowed: {result.violations}"

    def test_reports_syntax_errors_without_executing(self, validator: StaticValidator) -> None:
        result = validator.validate("def broken(:\n  pass")
        assert not result.passed
        assert "syntax error" in result.violations[0]


# ------------------------------------------------------------ sandbox runtime
class TestSandboxContainment:
    @pytest.fixture(scope="class")
    def sandbox(self) -> Sandbox:
        return Sandbox()

    def test_runs_legitimate_calculation(self, sandbox: Sandbox) -> None:
        result = sandbox.execute(
            "rate = (12.0 - 9.4) / 4.0\n"
            "life = (9.4 - 6.0) / rate\n"
            "print(f'{rate:.4f} {life:.2f}')"
        )
        assert result.ok
        assert result.exit_code == 0
        assert "0.6500" in result.stdout

    def test_blocks_network_at_static_layer(self, sandbox: Sandbox) -> None:
        result = sandbox.execute("import socket\nsocket.socket()")
        assert not result.ok
        assert not result.static_validation_passed
        assert any("socket" in violation for violation in result.static_violations)

    def test_blocks_network_at_runtime_when_static_is_bypassed(self, sandbox: Sandbox) -> None:
        """The second layer must hold on its own."""
        report = sandbox.self_test()
        assert report["static_layer_blocks_network_import"]
        assert report["runtime_layer_blocks_socket"]
        assert "NETWORK_NOT_BLOCKED" not in report["runtime_output"]

    def test_enforces_cpu_limit(self, sandbox: Sandbox) -> None:
        result = sandbox.execute("while True:\n    pass")
        assert not result.ok
        # Killed by the CPU rlimit or the wall-clock timeout; either is correct.
        assert result.timed_out or (result.exit_code or 0) != 0

    def test_workspace_is_isolated_per_run(self, sandbox: Sandbox) -> None:
        first = sandbox.execute("open('marker.txt', 'w').write('x')\nprint('wrote')")
        second = sandbox.execute(
            "import os\nprint('marker.txt' in os.listdir('.'))"
        )
        assert first.ok
        assert second.ok
        assert "False" in second.stdout, "a run must not see another run's files"


# ------------------------------------------------------------- policy gateway
class TestPolicyGateway:
    @pytest.fixture
    def gateway(self) -> PolicyGateway:
        return PolicyGateway()

    def test_unregistered_tool_is_denied(self, gateway: PolicyGateway) -> None:
        event = gateway.check_tool(
            make_user(), "exfiltrate_everything", sensitivity=Sensitivity.NORMAL
        )
        assert event.decision == PolicyDecision.DENY
        assert "not registered" in event.reason

    def test_tool_denied_to_role_without_grant(self, gateway: PolicyGateway) -> None:
        event = gateway.check_tool(
            make_user(role="auditor"), "python_exec", sensitivity=Sensitivity.NORMAL
        )
        assert event.decision == PolicyDecision.DENY

    def test_classification_ceiling_is_enforced(self, gateway: PolicyGateway) -> None:
        """An operator cleared to 'confidential' cannot touch restricted data."""
        stored = make_file(
            owner_id="other", department="engineering", classification=Sensitivity.RESTRICTED
        )
        event = gateway.check_file_access(make_user(role="operator", department="operations"), stored)
        assert event.decision == PolicyDecision.DENY
        assert "cleared" in event.reason

    def test_department_isolation(self, gateway: PolicyGateway) -> None:
        stored = make_file(owner_id="other", department="finance")
        event = gateway.check_file_access(
            make_user(role="engineer", department="inspection"), stored
        )
        assert event.decision == PolicyDecision.DENY
        assert "department" in event.reason

    def test_owner_always_reads_own_upload(self, gateway: PolicyGateway) -> None:
        user = make_user(role="operator", department="operations")
        stored = make_file(owner_id=user.id, department="finance")
        event = gateway.check_file_access(user, stored)
        assert event.decision == PolicyDecision.ALLOW

    def test_reviewer_crosses_departments(self, gateway: PolicyGateway) -> None:
        stored = make_file(owner_id="other", department="finance")
        event = gateway.check_file_access(make_user(role="reviewer"), stored)
        assert event.decision == PolicyDecision.ALLOW

    def test_unregistered_model_is_refused(self, gateway: PolicyGateway) -> None:
        event = gateway.check_model(
            make_user(),
            "some-model-nobody-approved",
            approved_classifications=[Sensitivity.NORMAL],
            registered=False,
            sensitivity=Sensitivity.NORMAL,
        )
        assert event.decision == PolicyDecision.DENY

    def test_model_not_approved_for_classification(self, gateway: PolicyGateway) -> None:
        event = gateway.check_model(
            make_user(),
            "small-model",
            approved_classifications=[Sensitivity.NORMAL],
            registered=True,
            sensitivity=Sensitivity.RESTRICTED,
        )
        assert event.decision == PolicyDecision.DENY

    def test_host_paths_are_refused(self, gateway: PolicyGateway) -> None:
        from pathlib import Path

        event = gateway.check_path_confinement(Path("/etc/passwd"))
        assert event.decision == PolicyDecision.DENY

    def test_storage_paths_are_allowed(self, gateway: PolicyGateway) -> None:
        event = gateway.check_path_confinement(
            get_config().settings.path("uploads") / "example.pdf"
        )
        assert event.decision == PolicyDecision.ALLOW

    def test_hard_denied_actions_have_no_override(self, gateway: PolicyGateway) -> None:
        for action in ("internet_access", "cloud_model_inference", "credential_access"):
            event = gateway.check_hard_denied(action, user=make_user(role="administrator"))
            assert event.decision == PolicyDecision.DENY, action


# -------------------------------------------------------------- audit chain
class TestAuditChain:
    def test_chain_verifies_when_untouched(self, tmp_path) -> None:
        log = AuditLog(path=tmp_path / "audit.jsonl")
        for index in range(5):
            log.record(category="test", action=f"event-{index}", actor="tester")
        status = log.verify_chain()
        assert status.valid
        assert status.events == 5

    def test_tampering_with_a_record_breaks_the_chain(self, tmp_path) -> None:
        """The whole point: an edited history must not verify."""
        path = tmp_path / "audit.jsonl"
        log = AuditLog(path=path)
        for index in range(4):
            log.record(category="test", action=f"event-{index}", actor="tester")
        assert log.verify_chain().valid

        lines = path.read_text().splitlines()
        record = json.loads(lines[1])
        record["detail"] = {"quietly": "changed"}
        lines[1] = json.dumps(record)
        path.write_text("\n".join(lines) + "\n")

        status = log.verify_chain()
        assert not status.valid
        assert status.broken_at == 2

    def test_deleting_a_record_breaks_the_chain(self, tmp_path) -> None:
        path = tmp_path / "audit.jsonl"
        log = AuditLog(path=path)
        for index in range(4):
            log.record(category="test", action=f"event-{index}", actor="tester")

        lines = path.read_text().splitlines()
        del lines[1]
        path.write_text("\n".join(lines) + "\n")

        assert not log.verify_chain().valid

    def test_concurrent_writers_cannot_fork_the_chain(self, tmp_path) -> None:
        """Two processes appended at once and both claimed the same sequence.

        The verifier caught it, but the write path must not allow it: the
        read-tail-and-append is taken under an OS-level lock, so independent
        writers serialise.
        """
        import multiprocessing

        path = tmp_path / "audit.jsonl"

        def writer(worker: int) -> None:
            log = AuditLog(path=path)
            for index in range(12):
                log.record(
                    category="test", action=f"w{worker}-{index}", actor=f"worker{worker}"
                )

        processes = [
            multiprocessing.Process(target=writer, args=(worker,)) for worker in range(3)
        ]
        for process in processes:
            process.start()
        for process in processes:
            process.join(timeout=60)

        log = AuditLog(path=path)
        status = log.verify_chain()
        assert status.valid, f"chain forked at event {status.broken_at}"
        assert status.events == 36

        sequences = [event.sequence for event in log.query(limit=500)]
        assert len(sequences) == len(set(sequences)), "sequence numbers must be unique"

    def test_query_filters_by_task_and_category(self, tmp_path) -> None:
        log = AuditLog(path=tmp_path / "audit.jsonl")
        log.record(category="model", action="a", actor="x", task_id="task-1")
        log.record(category="tool", action="b", actor="x", task_id="task-1")
        log.record(category="model", action="c", actor="x", task_id="task-2")

        assert len(log.query(task_id="task-1")) == 2
        assert len(log.query(category="model")) == 2
        assert len(log.query(task_id="task-1", category="model")) == 1


class TestApprovalGateIsActionable:
    """A held task must always have somebody who can release it.

    Two faults made that untrue. 'low_confidence_classification' held plain
    questions that produce no artifact, so an answer sat behind a release gate
    with nothing to release. And it nominated 'engineer' as an approver while
    access-control.yaml withholds 'approval.decide' from that role, so the API
    refused the very people the policy named.
    """

    @staticmethod
    def _profile(*, deliverable: bool, confidence: float):
        from backend.core.schemas import (
            Complexity,
            InputType,
            Sensitivity,
            TaskProfile,
            TaskType,
        )

        return TaskProfile(
            input_type=InputType.TEXT,
            task_type=TaskType.QUESTION_ANSWERING,
            complexity=Complexity.SIMPLE,
            sensitivity=Sensitivity.NORMAL,
            confidence=confidence,
            step_budget=4,
            requires_retrieval=True,
            requires_vision=False,
            requires_code_execution=False,
            produces_deliverable=deliverable,
            deliverable_format="docx" if deliverable else None,
        )

    def test_a_question_with_no_artifact_is_not_held_for_low_confidence(self) -> None:
        from backend.policy.gateway import get_policy_gateway

        required, reasons, _ = get_policy_gateway().approval_requirement(
            self._profile(deliverable=False, confidence=0.05),
            prompt="Who must approve continued operation after a Category 3 finding?",
            verification_valid=True,
        )
        assert required is False, f"held with no artifact to release: {reasons}"

    def test_the_same_task_producing_a_document_is_still_held(self) -> None:
        from backend.policy.gateway import get_policy_gateway

        required, reasons, _ = get_policy_gateway().approval_requirement(
            self._profile(deliverable=True, confidence=0.05),
            prompt="Draft an approval note for vessel V-2104.",
            verification_valid=True,
        )
        assert required is True
        assert any("low_confidence" in r for r in reasons)

    def test_every_nominated_approver_can_actually_decide(self) -> None:
        from backend.core.config import get_config
        from backend.policy.gateway import get_policy_gateway

        config = get_config()
        required, _, approvers = get_policy_gateway().approval_requirement(
            self._profile(deliverable=True, confidence=0.05),
            prompt="Draft an approval note for vessel V-2104.",
            verification_valid=True,
        )
        assert required is True
        assert approvers, "a held task named nobody who could release it"
        for role in approvers:
            assert "approval.decide" in config.role_permissions(role), (
                f"policy nominated '{role}', which cannot decide approvals"
            )
