"""In-process event bus backing the Server-Sent Events streams.

The reference architecture uses Redis for the event stream; on a single host an
asyncio fan-out queue gives the frontend the same live agent timeline without
another service. Subscribers are per-connection and bounded, so a slow browser
tab drops events instead of stalling the agent.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections import deque
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from backend.core.schemas import StreamEvent

MAX_QUEUE = 256
REPLAY_BUFFER = 400


class EventBus:
    """Fan-out of :class:`StreamEvent` to any number of live subscribers."""

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[StreamEvent]] = set()
        self._recent: deque[StreamEvent] = deque(maxlen=REPLAY_BUFFER)
        self._lock = asyncio.Lock()

    async def publish(
        self,
        event: str,
        *,
        task_id: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> StreamEvent:
        message = StreamEvent(
            event=event,
            task_id=task_id,
            at=datetime.now(timezone.utc),
            data=data or {},
        )
        self._recent.append(message)
        async with self._lock:
            subscribers = list(self._subscribers)
        for queue in subscribers:
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                # Drop for this subscriber rather than block the agent loop.
                continue
        return message

    def publish_soon(
        self,
        event: str,
        *,
        task_id: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> None:
        """Publish from synchronous code running inside the event loop's thread."""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(self.publish(event, task_id=task_id, data=data))

    @contextlib.asynccontextmanager
    async def subscribe(self) -> AsyncIterator[asyncio.Queue[StreamEvent]]:
        queue: asyncio.Queue[StreamEvent] = asyncio.Queue(maxsize=MAX_QUEUE)
        async with self._lock:
            self._subscribers.add(queue)
        try:
            yield queue
        finally:
            async with self._lock:
                self._subscribers.discard(queue)

    def replay(self, task_id: str | None = None, limit: int = 100) -> list[StreamEvent]:
        events = [
            event
            for event in self._recent
            if task_id is None or event.task_id == task_id
        ]
        return events[-limit:]

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)


_event_bus: EventBus | None = None


def get_event_bus() -> EventBus:
    global _event_bus
    if _event_bus is None:
        _event_bus = EventBus()
    return _event_bus
