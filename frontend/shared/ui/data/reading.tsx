'use client'

/**
 * Reading a value from the service, with the three honest outcomes and no
 * fourth.
 *
 * Every screen here used to own its own `loading` boolean, and the failure
 * modes had drifted apart: one swallowed errors into an empty table that read
 * as "nothing indexed", one showed "Reading the policy files…" for ever when
 * the request never settled, one defaulted a missing count to zero. This is
 * the one place those rules now live:
 *
 *   - A read that has not answered says so, and after a few seconds says how
 *     long it has been waiting. The service shares this machine's CPU with
 *     local inference, so a slow answer during a run is expected and worth
 *     explaining rather than hiding behind a spinner.
 *   - A read that never answers is abandoned after a bounded wait and becomes
 *     a failure with a retry. Nothing on these screens spins for ever.
 *   - A failed refresh keeps the last good reading on screen and says it is
 *     stale, rather than blanking a page that was correct a moment ago.
 */

import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { cn } from '@/lib/utils'
import { ErrorState } from './error-state'
import { LEDGER_MUTED } from './ledger'

export type FailureKind = 'timeout' | 'unreachable' | 'unauthenticated' | 'forbidden' | 'refused' | 'unreadable'

export interface ReadFailure {
  kind: FailureKind
  /** HTTP status when there was one. 0 means the request never got an answer. */
  status: number | null
  /** The upstream message, verbatim, when the service sent one. */
  detail: string | null
  /** For a timeout: how long was waited, in seconds. */
  waitedS?: number
}

/**
 * Classify an error thrown by `request()` in lib/api.ts, which throws an
 * ApiError carrying `status` and the service's `detail`. Anything without a
 * status was thrown in this browser, not returned by the service.
 */
export function describeFailure(error: unknown): ReadFailure {
  const e = (error ?? {}) as { status?: unknown; detail?: unknown; message?: unknown }
  const status = typeof e.status === 'number' ? e.status : null
  const detail =
    typeof e.detail === 'string' && e.detail
      ? e.detail
      : typeof e.message === 'string' && e.message
        ? e.message
        : null
  if (status === null) return { kind: 'unreadable', status, detail }
  if (status === 0) return { kind: 'unreachable', status, detail }
  if (status === 401) return { kind: 'unauthenticated', status, detail }
  if (status === 403) return { kind: 'forbidden', status, detail }
  return { kind: 'refused', status, detail }
}

export type ReadingStatus = 'idle' | 'reading' | 'read' | 'failed'

export interface Reading<T> {
  status: ReadingStatus
  data: T | null
  failure: ReadFailure | null
  /** When the current attempt began, for a measured elapsed readout. */
  startedAt: number
  /** When data was last read successfully. Null until the first success. */
  readAt: number | null
  /** A reload is running while earlier data stays on screen. */
  refreshing: boolean
  reload: () => void
  /**
   * Replace the data locally after a write whose result the caller already
   * holds (the service returns the updated record), so the screen does not
   * wait a round trip to show what it has just been told.
   */
  setData: (update: (current: T | null) => T | null) => void
}

interface Inner<T> {
  status: ReadingStatus
  data: T | null
  failure: ReadFailure | null
  startedAt: number
  readAt: number | null
  refreshing: boolean
}

/** 30 s. /api/health was measured at up to 20 s on this host during a run. */
export const DEFAULT_TIMEOUT_MS = 30_000

export function useReading<T>(
  read: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
  { timeoutMs = DEFAULT_TIMEOUT_MS, enabled = true }: { timeoutMs?: number; enabled?: boolean } = {},
): Reading<T> {
  const readRef = useRef(read)
  readRef.current = read
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<Inner<T>>(() => ({
    status: enabled ? 'reading' : 'idle',
    data: null,
    failure: null,
    startedAt: Date.now(),
    readAt: null,
    refreshing: false,
  }))

  useEffect(() => {
    if (!enabled) {
      setState((s) => (s.status === 'reading' ? { ...s, status: 'idle' } : s))
      return
    }
    const controller = new AbortController()
    let live = true
    let timedOut = false
    const timer = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)

    setState((s) =>
      s.data !== null
        ? { ...s, refreshing: true, startedAt: Date.now() }
        : { ...s, status: 'reading', failure: null, refreshing: false, startedAt: Date.now() },
    )

    readRef
      .current(controller.signal)
      .then((data) => {
        if (!live) return
        setState((s) => ({
          status: 'read',
          data,
          failure: null,
          startedAt: s.startedAt,
          readAt: Date.now(),
          refreshing: false,
        }))
      })
      .catch((error: unknown) => {
        if (!live) return
        const failure: ReadFailure = timedOut
          ? { kind: 'timeout', status: null, detail: null, waitedS: Math.round(timeoutMs / 1000) }
          : describeFailure(error)
        setState((s) => ({ ...s, status: 'failed', failure, refreshing: false }))
      })
      .finally(() => window.clearTimeout(timer))

    return () => {
      live = false
      window.clearTimeout(timer)
      controller.abort()
    }
    // The caller's deps decide when to read again; `read` is held in a ref so
    // an inline function does not refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt, enabled, timeoutMs])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const setData = useCallback(
    (update: (current: T | null) => T | null) => setState((s) => ({ ...s, data: update(s.data) })),
    [],
  )

  return { ...state, reload, setData }
}

/** Seconds before a waiting read explains why it may be slow. */
const SLOW_AFTER_S = 4

/**
 * A read in progress. Says what is being read and from where, and counts the
 * real seconds once they start to matter. There is no spinner: a spinner
 * animates whether or not anything is happening, and elapsed time does not.
 */
export function ReadingLine({
  what,
  source,
  startedAt,
  className,
}: {
  /** In words: "the approval queue". */
  what: string
  /** Where from: "GET /api/approvals". */
  source?: string
  startedAt: number
  className?: string
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const slow = seconds >= SLOW_AFTER_S

  return (
    <div role="status" className={cn('flex flex-col gap-1 py-6', className)}>
      <p className="text-body text-foreground-secondary">
        {slow ? `Still reading ${what}.` : `Reading ${what}…`}
        {slow && (
          <span className="text-foreground-muted">
            {' '}
            The service shares this machine&rsquo;s CPU with local inference, so a run in progress
            slows it down.
          </span>
        )}
      </p>
      <p className={LEDGER_MUTED}>
        {source && <span>{source} · </span>}
        <span className="tabular">{seconds} s</span>
      </p>
    </div>
  )
}

function failureCopy(failure: ReadFailure, what: string): { headline: string; next: string } {
  switch (failure.kind) {
    case 'timeout':
      return {
        headline: `No answer after ${failure.waitedS ?? '?'} s while reading ${what}.`,
        next: 'Nothing is shown in its place. The service may be busy with a run on this machine; retry once it finishes.',
      }
    case 'unreachable':
      return {
        headline: `Can't reach the workbench service to read ${what}.`,
        next: 'Nothing is shown in its place. Check that the backend is running, then retry.',
      }
    case 'unauthenticated':
      return {
        headline: 'Your session is no longer valid.',
        next: `Sign in again to read ${what}.`,
      }
    case 'forbidden':
      return {
        headline: `Your role can't read ${what}.`,
        next: 'The service refused it by policy. Its reason is below.',
      }
    case 'refused':
      return {
        headline: `The service refused to return ${what}${failure.status ? ` (HTTP ${failure.status})` : ''}.`,
        next: 'Its message is below, exactly as sent.',
      }
    case 'unreadable':
      return {
        headline: `${what.charAt(0).toUpperCase()}${what.slice(1)} arrived in a form this page could not read.`,
        next: 'The error is below.',
      }
  }
}

/** A failed read, in the house ErrorState, with a retry where one can help. */
export function FailureState({
  failure,
  what,
  retry,
  className,
}: {
  failure: ReadFailure
  what: string
  retry?: () => void
  className?: string
}) {
  const copy = failureCopy(failure, what)
  return (
    <ErrorState
      headline={copy.headline}
      nextAction={copy.next}
      detail={failure.detail ?? undefined}
      retry={failure.kind === 'unauthenticated' || failure.kind === 'forbidden' ? undefined : retry}
      className={className}
    />
  )
}

/** "11:32:05", from a millisecond timestamp. */
export function clockTime(ms: number | null): string {
  if (ms === null) return '—'
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
