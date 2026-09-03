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

    // Named event listeners matching backend publications
    const namedEvents = [
      'task.created',
      'task.stage',
      'task.planned',
      'task.model_selected',
      'task.tool_started',
      'task.tool_completed',
      'task.extraction',
      'task.evidence',
      'task.code_generated',
      'task.sandbox_result',
      'task.draft',
      'task.verified',
      'task.deliverable',
      'task.approval_decided',
      'task.finished',
      'task.failed',
      'task.blocked',
      'sovereignty.status',
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
