"""The answer stream must never show the reader a model's private reasoning.

`_strip_reasoning` is enough for a finished response, which can only contain
closed `<think>` blocks. A stream in flight is the harder case: it can stop
anywhere, including inside an open block or part-way through the opening tag
itself, and whatever is visible at that moment is what the reader sees.
"""

import pytest

from backend.agents.orchestrator import _visible_so_far
from backend.core.events import EventBus


class TestVisibleSoFar:
    def test_plain_text_passes_through(self):
        assert _visible_so_far("Hello world") == "Hello world"

    def test_empty_buffer(self):
        assert _visible_so_far("") == ""

    def test_closed_block_is_removed(self):
        assert _visible_so_far("<think>secret</think>Answer") == "Answer"

    def test_unclosed_block_hides_everything_after_it(self):
        # The model is mid-thought. None of it is the answer.
        assert _visible_so_far("<think>still going") == ""

    def test_unclosed_block_keeps_the_text_before_it(self):
        assert _visible_so_far("Ans<think>mid") == "Ans"

    def test_closed_then_unclosed(self):
        assert _visible_so_far("<think>a</think>X<think>b") == "X"

    def test_partial_opening_tag_is_held_back(self):
        # A fragment boundary fell between the "<" and the "think>". Showing
        # "<thi" would leak markup the next fragment turns into a block.
        assert _visible_so_far("Hello <thi") == "Hello "

    def test_bare_angle_bracket_is_held_back(self):
        assert _visible_so_far("Hello <") == "Hello "

    def test_inline_angle_bracket_survives(self):
        # Held back only at the tail, so a "<" the reader is meant to see
        # still arrives once anything follows it.
        assert _visible_so_far("a < b") == "a < b"

    def test_deltas_only_ever_grow(self):
        """The invariant the publisher relies on to compute a delta.

        Fragments are appended and the visible text recomputed from the whole
        buffer each time. If visible text could ever shrink, the slice
        `visible[len(sent):]` would silently emit nothing while the reader's
        copy kept stale text.
        """
        raw = ""
        previous = ""
        for fragment in ["The ", "answer ", "<th", "ink>no", "pe</think>", "is 42."]:
            raw += fragment
            visible = _visible_so_far(raw)
            assert visible.startswith(previous), (
                f"visible text shrank: {previous!r} -> {visible!r}"
            )
            previous = visible
        assert previous == "The answer is 42."


class TestTokenFramesAreEphemeral:
    """Token frames must not enter the replay buffer.

    A draft streams at roughly twenty frames a second. If those were kept,
    one answer would evict every structural event a reconnecting client needs,
    and replaying the surviving tail would rebuild a draft beginning
    mid-sentence -- the client appends deltas, it does not replace.
    """

    @pytest.mark.asyncio
    async def test_token_frames_are_not_replayed(self):
        bus = EventBus()
        await bus.publish("task.model_selected", task_id="t1", data={"model": "qwen3:8b"})
        for fragment in ["The ", "answer ", "is ", "42."]:
            await bus.publish("task.token", task_id="t1", data={"delta": fragment})
        await bus.publish("task.answer", task_id="t1", data={"answer": "The answer is 42."})

        replayed = [e.event for e in bus.replay(task_id="t1")]
        assert "task.token" not in replayed
        assert replayed == ["task.model_selected", "task.answer"]

    @pytest.mark.asyncio
    async def test_a_long_stream_does_not_evict_structural_events(self):
        from backend.core.events import REPLAY_BUFFER

        bus = EventBus()
        await bus.publish("task.model_selected", task_id="t1", data={})
        for i in range(REPLAY_BUFFER * 2):
            await bus.publish("task.token", task_id="t1", data={"delta": f"{i} "})

        replayed = [e.event for e in bus.replay(task_id="t1")]
        assert replayed == ["task.model_selected"], (
            "a long draft pushed the structural events out of the replay buffer"
        )

    @pytest.mark.asyncio
    async def test_live_subscribers_still_receive_token_frames(self):
        """Excluded from replay, never from the live fan-out."""
        bus = EventBus()
        async with bus.subscribe() as queue:
            await bus.publish("task.token", task_id="t1", data={"delta": "hi"})
            event = await queue.get()
        assert event.event == "task.token"
        assert event.data["delta"] == "hi"
