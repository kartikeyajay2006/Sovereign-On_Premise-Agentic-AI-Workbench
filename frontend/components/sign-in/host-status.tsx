'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Exactly the fields GET /api/status returns (backend/api/routes/system.py).
 * The route is public on purpose: its docstring says a containment claim on a
 * sign-in screen has to be a reading, or it is a slogan on a login page.
 * `external_calls` there is the monitor's unapproved-connection counter.
 */
interface PublicStatus {
  name: string | null
  sovereign: boolean
  external_calls: number
  monitor_active: boolean
  monitored_since: string
  checked_at: string
}

type State = { kind: 'reading' } | { kind: 'read'; status: PublicStatus } | { kind: 'unreachable' }

function isPublicStatus(value: unknown): value is PublicStatus {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.sovereign === 'boolean' &&
    typeof v.external_calls === 'number' &&
    typeof v.monitor_active === 'boolean' &&
    typeof v.monitored_since === 'string' &&
    typeof v.checked_at === 'string'
  )
}

function time(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** A loopback call that has not answered in this long is not running. */
const TIMEOUT_MS = 3000

/**
 * What this machine reports about itself before anyone has signed in, in one
 * line. Three states and no fourth: if the read fails the line says so; it
 * never falls back to a reassuring figure. The form needs the same service,
 * so an unreachable reading is also the most useful thing the page can say
 * about why signing in will fail.
 */
export function HostStatus({ className }: { className?: string }) {
  const [state, setState] = useState<State>({ kind: 'reading' })

  useEffect(() => {
    const controller = new AbortController()
    let live = true
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
    fetch('/api/status', { signal: controller.signal, cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: unknown) => {
        if (!isPublicStatus(body)) throw new Error('shape')
        if (live) setState({ kind: 'read', status: body })
      })
      .catch(() => {
        // A timeout lands here too, and is an answer: no reading.
        if (live) setState({ kind: 'unreachable' })
      })
      .finally(() => window.clearTimeout(timer))
    return () => {
      live = false
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [])

  const status = state.kind === 'read' ? state.status : null
  const monitoring = Boolean(status?.monitor_active)
  const observed = status && monitoring ? status.external_calls : null

  // A zero is a reading, not a verdict, so it is ink rather than green; red
  // only when something was seen leaving or the service did not answer.
  const dot =
    state.kind === 'reading'
      ? 'bg-control-strong'
      : state.kind === 'unreachable'
        ? 'bg-critical'
        : !monitoring
          ? 'bg-approval'
          : observed === 0
            ? 'bg-foreground'
            : 'bg-critical'

  const text =
    state.kind === 'reading'
      ? 'Asking this machine…'
      : state.kind === 'unreachable'
        ? 'The workbench service did not answer, so signing in will fail until it is running.'
        : !monitoring
          ? 'The egress monitor is not running on this machine.'
          : observed === 0
            ? 'No connection has left this machine’s loopback'
            : `${observed} connection${observed === 1 ? '' : 's'} seen leaving this machine’s loopback`

  return (
    <p
      role="status"
      aria-live="polite"
      title="Read from GET /api/status: the egress monitor's count of connections from the workbench's processes to anywhere outside the loopback ranges."
      className={cn('flex items-start gap-2.5 text-[0.82rem] leading-[1.5] text-foreground-secondary', className)}
    >
      <span aria-hidden className={cn('mt-[7px] size-1.5 shrink-0 rounded-full', dot)} />
      <span>
        {text}
        {status && monitoring ? <span className="text-foreground-muted"> · checked {time(status.checked_at)}</span> : null}
      </span>
    </p>
  )
}
