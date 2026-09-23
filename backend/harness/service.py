"""The harness runner.

A harness run is a sequence of ordinary tasks. The runner submits one child
through the task service, waits for its record to settle, then submits the
next. Nothing is handed to the orchestrator directly and nothing is decided
here about a child: classification, policy, retrieval, verification and the
approval gate all happen inside the task service, and the harness learns the
outcome by reading the child's record back.

One child at a time, deliberately. The task service runs one task at a time
on this host (about 135-200 s each on CPU), so queueing all twenty children
up front would not finish any sooner -- it would put a person's next thread
question behind all twenty. Submitting as each settles leaves at most one
harness child ahead of anyone else.

Progress is published on the event bus as ``harness.*`` events, and every
consequential step is appended to the audit chain: run started, each child
submitted (linked by task id), cancel requested, run finished or cancelled,
each report version with its hashes, each approval decision and download.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

from backend.core.audit import AuditLog, get_audit_log
from backend.core.config import get_config
from backend.core.events import EventBus, get_event_bus
from backend.core.schemas import PolicyDecision, Sensitivity, Task, User
from backend.harness.aggregate import (
    QUEUED_STATUSES,
    RUNNING_STATUSES,
    SETTLED_STATUSES,
    child_view,
    derive_outcome,
    tally,
)
from backend.harness.corpus import retrieval_scope, summarise_scope
from backend.harness.definitions import HarnessCatalog, InputKind, LoadedHarness, load_catalog
from backend.harness.expansion import (
    HarnessInputError,
    normalise_inputs,
    plan_rows,
    render_items,
    resolve_options,
)
from backend.harness.models import (
    ACTIVE_RUN_STATUSES,
    DefinitionErrorView,
    DefinitionSnapshot,
    ExcludedItem,
    HarnessCatalogView,
    HarnessChildView,
    HarnessDefinitionView,
    HarnessInputView,
    HarnessItem,
    HarnessPreview,
    HarnessReportRecord,
    HarnessRun,
    HarnessRunSummary,
    HarnessRunView,
    HarnessStartRequest,
    ItemState,
    PreviewItem,
    ReportApproval,
    ReportDownload,
    ReportFile,
    ReportView,
    RunPermissions,
    RunStatus,
    ScopeRecord,
)
from backend.harness.report import build_report_data, render_markdown, run_limitations
from backend.harness.store import HarnessStore
from backend.policy.gateway import get_policy_gateway

# A harness child answers in prose. "answer" is the task service's sentinel
# for "no document" (TaskAnalyzer._deliverable): without it a question that
# happens to say "note" or "memo" would draft and render a document per
# child, which the released_deliverable approval rule then holds -- twenty
# held files for a job whose deliverable is the harness report.
CHILD_DELIVERABLE_FORMAT = "answer"

# How often the runner re-reads the in-flight child. One indexed row read;
# at 2 s it lags a settled child by about 1% of a 200 s run. Overridable as
# SOVEREIGN_HARNESS__POLL_INTERVAL_SECONDS, like any app setting.
DEFAULT_POLL_SECONDS = 2.0


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


class HarnessError(RuntimeError):
    """A harness request that cannot be honoured. Carries its HTTP status."""

    status_code = 400


class HarnessNotFound(HarnessError):
    status_code = 404


class HarnessForbidden(HarnessError):
    status_code = 403


class HarnessConflict(HarnessError):
    status_code = 409


class HarnessGone(HarnessError):
    status_code = 410


class TaskGateway(Protocol):
    """The part of the task service a harness uses -- and nothing else."""

    async def create_task(
        self,
        user: User,
        prompt: str,
        file_ids: list[str],
        deliverable_format: str | None = None,
    ) -> Task: ...

    def get_task(self, task_id: str) -> Task | None: ...

    async def cancel(self, task_id: str, user: User) -> Task: ...

    def queue_state(self, task_id: str) -> dict[str, Any]: ...


class HarnessService:
    def __init__(
        self,
        *,
        tasks: TaskGateway,
        store: HarnessStore | None = None,
        audit: AuditLog | None = None,
        events: EventBus | None = None,
        definitions_dir: Path | None = None,
        poll_interval: float | None = None,
        recover: bool = True,
    ) -> None:
        self.config = get_config()
        self.tasks = tasks
        self.store = store or HarnessStore()
        self.audit = audit or get_audit_log()
        self.events = events or get_event_bus()
        self.definitions_dir = definitions_dir
        configured = self.config.settings.get("harness.poll_interval_seconds")
        self.poll_interval = float(
            poll_interval if poll_interval is not None else (configured or DEFAULT_POLL_SECONDS)
        )
        # The live record of every run this process is driving. The runner
        # and the request handlers mutate the SAME object, on the same event
        # loop, so a cancel cannot be lost to a runner writing back a copy it
        # read before the cancel arrived.
        self._active: dict[str, HarnessRun] = {}
        self._owners: dict[str, User] = {}
        self._cancellers: dict[str, User] = {}
        self._cancel_sent: dict[str, set[str]] = {}
        self._runners: dict[str, asyncio.Task[None]] = {}
        if recover:
            self.recover_interrupted()

    # ------------------------------------------------------------ helpers
    def _permissions(self, user: User) -> set[str]:
        return self.config.role_permissions(user.role)

    def can_read(self, run: HarnessRun, user: User) -> bool:
        return run.user_id == user.id or "task.read.all" in self._permissions(user)

    def _can_control(self, run: HarnessRun, user: User) -> bool:
        # The owner, or a supervisor who may both see all work and run work.
        # task.read.all alone is the auditor's grant, and an auditor
        # observes; it does not stop other people's runs.
        permissions = self._permissions(user)
        return run.user_id == user.id or {"task.read.all", "task.create"} <= permissions

    def _save(self, run: HarnessRun) -> None:
        self.store.save(run)

    def _read_task(self, task_id: str | None) -> Task | None:
        if not task_id:
            return None
        try:
            return self.tasks.get_task(task_id)
        except Exception:
            # Reported by the view as a record that could not be read back,
            # which is exactly what happened.
            return None

    def _queue_state(self, task_id: str) -> dict[str, Any] | None:
        try:
            return self.tasks.queue_state(task_id)
        except Exception:
            return None

    def _run(self, run_id: str) -> HarnessRun:
        run = self._active.get(run_id) or self.store.get(run_id)
        if run is None:
            raise HarnessNotFound("Harness run not found.")
        return run

    def _readable_run(self, run_id: str, viewer: User) -> HarnessRun:
        run = self._run(run_id)
        if not self.can_read(run, viewer):
            raise HarnessForbidden("You may only read your own harness runs.")
        return run

    def _report_dir(self, run_id: str) -> Path:
        return self.config.settings.path("deliverables") / "harness" / run_id

    def _confine(self, path: Path, user: User | None = None) -> None:
        decision = get_policy_gateway().check_path_confinement(path, user=user)
        if decision.decision != PolicyDecision.ALLOW:
            raise HarnessForbidden("That path lies outside the deliverable store and was refused.")

    async def _publish(
        self,
        event: str,
        run: HarnessRun,
        extra: dict[str, Any] | None = None,
        *,
        task_id: str | None = None,
    ) -> None:
        """Announce progress on the event bus.

        An event about one child carries that child's task id, so the event
        stream's own ownership check (backend/api/routes/system.py) delivers
        it only to people who may read that task. A run-level event has no
        task to scope it by and reaches every signed-in session, so every
        payload is ids and counts only -- never a prompt, an answer or a
        name. The run record is the truth; a lost event costs a moment of
        liveness, never correctness, because the interface reads the record.
        """
        done = sum(
            1
            for item in run.items
            if item.state
            in {
                ItemState.SETTLED,
                ItemState.NOT_SUBMITTED,
                ItemState.SUBMIT_FAILED,
                ItemState.SUBMIT_REFUSED,
            }
        )
        data = {
            "run_id": run.id,
            "harness_id": run.harness.id,
            "status": run.status.value,
            "settled": done,
            "total": len(run.items),
            **(extra or {}),
        }
        try:
            await self.events.publish(event, task_id=task_id, data=data)
        except Exception:
            pass

    # ------------------------------------------------------- definitions
    def catalog(self) -> HarnessCatalog:
        # Read on each request: three small files, and an edit takes effect
        # without a restart. A running run keeps the snapshot it started with.
        return load_catalog(self.definitions_dir)

    def _loaded(self, harness_id: str) -> LoadedHarness:
        loaded = self.catalog().get(harness_id)
        if loaded is None:
            raise HarnessNotFound(f"No harness named '{harness_id}' is defined.")
        return loaded

    def definition_view(self, loaded: LoadedHarness, user: User) -> HarnessDefinitionView:
        definition = loaded.definition
        inputs: list[HarnessInputView] = []
        for spec in definition.inputs:
            options = resolve_options(spec) if spec.kind == InputKind.CHOICE else []
            default = spec.default
            if spec.default_from == "user_department":
                default = (
                    user.department
                    if user.department in {option.value for option in options}
                    else None
                )
            inputs.append(
                HarnessInputView(
                    id=spec.id,
                    kind=spec.kind,
                    label=spec.label,
                    help=spec.help,
                    placeholder=spec.placeholder,
                    required=spec.required,
                    max_chars=spec.max_chars,
                    min_items=spec.min_items,
                    max_items=min(spec.max_items, definition.limits.max_items),
                    options=options,
                    default=default,
                )
            )
        return HarnessDefinitionView(
            id=definition.id,
            version=definition.version,
            name=definition.name,
            summary=definition.summary,
            description=definition.description,
            inputs=inputs,
            expansion_source=definition.expansion.source,
            aggregation=definition.aggregation,
            template=definition.expansion.template,
            label_template=definition.expansion.label,
            report_title=definition.report.title,
            report_requires_approval=definition.report.requires_approval,
            limitations=list(definition.report.limitations),
            max_items=definition.limits.max_items,
            child_timeout_seconds=definition.limits.child_timeout_seconds,
            source=loaded.source,
            sha256=loaded.sha256,
        )

    def catalog_view(self, user: User) -> HarnessCatalogView:
        catalog = self.catalog()
        return HarnessCatalogView(
            harnesses=[self.definition_view(loaded, user) for loaded in catalog.harnesses.values()],
            errors=[
                DefinitionErrorView(source=error.source, message=error.message)
                for error in catalog.errors
            ],
        )

    def _scope_record(self, user: User) -> ScopeRecord:
        summary = summarise_scope(retrieval_scope(user), database=self.store.db)
        departments = summary.scope.departments
        return ScopeRecord(
            departments=list(departments) if departments is not None else None,
            max_classification=summary.scope.max_classification,
            documents=summary.documents,
            sections=summary.sections,
        )

    # ------------------------------------------------------------ preview
    def preview(self, harness_id: str, raw_inputs: dict[str, Any], user: User) -> HarnessPreview:
        loaded = self._loaded(harness_id)
        definition = loaded.definition
        values, warnings = normalise_inputs(definition, raw_inputs, user=user)
        rows, expansion_warnings = plan_rows(definition, values, user=user, database=self.store.db)
        items = render_items(definition, values, rows)
        scope = self._scope_record(user)
        warnings = [*warnings, *expansion_warnings]
        if scope.documents == 0:
            warnings.append(
                "No indexed document is within your retrieval scope. Every item would be "
                "answered without evidence, fail verification and be held for review."
            )
        limit = definition.limits.max_items
        if len(items) > limit:
            warnings.append(
                f"{len(items)} items were found and one run takes at most {limit}; "
                f"deselect {len(items) - limit} before starting."
            )
        return HarnessPreview(
            harness_id=definition.id,
            items=[
                PreviewItem(
                    key=item.key,
                    index=item.index,
                    label=item.label,
                    prompt=item.prompt,
                    group=item.group,
                )
                for item in items
            ],
            limit=limit,
            scope=scope,
            warnings=warnings,
            inputs=values,
        )

    # -------------------------------------------------------------- start
    async def start(self, request: HarnessStartRequest, user: User) -> HarnessRun:
        loaded = self._loaded(request.harness_id)
        if request.definition_sha256 and request.definition_sha256 != loaded.sha256:
            raise HarnessConflict(
                f"{loaded.source} has changed since it was previewed, so its runs may now be "
                "asked something else. Reload the harness and preview again."
            )
        definition = loaded.definition
        values, _warnings = normalise_inputs(definition, request.inputs, user=user)
        rows, _ = plan_rows(definition, values, user=user, database=self.store.db)

        excluded: list[ExcludedItem] = []
        if request.selected is not None:
            available = {row.key for row in rows}
            missing = [key for key in request.selected if key not in available]
            if missing:
                raise HarnessInputError(
                    f"{len(missing)} selected item(s) no longer exist -- the inputs or the indexed "
                    "documents changed since the preview. Preview again before starting."
                )
            wanted = set(request.selected)
            unselected = [row for row in rows if row.key not in wanted]
            rows = [row for row in rows if row.key in wanted]
            excluded = [
                ExcludedItem(key=item.key, label=item.label)
                for item in render_items(definition, values, unselected)
            ]
        if not rows:
            raise HarnessInputError("Nothing to run: no item is selected.")
        limit = definition.limits.max_items
        if len(rows) > limit:
            raise HarnessInputError(
                f"{len(rows)} items selected; one run takes at most {limit}."
            )

        items = render_items(definition, values, rows)
        now = _utcnow()
        canonical_inputs = json.dumps(values, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        run = HarnessRun(
            id=str(uuid.uuid4()),
            harness=DefinitionSnapshot(
                id=definition.id,
                version=definition.version,
                name=definition.name,
                source=loaded.source,
                sha256=loaded.sha256,
                aggregation=definition.aggregation,
                report_title=definition.report.title,
                report_requires_approval=definition.report.requires_approval,
                limitations=list(definition.report.limitations),
                template=definition.expansion.template,
                child_timeout_seconds=definition.limits.child_timeout_seconds,
            ),
            user_id=user.id,
            username=user.username,
            user_display_name=user.display_name,
            role=user.role,
            department=user.department,
            inputs=values,
            inputs_sha256=_sha256(canonical_inputs.encode("utf-8")),
            excluded=excluded,
            scope=self._scope_record(user),
            status=RunStatus.RUNNING,
            created_at=now,
            updated_at=now,
            items=[
                HarnessItem(
                    index=item.index,
                    key=item.key,
                    label=item.label,
                    prompt=item.prompt,
                    group=item.group,
                )
                for item in items
            ],
        )
        self._active[run.id] = run
        self._owners[run.id] = user
        self._save(run)
        self.audit.record(
            category="harness",
            action="run_started",
            actor=user.username,
            actor_role=user.role,
            detail={
                "run_id": run.id,
                "harness_id": definition.id,
                "harness_version": definition.version,
                "definition_source": loaded.source,
                "definition_sha256": loaded.sha256,
                "items": len(run.items),
                "deselected": len(excluded),
                # Counts and a hash, not the questions: the task service
                # records prompt length, not prompt text, for the same reason.
                "inputs_sha256": run.inputs_sha256,
                "retrieval_departments": run.scope.departments,
            },
        )
        await self._publish("harness.started", run)
        self._runners[run.id] = asyncio.create_task(
            self._drive(run.id), name=f"harness-run-{run.id[:8]}"
        )
        return run

    # ------------------------------------------------------------- runner
    async def _drive(self, run_id: str) -> None:
        run = self._active[run_id]
        owner = self._owners[run_id]
        try:
            for item in run.items:
                if run.cancel_requested_at is not None:
                    break
                if item.state != ItemState.PENDING:
                    continue
                await self._submit(run, item, owner)
                if item.state == ItemState.SUBMITTED:
                    await self._await_settled(run, item, owner)
            self._finish(run)
            await self._publish(
                "harness.finished",
                run,
                {"report_version": run.report.version if run.report else None},
            )
        except asyncio.CancelledError:
            # The process is shutting down. The record is left as it stands;
            # the next start of this service marks it interrupted and says so.
            raise
        except Exception as exc:  # the runner must never die silently
            run.status = RunStatus.FAILED
            run.error = f"The harness runner stopped unexpectedly: {type(exc).__name__}: {exc}"
            run.finished_at = _utcnow()
            for item in run.items:
                if item.state == ItemState.PENDING:
                    item.state = ItemState.NOT_SUBMITTED
                    item.note = "The harness runner stopped before this item's turn."
            try:
                self._save(run)
                self.audit.record(
                    category="harness",
                    action="run_failed",
                    actor=run.username,
                    actor_role=run.role,
                    detail={"run_id": run.id, "error": run.error},
                )
            except Exception:
                pass
            await self._publish("harness.finished", run)
        finally:
            self._active.pop(run_id, None)
            self._owners.pop(run_id, None)
            self._cancellers.pop(run_id, None)
            self._cancel_sent.pop(run_id, None)
            self._runners.pop(run_id, None)

    def _current_identity(self, owner: User) -> User:
        """The person who started the run, as the identity store has them now.

        A run can outlive a policy edit or a deactivation by an hour. Reading
        the account afresh for each child means a role that loses task.create
        mid-run stops submitting, as it would stop typing into the thread. A
        user the store does not know (a test double) is taken as given.
        """
        try:
            from backend.core.identity import get_identity_service

            return get_identity_service().get_user(owner.id) or owner
        except Exception:
            return owner

    def _refusal(self, user: User) -> str | None:
        """Why this person may not submit a child now, or None if they may.

        The same check, through the same gateway and onto the same audit
        chain, that POST /api/tasks makes for every question in the thread.
        """
        if not user.active:
            return f"the account '{user.username}' is no longer active"
        decision = get_policy_gateway().check_permission(user, "task.create")
        return None if decision.decision == PolicyDecision.ALLOW else decision.reason

    async def _submit(self, run: HarnessRun, item: HarnessItem, owner: User) -> None:
        submitter = self._current_identity(owner)
        refusal = self._refusal(submitter)
        if refusal is not None:
            item.state = ItemState.SUBMIT_REFUSED
            item.error = refusal
            item.settled_at = _utcnow()
            self._save(run)
            self.audit.record(
                category="harness",
                action="child_refused",
                actor=submitter.username,
                actor_role=submitter.role,
                detail={"run_id": run.id, "index": item.index, "reason": refusal},
            )
            await self._publish("harness.child", run, {"index": item.index, "phase": "refused"})
            return

        try:
            task = await self.tasks.create_task(submitter, item.prompt, [], CHILD_DELIVERABLE_FORMAT)
        except Exception as exc:
            item.state = ItemState.SUBMIT_FAILED
            item.error = str(exc) or type(exc).__name__
            item.settled_at = _utcnow()
            self._save(run)
            self.audit.record(
                category="harness",
                action="child_submit_failed",
                actor=owner.username,
                actor_role=owner.role,
                detail={"run_id": run.id, "index": item.index, "error": item.error},
            )
            await self._publish("harness.child", run, {"index": item.index, "phase": "submit_failed"})
            return

        item.task_id = task.id
        item.state = ItemState.SUBMITTED
        item.submitted_at = _utcnow()
        self._save(run)
        self.audit.record(
            category="harness",
            action="child_submitted",
            actor=owner.username,
            actor_role=owner.role,
            # The child's own id, so the chain links this run to the task
            # record whose received/classified/verified events follow.
            task_id=task.id,
            detail={
                "run_id": run.id,
                "harness_id": run.harness.id,
                "index": item.index,
                "total": len(run.items),
            },
        )
        await self._publish(
            "harness.child",
            run,
            {"index": item.index, "task_id": task.id, "phase": "submitted"},
            task_id=task.id,
        )

    async def _await_settled(self, run: HarnessRun, item: HarnessItem, owner: User) -> None:
        timeout = run.harness.child_timeout_seconds
        running_since: float | None = None
        watchdog_fired = False
        while True:
            task = self._read_task(item.task_id)
            if task is None or task.status in SETTLED_STATUSES:
                item.state = ItemState.SETTLED
                item.settled_at = _utcnow()
                if task is None:
                    item.note = "The child task record could not be read back."
                self._save(run)
                outcome, _ = derive_outcome(item, task)
                await self._publish(
                    "harness.child",
                    run,
                    {
                        "index": item.index,
                        "task_id": item.task_id,
                        "phase": "settled",
                        "outcome": outcome.value,
                    },
                    task_id=item.task_id,
                )
                return

            if task.status in RUNNING_STATUSES and running_since is None:
                running_since = time.monotonic()
                item.started_at = _utcnow()
                self._save(run)
                await self._publish(
                    "harness.child",
                    run,
                    {"index": item.index, "task_id": item.task_id, "phase": "running"},
                    task_id=item.task_id,
                )

            if run.cancel_requested_at is not None:
                await self._stop_child(run, item, self._cancellers.get(run.id) or owner)
            elif (
                running_since is not None
                and not watchdog_fired
                and time.monotonic() - running_since > timeout
            ):
                watchdog_fired = True
                item.note = (
                    f"Stopped by the harness: still running after {timeout} s, the limit "
                    f"set in {run.harness.source}."
                )
                self._save(run)
                self.audit.record(
                    category="harness",
                    action="child_timeout",
                    actor=run.username,
                    actor_role=run.role,
                    task_id=item.task_id,
                    detail={"run_id": run.id, "index": item.index, "limit_seconds": timeout},
                )
                await self._stop_child(run, item, owner)

            await asyncio.sleep(self.poll_interval)

    async def _stop_child(self, run: HarnessRun, item: HarnessItem, actor: User) -> None:
        """Ask the task service to stop one child, once.

        A queued child is dropped at once; a running one ends at its next
        stage boundary, which is the task service's own cancel path and the
        only one the harness uses.
        """
        sent = self._cancel_sent.setdefault(run.id, set())
        if item.task_id is None or item.task_id in sent:
            return
        sent.add(item.task_id)
        try:
            await self.tasks.cancel(item.task_id, actor)
        except Exception as exc:
            # Usually the child settled between the read and this request.
            # Its record says how it ended; the refusal is kept beside it.
            item.note = " ".join(filter(None, [item.note, f"Stop request not accepted: {exc}"]))
            self._save(run)

    def _finish(self, run: HarnessRun) -> None:
        cancelled = run.cancel_requested_at is not None
        for item in run.items:
            if item.state == ItemState.PENDING:
                item.state = ItemState.NOT_SUBMITTED
                item.note = (
                    f"The run was cancelled by {run.cancel_requested_by} before this item's turn."
                    if cancelled
                    else "The run ended before this item's turn."
                )
        run.status = RunStatus.CANCELLED if cancelled else RunStatus.FINISHED
        run.finished_at = _utcnow()
        self._save(run)
        try:
            self._write_report(
                run,
                generated_by=run.username,
                actor_role=run.role,
                reason="cancelled" if cancelled else "finished",
            )
        except Exception as exc:
            run.error = (
                f"The report could not be written: {type(exc).__name__}: {exc}. "
                "Regenerate it once the cause is fixed; the child records are unaffected."
            )
            self.audit.record(
                category="harness",
                action="report_failed",
                actor=run.username,
                actor_role=run.role,
                detail={"run_id": run.id, "error": run.error},
            )
        self._save(run)
        counts = tally(derive_outcome(item, self._read_task(item.task_id))[0] for item in run.items)
        self.audit.record(
            category="harness",
            action="run_cancelled" if cancelled else "run_finished",
            actor=run.username,
            actor_role=run.role,
            detail={
                "run_id": run.id,
                "harness_id": run.harness.id,
                "status": run.status.value,
                "cancel_requested_by": run.cancel_requested_by,
                "items": counts.total,
                "outcomes": {
                    outcome.value: count for outcome, count in counts.counts.items() if count
                },
                "duration_ms": int((run.finished_at - run.created_at).total_seconds() * 1000),
                "report_files": (
                    [{"filename": f.filename, "sha256": f.sha256} for f in run.report.files]
                    if run.report
                    else []
                ),
            },
        )

    # ------------------------------------------------------------- report
    def _approval_reasons(self, run: HarnessRun, classification: Sensitivity) -> list[str]:
        reasons: list[str] = []
        if run.harness.report_requires_approval:
            reasons.append(
                f"{run.harness.source} sets report.requires_approval, so a reviewer signs this "
                "report off before it is released."
            )
        controls = get_policy_gateway().controls_for(classification)
        if controls.get("human_approval_required"):
            reasons.append(
                f"The report carries {classification.value} content, and "
                "policies/data-classification.yaml requires human approval at that level."
            )
        return reasons

    def _write_report(
        self, run: HarnessRun, *, generated_by: str, actor_role: str | None, reason: str
    ) -> HarnessReportRecord:
        rows = [(item, self._read_task(item.task_id)) for item in run.items]
        version = run.report.version + 1 if run.report else 1
        generated_at = _utcnow()
        data, counts, classification = build_report_data(
            run,
            rows,
            version=version,
            generated_at=generated_at,
            generated_by=generated_by,
            reason=reason,
        )
        json_bytes = (json.dumps(data, indent=2, ensure_ascii=False, default=str) + "\n").encode(
            "utf-8"
        )
        json_sha = _sha256(json_bytes)
        markdown_bytes = render_markdown(data, json_sha256=json_sha).encode("utf-8")

        directory = self._report_dir(run.id)
        directory.mkdir(parents=True, exist_ok=True)
        base = f"{run.harness.id}-{run.id[:8]}-v{version}"
        files: list[ReportFile] = []
        for fmt, payload in (("md", markdown_bytes), ("json", json_bytes)):
            path = directory / f"{base}.{fmt}"
            self._confine(path)
            path.write_bytes(payload)
            files.append(
                ReportFile(
                    format=fmt,  # type: ignore[arg-type]
                    filename=path.name,
                    sha256=_sha256(payload),
                    size_bytes=len(payload),
                )
            )

        reasons = self._approval_reasons(run, classification)
        record = HarnessReportRecord(
            version=version,
            generated_at=generated_at,
            generated_by=generated_by,
            reason=reason,  # type: ignore[arg-type]
            files=files,
            classification=classification,
            approval=ReportApproval(
                required=bool(reasons),
                reasons=reasons,
                decision="pending" if reasons else None,
            ),
            released=not reasons,
            child_statuses={
                item.task_id: task.status.value for item, task in rows if item.task_id and task
            },
            tally=counts,
        )
        if run.report is not None:
            run.previous_reports.append(run.report)
        run.report = record
        self.audit.record(
            category="harness",
            action="report_generated",
            actor=generated_by,
            actor_role=actor_role,
            detail={
                "run_id": run.id,
                "harness_id": run.harness.id,
                "version": version,
                "reason": reason,
                "files": [
                    {"filename": f.filename, "sha256": f.sha256, "size_bytes": f.size_bytes}
                    for f in files
                ],
                "classification": classification.value,
                "requires_approval": record.approval.required,
                "released": record.released,
                "outcomes": {
                    outcome.value: count for outcome, count in counts.counts.items() if count
                },
            },
        )
        return record

    # -------------------------------------------------------------- views
    def _permissions_for(self, run: HarnessRun, viewer: User, *, stale: bool) -> RunPermissions:
        permissions = self._permissions(viewer)
        owner = run.user_id == viewer.id
        active = run.status in ACTIVE_RUN_STATUSES or run.id in self._active
        report = run.report
        return RunPermissions(
            can_cancel=active and run.cancel_requested_at is None and self._can_control(run, viewer),
            # Offered only when there is something new to report: a fresh
            # version restarts any approval, so regenerating an unchanged
            # report would cost a reviewer's signature for nothing.
            can_regenerate_report=(
                not active and (report is None or stale) and self._can_control(run, viewer)
            ),
            can_decide_report=(
                report is not None
                and report.approval.required
                and report.approval.decision == "pending"
                and "approval.decide" in permissions
            ),
            can_download_report=(
                report is not None
                and (owner or "deliverable.download.all" in permissions)
                and (report.released or "approval.decide" in permissions)
            ),
        )

    def view(self, run: HarnessRun, viewer: User) -> HarnessRunView:
        children: list[HarnessChildView] = []
        for item in run.items:
            task = self._read_task(item.task_id)
            queue = None
            if task is not None and task.status in QUEUED_STATUSES and item.task_id:
                queue = self._queue_state(item.task_id)
            children.append(child_view(item, task, queue=queue))
        counts = tally(child.outcome for child in children)
        active = run.status in ACTIVE_RUN_STATUSES
        current_index = (
            next((item.index for item in run.items if item.state == ItemState.SUBMITTED), None)
            if active
            else None
        )
        changed: list[int] = []
        if run.report is not None:
            changed = [
                child.index
                for child in children
                if child.task_id
                and child.task_status is not None
                and run.report.child_statuses.get(child.task_id) != child.task_status.value
            ]
        permissions = self._permissions_for(run, viewer, stale=bool(changed))

        report_view: ReportView | None = None
        if run.report is not None:
            record = run.report
            report_view = ReportView(
                record=record,
                stale=bool(changed),
                changed_items=changed,
                downloads=(
                    [
                        ReportDownload(
                            format=file.format,
                            url=f"/api/harness-runs/{run.id}/report/{file.format}",
                            filename=file.filename,
                            sha256=file.sha256,
                            size_bytes=file.size_bytes,
                        )
                        for file in record.files
                    ]
                    if permissions.can_download_report
                    else []
                ),
            )

        return HarnessRunView(
            id=run.id,
            harness=run.harness,
            user_id=run.user_id,
            username=run.username,
            user_display_name=run.user_display_name,
            role=run.role,
            department=run.department,
            inputs=run.inputs,
            excluded=run.excluded,
            scope=run.scope,
            status=run.status,
            created_at=run.created_at,
            updated_at=run.updated_at,
            finished_at=run.finished_at,
            cancel_requested_at=run.cancel_requested_at,
            cancel_requested_by=run.cancel_requested_by,
            error=run.error,
            children=children,
            tally=counts,
            current_index=current_index,
            report=report_view,
            permissions=permissions,
            limitations=run_limitations(run),
            server_time=_utcnow(),
        )

    def run_view(self, run_id: str, viewer: User) -> HarnessRunView:
        return self.view(self._readable_run(run_id, viewer), viewer)

    def summaries(self, viewer: User, *, limit: int = 30) -> list[HarnessRunSummary]:
        everyone = "task.read.all" in self._permissions(viewer)
        summaries: list[HarnessRunSummary] = []
        for stored in self.store.list(None if everyone else viewer.id, limit=limit):
            run = self._active.get(stored.id, stored)
            outcomes = [derive_outcome(item, self._read_task(item.task_id))[0] for item in run.items]
            active = run.status in ACTIVE_RUN_STATUSES
            report = run.report
            summaries.append(
                HarnessRunSummary(
                    id=run.id,
                    harness_id=run.harness.id,
                    harness_name=run.harness.name,
                    status=run.status,
                    user_display_name=run.user_display_name,
                    created_at=run.created_at,
                    finished_at=run.finished_at,
                    tally=tally(outcomes),
                    current_index=(
                        next(
                            (item.index for item in run.items if item.state == ItemState.SUBMITTED),
                            None,
                        )
                        if active
                        else None
                    ),
                    report_version=report.version if report else None,
                    report_released=report.released if report else None,
                    report_requires_approval=report.approval.required if report else None,
                    report_decision=report.approval.decision if report else None,
                )
            )
        return summaries

    # ------------------------------------------------------------- cancel
    async def cancel(self, run_id: str, viewer: User) -> HarnessRun:
        run = self._active.get(run_id)
        if run is None:
            stored = self._readable_run(run_id, viewer)
            raise HarnessConflict(
                f"This run has already ended ({stored.status.value}); there is nothing to cancel."
            )
        if not self.can_read(run, viewer) or not self._can_control(run, viewer):
            raise HarnessForbidden(
                "Only the person who started this run, or a supervisor who may run work, can "
                "cancel it."
            )
        if run.cancel_requested_at is not None:
            return run

        in_flight = next((item for item in run.items if item.state == ItemState.SUBMITTED), None)
        not_submitted = sum(1 for item in run.items if item.state == ItemState.PENDING)
        run.cancel_requested_at = _utcnow()
        run.cancel_requested_by = viewer.display_name
        run.status = RunStatus.CANCELLING
        self._cancellers[run.id] = viewer
        self._save(run)
        self.audit.record(
            category="harness",
            action="run_cancel_requested",
            actor=viewer.username,
            actor_role=viewer.role,
            detail={
                "run_id": run.id,
                "harness_id": run.harness.id,
                "owner": run.username,
                "in_flight_task": in_flight.task_id if in_flight else None,
                "not_yet_submitted": not_submitted,
            },
        )
        await self._publish("harness.cancelling", run, {"not_yet_submitted": not_submitted})
        if in_flight is not None:
            await self._stop_child(run, in_flight, viewer)
        return run

    # ------------------------------------------------- report lifecycle
    async def regenerate_report(self, run_id: str, viewer: User) -> HarnessRun:
        run = self._readable_run(run_id, viewer)
        if run.id in self._active or run.status in ACTIVE_RUN_STATUSES:
            raise HarnessConflict("This run is still in progress; its report is written when it ends.")
        if not self._can_control(run, viewer):
            raise HarnessForbidden(
                "Only the person who started this run, or a supervisor who may run work, can "
                "regenerate its report."
            )
        if run.report is not None:
            current = {
                item.task_id: task.status.value
                for item in run.items
                if item.task_id and (task := self._read_task(item.task_id)) is not None
            }
            if current == run.report.child_statuses:
                raise HarnessConflict(
                    f"No child has changed since report version {run.report.version}; "
                    "regenerating would only restart its approval."
                )
        record = self._write_report(
            run, generated_by=viewer.username, actor_role=viewer.role, reason="regenerated"
        )
        if run.error and run.error.startswith("The report could not be written"):
            # That error described the missing report, which now exists. Any
            # other error (an interruption, a runner failure) stays on record.
            run.error = None
        self._save(run)
        await self._publish(
            "harness.report",
            run,
            {"report_version": record.version, "released": record.released},
        )
        return run

    async def decide_report(
        self, run_id: str, viewer: User, decision: str, comment: str | None
    ) -> HarnessRun:
        run = self._readable_run(run_id, viewer)
        if "approval.decide" not in self._permissions(viewer):
            raise HarnessForbidden(f"Role '{viewer.role}' cannot approve reports.")
        report = run.report
        if report is None:
            raise HarnessConflict("This run has no report to decide on.")
        if not report.approval.required:
            raise HarnessConflict(
                "This report version needed no approval; it was released when it was written."
            )
        if report.approval.decision != "pending":
            raise HarnessConflict(
                f"Report version {report.version} was already {report.approval.decision}."
            )
        approved = decision == "approve"
        report.approval.decision = "approved" if approved else "rejected"
        report.approval.reviewer_id = viewer.id
        report.approval.reviewer_name = viewer.display_name
        report.approval.comment = comment
        report.approval.decided_at = _utcnow()
        report.released = approved
        self._save(run)
        self.audit.record(
            category="approval",
            action="harness_report_approved" if approved else "harness_report_rejected",
            actor=viewer.username,
            actor_role=viewer.role,
            detail={
                "run_id": run.id,
                "harness_id": run.harness.id,
                "version": report.version,
                "comment": comment,
                "files": [{"filename": f.filename, "sha256": f.sha256} for f in report.files],
            },
        )
        await self._publish(
            "harness.report",
            run,
            {"report_version": report.version, "released": report.released},
        )
        return run

    def report_file(self, run_id: str, fmt: str, viewer: User) -> tuple[Path, ReportFile]:
        run = self._readable_run(run_id, viewer)
        permissions = self._permissions(viewer)
        if run.user_id != viewer.id and "deliverable.download.all" not in permissions:
            raise HarnessForbidden("You are not entitled to this report.")
        report = run.report
        if report is None:
            raise HarnessNotFound("This run has no report yet.")
        if not report.released and "approval.decide" not in permissions:
            raise HarnessForbidden(
                "This report is held pending approval and has not been released."
            )
        file = next((entry for entry in report.files if entry.format == fmt), None)
        if file is None:
            raise HarnessNotFound(f"This report has no '{fmt}' file.")
        path = self._report_dir(run.id) / file.filename
        self._confine(path, viewer)
        if not path.exists():
            raise HarnessGone(
                f"'{file.filename}' is recorded for this run but is no longer in deliverable "
                "storage. Regenerate the report to write it again."
            )
        # Checked on every download, not assumed: the hash recorded when the
        # file was written is the one the audit chain carries.
        if _sha256(path.read_bytes()) != file.sha256:
            self.audit.record(
                category="harness",
                action="report_integrity_failure",
                actor=viewer.username,
                actor_role=viewer.role,
                detail={"run_id": run.id, "filename": file.filename, "recorded_sha256": file.sha256},
            )
            raise HarnessConflict(
                f"'{file.filename}' no longer matches the sha256 recorded when it was written, "
                "so it was not served. The mismatch is recorded in the audit log."
            )
        self.audit.record(
            category="harness",
            action="report_downloaded",
            actor=viewer.username,
            actor_role=viewer.role,
            detail={
                "run_id": run.id,
                "version": report.version,
                "filename": file.filename,
                "sha256": file.sha256,
                "released": report.released,
            },
        )
        return path, file

    # ----------------------------------------------------------- recovery
    def recover_interrupted(self) -> list[str]:
        """Close out runs left in progress by a process that no longer exists.

        Runners live in this object, so when it is first built no run can
        have one. Anything still recorded as running was abandoned -- the
        process stopped -- and, left alone, would display as running forever.
        The task service fails its own orphaned children at boot the same way.
        """
        recovered: list[str] = []
        for run in self.store.list(None, limit=500, statuses=[s.value for s in ACTIVE_RUN_STATUSES]):
            if run.id in self._active:
                continue
            previous = run.status.value
            run.status = RunStatus.INTERRUPTED
            run.finished_at = _utcnow()
            run.error = (
                "The workbench stopped while this run was in progress, so the harness did not "
                "finish it. Items not yet submitted were never run; start a new run to cover them."
            )
            for item in run.items:
                if item.state == ItemState.PENDING:
                    item.state = ItemState.NOT_SUBMITTED
                    item.note = "The workbench stopped before this item's turn."
            try:
                self._write_report(
                    run, generated_by=run.username, actor_role=run.role, reason="interrupted"
                )
            except Exception as exc:
                run.error += f" The partial report could not be written: {exc}"
            self._save(run)
            self.audit.record(
                category="harness",
                action="run_interrupted",
                actor=run.username,
                actor_role=run.role,
                detail={
                    "run_id": run.id,
                    "previous_status": previous,
                    "submitted": sum(1 for item in run.items if item.task_id),
                    "not_submitted": sum(
                        1 for item in run.items if item.state == ItemState.NOT_SUBMITTED
                    ),
                },
            )
            recovered.append(run.id)
        return recovered


_service: HarnessService | None = None


def get_harness_service() -> HarnessService:
    """Process-wide harness service, bound to the process-wide task service.

    Imported late: the task service pulls in the orchestrator and the whole
    model layer, which nothing in this package needs until a run starts.
    """
    global _service
    if _service is None:
        from backend.api.task_service import get_task_service

        _service = HarnessService(tasks=get_task_service())
    return _service
