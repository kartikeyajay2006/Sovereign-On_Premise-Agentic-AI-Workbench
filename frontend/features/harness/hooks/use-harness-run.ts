'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEventStream } from '@/hooks/use-event-stream'
import { ApiError } from '@/lib/api'
import { harnessApi } from '../api'
import type { HarnessRunView } from '../model/types'
import { ACTIVE_RUN } from '../ui/outcome'

/**
 * How often an active run is re-read.
 *
 * The record is the truth and this reads it. The event stream only says
 * when to read it again: a harness event for this run brings the next read
 * forward, and nothing on screen is ever taken from an event itself, so a
 * lost event costs a moment of liveness and never correctness. Faster
 * polling would not be fresher: the runner itself learns that a child has
 * settled by reading that child's record every two seconds, and a child
 * takes minutes on this host.
 */
const POLL_MS = 2500

/** Refusals that another attempt will not change. */
const PERMANENT = new Set([401, 403, 404])

export interface HarnessRunState {
  run: HarnessRunView | null
  error: ApiError | null
  /** Browser clock when `run` was read, to advance the server's clock from. */
  fetchedAt: number | null
  /** Replace the record with one a mutation returned. */
  replace: (next: HarnessRunView) => void
  refresh: () => void
}

export function useHarnessRun(runId: string): HarnessRunState {
  const [run, setRun] = useState<HarnessRunView | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    let live = true
    let timer: number | undefined

    const read = async () => {
      try {
        const next = await harnessApi.run(runId)
        if (!live) return
        setRun(next)
        setError(null)
        setFetchedAt(Date.now())
        if (ACTIVE_RUN.has(next.status)) timer = window.setTimeout(read, POLL_MS)
      } catch (err) {
        if (!live) return
        const failure =
          err instanceof ApiError ? err : new ApiError(0, 'The run could not be read.')
        setError(failure)
        // A dropped connection costs liveness, not the record: keep asking,
        // at half the pace, unless the answer was a refusal.
        if (!PERMANENT.has(failure.status)) timer = window.setTimeout(read, POLL_MS * 2)
      }
    }

    void read()
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [runId, generation])

  // The server's clock when the record on screen was built. An event from
  // before it is already reflected there (the stream replays recent events
  // when it connects), so only a newer one is worth a read.
  const shownAt = useRef<number | null>(null)
  shownAt.current = run ? Date.parse(run.server_time) : null

  useEventStream({
    onEvent: (event) => {
      if (!event.event.startsWith('harness.') || event.data?.run_id !== runId) return
      const at = Date.parse(event.at)
      if (shownAt.current !== null && Number.isFinite(at) && at <= shownAt.current) return
      setGeneration((value) => value + 1)
    },
  })

  const replace = useCallback((next: HarnessRunView) => {
    setRun(next)
    setFetchedAt(Date.now())
    // Restart the read loop so a run a mutation left active keeps polling.
    setGeneration((value) => value + 1)
  }, [])

  const refresh = useCallback(() => setGeneration((value) => value + 1), [])

  return { run, error, fetchedAt, replace, refresh }
}
