"""Agent orchestrator.

An explicit state machine implementing the lifecycle from the reference
architecture: receive → classify → plan → retrieve → select → execute →
observe → verify → approve → deliver → audit.

Every stage emits an SSE event and an audit record, so the agent timeline in
the UI is the execution trace rather than a decoration. Model selection happens
per stage through the router, which is how a single task can legitimately use
the vision model for extraction and the reasoning model for drafting, with both
choices explained.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from backend.agents.verifier import get_verification_engine
from backend.core.audit import get_audit_log
from backend.core.config import get_config
from backend.core.events import get_event_bus
from backend.core.schemas import (
    AgentPlan,
    ApprovalRecord,
    EvidenceItem,
    ModelRole,
    PlanStep,
    PolicyDecision,
    RoutingDecision,
    SandboxResult,
    StoredFile,
    Task,
    TaskProfile,
    TaskStatus,
    TaskType,
    ToolCall,
    User,
)
from backend.models_layer.client import InferenceError, get_inference_client
from backend.models_layer.manager import get_model_manager
from backend.models_layer.registry import get_model_registry
from backend.models_layer.router import NoEligibleModelError, get_model_router
from backend.policy.gateway import get_policy_gateway
from backend.tools.registry import ToolContext, get_tool_registry

CODE_FENCE = re.compile(r"```(?:python|py)?\s*\n(.*?)```", re.DOTALL)
JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)
THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
# A numeric result worth recomputing: a figure carrying a unit, or an explicit
# equality. Prose with no such assertion needs no calculation check.
NUMERIC_ASSERTION = re.compile(
    # A percentage: '%' is not a word character, so no trailing \b here.
    r"\d+(?:\.\d+)?\s*%"
    # A figure carrying a unit.
    r"|\d+(?:\.\d+)?\s*(?:mm|cm|m|kg|t|bar|psi|kpa|mpa|years?|yrs?|months?|"
    r"days?|hours?|hrs?)\b"
    # An explicit computed equality.
    r"|=\s*-?\d+(?:\.\d+)?",
    re.IGNORECASE,
)


class EvidenceLedger:
    """Owns evidence identity for one task run.

    Identifiers are what a citation points at, so they must be unique across
    the whole run. Assigning them at each collection site produced collisions
    the moment two attachments were read — both started at ``F1`` — which made
    two different sources indistinguishable in the finished document.

    Prefixes stay meaningful: S for retrieved sources, F for attached files,
    V for what the vision model read, C for recomputed figures, X for sandbox
    output.
    """

    PREFIXES = {
        "knowledge_base": "S",
        "uploaded_file": "F",
        "vision_extraction": "V",
        "computation": "C",
    }

    def __init__(self, existing: list[EvidenceItem]) -> None:
        self._items = existing
        self._counters: dict[str, int] = {}
        for item in existing:
            prefix = "".join(character for character in item.id if character.isalpha())
            digits = "".join(character for character in item.id if character.isdigit())
            if prefix and digits:
                self._counters[prefix] = max(self._counters.get(prefix, 0), int(digits))

    def _next_id(self, prefix: str) -> str:
        self._counters[prefix] = self._counters.get(prefix, 0) + 1
        return f"{prefix}{self._counters[prefix]}"

    def add(self, item: EvidenceItem, *, prefix: str | None = None) -> EvidenceItem:
        """Append one item under a freshly allocated identifier."""
        chosen = prefix or self.PREFIXES.get(item.kind, "E")
        item.id = self._next_id(chosen)
        self._items.append(item)
        return item

    def extend(self, items: list[EvidenceItem], *, prefix: str | None = None) -> list[EvidenceItem]:
        return [self.add(item, prefix=prefix) for item in items]

    @property
    def items(self) -> list[EvidenceItem]:
        return self._items

    def __len__(self) -> int:
        return len(self._items)


def _strip_reasoning(text: str) -> str:
    """Remove chain-of-thought blocks some reasoning models emit."""
    return THINK_BLOCK.sub("", text or "").strip()


def _parse_json(text: str) -> dict[str, Any] | None:
    """Recover a JSON object from model output that may carry prose around it."""
    cleaned = _strip_reasoning(text)
    for candidate in (cleaned, *(match.group(0) for match in [JSON_OBJECT.search(cleaned)] if match)):
        if not candidate:
            continue
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            continue
    return None


class AgentOrchestrator:
    """Executes one task from classification through to deliverable."""

    def __init__(self) -> None:
        self.config = get_config()
        self.router = get_model_router()
        self.registry = get_model_registry()
        self.client = get_inference_client()
        self.manager = get_model_manager()
        self.tools = get_tool_registry()
        self.gateway = get_policy_gateway()
        self.verifier = get_verification_engine()
        self.audit = get_audit_log()
        self.events = get_event_bus()
        self._persist: Callable[[Task], None] | None = None

    def _checkpoint(self, task: Task) -> None:
        """Write the in-flight task record, ignoring storage hiccups."""
        if self._persist is None:
            return
        try:
            self._persist(task)
        except Exception:
            # Losing a checkpoint must not abort a run that is otherwise fine.
            pass

    # -- eventing ----------------------------------------------------------
    async def _emit(
        self, task: Task, event: str, data: dict[str, Any] | None = None
    ) -> None:
        await self.events.publish(event, task_id=task.id, data=data or {})

    async def _stage(
        self,
        task: Task,
        status: TaskStatus,
        message: str,
        data: dict[str, Any] | None = None,
    ) -> None:
        task.status = status
        task.updated_at = datetime.now(timezone.utc)
        self._checkpoint(task)
        await self._emit(
            task,
            "task.stage",
            {"status": status.value, "message": message, **(data or {})},
        )

    # -- model invocation --------------------------------------------------
    async def _generate(
        self,
        task: Task,
        user: User,
        *,
        stage: str,
        system_prompt: str,
        prompt: str,
        images: list[Path] | None = None,
        format_json: bool = False,
    ) -> tuple[str, RoutingDecision]:
        """Route to a model for this stage, enforce model policy, then generate."""
        assert task.profile is not None
        decision = await self.router.route(
            task.profile,
            stage=stage,
            extra_capabilities=["vision"] if images else None,
        )
        task.routing.append(decision)
        self._checkpoint(task)
        await self._emit(
            task,
            "task.model_selected",
            {
                "stage": stage,
                "model": decision.selected_model,
                "display_name": decision.selected_display_name,
                "role": decision.requested_role.value,
                "reason": decision.reason,
                "rule": decision.rule,
                "used_fallback": decision.used_fallback,
                "candidates": decision.candidates,
            },
        )

        if not decision.selected_model:
            raise NoEligibleModelError(decision.reason)

        descriptor = await self.router.resolve_descriptor(decision)
        policy_event = self.gateway.check_model(
            user,
            descriptor.id,
            approved_classifications=descriptor.approved_classifications,
            registered=descriptor.registered,
            sensitivity=task.profile.sensitivity,
            task_id=task.id,
        )
        task.policy_events.append(policy_event)
        if policy_event.decision != PolicyDecision.ALLOW:
            raise NoEligibleModelError(policy_event.reason)

        # Memory admission: make room before invoking, evicting the previously
        # resident model when the host cannot hold both.
        admission = await self.manager.admit(
            descriptor, actor=user.username, task_id=task.id
        )
        if admission.get("evicted"):
            await self._emit(
                task,
                "task.model_swapped",
                {
                    "stage": stage,
                    "evicted": admission["evicted"],
                    "loading": descriptor.id,
                    "available_mb": admission.get("available_after_mb"),
                    "reason": admission.get("reason", "single-model residency policy"),
                },
            )

        self.audit.record(
            category="model",
            action="inference_started",
            actor=user.username,
            actor_role=user.role,
            task_id=task.id,
            detail={
                "stage": stage,
                "model": descriptor.id,
                "model_version": descriptor.quantization,
                "routing_reason": decision.reason,
                "provider": descriptor.provider,
                "memory_admission": admission,
                "local_only": True,
            },
        )

        result = await self.client.generate(
            model=descriptor.provider_model,
            prompt=prompt,
            system=system_prompt,
            images=images,
            options=self.router.generation_options(descriptor.id),
            serving=self.router.serving_options(descriptor.id),
            format_json=format_json,
        )
        await self._emit(
            task,
            "task.model_completed",
            {
                "stage": stage,
                "model": descriptor.id,
                "latency_ms": result.latency_ms,
                "tokens_per_second": result.tokens_per_second,
                "eval_count": result.eval_count,
            },
        )
        self.audit.record(
            category="model",
            action="inference_completed",
            actor=user.username,
            actor_role=user.role,
            task_id=task.id,
            detail={
                "stage": stage,
                "model": descriptor.id,
                "latency_ms": result.latency_ms,
                "output_chars": len(result.text),
            },
        )
        return _strip_reasoning(result.text), decision

    # -- tool invocation ---------------------------------------------------
    async def _call_tool(
        self, task: Task, context: ToolContext, name: str, arguments: dict[str, Any]
    ) -> ToolCall:
        await self._emit(
            task, "task.tool_started", {"tool": name, "arguments": _summarise(arguments)}
        )
        call = await self.tools.invoke(name, arguments, context)
        task.tool_calls.append(call)
        self._checkpoint(task)
        await self._emit(
            task,
            "task.tool_completed",
            {
                "tool": name,
                "ok": call.ok,
                "summary": call.output_summary,
                "duration_ms": call.duration_ms,
                "policy_decision": call.policy_decision.value,
            },
        )
        self.audit.record(
            category="tool",
            action=f"{name}:{'ok' if call.ok else 'failed'}",
            actor=context.user.username,
            actor_role=context.user.role,
            task_id=task.id,
            detail={
                "arguments": _summarise(arguments),
                "summary": call.output_summary,
                "policy_decision": call.policy_decision.value,
                "duration_ms": call.duration_ms,
            },
        )
        return call

    # -- stages ------------------------------------------------------------
    async def _plan(self, task: Task, user: User) -> AgentPlan:
        assert task.profile is not None
        profile = task.profile
        available = self.tools.available_for(user, profile.sensitivity)
        catalogue = "\n".join(
            f"- {entry['name']}: {entry['description']}"
            for entry in self.tools.describe()
            if entry["name"] in available
        )
        files = "\n".join(
            f"- {stored.filename} ({stored.media_type}, {stored.size_bytes} bytes)"
            for stored in task.files
        ) or "- none"

        prompt = self.config.prompt(
            "task.plan",
            prompt=task.prompt,
            input_type=profile.input_type.value,
            task_type=profile.task_type.value,
            complexity=profile.complexity.value,
            sensitivity=profile.sensitivity.value,
            step_budget=profile.step_budget,
            files=files,
            tools=catalogue or "- none available to this role",
        )

        try:
            text, _ = await self._generate(
                task,
                user,
                stage="planning",
                system_prompt=self.config.system_prompt("planning"),
                prompt=prompt,
                format_json=True,
            )
            parsed = _parse_json(text) or {}
        except (InferenceError, NoEligibleModelError):
            parsed = {}

        steps: list[PlanStep] = []
        for index, raw in enumerate(parsed.get("steps") or [], start=1):
            if not isinstance(raw, dict):
                continue
            steps.append(
                PlanStep(
                    id=int(raw.get("id", index)),
                    action=str(raw.get("action", "reason")),
                    objective=str(raw.get("objective", "")),
                    inputs=str(raw.get("inputs")) if raw.get("inputs") else None,
                )
            )

        if not steps:
            # A deterministic plan derived from the profile, used when the model
            # returns nothing usable. The workflow is never left undefined.
            steps = self._fallback_plan(profile)

        plan = AgentPlan(
            steps=steps[: profile.step_budget],
            expected_outputs=[str(item) for item in (parsed.get("expected_outputs") or [])],
            risks=[str(item) for item in (parsed.get("risks") or [])],
            created_at=datetime.now(timezone.utc),
        )
        task.plan = plan
        self._checkpoint(task)
        await self._emit(
            task,
            "task.planned",
            {
                "steps": [step.model_dump(mode="json") for step in plan.steps],
                "expected_outputs": plan.expected_outputs,
                "risks": plan.risks,
            },
        )
        self.audit.record(
            category="agent",
            action="plan_created",
            actor=user.username,
            actor_role=user.role,
            task_id=task.id,
            detail={"step_count": len(plan.steps), "plan_version": plan.version},
        )
        return plan

    @staticmethod
    def _fallback_plan(profile: TaskProfile) -> list[PlanStep]:
        steps: list[PlanStep] = []
        index = 1
        if profile.requires_vision:
            steps.append(
                PlanStep(
                    id=index,
                    action="vision_extract",
                    objective="Read the visual input and extract its content and findings",
                )
            )
            index += 1
        if profile.requires_retrieval:
            steps.append(
                PlanStep(
                    id=index,
                    action="knowledge_search",
                    objective="Retrieve the governing local procedure and applicable clauses",
                )
            )
            index += 1
        if profile.requires_code_execution:
            steps.append(
                PlanStep(
                    id=index,
                    action="python_exec",
                    objective="Compute the required values in the sandbox",
                )
            )
            index += 1
        steps.append(
            PlanStep(
                id=index,
                action="reason",
                objective="Analyse the gathered evidence and answer the request",
            )
        )
        index += 1
        if profile.produces_deliverable:
            steps.append(
                PlanStep(
                    id=index,
                    action="document_generate",
                    objective=f"Produce the {profile.deliverable_format or 'docx'} deliverable",
                )
            )
        return steps

    async def _vision_extraction(
        self, task: Task, user: User, images: list[Path]
    ) -> tuple[dict[str, Any] | None, str]:
        prompt = self.config.prompt("task.vision_extract", prompt=task.prompt)
        text, _ = await self._generate(
            task,
            user,
            stage="vision_extraction",
            system_prompt=self.config.system_prompt("vision"),
            prompt=prompt,
            images=images,
            format_json=True,
        )
        parsed = _parse_json(text)
        return parsed, text

    async def _extract_calculations(
        self, task: Task, user: User, text: str
    ) -> list[dict[str, Any]]:
        # Every model call costs real time on a CPU host. Text asserting no
        # numeric result has nothing to recompute, so skip the round trip
        # rather than asking a model to confirm the obvious.
        if not NUMERIC_ASSERTION.search(text or ""):
            return []
        try:
            raw, _ = await self._generate(
                task,
                user,
                stage="verification",
                system_prompt=self.config.system_prompt("reasoning"),
                prompt=self.config.prompt("task.extract_calculations", text=text[:6000]),
                format_json=True,
            )
        except (InferenceError, NoEligibleModelError):
            return []
        parsed = _parse_json(raw) or {}
        calculations: list[dict[str, Any]] = []
        for entry in parsed.get("calculations") or []:
            if isinstance(entry, dict) and entry.get("expression"):
                calculations.append(entry)
        return calculations[:8]

    # -- main loop ---------------------------------------------------------
    async def run(
        self,
        task: Task,
        user: User,
        persist: Callable[[Task], None] | None = None,
    ) -> Task:
        """Execute one task.

        ``persist`` is invoked at every stage boundary so the stored record
        tracks the run. Without it a long CPU inference leaves the task frozen
        at 'classified' in the database while the agent is plainly working.
        """
        self._persist = persist
        started = datetime.now(timezone.utc)
        assert task.profile is not None
        profile = task.profile

        workspace = self.config.settings.path("workspaces") / task.id
        workspace.mkdir(parents=True, exist_ok=True)
        context = ToolContext(
            user=user,
            task_id=task.id,
            sensitivity=profile.sensitivity,
            files=task.files,
            workspace=workspace,
        )

        # Bound to the task up front: evidence gathered before a failure must
        # survive that failure, otherwise a partial run looks like it found
        # nothing at all.
        ledger = EvidenceLedger(task.evidence)
        evidence: list[EvidenceItem] = task.evidence
        extraction: dict[str, Any] | None = None
        sandbox_result: SandboxResult | None = None
        draft_content: dict[str, Any] | None = None
        answer_text = ""
        limitations: list[str] = []

        try:
            # ---------------------------------------------------- plan
            await self._stage(task, TaskStatus.PLANNED, "Producing an execution plan")
            task.plan = await self._plan(task, user)

            planned_actions = {step.action for step in task.plan.steps}

            # ----------------------------------------- vision extraction
            images = [
                Path(stored.stored_path)
                for stored in task.files
                if Path(stored.stored_path).suffix.lower()
                in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif", ".gif"}
            ]
            if profile.requires_vision and images:
                await self._stage(
                    task,
                    TaskStatus.EXECUTING,
                    f"Reading {len(images)} visual input(s) with the vision model",
                )
                self._mark_step(task, {"vision_extract", "vision_analysis"}, "running")
                extraction, raw_extraction = await self._vision_extraction(task, user, images)
                if extraction:
                    for finding in extraction.get("findings") or []:
                        ledger.add(
                            EvidenceItem(
                                id="pending",
                                source_document=task.files[0].filename if task.files else "visual input",
                                location=str(finding.get("location") or "visual observation"),
                                excerpt=str(finding.get("description", "")),
                                classification=profile.sensitivity,
                                kind="vision_extraction",
                            )
                        )
                    transcription = str(extraction.get("transcription") or "")
                    if transcription:
                        ledger.add(
                            EvidenceItem(
                                id="pending",
                                source_document=task.files[0].filename if task.files else "visual input",
                                location="transcribed content",
                                excerpt=transcription[:1500],
                                classification=profile.sensitivity,
                                kind="vision_extraction",
                            )
                        )
                    await self._emit(
                        task,
                        "task.extraction",
                        {
                            "document_type": extraction.get("document_type"),
                            "fields": extraction.get("fields", [])[:12],
                            "findings": extraction.get("findings", [])[:12],
                            "illegible": extraction.get("illegible_regions", []),
                        },
                    )
                else:
                    limitations.append(
                        "The vision model's extraction could not be parsed as structured "
                        "data; its raw reading was used instead."
                    )
                    extraction = {"transcription": raw_extraction}
                    ledger.add(
                        EvidenceItem(
                            id="pending",
                            source_document=task.files[0].filename if task.files else "visual input",
                            location="transcribed content",
                            excerpt=raw_extraction[:1500],
                            classification=profile.sensitivity,
                            kind="vision_extraction",
                        )
                    )
                self._mark_step(task, {"vision_extract", "vision_analysis"}, "done")

            # ------------------------------------------ document reading
            text_files = [
                stored
                for stored in task.files
                if Path(stored.stored_path).suffix.lower()
                not in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif", ".gif"}
            ]
            for stored in text_files:
                call = await self._call_tool(
                    task, context, "file_read", {"file_id": stored.id}
                )
                if call.ok:
                    for item in call.output.get("evidence", []):
                        ledger.add(EvidenceItem(**item))

            # ------------------------------------------------- retrieval
            if profile.requires_retrieval:
                await self._stage(
                    task, TaskStatus.RETRIEVING, "Searching the local knowledge base"
                )
                self._mark_step(task, {"knowledge_search"}, "running")
                query = task.prompt
                if extraction and extraction.get("findings"):
                    query += " " + " ".join(
                        str(finding.get("description", ""))
                        for finding in extraction["findings"][:3]
                    )
                call = await self._call_tool(
                    task, context, "knowledge_search", {"query": query[:800]}
                )
                if call.ok:
                    retrieved = ledger.extend(
                        [EvidenceItem(**item) for item in call.output.get("evidence", [])]
                    )
                    await self._emit(
                        task,
                        "task.evidence",
                        {
                            "mode": call.output.get("mode"),
                            "count": len(retrieved),
                            "items": [item.model_dump(mode="json") for item in retrieved],
                        },
                    )
                    if not retrieved:
                        limitations.append(
                            "No supporting passages were found in the local knowledge "
                            "base for this request."
                        )
                self._mark_step(task, {"knowledge_search"}, "done")

            # ------------------------------------------ code execution
            if profile.requires_code_execution or "python_exec" in planned_actions:
                await self._stage(
                    task, TaskStatus.EXECUTING, "Generating and running code in the sandbox"
                )
                self._mark_step(task, {"python_exec", "spreadsheet_analyze"}, "running")
                sandbox_result = await self._run_code_stage(task, user, context, ledger)
                self._mark_step(task, {"python_exec", "spreadsheet_analyze"}, "done")

            # ---------------------------------------------- reasoning
            await self._stage(task, TaskStatus.EXECUTING, "Reasoning over the gathered evidence")
            self._mark_step(task, {"reason", "analysis"}, "running")
            answer_text = await self._reason(task, user, evidence, extraction, sandbox_result)
            task.answer = answer_text
            self._mark_step(task, {"reason", "analysis"}, "done")

            # -------------------------------------------- verification
            await self._stage(task, TaskStatus.VERIFYING, "Verifying evidence and calculations")
            checks = [self.verifier.check_sources(answer_text, evidence)]

            calculations = await self._extract_calculations(task, user, answer_text)
            calculation_check, checked_calculations = self.verifier.check_calculations(calculations)
            checks.append(calculation_check)
            for entry in checked_calculations:
                if entry.get("recomputed") is not None:
                    ledger.add(
                        EvidenceItem(
                            id="pending",
                            source_document="independent sandbox recomputation",
                            location=str(entry.get("label", "calculation")),
                            excerpt=(
                                f"{entry.get('expression')} = {entry.get('recomputed')} "
                                f"{entry.get('units', '')}".strip()
                            ),
                            classification=profile.sensitivity,
                            kind="computation",
                        )
                    )

            checks.append(self.verifier.check_code(sandbox_result))

            # ---------------------------------------------- deliverable
            if profile.produces_deliverable:
                await self._stage(
                    task,
                    TaskStatus.EXECUTING,
                    f"Drafting the {(profile.deliverable_format or 'docx').upper()} deliverable",
                )
                self._mark_step(task, {"document_generate"}, "running")
                draft_content = await self._draft(
                    task, user, answer_text, evidence, checked_calculations
                )
                checks.append(self.verifier.check_document(draft_content, evidence))
                self._mark_step(task, {"document_generate"}, "done")

            task.verification = self.verifier.compile_report(
                checks, text=answer_text, evidence=evidence, limitations=limitations
            )
            await self._emit(
                task,
                "task.verified",
                task.verification.model_dump(mode="json"),
            )
            self.audit.record(
                category="verification",
                action="completed",
                actor=user.username,
                actor_role=user.role,
                task_id=task.id,
                detail={
                    "valid": task.verification.valid,
                    "checks": {
                        check.name: check.passed for check in task.verification.checks
                    },
                },
            )

            # ------------------------------------------------- approval
            required, reasons, approvers = self.gateway.approval_requirement(
                profile,
                prompt=task.prompt,
                verification_valid=task.verification.valid,
            )
            task.approval = ApprovalRecord(
                required=required,
                reasons=reasons,
                approver_roles=approvers,
                decision="pending" if required else None,
            )

            if required:
                # The deliverable is rendered but held unreleased until a human
                # decides. Draft content is carried on the task for the reviewer.
                if draft_content is not None:
                    await self._render_deliverable(task, context, draft_content, evidence, checked_calculations)
                await self._stage(
                    task,
                    TaskStatus.AWAITING_APPROVAL,
                    "Held for human approval before release",
                    {"reasons": reasons, "approver_roles": approvers},
                )
                self.audit.record(
                    category="approval",
                    action="requested",
                    actor=user.username,
                    actor_role=user.role,
                    task_id=task.id,
                    detail={"reasons": reasons, "approver_roles": approvers},
                )
            else:
                if draft_content is not None:
                    await self._render_deliverable(task, context, draft_content, evidence, checked_calculations)
                    for deliverable in task.deliverables:
                        deliverable.released = True
                await self._stage(task, TaskStatus.DELIVERED, "Task complete")
                task.completed_at = datetime.now(timezone.utc)

        except NoEligibleModelError as exc:
            task.status = TaskStatus.BLOCKED
            task.error = str(exc)
            await self._emit(task, "task.blocked", {"reason": str(exc)})
            self.audit.record(
                category="agent",
                action="blocked",
                actor=user.username,
                actor_role=user.role,
                task_id=task.id,
                detail={"reason": str(exc)},
            )
        except InferenceError as exc:
            task.status = TaskStatus.FAILED
            task.error = f"Local inference failed: {exc}"
            await self._emit(task, "task.failed", {"reason": task.error})
            self.audit.record(
                category="agent",
                action="failed",
                actor=user.username,
                actor_role=user.role,
                task_id=task.id,
                detail={"reason": task.error},
            )
        except Exception as exc:  # unexpected: fail safe, never silently continue
            task.status = TaskStatus.FAILED
            task.error = f"{type(exc).__name__}: {exc}"
            await self._emit(task, "task.failed", {"reason": task.error})
            self.audit.record(
                category="agent",
                action="failed",
                actor=user.username,
                actor_role=user.role,
                task_id=task.id,
                detail={"reason": task.error},
            )

        task.updated_at = datetime.now(timezone.utc)
        task.duration_ms = int((task.updated_at - started).total_seconds() * 1000)
        await self._emit(
            task,
            "task.finished",
            {"status": task.status.value, "duration_ms": task.duration_ms},
        )
        return task

    # -- stage helpers -----------------------------------------------------
    @staticmethod
    def _mark_step(task: Task, actions: set[str], status: str) -> None:
        if task.plan is None:
            return
        for step in task.plan.steps:
            if step.action in actions and (
                status != "done" or step.status in {"running", "pending"}
            ):
                step.status = status  # type: ignore[assignment]

    async def _run_code_stage(
        self,
        task: Task,
        user: User,
        context: ToolContext,
        ledger: EvidenceLedger,
    ) -> SandboxResult | None:
        assert task.profile is not None

        spreadsheets = [
            stored
            for stored in task.files
            if Path(stored.filename).suffix.lower() in {".csv", ".xlsx", ".xls"}
        ]
        context_lines: list[str] = []
        if spreadsheets:
            call = await self._call_tool(
                task, context, "spreadsheet_analyze", {"file_id": spreadsheets[0].id}
            )
            if call.ok:
                context_lines.append("Spreadsheet structure:\n" + call.output.get("stdout", "")[:2000])
        for item in ledger.items[:4]:
            context_lines.append(f"[{item.id}] {item.excerpt[:400]}")

        prompt = self.config.prompt(
            "task.generate_code",
            prompt=task.prompt,
            context="\n\n".join(context_lines) or "no additional context",
            files="\n".join(f"- {stored.filename}" for stored in task.files) or "- none",
        )
        # Generation, then execution, with a bounded retry. A small local model
        # will occasionally emit a truncated string or a NameError; feeding the
        # exact failure back is usually enough to fix it, and is far cheaper
        # than failing the whole task. The budget comes from
        # policies/approval-rules.yaml so an operator can tune it.
        attempts = int(
            self.config.approval_rules.get("verification", {}).get("max_replans", 2)
        )
        result: SandboxResult | None = None
        feedback = ""

        for attempt in range(1, max(1, attempts) + 1):
            try:
                text, _ = await self._generate(
                    task,
                    user,
                    stage="code_generation",
                    system_prompt=self.config.system_prompt("coding"),
                    prompt=prompt + feedback,
                )
            except (InferenceError, NoEligibleModelError):
                return result

            match = CODE_FENCE.search(text)
            code = match.group(1).strip() if match else text.strip()
            if not code:
                return result

            await self._emit(
                task, "task.code_generated", {"code": code, "attempt": attempt}
            )
            call = await self._call_tool(task, context, "python_exec", {"code": code})
            payload = call.output.get("result")
            if not payload:
                return result

            result = SandboxResult(**payload)
            if result.ok:
                break

            problem = (
                "\n".join(result.static_violations)
                if not result.static_validation_passed
                else result.stderr.strip()[:800]
            )
            if not problem or attempt >= attempts:
                break

            await self._emit(
                task,
                "task.code_retry",
                {"attempt": attempt, "problem": problem[:400]},
            )
            self.audit.record(
                category="agent",
                action="code_retry",
                actor=user.username,
                actor_role=user.role,
                task_id=task.id,
                detail={"attempt": attempt, "problem": problem[:400]},
            )
            feedback = (
                "\n\nYour previous attempt did not run. Fix it and return the "
                "complete corrected script.\n\nWhat went wrong:\n" + problem
            )

        if result is None:
            return None
        await self._emit(
            task,
            "task.sandbox_result",
            {
                "ok": result.ok,
                "exit_code": result.exit_code,
                "stdout": result.stdout[:4000],
                "stderr": result.stderr[:2000],
                "duration_ms": result.duration_ms,
                "static_validation_passed": result.static_validation_passed,
                "static_violations": result.static_violations,
                "network_attempts_blocked": result.network_attempts_blocked,
            },
        )
        if result.ok and result.stdout.strip():
            ledger.add(
                EvidenceItem(
                    id="pending",
                    source_document="sandbox execution",
                    location=f"exit {result.exit_code}, {result.duration_ms}ms",
                    excerpt=result.stdout[:1200],
                    classification=task.profile.sensitivity,
                    kind="computation",
                )
            )
        return result

    async def _reason(
        self,
        task: Task,
        user: User,
        evidence: list[EvidenceItem],
        extraction: dict[str, Any] | None,
        sandbox_result: SandboxResult | None,
    ) -> str:
        extraction_block = ""
        if extraction:
            extraction_block = (
                "Content extracted from the visual input by the local vision model:\n"
                + json.dumps(extraction, indent=2)[:4000]
            )
        if sandbox_result and sandbox_result.ok and sandbox_result.stdout.strip():
            extraction_block += (
                "\n\nOutput of code executed in the secure sandbox:\n"
                + sandbox_result.stdout[:2000]
            )

        evidence_block = "\n\n".join(
            f"[{item.id}] {item.source_document}"
            + (f", {item.location}" if item.location else "")
            + f"\n{item.excerpt[:900]}"
            for item in evidence[:10]
        ) or "No local evidence was retrieved."

        prompt = self.config.prompt(
            "task.reason_with_evidence",
            prompt=task.prompt,
            extraction_block=extraction_block or "No visual or computed input for this task.",
            evidence=evidence_block,
        )
        text, _ = await self._generate(
            task,
            user,
            stage="drafting",
            system_prompt=self.config.system_prompt("reasoning"),
            prompt=prompt,
        )
        await self._emit(task, "task.answer", {"answer": text})
        return text

    async def _draft(
        self,
        task: Task,
        user: User,
        analysis: str,
        evidence: list[EvidenceItem],
        calculations: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        assert task.profile is not None
        fmt = task.profile.deliverable_format or "docx"

        calculations_block = ""
        if calculations:
            calculations_block = "Independently recomputed calculations:\n" + "\n".join(
                f"- {entry.get('label')}: {entry.get('expression')} = "
                f"{entry.get('recomputed')} {entry.get('units', '')} "
                f"({'matched' if entry.get('matched') else 'DISCREPANCY'})"
                for entry in calculations
            )

        evidence_block = "\n".join(
            f"[{item.id}] {item.source_document}"
            + (f", {item.location}" if item.location else "")
            + f": {item.excerpt[:300]}"
            for item in evidence[:10]
        ) or "No evidence available."

        prompt = self.config.prompt(
            "task.draft_deliverable",
            format=fmt.upper(),
            prompt=task.prompt,
            analysis=analysis[:6000],
            evidence=evidence_block,
            calculations_block=calculations_block or "No calculations were performed.",
        )
        text, _ = await self._generate(
            task,
            user,
            stage="drafting",
            system_prompt=self.config.system_prompt("drafting"),
            prompt=prompt,
            format_json=True,
        )
        content = _parse_json(text)
        if content is None:
            # Structure the analysis deterministically rather than losing the work.
            content = {
                "title": f"{task.profile.task_type.value.replace('_', ' ').title()} — {task.id[:8]}",
                "reference": task.id[:12].upper(),
                "summary": analysis[:600],
                "sections": [{"heading": "Analysis", "body": analysis}],
                "findings": [],
                "recommendation": "See analysis above; structured drafting was unavailable.",
                "approval_statement": "Approval of the analysis as recorded.",
            }
        await self._emit(task, "task.draft", {"content": content})
        return content

    async def _render_deliverable(
        self,
        task: Task,
        context: ToolContext,
        content: dict[str, Any],
        evidence: list[EvidenceItem],
        calculations: list[dict[str, Any]],
    ) -> None:
        assert task.profile is not None
        call = await self._call_tool(
            task,
            context,
            "document_generate",
            {
                "format": task.profile.deliverable_format or "docx",
                "content": content,
                "evidence": [item.model_dump(mode="json") for item in evidence],
                "routing": task.routing,
                "verification": task.verification,
                "calculations": calculations,
            },
        )
        if call.ok and call.output.get("deliverable"):
            from backend.core.schemas import Deliverable

            deliverable = Deliverable(**call.output["deliverable"])
            task.deliverables.append(deliverable)
            await self._emit(
                task, "task.deliverable", deliverable.model_dump(mode="json")
            )
            self.audit.record(
                category="deliverable",
                action="generated",
                actor=context.user.username,
                actor_role=context.user.role,
                task_id=task.id,
                detail={
                    "filename": deliverable.filename,
                    "format": deliverable.format,
                    "sha256": deliverable.sha256,
                    "released": deliverable.released,
                },
            )


def _summarise(arguments: dict[str, Any]) -> dict[str, Any]:
    """Trim tool arguments for the timeline and audit log."""
    summary: dict[str, Any] = {}
    for key, value in arguments.items():
        if isinstance(value, str) and len(value) > 400:
            summary[key] = value[:400] + f"… ({len(value)} chars)"
        elif isinstance(value, (list, dict)):
            summary[key] = f"<{type(value).__name__} of {len(value)}>"
        else:
            summary[key] = value
    return summary


_orchestrator: AgentOrchestrator | None = None


def get_orchestrator() -> AgentOrchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = AgentOrchestrator()
    return _orchestrator
