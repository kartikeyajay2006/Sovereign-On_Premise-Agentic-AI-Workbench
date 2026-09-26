"""Interactive sandbox endpoints.

Registered in backend/api/main.py. These are the "watch it contain a real
payload, live" surface: an operator submits code, it goes through exactly the
governance an agent tool call does, runs under the same probed resource limits,
and comes back with what was *measured*, not what was configured.

The governance is not optional and is not re-implemented here. Every request:

* is authenticated (:data:`CurrentUser`);
* is authorised by the policy gateway's ``python_exec`` tool check for the
  caller's role and the run's data classification, from
  policies/tool-permissions.yaml - the same call the agent's tool dispatcher
  makes, so the console cannot do anything the agent could not;
* is bounded in size before anything runs, and bounded in concurrency so a
  shared host is not swamped;
* is recorded to the tamper-evident audit trail - the policy decision by the
  gateway, and the execution outcome here, so a run is visible in the timeline
  whether it was allowed, denied, or contained;
* is passed through the static validator (this endpoint calls
  :meth:`Sandbox.execute`, which always validates; it never reaches the
  unvalidated path).
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from backend.api.dependencies import CurrentUser
from backend.core.audit import get_audit_log
from backend.core.config import get_config
from backend.core.schemas import PolicyDecision, SandboxResult, Sensitivity
from backend.policy.gateway import get_policy_gateway
from backend.tools.sandbox import get_sandbox

router = APIRouter(prefix="/api", tags=["sandbox"])


# ------------------------------------------------------------------- limits
# A console that dispatches arbitrary code needs two independent brakes beyond
# the resource limits the child itself runs under: an upper bound on how much
# code one request may carry, and a cap on how many executions run at once.
# Both protect the host the interface is meant to be honest about - a box with
# ~1.7 GB of free RAM shared by other work cannot absorb unbounded concurrent
# interpreters, and reporting a sandbox that took the machine down with it
# would be its own kind of dishonesty.
_DEFAULT_MAX_CODE_BYTES = 65_536
_MAX_GLOBAL_CONCURRENCY = 2
_MAX_PER_USER_CONCURRENCY = 1

_global_slots = threading.BoundedSemaphore(_MAX_GLOBAL_CONCURRENCY)
_active_by_user: dict[str, int] = {}
_active_lock = threading.Lock()


def _max_code_bytes() -> int:
    return int(get_config().settings.sandbox.get("max_code_bytes", _DEFAULT_MAX_CODE_BYTES))


class SandboxExecuteRequest(BaseModel):
    code: str = Field(min_length=1)
    # The data classification this run is treated as handling. It is checked
    # against the python_exec ceiling in policy, exactly as an agent tool call
    # would be, and recorded on the audit event. Defaults to the least
    # sensitive level rather than silently assuming the most permissive.
    classification: Sensitivity = Sensitivity.NORMAL


class AppliedLimits(BaseModel):
    """The limits actually put in force for a run - mirrors LimitsApplied."""

    mechanism: str
    memory_mb: int | None = None
    cpu_seconds: int | None = None
    active_process_limit: int | None = None
    wall_timeout_seconds: float | None = None
    kill_on_close: bool = False
    die_on_unhandled_exception: bool = False


class ExecutionAccounting(BaseModel):
    """Measured facts read back from the OS - mirrors ExecutionAccounting.

    A ``None`` is the absence of a reading, never zero: the POSIX backend does
    not report peak memory, and a zero there would be a claim it never made.
    """

    assessable: bool
    peak_memory_bytes: int | None = None
    cpu_user_seconds: float | None = None
    cpu_kernel_seconds: float | None = None
    termination_reason: str | None = None
    output_truncated: bool = False


class SandboxExecuteResponse(BaseModel):
    result: SandboxResult
    limits: AppliedLimits
    accounting: ExecutionAccounting
    classification: Sensitivity
    policy_decision: PolicyDecision
    policy_reason: str
    ran_at: datetime


class SandboxLimits(BaseModel):
    """What this host would apply, and whether it will run code at all.

    These are the limits that *will* be applied to the next run and the probed
    fact of whether execution is possible here - distinct from the per-run
    ``limits``/``accounting`` in a response, which say what actually happened.
    """

    enabled: bool
    execution_allowed: bool
    reason: str
    runtime: str
    # What config/app.yaml asks for (subprocess | podman | docker), beside
    # ``runtime``, which is what this host actually does.
    configured_runtime: str
    # The container isolation probe (binary, rootless, each check and the
    # verdict), or None when no container runtime is configured.
    container: dict | None = None
    backend: str
    memory_mb: int
    cpu_seconds: int
    wall_timeout_seconds: float
    active_process_limit: int | None
    max_code_bytes: int
    network_allowed: bool
    max_global_concurrency: int
    max_per_user_concurrency: int


@router.get("/sandbox/limits", response_model=SandboxLimits)
def sandbox_limits(user: CurrentUser) -> SandboxLimits:
    """Report the caps that will be applied, and whether the host can execute."""
    sandbox = get_sandbox()
    settings = get_config().settings.sandbox
    allowed, reason = sandbox.execution_allowed
    backend = sandbox._enforcement_backend() or "none"
    active_limit: int | None = None
    if backend == "windows_job_object":
        active_limit = max(2, int(settings.get("max_active_processes", 8)))
    elif backend.endswith("_container"):
        active_limit = sandbox.container_settings().pids_limit
    return SandboxLimits(
        enabled=sandbox.enabled,
        execution_allowed=allowed,
        reason=reason,
        runtime=sandbox.runtime,
        configured_runtime=str(settings.get("runtime", "subprocess")),
        container=sandbox.container_probe(),
        backend=backend,
        memory_mb=int(settings.get("max_memory_mb", 1024)),
        cpu_seconds=int(settings.get("max_cpu_seconds", 30)),
        wall_timeout_seconds=float(settings.get("timeout_seconds", 45)),
        active_process_limit=active_limit,
        max_code_bytes=_max_code_bytes(),
        network_allowed=bool(settings.get("network_enabled", False)),
        max_global_concurrency=_MAX_GLOBAL_CONCURRENCY,
        max_per_user_concurrency=_MAX_PER_USER_CONCURRENCY,
    )


@router.post("/sandbox/execute", response_model=SandboxExecuteResponse)
def sandbox_execute(payload: SandboxExecuteRequest, user: CurrentUser) -> SandboxExecuteResponse:
    """Run one payload through full governance and return what was measured."""
    audit = get_audit_log()

    # Size gate first: reject before the policy check so an oversized body never
    # reaches the validator or the audit trail as an execution.
    code_bytes = len(payload.code.encode("utf-8"))
    limit = _max_code_bytes()
    if code_bytes > limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Code is {code_bytes} bytes; the sandbox console accepts at most {limit}.",
        )

    # Same policy call the agent's tool dispatcher makes. It records its own
    # audit event (the decision and its rule), so a denial is already in the
    # trail before we raise.
    gateway = get_policy_gateway()
    decision = gateway.check_tool(
        user,
        "python_exec",
        sensitivity=payload.classification,
        arguments={"code_bytes": code_bytes, "surface": "sandbox_console"},
    )
    if decision.decision != PolicyDecision.ALLOW:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=decision.reason)

    # Concurrency brakes. Acquire the global slot first; if the per-user cap is
    # already reached, release the global slot before raising so it is never
    # leaked.
    if not _global_slots.acquire(blocking=False):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="The sandbox is at capacity on this host. Try again in a moment.",
        )
    try:
        with _active_lock:
            if _active_by_user.get(user.id, 0) >= _MAX_PER_USER_CONCURRENCY:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="You already have a sandbox run in progress. One at a time.",
                )
            _active_by_user[user.id] = _active_by_user.get(user.id, 0) + 1
        try:
            outcome = get_sandbox().execute_detailed(payload.code, keep_workspace=False)
        finally:
            with _active_lock:
                _active_by_user[user.id] = max(0, _active_by_user.get(user.id, 1) - 1)
    finally:
        _global_slots.release()

    result = outcome.result
    audit.record(
        category="security",
        action="sandbox_execute",
        actor=user.username,
        actor_role=user.role,
        detail={
            "surface": "sandbox_console",
            "classification": payload.classification.value,
            "code_bytes": code_bytes,
            "static_validation_passed": result.static_validation_passed,
            "static_violations": result.static_violations,
            "ok": result.ok,
            "exit_code": result.exit_code,
            "duration_ms": result.duration_ms,
            "timed_out": result.timed_out,
            "backend": outcome.limits.mechanism,
            "termination_reason": outcome.accounting.termination_reason,
            "peak_memory_bytes": outcome.accounting.peak_memory_bytes,
            "network_attempts_blocked": result.network_attempts_blocked,
        },
    )

    return SandboxExecuteResponse(
        result=result,
        limits=AppliedLimits(**outcome.limits.to_dict()),
        accounting=ExecutionAccounting(**outcome.accounting.to_dict()),
        classification=payload.classification,
        policy_decision=decision.decision,
        policy_reason=decision.reason,
        ran_at=datetime.now(timezone.utc),
    )


@router.post("/sandbox/self-test")
def sandbox_self_test(user: CurrentUser) -> dict:
    """Run the containment self-test on this host and record that it was run.

    The payloads are fixed and adversarial, not user-supplied, so any
    authenticated user may run this diagnostic; what it reports is exactly what
    the sandbox did with them just now. It shares the global concurrency slot so
    a self-test and a heavy execution do not run on top of each other.
    """
    if not _global_slots.acquire(blocking=False):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="The sandbox is at capacity on this host. Try again in a moment.",
        )
    try:
        report = get_sandbox().self_test_report()
    finally:
        _global_slots.release()

    get_audit_log().record(
        category="security",
        action="sandbox_self_test",
        actor=user.username,
        actor_role=user.role,
        detail={
            "surface": "sandbox_console",
            "assessable": report.get("assessable"),
            "backend": report.get("backend"),
            "passed": report.get("passed"),
            "total": report.get("total"),
            "all_passed": report.get("all_passed"),
        },
    )
    return report
