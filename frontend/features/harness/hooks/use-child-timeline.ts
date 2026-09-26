'use client'

import { useEffect, useRef, useState } from 'react'
import { useEventStream } from '@/hooks/use-event-stream'
import { ApiError } from '@/lib/api'
import type { StreamEvent } from '@/lib/types'
import { harnessApi } from '../api'
import { applyEvent, EMPTY_TIMELINE, timelineFromTask, type Timeline } from '../model/timeline'

export interface ChildTimelineState {
  timeline: Timeline
  /** The record has been read at least once for this child. */
  loaded: boolean
  error: string | null
}

/**
 * One child's stage timeline: its record, extended by its live events.
 *
 * The record is read when the child is chosen and again when it stops
 * being live, so a settled child always ends on what its record says.
 * While it is live, the stream is opened scoped to its task id -- the
 * backend's ownership check decides whether this viewer receives those
 * events at all -- and every `task.*` event is folded in as it arrives.
 * Events are kept per child so a record read that lands after some events
 * does not drop them: the record is the base, the events are replayed onto
 * it, and the fold is idempotent for anything both hold.
 *
 * Only timing and counts are taken from the record. The answer, and any
 * held draft, are never read out of it here.
 */
export function useChildTimeline(taskId: string | null, live: boolean): ChildTimelineState {
  const [state, setState] = useState<ChildTimelineState>({ timeline: EMPTY_TIMELINE, loaded: false, error: null })
  const events = useRef<StreamEvent[]>([])
  const current = useRef<string | null>(taskId)

  useEffect(() => {
    current.current = taskId
    events.current = []
    setState({ timeline: EMPTY_TIMELINE, loaded: false, error: null })
  }, [taskId])

  useEffect(() => {
    if (!taskId) return
    let alive = true
    harnessApi
      .childTask(taskId)
      .then((task) => {
        if (!alive || current.current !== taskId) return
        const base = timelineFromTask(task)
        setState({ timeline: events.current.reduce(applyEvent, base), loaded: true, error: null })
      })
      .catch((err) => {
        if (!alive || current.current !== taskId) return
        setState((prev) => ({
          ...prev,
          loaded: true,
          error: err instanceof ApiError ? String(err.detail || err.message) : String(err),
        }))
      })
    return () => {
      alive = false
    }
    // Re-read when the child stops being live: its record is then final.
  }, [taskId, live])

  useEventStream({
    taskId,
    enabled: Boolean(taskId) && live,
    onEvent: (event) => {
      if (!event.event.startsWith('task.') || event.task_id !== current.current) return
      // Tokens are kept only as the latest frame; the rest are kept to be
      // replayed onto a record read that arrives after them.
      if (event.event !== 'task.token') events.current.push(event)
      setState((prev) => ({ ...prev, timeline: applyEvent(prev.timeline, event) }))
    },
  })

  return state
}
