'use client'

import { useEffect, useRef, useState } from 'react'
import type { StreamEvent } from '@/lib/types'

export interface EventStreamOptions {
  taskId?: string | null
  enabled?: boolean
  onEvent?: (event: StreamEvent) => void
}

/**
 * Subscribe to the backend's server-sent event stream.
 *
 * Rendering cost is a correctness concern here, not a polish one. The event
 * bus in backend/core/events.py holds MAX_QUEUE = 256 per subscriber and
 * drops events for a subscriber that cannot keep up, rather than blocking the
 * agent loop. A tab that spends its time re-rendering is a tab that silently
 * loses stage and evidence events — on a product whose claim is the
 * completeness of the record.
 *
 * This hook previously called setLastEvent on every message, forcing a React
 * render per event. Nothing consumed the value: all three call sites
 * (console-view, ask-view, security-view) pass onEvent and discard the return.
 * The state is gone, so the hook itself now renders only when the connection
 * opens or drops. Anything needing the latest event can keep it from onEvent,
 * where the consumer decides whether it is worth a render.
 */
export function useEventStream(options: EventStreamOptions = {}) {
  const { taskId, enabled = true, onEvent } = options
  const [connected, setConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    const query = taskId ? `?task_id=${encodeURIComponent(taskId)}` : ''
    const url = `/api/events${query}`

    const es = new EventSource(url, { withCredentials: true })
    eventSourceRef.current = es

    es.onopen = () => {
      setConnected(true)
    }

    es.onerror = () => {
      setConnected(false)
    }

    // No `onmessage` handler. _sse() in backend/api/routes/system.py always
    // writes an `event:` line, so the browser routes every message to a named
    // listener and `onmessage` fires only for the unnamed default type, which
    // this backend never sends. The handler that used to sit here was
    // unreachable.

    // Named event listeners matching backend publications.
    //
    // This list is the whole contract. _sse() in backend/api/routes/system.py
    // always writes an `event:` line, so the browser never fires `onmessage`
    // and an event missing from this array is dropped in silence — no error,
    // no console warning, just a feature that appears not to work. That is why
    // queue position never displayed: the backend publishes task.queued and
    // wires Task.queue_position end to end, and nothing was listening.
    //
    // Sourced from the publish() and _emit() call sites in
    // backend/agents/orchestrator.py, backend/api/task_service.py,
    // backend/security/sovereignty.py and backend/harness/service.py. Adding a
    // new event on the backend means adding it here in the same change. The
    // harness events shipped without that, so a harness run's progress
    // reached the browser and was dropped here; they carry ids and counts
    // only, and a run-level one has no task id, so a consumer must switch on
    // the event name, as every consumer here does.
    const namedEvents = [
      'task.created',
      'task.queued',
      'task.stage',
      'task.planned',
      'task.model_selected',
      'task.model_completed',
      'task.model_swapped',
      'task.tool_started',
      'task.tool_completed',
      'task.extraction',
      'task.evidence',
      'task.code_generated',
      'task.code_retry',
      'task.sandbox_result',
      'task.calculation',
      'task.conflict',
      'task.draft',
      'task.token',
      'task.answer',
      'task.verified',
      'task.deliverable',
      'task.approval_decided',
      'task.finished',
      'task.failed',
      'task.blocked',
      'task.cancelled',
      'sovereignty.status',
      'sovereignty.error',
      'harness.started',
      'harness.child',
      'harness.cancelling',
      'harness.finished',
      'harness.report',
    ]

    namedEvents.forEach((eventName) => {
      es.addEventListener(eventName, (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data)
          const streamEvent: StreamEvent = {
            event: eventName,
            task_id: parsed.task_id || taskId,
            at: parsed.at || new Date().toISOString(),
            data: parsed.data || parsed,
          }
          onEventRef.current?.(streamEvent)
        } catch (err) {
          console.warn(`[sse] Error parsing ${eventName}:`, err)
        }
      })
    })

    return () => {
      es.close()
      eventSourceRef.current = null
      setConnected(false)
    }
  }, [taskId, enabled])

  return { connected }
}
