"""Task lifecycle service.

Owns task persistence, the execution queue, and the approval workflow. Agent
runs happen on a background worker so the API stays responsive while CPU
inference proceeds; progress reaches the browser over SSE.
"""

from __future__ import annotations

import asyncio
import hashlib
import mimetypes
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.agents.orchestrator import get_orchestrator
from backend.core.analyzer import get_task_analyzer
from backend.core.audit import get_audit_log
from backend.core.config import get_config
from backend.core.database import get_database
from backend.core.events import get_event_bus
from backend.core.schemas import (
    ApprovalRecord,
    InputType,
    PolicyDecision,
    Sensitivity,
    StoredFile,
    Task,
    TaskStatus,
    TaskSummary,
    User,
)
from backend.policy.gateway import get_policy_gateway


class TaskError(RuntimeError):
    """Raised for task-level failures that map to a client error."""


class TaskService:
    def __init__(self) -> None:
        self.config = get_config()
        self.db = get_database()
        self.analyzer = get_task_analyzer()
        self.gateway = get_policy_gateway()
        self.audit = get_audit_log()
        self.events = get_event_bus()
        self.orchestrator = get_orchestrator()
        self.orchestrator._is_cancelled = self.is_cancelled
        self._queue: asyncio.Queue[tuple[str, str]] = asyncio.Queue()
        # Order of ids still waiting, so a caller can be told its position
        # rather than watching an apparently idle screen.
        self._waiting: list[str] = []
        # Which task is executing right now, for queue positions and cancels.
        self._active: str | None = None
        # Asked to stop. Checked between stages, so a run ends at a clean
        # boundary rather than being torn down mid-write.
        self._cancelled: set[str] = set()
        self._workers: list[asyncio.Task[None]] = []
        # Whether the worker loop should keep going. This used to share a name
        # with the running task id above, so clearing the id at the end of a
        # run also ended the loop: the queue served exactly one task per
        # process start, and everything after it sat at 'classified' forever.
        self._alive = False

    # -- files -------------------------------------------------------------
    def _input_type_for(self, filename: str) -> InputType:
        suffix = Path(filename).suffix.lower()
        mapping = self.config.classification["input_types"]["by_extension"]
        for type_name, extensions in mapping.items():
            if suffix in [str(item).lower() for item in extensions]:
                try:
                    return InputType(type_name)
                except ValueError:
                    break
        return InputType.TEXT

    def store_upload(
        self, user: User, filename: str, payload: bytes, classification: Sensitivity | None = None
    ) -> StoredFile:
        """Quarantine checks, then persist an upload inside the storage root."""
        storage = self.config.settings.storage
        max_bytes = int(storage.get("max_upload_bytes", 52428800))
        allowed = {str(item).lower() for item in storage.get("allowed_upload_extensions", [])}
        suffix = Path(filename).suffix.lower()
        notes: list[str] = []

        if suffix not in allowed:
            raise TaskError(
                f"File type '{suffix or 'unknown'}' is not accepted. "
                f"Permitted types: {', '.join(sorted(allowed))}"
            )
        if len(payload) > max_bytes:
            raise TaskError(
                f"File exceeds the {max_bytes // (1024 * 1024)} MB upload limit"
            )
        if not payload:
            raise TaskError("File is empty")

        digest = hashlib.sha256(payload).hexdigest()
        file_id = str(uuid.uuid4())
        safe_name = Path(filename).name
        target_dir = self.config.settings.path("uploads") / user.id
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"{file_id}_{safe_name}"
        target.write_bytes(payload)

        confinement = self.gateway.check_path_confinement(target, user=user)
        if confinement.decision != PolicyDecision.ALLOW:
            target.unlink(missing_ok=True)
            raise TaskError(confinement.reason)

        media_type = mimetypes.guess_type(safe_name)[0] or "application/octet-stream"
        stored = StoredFile(
            id=file_id,
            filename=safe_name,
            stored_path=str(target),
            media_type=media_type,
            size_bytes=len(payload),
            sha256=digest,
            input_type=self._input_type_for(safe_name),
            classification=classification or Sensitivity.NORMAL,
            owner_id=user.id,
            department=user.department,
            quarantine_passed=True,
            quarantine_notes=notes,
            uploaded_at=datetime.now(timezone.utc),
        )
        record = stored.model_dump(mode="json")
        record["task_id"] = None
        self.db.insert_file(record)
        self.audit.record(
            category="file",
            action="uploaded",
            actor=user.username,
            actor_role=user.role,
            detail={
                "filename": safe_name,
                "sha256": digest,
                "size_bytes": len(payload),
                "input_type": stored.input_type.value,
                "quarantine_passed": True,
            },
        )
        return stored

    def get_file(self, file_id: str) -> StoredFile | None:
        record = self.db.get_file(file_id)
        return StoredFile(**record) if record else None

    def list_files(self, user: User) -> list[StoredFile]:
        overrides = self.config.access_control.get("file_access", {}).get("override_roles", [])
        records = self.db.list_files(None if user.role in overrides else user.id)
        return [StoredFile(**record) for record in records]

    # -- persistence -------------------------------------------------------
    def _persist(self, task: Task) -> None:
        payload = task.model_dump(mode="json")
        existing = self.db.get_task(task.id)
        if existing is None:
            self.db.insert_task(
                task.id,
                task.user_id,
                task.department,
                task.prompt,
                task.status.value,
                payload,
            )
        else:
            self.db.update_task(
                task.id,
                task.status.value,
                payload,
                completed=task.status
                in {TaskStatus.DELIVERED, TaskStatus.REJECTED, TaskStatus.FAILED},
            )

    def get_task(self, task_id: str) -> Task | None:
        record = self.db.get_task(task_id)
        if record is None:
            return None
        return Task(**record["payload"])

    def list_tasks(self, user: User, limit: int = 50) -> list[TaskSummary]:
        can_see_all = "task.read.all" in self.config.role_permissions(user.role)
        records = self.db.list_tasks(None if can_see_all else user.id, limit=limit)
        summaries: list[TaskSummary] = []
        for record in records:
            task = Task(**record["payload"])
            summaries.append(
                TaskSummary(
                    id=task.id,
                    prompt=task.prompt,
                    status=task.status,
                    task_type=task.profile.task_type if task.profile else None,
                    sensitivity=task.profile.sensitivity if task.profile else None,
                    created_at=task.created_at,
                    updated_at=task.updated_at,
                    deliverable_count=len(task.deliverables),
                    approval_required=bool(task.approval and task.approval.required),
                    user_display_name=task.user_display_name,
                )
            )
        return summaries

    def pending_approvals(self, user: User) -> list[Task]:
        records = self.db.list_tasks(None, limit=200, statuses=[TaskStatus.AWAITING_APPROVAL.value])
        tasks = [Task(**record["payload"]) for record in records]
        return [
            task
            for task in tasks
            if task.approval and user.role in (task.approval.approver_roles or [user.role])
        ]

    # -- creation and execution -------------------------------------------
    async def create_task(
        self,
        user: User,
        prompt: str,
        file_ids: list[str],
        deliverable_format: str | None = None,
    ) -> Task:
        files: list[StoredFile] = []
        for file_id in file_ids:
            stored = self.get_file(file_id)
            if stored is None:
                raise TaskError(f"Unknown file id: {file_id}")
            access = self.gateway.check_file_access(user, stored)
            if access.decision != PolicyDecision.ALLOW:
                raise TaskError(access.reason)
            files.append(stored)

        profile = self.analyzer.analyze(prompt, files, requested_format=deliverable_format)
        now = datetime.now(timezone.utc)
        task = Task(
            id=str(uuid.uuid4()),
            prompt=prompt,
            status=TaskStatus.CLASSIFIED,
            user_id=user.id,
            user_display_name=user.display_name,
            department=user.department,
            created_at=now,
            updated_at=now,
            files=files,
            profile=profile,
        )

        required, reasons, approvers = self.gateway.approval_requirement(
            profile, prompt=prompt
        )
        task.approval = ApprovalRecord(
            required=required, reasons=reasons, approver_roles=approvers
        )

        for stored in files:
            self.db.attach_file_to_task(stored.id, task.id)

        self._persist(task)
        self.audit.record(
            category="task",
            action="received",
            actor=user.username,
            actor_role=user.role,
            task_id=task.id,
            detail={
                "prompt_chars": len(prompt),
                "input_hashes": [stored.sha256 for stored in files],
                "filenames": [stored.filename for stored in files],
            },
        )
        self.audit.record(
            category="task",
            action="classified",
            actor=user.username,
            actor_role=user.role,
            task_id=task.id,
            detail={
                "input_type": profile.input_type.value,
                "task_type": profile.task_type.value,
                "complexity": profile.complexity.value,
                "sensitivity": profile.sensitivity.value,
                "confidence": profile.confidence,
                "requires_vision": profile.requires_vision,
                "requires_retrieval": profile.requires_retrieval,
                "produces_deliverable": profile.produces_deliverable,
                "policy_basis": "config/classification.yaml",
            },
        )
        await self.events.publish(
            "task.created",
            task_id=task.id,
            data={
                "task_id": task.id,
                "prompt": prompt,
                "profile": profile.model_dump(mode="json"),
                "approval": task.approval.model_dump(mode="json"),
            },
        )

        self._waiting.append(task.id)
        await self._queue.put((task.id, user.id))
        await self._publish_queue()
        return task

    async def _publish_queue(self) -> None:
        """Announce the waiting line so nobody is left guessing."""
        for waiting_id in list(self._waiting):
            state = self.queue_state(waiting_id)
            await self.events.publish(
                "task.queued",
                task_id=waiting_id,
                data={**state, "running_task": self._active},
            )

    def is_cancelled(self, task_id: str) -> bool:
        return task_id in self._cancelled

    async def cancel(self, task_id: str, user: User) -> Task:
        """Stop a task the user no longer wants.

        A queued task is dropped immediately. A running one is asked to stop
        and ends at its next stage boundary, so partial work and the audit
        record stay consistent.
        """
        task = self.get_task(task_id)
        if task is None:
            raise TaskError(f"Unknown task: {task_id}")

        permissions = self.config.role_permissions(user.role)
        if task.user_id != user.id and "task.read.all" not in permissions:
            raise TaskError("You can only stop your own tasks")

        terminal = {
            TaskStatus.DELIVERED,
            TaskStatus.FAILED,
            TaskStatus.REJECTED,
            TaskStatus.BLOCKED,
            TaskStatus.CANCELLED,
        }
        if task.status in terminal:
            raise TaskError("This task has already finished")

        self._cancelled.add(task_id)
        if task_id in self._waiting:
            self._waiting.remove(task_id)

        # A task that never started can be closed out at once.
        if self._active != task_id:
            task.status = TaskStatus.CANCELLED
            task.error = "Stopped before it started."
            task.updated_at = datetime.now(timezone.utc)
            task.completed_at = task.updated_at
            self._persist(task)

        self.audit.record(
            category="task",
            action="cancelled",
            actor=user.username,
            actor_role=user.role,
            task_id=task_id,
            detail={"was_running": self._active == task_id},
        )
        await self.events.publish(
            "task.cancelled",
            task_id=task_id,
            data={"by": user.display_name, "was_running": self._active == task_id},
        )
        await self._publish_queue()
        return self.get_task(task_id) or task

    def queue_state(self, task_id: str) -> dict[str, Any]:
        """Where this task sits in the line, for the API and the UI.

        A task already in progress counts as one ahead: from the caller's seat
        they are waiting on it, and reporting "none ahead" while something else
        holds the worker is exactly the silence that makes the application look
        stuck.
        """
        if self._active == task_id:
            return {
                "running": True,
                "position": 0,
                "ahead": 0,
                "queue_length": len(self._waiting),
            }

        in_progress = 1 if self._active else 0
        if task_id in self._waiting:
            position = self._waiting.index(task_id) + 1
            return {
                "running": False,
                "position": position + in_progress,
                "ahead": position - 1 + in_progress,
                "queue_length": len(self._waiting) + in_progress,
            }
        return {
            "running": False,
            "position": None,
            "ahead": 0,
            "queue_length": len(self._waiting) + in_progress,
        }

    async def _worker(self) -> None:
        from backend.core.identity import get_identity_service

        identity = get_identity_service()
        while self._alive:
            try:
                task_id, user_id = await self._queue.get()
            except asyncio.CancelledError:
                return
            try:
                if task_id in self._waiting:
                    self._waiting.remove(task_id)
                if task_id in self._cancelled:
                    # Dropped while it was still queued.
                    self._cancelled.discard(task_id)
                    continue
                self._active = task_id
                await self._publish_queue()

                task = self.get_task(task_id)
                user = identity.get_user(user_id)
                if task is None or user is None:
                    continue
                task = await self.orchestrator.run(task, user, persist=self._persist)
                self._persist(task)
                self.audit.record(
                    category="task",
                    action=f"finished:{task.status.value}",
                    actor=user.username,
                    actor_role=user.role,
                    task_id=task.id,
                    detail={
                        "status": task.status.value,
                        "duration_ms": task.duration_ms,
                        "deliverables": [d.filename for d in task.deliverables],
                        "verification_valid": (
                            task.verification.valid if task.verification else None
                        ),
                        "network_activity": "none — all processing local",
                    },
                )
            except Exception as exc:  # a worker must never die silently
                await self.events.publish(
                    "task.failed",
                    task_id=task_id,
                    data={"reason": f"worker error: {exc}"},
                )
            finally:
                self._active = None
                self._queue.task_done()

    async def start(self, worker_count: int = 1) -> None:
        if self._alive:
            return
        self._alive = True
        self._workers = [
            asyncio.create_task(self._worker()) for _ in range(max(1, worker_count))
        ]

    def recover_orphans(self) -> list[str]:
        """Close out tasks left mid-flight by a worker that no longer exists.

        A task is only ever in a running state because some worker is holding
        it. At boot there are none, so anything still marked running was
        abandoned — the process was killed, or the host restarted. Left alone
        it stays "working" forever, and the workspace faithfully reports that
        forever, which reads as the application being hung.
        """
        active = {
            TaskStatus.RECEIVED.value,
            TaskStatus.CLASSIFIED.value,
            TaskStatus.PLANNED.value,
            TaskStatus.RETRIEVING.value,
            TaskStatus.EXECUTING.value,
            TaskStatus.VERIFYING.value,
        }
        recovered: list[str] = []
        for record in self.db.list_tasks(None, limit=500, statuses=sorted(active)):
            task = Task(**record["payload"])
            task.status = TaskStatus.FAILED
            task.error = (
                "This task was interrupted when the workbench stopped, so it did "
                "not finish. Submit it again to run it from the start."
            )
            task.updated_at = datetime.now(timezone.utc)
            task.completed_at = task.updated_at
            self._persist(task)
            self.audit.record(
                category="task",
                action="recovered_after_restart",
                actor="system",
                task_id=task.id,
                detail={"previous_status": record["status"]},
            )
            recovered.append(task.id)
        return recovered

    async def stop(self) -> None:
        self._alive = False
        for worker in self._workers:
            worker.cancel()
        for worker in self._workers:
            try:
                await worker
            except (asyncio.CancelledError, Exception):
                pass
        self._workers = []

    # -- approval ----------------------------------------------------------
    async def decide_approval(
        self, task_id: str, user: User, decision: str, comment: str | None
    ) -> Task:
        task = self.get_task(task_id)
        if task is None:
            raise TaskError(f"Unknown task: {task_id}")
        if task.status != TaskStatus.AWAITING_APPROVAL or task.approval is None:
            raise TaskError("This task is not awaiting approval")

        permission = self.gateway.check_permission(user, "approval.decide", task_id=task_id)
        if permission.decision != PolicyDecision.ALLOW:
            raise TaskError(permission.reason)
        if task.approval.approver_roles and user.role not in task.approval.approver_roles:
            raise TaskError(
                f"Role '{user.role}' is not an approving authority for this task "
                f"(requires one of: {', '.join(task.approval.approver_roles)})"
            )

        approved = decision == "approve"
        task.approval.decision = "approved" if approved else "rejected"
        task.approval.reviewer_id = user.id
        task.approval.reviewer_name = user.display_name
        task.approval.comment = comment
        task.approval.decided_at = datetime.now(timezone.utc)
        task.status = TaskStatus.DELIVERED if approved else TaskStatus.REJECTED
        task.updated_at = datetime.now(timezone.utc)
        task.completed_at = task.updated_at

        for deliverable in task.deliverables:
            deliverable.released = approved

        self._persist(task)
        self.audit.record(
            category="approval",
            action="approved" if approved else "rejected",
            actor=user.username,
            actor_role=user.role,
            task_id=task.id,
            detail={
                "reviewer": user.display_name,
                "comment": comment,
                "deliverables_released": [d.filename for d in task.deliverables] if approved else [],
                "evidence_presented": len(task.evidence),
            },
        )
        await self.events.publish(
            "task.approval_decided",
            task_id=task.id,
            data={
                "decision": task.approval.decision,
                "reviewer": user.display_name,
                "comment": comment,
                "status": task.status.value,
            },
        )
        return task


_service: TaskService | None = None


def get_task_service() -> TaskService:
    global _service
    if _service is None:
        _service = TaskService()
    return _service
