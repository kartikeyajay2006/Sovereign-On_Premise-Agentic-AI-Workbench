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

import asyncio
import contextlib
import json
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, TypeVar

from backend.agents.verifier import get_verification_engine
from backend.core.audit import get_audit_log
from backend.core.config import get_config
from backend.core.events import get_event_bus
from backend.core.schemas import (
    AgentPlan,
    ApprovalRecord,
    EvidenceItem,
    ModelDescriptor,
    ModelRole,
    ModelUsage,
    PlanStep,
    PolicyDecision,
    RoutingDecision,
    SandboxResult,
    Sensitivity,
    StoredFile,
    Task,
    TaskProfile,
    TaskStatus,
    TaskType,
    ToolCall,
    User,
    VerificationCheck,
    VerificationReport,
)
from backend.models_layer.client import (
    GenerationResult,
    InferenceError,
    get_inference_client,
)
from backend.models_layer.manager import get_model_manager
from backend.models_layer.registry import get_model_registry
from backend.models_layer.router import NoEligibleModelError, get_model_router
from backend.policy.gateway import get_policy_gateway
from backend.tools.registry import ToolContext, get_tool_registry

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif", ".gif"}
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

# Arithmetic worth recomputing: an explicit result, an operation between
# figures, or the words a computed quantity travels with. A figure merely
# quoted from a clause -- "24 months", "20%" -- carries none of these, and
# asking a model to extract calculations from it cost 15 to 37 seconds on this
# host to learn there were none.
ARITHMETIC_SIGNAL = re.compile(
    r"=\s*-?\d"
    r"|\d\s*[-+×x*/÷]\s*\d"
    r"|\b(?:rate|remaining life|calculated|computed|recomputed|per year|mm/y(?:ea)?r|/yr)\b",
    re.IGNORECASE,
)

#: How often an in-flight model call looks for a stop request. A call is one
#: HTTP request that runs for minutes on this host, so this, not the stage
#: boundary, is what bounds how long Stop takes to be honoured.
CANCEL_POLL_SECONDS = 0.25

_T = TypeVar("_T")


class TaskCancelled(RuntimeError):
    """Raised when the person who asked for a task asks it to stop."""

    def __init__(self, task_id: str) -> None:
        super().__init__(f"Task {task_id} was stopped by request")


def _option_int(options: dict[str, Any], key: str) -> int | None:
    """A positive integer generation option, or None when it was not sent."""
    value = options.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return None
    return value


def _ms(nanoseconds: int | None) -> int | None:
    return None if nanoseconds is None else int(round(nanoseconds / 1_000_000))


def _usage_record(
    *,
    stage: str,
    descriptor: ModelDescriptor,
    options: dict[str, Any],
    latency_ms: int,
    started_at: datetime,
    streamed: bool,
    result: GenerationResult | None = None,
) -> ModelUsage:
    """One call's usage. With no result the call was stopped, and says so.

    Every count is copied as the runtime reported it, None included; nothing
    here substitutes a zero for a figure that did not arrive.
    """
    return ModelUsage(
        stage=stage,
        model=descriptor.id,
        display_name=descriptor.display_name,
        prompt_tokens=result.prompt_eval_count if result else None,
        output_tokens=result.eval_count if result else None,
        latency_ms=latency_ms,
        tokens_per_second=result.tokens_per_second if result else None,
        context_window=_option_int(options, "num_ctx"),
        output_limit=_option_int(options, "num_predict"),
        done_reason=result.done_reason if result else None,
        first_token_ms=result.first_token_ms if result else None,
        load_ms=_ms(result.load_duration_ns) if result else None,
        prompt_eval_ms=_ms(result.prompt_eval_duration_ns) if result else None,
        eval_ms=_ms(result.eval_duration_ns) if result else None,
        streamed=streamed,
        cancelled=result is None,
        started_at=started_at,
    )


def _needs_plan(profile: TaskProfile, files: list[StoredFile]) -> bool:
    """Whether this task's work branches enough to be worth planning.

    A plan earns its cost when there is more than one way through: code to
    run, a drawing to read, a document to produce, or attachments whose
    handling depends on what they are. A single retrieval question has one
    route, and planning it was costing 79 seconds of a 200-second run for an
    artifact no client renders.
    """
    return bool(
        profile.requires_code_execution
        or profile.requires_vision
        or profile.produces_deliverable
        or files
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


def _raised_reason(items: list[EvidenceItem], level: Sensitivity) -> str:
    """An approval reason naming the evidence that raised a run's class.

    Written as the policy engine writes its own ("rule: description"), so the
    screens that already split and render those reasons show it unchanged.
    A document is named by its code, the part of the source before the
    title, which is how the corpus and the demo script refer to it.
    """
    ids = ", ".join(item.id for item in items)
    documents: list[str] = []
    for item in items:
        code = item.source_document.split(" — ")[0].strip()
        if code and code not in documents:
            documents.append(code)
    source = f"{ids} ({', '.join(documents)})" if documents else ids
    verb = "is" if len(items) == 1 else "are"
    return (
        f"classification_raised: Evidence {source} {verb} {level.value}, "
        f"so the run is {level.value} too."
    )


def _pdf_has_text(path: Path) -> bool:
    from backend.rag.parsing import has_extractable_text

    try:
        return has_extractable_text(path)
    except Exception:
        return True


def _strip_reasoning(text: str) -> str:
    """Remove chain-of-thought blocks some reasoning models emit."""
    return THINK_BLOCK.sub("", text or "").strip()


def _visible_so_far(raw: str) -> str:
    """The part of a partial stream that is safe to show the reader.

    `_strip_reasoning` only removes *closed* `<think>` blocks, which is all a
    finished response can contain. A stream in flight can also end part-way
    into an open one, so everything from an unclosed opener onward is dropped
    too -- otherwise the reader watches the model think.

    A trailing partial tag is held back for the same reason: `<thi` at the end
    of the buffer may be the start of an opener, and showing it would leak a
    fragment of markup that the next fragment turns into a block.
    """
    visible = THINK_BLOCK.sub("", raw or "")
    opener = visible.find("<think>")
    if opener != -1:
        visible = visible[:opener]
    # Hold back a trailing prefix of "<think>" that may still be completed.
    tail = visible[-7:]
    for cut in range(len(tail), 0, -1):
        if "<think>".startswith(tail[-cut:]):
            visible = visible[:-cut]
            break
    return visible


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
        # Set by the task service; asked between stages so a run stops at a
        # clean boundary rather than being torn down mid-write.
        self._is_cancelled: Callable[[str], bool] | None = None

    def _checkpoint(self, task: Task) -> None:
        """Write the in-flight task record, ignoring storage hiccups."""
        if self._persist is None:
            return
        try:
            self._persist(task)
        except Exception:
            # Losing a checkpoint must not abort a run that is otherwise fine.
            pass

    def _check_cancelled(self, task: Task) -> bool:
        return bool(self._is_cancelled and self._is_cancelled(task.id))

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
        *,
        phase: str | None = None,
    ) -> None:
        """Enter a stage, announcing it.

        `phase` names which piece of work is starting, because `status` does
        not: reading a scan, running code, reasoning and drafting a document
        are all EXECUTING. A client that mapped status alone to a stage row
        lit the sandbox row for plain reasoning and then marked it done, on a
        run that never touched the sandbox.
        """
        if self._check_cancelled(task):
            raise TaskCancelled(task.id)
        task.status = status
        task.updated_at = datetime.now(timezone.utc)
        self._checkpoint(task)
        payload: dict[str, Any] = {"status": status.value, "message": message, **(data or {})}
        if phase:
            payload["phase"] = phase
        await self._emit(task, "task.stage", payload)

    async def _until_stopped(self, task: Task, work: Awaitable[_T]) -> _T:
        """Await one model call, abandoning it as soon as a stop is requested.

        Stop used to be honoured only between stages, and a stage on this
        host is one model call that runs for minutes: pressing Stop during a
        ninety-second draft did nothing for ninety seconds and then stopped a
        run that had already paid for the expensive part. Cancelling the
        request closes its connection, which is what tells the runtime to
        stop generating as well.
        """
        if self._check_cancelled(task):
            # Asked to stop before the call began: do not begin it.
            if asyncio.iscoroutine(work):
                work.close()
            raise TaskCancelled(task.id)
        job = asyncio.ensure_future(work)
        try:
            while True:
                done, _ = await asyncio.wait({job}, timeout=CANCEL_POLL_SECONDS)
                if done:
                    return job.result()
                if self._check_cancelled(task):
                    job.cancel()
                    # Waited on rather than awaited, so this task's own
                    # cancellation (a worker shutdown) still propagates.
                    await asyncio.wait({job})
                    if not job.cancelled():
                        # Retrieved, so an error raised while the call was
                        # being torn down is not reported as an unhandled one.
                        job.exception()
                    raise TaskCancelled(task.id)
        except asyncio.CancelledError:
            # The worker itself is stopping: take the request down with it.
            job.cancel()
            raise

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
        stream_to_user: bool = False,
    ) -> tuple[str, RoutingDecision]:
        """Route to a model for this stage, enforce model policy, then generate.

        `stream_to_user` publishes each fragment as `task.token` while the
        model is still producing. Only the stage whose text the reader will
        actually read should set it: the planning and verification stages run
        against the same models, and streaming those into the answer pane
        would show the reader a draft of reasoning they were never meant to
        see mistaken for the answer.
        """
        assert task.profile is not None
        decision = await self.router.route(
            task.profile,
            stage=stage,
            extra_capabilities=["vision"] if images else None,
            preferred_model=task.preferred_model,
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
                "preferred_model": decision.preferred_model,
                "preference_honoured": decision.preference_honoured,
                "preference_reason": decision.preference_reason,
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

        # Admission can take seconds when it has to evict a model. A stop that
        # arrived meanwhile ends the run here, before the audit trail records
        # an inference that is never going to start.
        if self._check_cancelled(task):
            raise TaskCancelled(task.id)

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

        # Resolved once and used for both the call and its usage record, so
        # the window the record reports is the window the call was given.
        options = self.router.generation_options(descriptor.id, stage=stage)
        serving = self.router.serving_options(descriptor.id)
        started_at = datetime.now(timezone.utc)
        started = time.perf_counter()
        try:
            if stream_to_user:
                result = await self._until_stopped(
                    task,
                    self._generate_streaming(
                        task,
                        model=descriptor.provider_model,
                        prompt=prompt,
                        system_prompt=system_prompt,
                        images=images,
                        options=options,
                        serving=serving,
                        stage=stage,
                        format_json=format_json,
                    ),
                )
            else:
                result = await self._until_stopped(
                    task,
                    self.client.generate(
                        model=descriptor.provider_model,
                        prompt=prompt,
                        system=system_prompt,
                        images=images,
                        options=options,
                        serving=serving,
                        format_json=format_json,
                    ),
                )
        except TaskCancelled:
            # The call consumed real time before it was stopped, so it is on
            # the record -- with its wall clock and no counts, because the
            # runtime reports counts only in the message a stopped call never
            # sends.
            stopped = _usage_record(
                stage=stage,
                descriptor=descriptor,
                options=options,
                latency_ms=int((time.perf_counter() - started) * 1000),
                started_at=started_at,
                streamed=stream_to_user,
            )
            task.usage.append(stopped)
            self._checkpoint(task)
            self.audit.record(
                category="model",
                action="inference_cancelled",
                actor=user.username,
                actor_role=user.role,
                task_id=task.id,
                detail={
                    "stage": stage,
                    "model": descriptor.id,
                    "latency_ms": stopped.latency_ms,
                },
            )
            raise

        usage = _usage_record(
            stage=stage,
            descriptor=descriptor,
            options=options,
            latency_ms=int((time.perf_counter() - started) * 1000),
            started_at=started_at,
            streamed=stream_to_user,
            result=result,
        )
        task.usage.append(usage)
        self._checkpoint(task)
        await self._emit(
            task,
            "task.model_completed",
            {
                "stage": stage,
                "model": descriptor.id,
                "latency_ms": usage.latency_ms,
                "tokens_per_second": usage.tokens_per_second,
                "eval_count": usage.output_tokens,
                "prompt_tokens": usage.prompt_tokens,
                "output_tokens": usage.output_tokens,
                # The whole record, so a live client shows exactly what a
                # reopened run will read back from the task.
                "usage": usage.model_dump(mode="json"),
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
                "latency_ms": usage.latency_ms,
                "output_chars": len(result.text),
                "prompt_tokens": usage.prompt_tokens,
                "output_tokens": usage.output_tokens,
                "done_reason": usage.done_reason,
            },
        )
        return _strip_reasoning(result.text), decision

    async def _generate_streaming(
        self,
        task: Task,
        *,
        model: str,
        prompt: str,
        system_prompt: str,
        images: list[Path] | None,
        options: dict[str, Any],
        stage: str,
        format_json: bool = False,
        serving: dict[str, Any] | None = None,
    ) -> GenerationResult:
        """Stream one stage, publishing `task.token` as the text arrives.

        Two things make this more than a loop over fragments.

        A reasoning model emits `<think>` blocks the reader must never see,
        and a fragment boundary can fall anywhere -- including between the
        `<` and the `think>`. So the visible text is recomputed from the whole
        raw buffer each time rather than filtered per fragment: closed blocks
        are removed, and an unclosed one truncates everything after it. The
        delta published is whatever that leaves beyond what was already sent,
        which is correct however the fragments happen to split.

        Fragments also arrive far faster than a reader reads. Publishing each
        one would put thousands of SSE frames on the wire for a single answer,
        so they are coalesced into roughly 20 frames a second: still
        continuous to the eye, two orders of magnitude cheaper.
        """
        raw = ""
        sent = ""
        stats: dict[str, Any] = {}
        started = time.perf_counter()
        # Load plus prompt processing: the wait before anything could appear.
        first_token_ms: int | None = None
        last_flush = 0.0
        FLUSH_INTERVAL = 0.05

        async def flush() -> None:
            nonlocal sent
            visible = _visible_so_far(raw)
            if len(visible) > len(sent):
                sent = visible
                # The whole visible text, not the delta since the last frame.
                #
                # A delta protocol cannot survive a dropped frame, and frames
                # do get dropped: the client's EventSource is torn down when
                # its task id or enabled flag changes and reconnects on any
                # error, and token frames are deliberately excluded from the
                # replay buffer. A client that missed one frame would append
                # the next onto a gap and render a draft that silently begins
                # mid-sentence -- observed losing the first 22 characters of
                # an answer.
                #
                # Sending the cumulative text makes every frame a complete
                # repair of the one before it. The cost is bytes on a loopback
                # connection, which is the cheapest thing this system spends.
                await self._emit(task, "task.token", {"stage": stage, "text": visible})

        # aclosing, so that however this loop ends -- including a stop that
        # cancels this coroutine between fragments -- the generator is closed
        # at once, which closes the connection and ends the runtime's work,
        # rather than whenever the garbage collector finalises it.
        async with contextlib.aclosing(
            self.client.stream(
                model=model,
                prompt=prompt,
                system=system_prompt,
                images=images,
                options=options,
                format_json=format_json,
                stats_out=stats,
                serving=serving,
            )
        ) as fragments:
            async for fragment in fragments:
                if first_token_ms is None:
                    first_token_ms = int((time.perf_counter() - started) * 1000)
                raw += fragment
                now = time.perf_counter()
                if now - last_flush >= FLUSH_INTERVAL:
                    last_flush = now
                    await flush()

        await flush()

        return GenerationResult.from_runtime(
            text=raw,
            model=model,
            latency_ms=int((time.perf_counter() - started) * 1000),
            stats=stats,
            first_token_ms=first_token_ms,
        )

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

    def _visual_inputs(
        self, task: Task, workspace: Path, limitations: list[str]
    ) -> list[Path]:
        """Everything the vision model should look at.

        Images are obvious. Scanned PDFs are the case that matters: a scan
        carries no text layer, so it must be rendered to pages and read. Before
        this the analyzer would mark such a document as needing vision, the
        orchestrator would find no image, and the reading step was silently
        skipped — the platform could not read the very thing it exists to read.

        A born-digital PDF keeps the text path, which is faster and exact.
        """
        from backend.rag.parsing import ParsingError, has_extractable_text, rasterize_pdf

        visual: list[Path] = []
        for stored in task.files:
            path = Path(stored.stored_path)
            suffix = path.suffix.lower()

            if suffix in IMAGE_SUFFIXES:
                visual.append(path)
                continue

            if suffix == ".pdf" and not has_extractable_text(path):
                try:
                    pages = rasterize_pdf(path, workspace / "pages")
                except (ParsingError, Exception) as exc:
                    limitations.append(
                        f"'{stored.filename}' appears to be a scan but could not be "
                        f"rendered for the vision model: {exc}"
                    )
                    continue
                if pages:
                    visual.extend(pages)
                    self.audit.record(
                        category="tool",
                        action="pdf_rasterized",
                        actor=task.user_display_name or "system",
                        task_id=task.id,
                        detail={
                            "filename": stored.filename,
                            "pages_rendered": len(pages),
                            "reason": "no extractable text; treated as a scan",
                        },
                    )
        return visual

    def _record_extraction(
        self,
        task: Task,
        ledger: EvidenceLedger,
        extraction: dict[str, Any] | None,
        raw_extraction: str,
        limitations: list[str],
    ) -> None:
        """Turn what the vision model read into citable evidence."""
        assert task.profile is not None
        source = task.files[0].filename if task.files else "visual input"

        if not extraction:
            limitations.append(
                "The vision model's extraction could not be parsed as structured "
                "data; its raw reading was used instead."
            )
            ledger.add(
                EvidenceItem(
                    id="pending",
                    source_document=source,
                    location="transcribed content",
                    excerpt=raw_extraction[:1500],
                    classification=task.profile.sensitivity,
                    kind="vision_extraction",
                )
            )
            return

        for finding in extraction.get("findings") or []:
            ledger.add(
                EvidenceItem(
                    id="pending",
                    source_document=source,
                    location=str(finding.get("location") or "visual observation"),
                    excerpt=str(finding.get("description", "")),
                    classification=task.profile.sensitivity,
                    kind="vision_extraction",
                )
            )

        transcription = str(extraction.get("transcription") or "")
        if transcription:
            ledger.add(
                EvidenceItem(
                    id="pending",
                    source_document=source,
                    location="transcribed content",
                    excerpt=transcription[:1500],
                    classification=task.profile.sensitivity,
                    kind="vision_extraction",
                )
            )

    # -- stages ------------------------------------------------------------
    async def _plan(
        self,
        task: Task,
        user: User,
        *,
        extraction: dict[str, Any] | None = None,
    ) -> AgentPlan:
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

        # Planning happens after the scan has been read, so the plan can refer
        # to what the document actually contains rather than guessing.
        if extraction:
            document_type = str(extraction.get("document_type") or "document")
            findings = [
                str(finding.get("description", ""))
                for finding in (extraction.get("findings") or [])[:4]
            ]
            files += f"\n\nAlready read from the visual input ({document_type}):"
            for finding in findings:
                files += f"\n  - {finding[:160]}"
            if not findings:
                files += "\n  - content transcribed; no discrete findings listed"

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
                # 79 seconds of the measured run, generating 1218 characters
                # the reader never saw. The text is JSON and is never shown as
                # prose -- the client counts these frames to report real
                # progress instead of leaving the stage blank.
                stream_to_user=True,
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
        if not ARITHMETIC_SIGNAL.search(text or ""):
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

        if profile.task_type == TaskType.CONVERSATION:
            return await self._converse(task, user, started)

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
            images = self._visual_inputs(task, workspace, limitations)
            reads_images = bool(profile.requires_vision and images)

            # Read the visual input before planning when there is one.
            #
            # Two reasons. Only one generation model fits in memory on a modest
            # host, so planning first means loading the reasoning model,
            # evicting it for the vision model, then loading it again — a
            # multi-gigabyte round trip for nothing. And a plan written after
            # the document has been read is a better plan.
            if reads_images:
                await self._stage(
                    task,
                    TaskStatus.EXECUTING,
                    f"Reading {len(images)} visual input(s) with the vision model",
                    phase="vision_extraction",
                )
                extraction, raw_extraction = await self._vision_extraction(
                    task, user, images
                )
                self._record_extraction(task, ledger, extraction, raw_extraction, limitations)
                if extraction:
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

            # ---------------------------------------------------- plan
            #
            # Planned only when there is something to plan.
            #
            # This ran unconditionally and was the most expensive stage of
            # every run -- 79 seconds of a 200-second measured run, producing
            # 1218 characters of JSON. What consumed it was one membership
            # test, `"python_exec" in planned_actions`, sitting beside a
            # `profile.requires_code_execution` that the classifier had
            # already computed; `_mark_step` wrote statuses onto steps no
            # client renders, since the frontend subscribes to `task.planned`
            # and reads nothing from its payload.
            #
            # So a single-step retrieval question spent two fifths of its
            # wall-clock deciding how to answer a question that has one way
            # to be answered. A plan earns its cost when the work branches:
            # code to run, files to read, or a document to produce.
            #
            # Deliberately not keyed on `step_budget`: that is a ceiling the
            # classifier allows, not an estimate of what the task needs. A
            # one-sentence retrieval question comes back with a budget of 14,
            # so any test against it would keep planning for everything.
            needs_plan = _needs_plan(profile, task.files)

            if needs_plan:
                await self._stage(
                    task, TaskStatus.PLANNED, "Producing an execution plan", phase="planning"
                )
                task.plan = await self._plan(task, user, extraction=extraction)
                planned_actions = {step.action for step in task.plan.steps}
            else:
                # Said, not silently skipped. A stage that did not run must
                # report that it did not run: this pipeline's claim is that
                # the log accounts for every stage, and a plan quietly absent
                # would leave a reader to assume one was made.
                task.plan = None
                planned_actions = set()
                await self._stage(
                    task,
                    TaskStatus.PLANNED,
                    "No plan required: a single retrieval step with no code, files or deliverable",
                    {"skipped": True},
                    phase="planning",
                )

            if reads_images:
                self._mark_step(task, {"vision_extract", "vision_analysis"}, "done")

            # ------------------------------------------ document reading
            text_files = [
                stored
                for stored in task.files
                if Path(stored.stored_path).suffix.lower() not in IMAGE_SUFFIXES
                # A scan already read by the vision model has no text to parse.
                and not (
                    Path(stored.stored_path).suffix.lower() == ".pdf"
                    and reads_images
                    and not _pdf_has_text(Path(stored.stored_path))
                )
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
                    task,
                    TaskStatus.RETRIEVING,
                    "Searching the local knowledge base",
                    phase="retrieval",
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
                    task,
                    TaskStatus.EXECUTING,
                    "Generating and running code in the sandbox",
                    phase="code_execution",
                )
                self._mark_step(task, {"python_exec", "spreadsheet_analyze"}, "running")
                sandbox_result = await self._run_code_stage(task, user, context, ledger)
                self._mark_step(task, {"python_exec", "spreadsheet_analyze"}, "done")

            # ---------------------------------------------- reasoning
            await self._stage(
                task,
                TaskStatus.EXECUTING,
                "Reasoning over the gathered evidence",
                phase="reasoning",
            )
            self._mark_step(task, {"reason", "analysis"}, "running")
            answer_text = await self._reason(task, user, evidence, extraction, sandbox_result)
            task.answer = answer_text
            self._mark_step(task, {"reason", "analysis"}, "done")

            # -------------------------------------------- verification
            await self._stage(
                task,
                TaskStatus.VERIFYING,
                "Verifying evidence and calculations",
                phase="verification",
            )

            # Verification reads model output, which is untrusted: a figure
            # returned as "19.9 mm" once crashed a run that had otherwise
            # succeeded. A check that cannot complete is reported as a failed
            # check, never as a failed task — refusing to verify is a result.
            checks: list[VerificationCheck] = []
            try:
                checks.append(self.verifier.check_sources(answer_text, evidence))
            except Exception as exc:
                checks.append(
                    VerificationCheck(
                        name="source_verification",
                        kind="source",
                        passed=False,
                        detail=f"This check could not be completed: {exc}",
                    )
                )

            checked_calculations: list[dict[str, Any]] = []
            try:
                calculations = await self._extract_calculations(task, user, answer_text)
                calculation_check, checked_calculations = self.verifier.check_calculations(
                    calculations
                )
                checks.append(calculation_check)
            except TaskCancelled:
                # A stop is not a check that failed. Caught by the clause
                # below it would have been filed in the verification report
                # as "figures could not be recomputed", on a run that went on
                # to report itself verified-then-cancelled.
                raise
            except Exception as exc:
                checks.append(
                    VerificationCheck(
                        name="calculation_verification",
                        kind="calculation",
                        passed=False,
                        detail=f"Figures could not be recomputed: {exc}",
                    )
                )
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
                    phase="deliverable",
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

            # ------------------------------------------ classification
            #
            # An answer is at least as sensitive as the most sensitive thing
            # it was built from. The profile's classification was set from the
            # prompt and the attachments alone, so an engineer's question
            # answered out of a Restricted design memo stayed "normal": it was
            # not held, and any deliverable was stamped with a class below the
            # material inside it. Retrieval already refused evidence above the
            # user's clearance; this is the other half -- what was admitted
            # raises the output to its own level before the approval gate
            # reads it. It only ever rises.
            raised = self._classification_of_evidence(task.evidence)
            raised_by: list[EvidenceItem] = []
            if raised is not None and self.config.classification_rank(
                raised.value
            ) > self.config.classification_rank(profile.sensitivity.value):
                previous = profile.sensitivity
                profile = profile.model_copy(update={"sensitivity": raised})
                task.profile = profile
                self._checkpoint(task)
                raised_by = [item for item in task.evidence if item.classification == raised]
                self.audit.record(
                    category="policy",
                    action="classification_raised",
                    actor=user.username,
                    actor_role=user.role,
                    task_id=task.id,
                    detail={
                        "from": previous.value,
                        "to": raised.value,
                        "because": [item.id for item in raised_by],
                    },
                )
                await self._emit(
                    task,
                    "task.classified",
                    {
                        "sensitivity": raised.value,
                        "raised_from": previous.value,
                        "reason": "evidence used in the answer is classified higher",
                    },
                )

            # ------------------------------------------------- approval
            required, reasons, approvers = self.gateway.approval_requirement(
                profile,
                prompt=task.prompt,
                verification_valid=task.verification.valid,
            )
            # The gate's own reason says only that sensitive or restricted
            # work needs an authority. When the class came from the evidence
            # rather than the request, a reader saw "4 of 4 checks passed"
            # beside HELD and had no way to learn that retrieval had admitted
            # a Restricted design memo. The reason now names it, ahead of the
            # rule it triggered.
            if raised_by and any(r.startswith("sensitive_classification") for r in reasons):
                reasons = [_raised_reason(raised_by, profile.sensitivity), *reasons]
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

        except TaskCancelled:
            # Read before it is overwritten: the audit record said "stopped
            # during: cancelled", which is true of every cancelled run.
            stopped_during = task.status.value
            task.status = TaskStatus.CANCELLED
            task.error = "Stopped at your request."
            await self._emit(
                task,
                "task.cancelled",
                {"reason": "stopped by request", "stopped_during": stopped_during},
            )
            self.audit.record(
                category="agent",
                action="cancelled",
                actor=user.username,
                actor_role=user.role,
                task_id=task.id,
                detail={"stage": stopped_during},
            )
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

    async def _converse(self, task: Task, user: User, started: datetime) -> Task:
        """Answer a conversational message in one short model call.

        A greeting went through the whole pipeline: retrieval, a 1,236-token
        drafting prompt, a verification call, and a hold -- 140 seconds on
        this host to answer "Hi", which ended waiting for a reviewer. It makes
        no claims, so there is nothing to retrieve for, nothing to verify and
        nothing to hold. It still goes through model routing and policy like
        every call, streams like every answer, and is recorded: the verifier's
        report says plainly that no checks were run and why.
        """
        try:
            await self._stage(task, TaskStatus.EXECUTING, "Replying", phase="drafting")
            text, _ = await self._generate(
                task,
                user,
                stage="drafting",
                system_prompt=self.config.system_prompt("conversation"),
                prompt=task.prompt,
                stream_to_user=True,
            )
            text = text.strip()
            await self._emit(task, "task.answer", {"answer": text})
            task.answer = text
            task.verification = VerificationReport(
                valid=True,
                checks=[],
                limitations=[
                    "Conversational reply: nothing was retrieved and no claims were checked, "
                    "because the message asked for none."
                ],
                completed_at=datetime.now(timezone.utc),
            )
            task.approval = ApprovalRecord(required=False)
            self.audit.record(
                category="agent",
                action="conversational_reply",
                actor=user.username,
                actor_role=user.role,
                task_id=task.id,
                detail={"characters": len(text)},
            )
            await self._stage(task, TaskStatus.DELIVERED, "Replied")
            task.completed_at = datetime.now(timezone.utc)
        except TaskCancelled:
            task.status = TaskStatus.CANCELLED
            task.error = "Stopped at your request."
            await self._emit(task, "task.cancelled", {"reason": "stopped by request", "stopped_during": "executing"})
        except NoEligibleModelError as exc:
            task.status = TaskStatus.BLOCKED
            task.error = str(exc)
            await self._emit(task, "task.blocked", {"reason": str(exc)})
        except InferenceError as exc:
            task.status = TaskStatus.FAILED
            task.error = f"Local inference failed: {exc}"
            await self._emit(task, "task.failed", {"reason": task.error})
        task.updated_at = datetime.now(timezone.utc)
        task.duration_ms = int((task.updated_at - started).total_seconds() * 1000)
        await self._emit(task, "task.finished", {"status": task.status.value, "duration_ms": task.duration_ms})
        return task

    # -- stage helpers -----------------------------------------------------
    def _classification_of_evidence(self, evidence: list[EvidenceItem]) -> Sensitivity | None:
        """The most sensitive classification among the evidence, if any.

        Ranked by the configured classification levels, not by enum order,
        so the policy file stays the one place the ordering is defined.
        """
        if not evidence:
            return None
        return max(
            (item.classification for item in evidence),
            key=lambda level: self.config.classification_rank(level.value),
        )

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
            # Compact, not pretty-printed: indentation is tokens, and tokens
            # are both wall-clock time and cache on a CPU host.
            extraction_block = (
                "Content extracted from the visual input by the local vision model:\n"
                + json.dumps(extraction, separators=(",", ":"))[:2500]
            )
        if sandbox_result and sandbox_result.ok and sandbox_result.stdout.strip():
            extraction_block += (
                "\n\nOutput of code executed in the secure sandbox:\n"
                + sandbox_result.stdout[:2000]
            )

        evidence_block = "\n\n".join(
            f"[{item.id}] {item.source_document}"
            + (f", {item.location}" if item.location else "")
            + f"\n{item.excerpt[:500]}"
            for item in evidence[:6]
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
            # The one stage whose output the reader reads as the answer.
            stream_to_user=True,
        )
        # Still emitted: `task.token` carries the text as it arrives, but a
        # client that joined late, missed frames, or reloaded has no way to
        # rebuild it. This is the authoritative copy and the one that is
        # persisted.
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
