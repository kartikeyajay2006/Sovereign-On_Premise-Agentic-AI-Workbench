'use client'

import { useEffect, useRef, useState } from 'react'
import type { StreamEvent } from '@/lib/types'

export interface EventStreamOptions {
  taskId?: string | null
  enabled?: boolean
  onEvent?: (event: StreamEvent) => void
}

export function useEventStream(options: EventStreamOptions = {}) {
  const { taskId, enabled = true, onEvent } = options
  const [connected, setConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<StreamEvent | null>(null)
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

    // Default message handler
    es.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data)
        const streamEvent: StreamEvent = {
          event: msg.type || 'message',
          task_id: parsed.task_id || taskId,
          at: parsed.at || new Date().toISOString(),
          data: parsed.data || parsed,
        }
        setLastEvent(streamEvent)
        onEventRef.current?.(streamEvent)
      } catch (err) {
        console.warn('[sse] Error parsing SSE message:', err)
      }
    }

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
    // backend/agents/orchestrator.py, backend/api/task_service.py and
    // backend/security/sovereignty.py. Adding a new event on the backend means
    // adding it here in the same change.
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
      'task.draft',
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
          setLastEvent(streamEvent)
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

  return { connected, lastEvent }
}
