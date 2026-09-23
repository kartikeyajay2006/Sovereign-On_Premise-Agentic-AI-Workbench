'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { CARD, MONO_LABEL, MONO_META } from './tokens'

/** Exactly the fields GET /api/status returns. backend/api/routes/system.py */
interface PublicStatus {
  name: string
  sovereign: boolean
  external_calls: number
  monitor_active: boolean
  monitored_since: string
  checked_at: string
}

type State = { kind: 'reading' } | { kind: 'read'; status: PublicStatus } | { kind: 'unavailable' }

export interface LiveContainmentProps {
  className?: string
}

function isPublicStatus(value: unknown): value is PublicStatus {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.sovereign === 'boolean' &&
    typeof candidate.external_calls === 'number' &&
    typeof candidate.monitored_since === 'string' &&
    typeof candidate.checked_at === 'string'
  )
}

/** "2026-09-21T05:37:29.606989+00:00" -> "05:37:29". Absent stays absent. */
function clock(iso: string): string {
  const match = /T(\d{2}:\d{2}:\d{2})/.exec(iso)
  return match ? match[1] : iso
}

/**
 * The only component on this page that fetches anything.
 *
 * Three states, and there is no fourth: reading, read, unavailable. If the
 * fetch fails the cell says so plainly and does not fall back to a pleasant
 * number. On a laptop with no backend running, this cell reading "not reachable
 * from this browser" is worth more than any figure, because it demonstrates
 * that the page will not print a number it has not obtained. lib/api.ts refuses
 * the same way, for the same reason.
 */
export function LiveContainment({ className }: LiveContainmentProps) {
  const [state, setState] = useState<State>({ kind: 'reading' })

  useEffect(() => {
    const controller = new AbortController()
    // 2.5s: a loopback call that has not answered by then is not running.
    const timer = setTimeout(() => controller.abort(), 2500)

    fetch('/api/status', { signal: controller.signal, cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('status'))))
      .then((body: unknown) => {
        if (!isPublicStatus(body)) throw new Error('shape')
        setState({ kind: 'read', status: body })
      })
      .catch(() => setState({ kind: 'unavailable' }))
      .finally(() => clearTimeout(timer))

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [])

  const breached = state.kind === 'read' && !state.status.sovereign

  return (
    <div className={cn(CARD, 'p-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className={MONO_LABEL}>Containment</span>
        {/*
          A 6px mark beside a sentence that already states the reading in
          words, so it carries no meaning alone. Ink, not green, when nothing
          was observed: the monitor samples the connection table and fails
          open, reporting an empty list when it cannot read it, so a zero is
          a reading and not a proof, and the page does not glow about what it
          cannot prove. Critical only for a connection it did observe.
        */}
        <span
          aria-hidden
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            state.kind === 'reading' && 'bg-control-strong',
            state.kind === 'unavailable' && 'bg-control-strong',
            state.kind === 'read' && !breached && 'bg-foreground',
            breached && 'bg-critical',
          )}
        />
      </div>

      <p
        aria-live="polite"
        className={cn(
          'mt-2 text-answer tracking-[-0.008em]',
          // --critical-text (#b91c1c, 6.03:1) rather than --critical (4.50:1).
          // A status hue on a text node always takes its -text variant.
          breached ? 'text-critical-text' : 'text-foreground',
        )}
      >
        {state.kind === 'reading' && 'Reading from this machine…'}
        {state.kind === 'unavailable' && 'Not reachable from this browser.'}
        {state.kind === 'read' &&
          `${state.status.external_calls} unapproved connection${
            state.status.external_calls === 1 ? '' : 's'
          } observed.`}
      </p>

      <p className={cn(MONO_META, 'mt-1 leading-[16px]')}>
        {state.kind === 'read'
          ? `since ${clock(state.status.monitored_since)} UTC · checked ${clock(state.status.checked_at)} UTC`
          : state.kind === 'unavailable'
            ? 'GET /api/status — no response'
            : 'GET /api/status'}
      </p>
    </div>
  )
}
