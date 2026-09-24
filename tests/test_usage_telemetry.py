"""What a model call cost, recorded as measured and kept with the task.

The thread shows which model answered, its token counts, its generation
speed and how full its context window was. Every one of those has to be a
figure the runtime reported or the orchestrator timed -- and a figure that
did not arrive has to stay absent, because a zero on screen is a claim that
something took no tokens, and an absent count read as zero understates the
run it describes.

These drive the real orchestrator, client parsing and persistence against
fakes of the runtime. Nothing here performs inference.
"""

from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timezone
from typing import Any

import httpx
import pytest

from backend.agents.orchestrator import AgentOrchestrator, TaskCancelled
from backend.core.schemas import (
    ModelDescriptor,
    ModelRole,
    ModelUsage,
    RoutingDecision,
    Sensitivity,
    Task,
    TaskCreateRequest,
    TaskProfile,
    TaskStatus,
    User,
)
from backend.models_layer.client import GenerationResult, InferenceError, OllamaClient

NUM_CTX = 5120
NUM_PREDICT = 900


# ------------------------------------------------------------------ fakes
def profile(**overrides: Any) -> TaskProfile:
    """A plain question: no plan, no retrieval, no code, no deliverable."""
    base: dict[str, Any] = dict(
        input_type="text",
        task_type="question_answering",
        complexity="simple",
        sensitivity="normal",
        confidence=0.9,
        step_budget=6,
        requires_retrieval=False,
        requires_vision=False,
        requires_code_execution=False,
        produces_deliverable=False,
    )
    base.update(overrides)
    return TaskProfile(**base)


def make_task(**overrides: Any) -> Task:
    now = datetime.now(timezone.utc)
    fields: dict[str, Any] = dict(
        id=f"task-{time.perf_counter_ns()}",
        prompt="How often must V-2104 be inspected?",
        status=TaskStatus.CLASSIFIED,
        user_id="u-test",
        user_display_name="Tester",
        department="inspection",
        created_at=now,
        updated_at=now,
        profile=profile(),
    )
    fields.update(overrides)
    return Task(**fields)


USER = User(
    id="u-test",
    username="tester",
    display_name="Tester",
    role="engineer",
    department="inspection",
)

MODEL = ModelDescriptor(
    id="reason:3b",
    display_name="Reason 3B",
    family="reason",
    role=ModelRole.REASONING,
    capabilities=["text", "reasoning"],
    context_window=32768,
    parameters_b=3.0,
    approved_classifications=[Sensitivity.NORMAL, Sensitivity.CONFIDENTIAL],
    provider="ollama",
    provider_model="reason:3b",
    available=True,
)


class FakeRouter:
    """Always routes to MODEL, with the stage budgets a real call is given."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def route(
        self,
        profile: TaskProfile,
        *,
        stage: str | None = None,
        extra_capabilities: list[str] | None = None,
        preferred_model: str | None = None,
    ) -> RoutingDecision:
        self.calls.append({"stage": stage, "preferred_model": preferred_model})
        return RoutingDecision(
            requested_role=ModelRole.REASONING,
            required_capabilities=["reasoning"],
            selected_model=MODEL.id,
            selected_display_name=MODEL.display_name,
            rule="test",
            reason="test routing",
            decided_at=datetime.now(timezone.utc),
            preferred_model=preferred_model,
            preference_honoured=False if preferred_model else None,
            preference_reason=f"{preferred_model} is not in the model registry"
            if preferred_model
            else None,
        )

    async def resolve_descriptor(self, decision: RoutingDecision) -> ModelDescriptor:
        return MODEL

    def generation_options(self, model_id: str, stage: str | None = None) -> dict[str, Any]:
        return {"temperature": 0.3, "num_ctx": NUM_CTX, "num_predict": NUM_PREDICT}

    def serving_options(self, model_id: str) -> dict[str, Any]:
        return {"think": False}


class NoopManager:
    async def admit(self, descriptor: ModelDescriptor, *, actor: str, task_id: str) -> dict[str, Any]:
        return {}


class EventRecorder:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []

    async def publish(self, event: str, *, task_id: str | None = None, data: dict[str, Any] | None = None) -> None:
        self.events.append((event, data or {}))

    def named(self, name: str) -> list[dict[str, Any]]:
        return [data for event, data in self.events if event == name]


class FakeClient:
    """Stands in for the runtime. Each behaviour is consumed in call order."""

    def __init__(
        self,
        *,
        results: list[GenerationResult] | None = None,
        fragments: list[str] | None = None,
        stats: dict[str, Any] | None = None,
        fragment_delay: float = 0.0,
        generate_delay: float = 0.0,
        on_generate: Any = None,
    ) -> None:
        self.results = list(results or [])
        self.fragments = fragments or []
        self.stats = stats or {}
        self.fragment_delay = fragment_delay
        self.generate_delay = generate_delay
        self.on_generate = on_generate
        self.generate_calls: list[dict[str, Any]] = []
        self.stream_calls: list[dict[str, Any]] = []
        self.stream_closed = False
        self.generate_cancelled = False

    async def generate(self, **kwargs: Any) -> GenerationResult:
        self.generate_calls.append(kwargs)
        if self.on_generate:
            self.on_generate()
        if self.generate_delay:
            try:
                await asyncio.sleep(self.generate_delay)
            except asyncio.CancelledError:
                self.generate_cancelled = True
                raise
        return self.results.pop(0)

    async def stream(self, **kwargs: Any):
        self.stream_calls.append(kwargs)
        try:
            for fragment in self.fragments:
                if self.fragment_delay:
                    await asyncio.sleep(self.fragment_delay)
                yield fragment
            stats_out = kwargs.get("stats_out")
            if stats_out is not None:
                stats_out.update(self.stats)
        finally:
            self.stream_closed = True


def orchestrator_with(client: FakeClient, *, real_policy: bool = False) -> tuple[AgentOrchestrator, EventRecorder, FakeRouter]:
    """The real orchestrator with the runtime, router and residency faked."""
    from backend.agents.verifier import get_verification_engine
    from backend.core.audit import get_audit_log
    from backend.core.config import get_config
    from backend.policy.gateway import get_policy_gateway

    orchestrator = AgentOrchestrator.__new__(AgentOrchestrator)
    recorder = EventRecorder()
    router = FakeRouter()
    orchestrator.config = get_config()
    orchestrator.router = router  # type: ignore[assignment]
    orchestrator.client = client  # type: ignore[assignment]
    orchestrator.manager = NoopManager()  # type: ignore[assignment]
    orchestrator.gateway = get_policy_gateway()
    orchestrator.verifier = get_verification_engine()
    orchestrator.audit = get_audit_log()
    orchestrator.events = recorder  # type: ignore[assignment]
    orchestrator._persist = None
    orchestrator._is_cancelled = None
    return orchestrator, recorder, router


def blocking_result(**overrides: Any) -> GenerationResult:
    fields: dict[str, Any] = dict(
        text="The interval is set by SOP-INS-014 [S1].",
        model="reason:3b",
        latency_ms=61_000,
        prompt_eval_count=812,
        eval_count=301,
        load_duration_ns=1_200_000_000,
        prompt_eval_duration_ns=9_800_000_000,
        eval_duration_ns=50_000_000_000,
        done_reason="stop",
    )
    fields.update(overrides)
    return GenerationResult(**fields)


async def generate(orchestrator: AgentOrchestrator, task: Task, *, stream: bool) -> str:
    text, _ = await orchestrator._generate(
        task,
        USER,
        stage="drafting",
        system_prompt="system",
        prompt="prompt",
        stream_to_user=stream,
    )
    return text


# ---------------------------------------------------------- blocking calls
class TestBlockingCall:
    @pytest.mark.asyncio
    async def test_records_the_counts_and_timings_the_runtime_reported(self) -> None:
        client = FakeClient(results=[blocking_result()])
        orchestrator, recorder, _ = orchestrator_with(client)
        task = make_task()

        await generate(orchestrator, task, stream=False)

        assert len(task.usage) == 1
        usage = task.usage[0]
        assert usage.stage == "drafting"
        assert usage.model == "reason:3b"
        assert usage.display_name == "Reason 3B"
        assert usage.prompt_tokens == 812
        assert usage.output_tokens == 301
        # 301 tokens over the runtime's 50 s of generation -- not over the
        # wall clock, which also contains load and prompt processing.
        assert usage.tokens_per_second == pytest.approx(6.02)
        assert usage.context_window == NUM_CTX
        assert usage.output_limit == NUM_PREDICT
        assert usage.done_reason == "stop"
        assert usage.load_ms == 1200
        assert usage.prompt_eval_ms == 9800
        assert usage.eval_ms == 50_000
        assert usage.first_token_ms is None, "a blocking call cannot time its first token"
        assert usage.streamed is False
        assert usage.cancelled is False
        assert usage.latency_ms >= 0

    @pytest.mark.asyncio
    async def test_model_completed_carries_prompt_tokens_and_the_whole_record(self) -> None:
        client = FakeClient(results=[blocking_result()])
        orchestrator, recorder, _ = orchestrator_with(client)
        task = make_task()

        await generate(orchestrator, task, stream=False)

        [completed] = recorder.named("task.model_completed")
        assert completed["prompt_tokens"] == 812
        assert completed["output_tokens"] == 301
        assert completed["eval_count"] == 301
        assert completed["tokens_per_second"] == pytest.approx(6.02)
        assert completed["usage"] == task.usage[0].model_dump(mode="json")

    @pytest.mark.asyncio
    async def test_counts_the_runtime_did_not_report_stay_null_not_zero(self) -> None:
        """Ollama omits a zero counter; a cached prompt arrives with no count."""
        client = FakeClient(
            results=[
                blocking_result(
                    prompt_eval_count=None,
                    eval_count=None,
                    load_duration_ns=None,
                    prompt_eval_duration_ns=None,
                    eval_duration_ns=None,
                    done_reason=None,
                )
            ]
        )
        orchestrator, recorder, _ = orchestrator_with(client)
        task = make_task()

        await generate(orchestrator, task, stream=False)

        usage = task.usage[0]
        assert usage.prompt_tokens is None
        assert usage.output_tokens is None
        assert usage.tokens_per_second is None
        assert usage.load_ms is None
        assert usage.done_reason is None
        dumped = usage.model_dump(mode="json")
        assert dumped["prompt_tokens"] is None and dumped["output_tokens"] is None
        [completed] = recorder.named("task.model_completed")
        assert completed["prompt_tokens"] is None

    @pytest.mark.asyncio
    async def test_the_models_serving_options_are_sent(self) -> None:
        client = FakeClient(results=[blocking_result()])
        orchestrator, _, _ = orchestrator_with(client)

        await generate(orchestrator, make_task(), stream=False)

        assert client.generate_calls[0]["serving"] == {"think": False}
        assert client.generate_calls[0]["options"]["num_ctx"] == NUM_CTX


# ---------------------------------------------------------- streamed calls
STREAM_STATS = {
    "prompt_eval_count": 2341,
    "eval_count": 412,
    "total_duration": 95_000_000_000,
    "load_duration": 2_100_000_000,
    "prompt_eval_duration": 25_000_000_000,
    "eval_duration": 67_540_000_000,
    "done_reason": "length",
}


class TestStreamedCall:
    @pytest.mark.asyncio
    async def test_records_usage_from_the_final_chunk_and_times_the_first_token(self) -> None:
        client = FakeClient(fragments=["The ", "interval ", "is four years."], stats=STREAM_STATS)
        orchestrator, recorder, _ = orchestrator_with(client)
        task = make_task()

        text = await generate(orchestrator, task, stream=True)

        assert text == "The interval is four years."
        usage = task.usage[0]
        assert usage.streamed is True
        assert usage.prompt_tokens == 2341
        assert usage.output_tokens == 412
        assert usage.tokens_per_second == pytest.approx(412 / 67.54, abs=0.01)
        assert usage.done_reason == "length", "an answer cut off by its budget must say so"
        assert usage.load_ms == 2100
        assert usage.first_token_ms is not None and usage.first_token_ms >= 0
        assert usage.context_window == NUM_CTX

    @pytest.mark.asyncio
    async def test_the_token_protocol_is_unchanged(self) -> None:
        """Frames stay cumulative: each one carries the whole visible draft."""
        client = FakeClient(fragments=["The ", "interval ", "is four years."], stats=STREAM_STATS)
        orchestrator, recorder, _ = orchestrator_with(client)

        await generate(orchestrator, make_task(), stream=True)

        frames = [data["text"] for data in recorder.named("task.token")]
        assert frames, "the draft streamed nothing"
        assert frames[-1] == "The interval is four years."
        for earlier, later in zip(frames, frames[1:]):
            assert later.startswith(earlier)

    @pytest.mark.asyncio
    async def test_the_streaming_path_sends_the_serving_options_too(self) -> None:
        """It used to drop them, so qwen3:8b deliberated on the streamed stages."""
        client = FakeClient(fragments=["ok"], stats=STREAM_STATS)
        orchestrator, _, _ = orchestrator_with(client)

        await generate(orchestrator, make_task(), stream=True)

        assert client.stream_calls[0]["serving"] == {"think": False}

    @pytest.mark.asyncio
    async def test_a_stream_that_ends_without_a_final_chunk_reports_no_counts(self) -> None:
        client = FakeClient(fragments=["partial"], stats={})
        orchestrator, _, _ = orchestrator_with(client)
        task = make_task()

        await generate(orchestrator, task, stream=True)

        usage = task.usage[0]
        assert usage.prompt_tokens is None
        assert usage.output_tokens is None
        assert usage.tokens_per_second is None
        assert usage.first_token_ms is not None, "the first fragment was still timed"


# ----------------------------------------------------------------- the stop
class TestStop:
    @pytest.mark.asyncio
    async def test_a_stop_ends_a_streamed_call_mid_flight(self) -> None:
        # Two hundred fragments a tenth of a second apart: twenty seconds of
        # generation if nothing stops it.
        client = FakeClient(fragments=["x "] * 200, fragment_delay=0.1, stats=STREAM_STATS)
        orchestrator, _, _ = orchestrator_with(client)
        stop = {"requested": False}
        orchestrator._is_cancelled = lambda task_id: stop["requested"]
        task = make_task()

        call = asyncio.create_task(generate(orchestrator, task, stream=True))
        await asyncio.sleep(0.35)
        stop["requested"] = True
        started = time.perf_counter()
        with pytest.raises(TaskCancelled):
            await asyncio.wait_for(call, timeout=3)

        assert time.perf_counter() - started < 1.5, "the stop waited for the call to finish"
        assert client.stream_closed, "the stream was left open after the stop"
        [usage] = task.usage
        assert usage.cancelled is True
        assert usage.streamed is True
        assert usage.prompt_tokens is None and usage.output_tokens is None
        assert usage.latency_ms > 0

    @pytest.mark.asyncio
    async def test_a_stop_ends_a_blocking_call_mid_flight(self) -> None:
        client = FakeClient(results=[blocking_result()], generate_delay=30)
        orchestrator, recorder, _ = orchestrator_with(client)
        stop = {"requested": False}
        orchestrator._is_cancelled = lambda task_id: stop["requested"]
        task = make_task()

        call = asyncio.create_task(generate(orchestrator, task, stream=False))
        await asyncio.sleep(0.3)
        stop["requested"] = True
        with pytest.raises(TaskCancelled):
            await asyncio.wait_for(call, timeout=3)

        assert client.generate_cancelled, "the request was not cancelled"
        assert task.usage[0].cancelled is True
        assert recorder.named("task.model_completed") == []

    @pytest.mark.asyncio
    async def test_a_stop_requested_before_the_call_never_starts_it(self) -> None:
        client = FakeClient(results=[blocking_result()])
        orchestrator, _, _ = orchestrator_with(client)
        orchestrator._is_cancelled = lambda task_id: True
        task = make_task()

        with pytest.raises(TaskCancelled):
            await generate(orchestrator, task, stream=False)

        assert client.generate_calls == []
        # A call that never began cost nothing, so it has no usage record --
        # not a stopped one reading "0.0s".
        assert task.usage == []


# -------------------------------------------------------------- preference
class TestPreferenceReachesTheRouter:
    @pytest.mark.asyncio
    async def test_the_tasks_preferred_model_is_asked_for_and_the_answer_announced(self) -> None:
        client = FakeClient(results=[blocking_result()])
        orchestrator, recorder, router = orchestrator_with(client)
        task = make_task(preferred_model="mystery:70b")

        await generate(orchestrator, task, stream=False)

        assert router.calls[0]["preferred_model"] == "mystery:70b"
        [selected] = recorder.named("task.model_selected")
        assert selected["preferred_model"] == "mystery:70b"
        assert selected["preference_honoured"] is False
        assert selected["preference_reason"] == "mystery:70b is not in the model registry"
        assert task.routing[0].preference_honoured is False


# ------------------------------------------------------------- persistence
class TestPersistence:
    @pytest.mark.asyncio
    async def test_usage_and_preference_survive_a_round_trip_through_the_database(self) -> None:
        """A run reopened from the session rail reads the record, not the stream."""
        from backend.api.task_service import TaskService
        from backend.core.database import get_database

        client = FakeClient(fragments=["done"], stats=STREAM_STATS)
        orchestrator, _, _ = orchestrator_with(client)
        task = make_task(preferred_model="reason:3b")
        await generate(orchestrator, task, stream=True)

        service = TaskService.__new__(TaskService)
        service.db = get_database()
        service._persist(task)
        reopened = service.get_task(task.id)

        assert reopened is not None
        assert reopened.preferred_model == "reason:3b"
        assert reopened.usage == task.usage
        assert reopened.usage[0].prompt_tokens == 2341

    def test_a_record_written_before_usage_existed_still_loads(self) -> None:
        legacy = make_task().model_dump(mode="json")
        legacy.pop("usage")
        legacy.pop("preferred_model")
        restored = Task(**legacy)
        assert restored.usage == []
        assert restored.preferred_model is None

    def test_an_absurd_preference_is_refused_at_the_boundary(self) -> None:
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            TaskCreateRequest(prompt="x", preferred_model="m" * 129)


# ------------------------------------------------------------ whole runs
class TestAWholeRun:
    """The real run() loop with the runtime faked, from dispatch to the end."""

    @pytest.mark.asyncio
    async def test_every_model_call_leaves_a_usage_record_and_every_stage_names_its_phase(self) -> None:
        # Arithmetic, so the verifier has a figure to recompute and makes its
        # call; a figure merely quoted from a clause is no longer sent.
        answer = ["Wall loss is 12.0 - 10.2 = 1.8 mm, ", "a rate of 0.3 mm/yr ", "under SOP-INS-014 [S1]."]
        client = FakeClient(
            fragments=answer,
            stats=STREAM_STATS,
            results=[blocking_result(text='{"calculations": []}', prompt_eval_count=650, eval_count=40)],
        )
        orchestrator, recorder, _ = orchestrator_with(client)
        task = make_task()

        finished = await orchestrator.run(task, USER)

        assert finished.status in {TaskStatus.DELIVERED, TaskStatus.AWAITING_APPROVAL}
        assert [usage.stage for usage in finished.usage] == ["drafting", "verification"]
        drafting, verification = finished.usage
        assert drafting.streamed and drafting.prompt_tokens == 2341
        assert not verification.streamed and verification.prompt_tokens == 650

        phases = [data.get("phase") for data in recorder.named("task.stage")]
        assert "planning" in phases, "the skipped plan still reports its phase"
        assert "reasoning" in phases
        assert "verification" in phases
        assert "code_execution" not in phases, "no code ran, so no sandbox phase"
        plan_event = next(
            data for data in recorder.named("task.stage") if data.get("phase") == "planning"
        )
        assert plan_event.get("skipped") is True

    @pytest.mark.asyncio
    async def test_a_stop_during_verification_is_a_stop_not_a_failed_check(self) -> None:
        """The verification stage catches Exception, and a stop is one.

        Swallowed there, a stop pressed during the calculation check was
        filed as "figures could not be recomputed", the run carried on to
        publish a verification report, and only then noticed it had been
        stopped.
        """
        stop = {"requested": False}

        def press_stop() -> None:
            stop["requested"] = True

        client = FakeClient(
            fragments=["Wall loss is 12.0 - 10.2 = 1.8 mm [S1]."],
            stats=STREAM_STATS,
            results=[blocking_result(text='{"calculations": []}')],
            generate_delay=30,
            on_generate=press_stop,
        )
        orchestrator, recorder, _ = orchestrator_with(client)
        orchestrator._is_cancelled = lambda task_id: stop["requested"]
        task = make_task()

        finished = await asyncio.wait_for(orchestrator.run(task, USER), timeout=5)

        assert finished.status == TaskStatus.CANCELLED
        assert finished.verification is None
        assert recorder.named("task.verified") == []
        [cancelled] = recorder.named("task.cancelled")
        assert cancelled["stopped_during"] == TaskStatus.VERIFYING.value
        assert [usage.cancelled for usage in finished.usage] == [False, True]


# --------------------------------------------------------- client parsing
def mock_client(monkeypatch: pytest.MonkeyPatch, handler) -> OllamaClient:
    client = OllamaClient()

    async def transport_client(self: OllamaClient) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self.base_url, transport=httpx.MockTransport(handler))

    monkeypatch.setattr(OllamaClient, "_client", transport_client)
    return client


class TestRuntimeParsing:
    @pytest.mark.asyncio
    async def test_generate_reads_counts_and_durations(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "response": "hello",
                    "done": True,
                    "done_reason": "stop",
                    "prompt_eval_count": 12,
                    "eval_count": 5,
                    "load_duration": 3_000_000,
                    "prompt_eval_duration": 4_000_000,
                    "eval_duration": 500_000_000,
                },
            )

        result = await mock_client(monkeypatch, handler).generate(model="m", prompt="p")
        assert result.prompt_eval_count == 12
        assert result.eval_count == 5
        assert result.eval_duration_ns == 500_000_000
        assert result.tokens_per_second == pytest.approx(10.0)
        assert result.done_reason == "stop"

    @pytest.mark.asyncio
    async def test_missing_or_malformed_counters_become_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={"response": "x", "done": True, "eval_count": True, "prompt_eval_count": -3},
            )

        result = await mock_client(monkeypatch, handler).generate(model="m", prompt="p")
        assert result.prompt_eval_count is None, "a negative count is not a count"
        assert result.eval_count is None, "True must not become a token count of 1"
        assert result.eval_duration_ns is None
        assert result.tokens_per_second is None

    @pytest.mark.asyncio
    async def test_stream_fills_stats_and_sends_serving_fields(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen.update(json.loads(request.content))
            lines = [
                {"response": "Hel", "done": False},
                {"response": "lo", "done": False},
                {
                    "response": "",
                    "done": True,
                    "done_reason": "stop",
                    "prompt_eval_count": 10,
                    "eval_count": 2,
                    "eval_duration": 1_000_000_000,
                    "load_duration": 5,
                },
            ]
            body = "\n".join(json.dumps(line) for line in lines).encode()
            return httpx.Response(200, content=body)

        client = mock_client(monkeypatch, handler)
        stats: dict[str, Any] = {}
        fragments = [
            fragment
            async for fragment in client.stream(
                model="qwen3:8b", prompt="p", stats_out=stats, serving={"think": False}
            )
        ]
        assert fragments == ["Hel", "lo"]
        assert seen["think"] is False, "the streaming request dropped the serving fields"
        assert stats["prompt_eval_count"] == 10
        assert stats["eval_count"] == 2
        assert stats["eval_duration"] == 1_000_000_000
        assert stats["prompt_eval_duration"] is None, "absent, so None -- not 0"
        assert stats["done_reason"] == "stop"

    @pytest.mark.asyncio
    async def test_a_mid_stream_error_is_raised_not_mistaken_for_the_end(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            lines = [{"response": "Half an ans", "done": False}, {"error": "model runner crashed"}]
            return httpx.Response(200, content="\n".join(json.dumps(line) for line in lines).encode())

        client = mock_client(monkeypatch, handler)
        with pytest.raises(InferenceError, match="model runner crashed"):
            async for _ in client.stream(model="m", prompt="p"):
                pass


# --------------------------------------------------------- dispatch wiring
class TestDispatch:
    @pytest.mark.asyncio
    async def test_the_route_passes_the_preference_to_the_service(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from backend.api.routes import tasks as task_routes

        captured: dict[str, Any] = {}

        class Service:
            async def create_task(self, user: User, prompt: str, file_ids: list[str], fmt: str | None, **kwargs: Any) -> Task:
                captured.update(kwargs, prompt=prompt)
                return make_task(preferred_model=kwargs.get("preferred_model"))

        monkeypatch.setattr(task_routes, "get_task_service", lambda: Service())
        created = await task_routes.create_task(
            TaskCreateRequest(prompt="Why?", preferred_model="qwen3:8b"), USER
        )
        assert captured["preferred_model"] == "qwen3:8b"
        assert created.preferred_model == "qwen3:8b"

    @pytest.mark.asyncio
    async def test_the_service_stores_and_announces_the_preference(self) -> None:
        """Without starting a worker: nothing is dispatched to a model."""
        from backend.api.task_service import TaskService
        from backend.core.analyzer import get_task_analyzer
        from backend.core.audit import get_audit_log
        from backend.core.config import get_config
        from backend.core.database import get_database
        from backend.policy.gateway import get_policy_gateway

        service = TaskService.__new__(TaskService)
        service.config = get_config()
        service.db = get_database()
        service.analyzer = get_task_analyzer()
        service.gateway = get_policy_gateway()
        service.audit = get_audit_log()
        recorder = EventRecorder()
        service.events = recorder  # type: ignore[assignment]
        service._queue = asyncio.Queue()
        service._waiting = []
        service._active = None
        service._cancelled = set()

        task = await service.create_task(USER, "What does SOP-INS-014 require?", [], None, preferred_model="  qwen3:8b ")
        assert task.preferred_model == "qwen3:8b"
        assert service.get_task(task.id).preferred_model == "qwen3:8b"
        [created] = recorder.named("task.created")
        assert created["preferred_model"] == "qwen3:8b"

        automatic = await service.create_task(USER, "And SOP-MNT-022?", [], None, preferred_model="   ")
        assert automatic.preferred_model is None


class TestStopBookkeeping:
    @pytest.mark.asyncio
    async def test_a_stop_is_forgotten_once_its_run_ends_and_the_row_is_closed(self) -> None:
        """The real worker loop, with the orchestrator faked.

        A stop pressed mid-run used to stay in the service's set for the life
        of the process, and a cancelled row never received a completion time.
        """
        from backend.api.task_service import TaskService
        from backend.core.audit import get_audit_log
        from backend.core.config import get_config
        from backend.core.database import get_database
        from backend.core.identity import get_identity_service

        identity = get_identity_service()
        identity.ensure_seed_users()
        operator = next(u for u in identity.list_users() if u.username == "operator")

        service = TaskService.__new__(TaskService)
        service.config = get_config()
        service.db = get_database()
        service.audit = get_audit_log()
        service.events = EventRecorder()  # type: ignore[assignment]
        service._queue = asyncio.Queue()
        service._waiting = []
        service._active = None
        service._cancelled = set()
        service._workers = []
        service._alive = True

        task = make_task(user_id=operator.id)
        service._persist(task)

        class StoppedMidRun:
            async def run(self, running: Task, user: User, persist: Any = None) -> Task:
                service._cancelled.add(running.id)  # Stop, pressed during the run.
                running.status = TaskStatus.CANCELLED
                running.error = "Stopped at your request."
                return running

        service.orchestrator = StoppedMidRun()  # type: ignore[assignment]
        service._queue.put_nowait((task.id, operator.id))
        worker = asyncio.create_task(service._worker())
        await asyncio.wait_for(service._queue.join(), timeout=5)
        service._alive = False
        worker.cancel()

        assert task.id not in service._cancelled
        row = service.db.get_task(task.id)
        assert row is not None and row["status"] == "cancelled"
        assert row["completed_at"] is not None
