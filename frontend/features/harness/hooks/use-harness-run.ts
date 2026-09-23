'use client'

import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '@/lib/api'
import { harnessApi } from '../api'
import type { HarnessRunView } from '../model/types'
import { ACTIVE_RUN } from '../ui/outcome'

/**
 * How often an active run is re-read.
 *
 * The record is the truth and this reads it; there is no event-stream path
 * to fall out of sync with. Faster would not be fresher: the runner itself
 * learns that a child has settled by reading that child's record every two
 * seconds, and a child takes minutes on this host.
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

  const replace = useCallback((next: HarnessRunView) => {
    setRun(next)
    setFetchedAt(Date.now())
    // Restart the read loop so a run a mutation left active keeps polling.
    setGeneration((value) => value + 1)
  }, [])

  const refresh = useCallback(() => setGeneration((value) => value + 1), [])

  return { run, error, fetchedAt, replace, refresh }
}
