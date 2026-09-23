'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Exactly the fields GET /api/status returns (backend/api/routes/system.py:59-76).
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
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function stamp(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** A loopback call that has not answered in this long is not running. */
const TIMEOUT_MS = 3000

/**
 * What this machine reports about itself, before anyone has signed in.
 *
 * Three states and no fourth. If the read fails the block says so plainly;
 * it never falls back to a reassuring figure. The sign-in form below it
 * needs the same service, so an unreachable reading here is also the most
 * useful thing the page can say about why signing in will fail.
 */
export function HostStatus({ onReachable }: { onReachable?: (reachable: boolean) => void }) {
  const [state, setState] = useState<State>({ kind: 'reading' })

  useEffect(() => {
    const controller = new AbortController()
    let live = true
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
    fetch('/api/status', { signal: controller.signal, cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: unknown) => {
        if (!isPublicStatus(body)) throw new Error('shape')
        if (!live) return
        setState({ kind: 'read', status: body })
        onReachable?.(true)
      })
      .catch(() => {
        // A timeout lands here too, and is an answer: no reading. Leaving
        // the page is not, and says nothing.
        if (!live) return
        setState({ kind: 'unreachable' })
        onReachable?.(false)
      })
      .finally(() => window.clearTimeout(timer))
    return () => {
      live = false
      window.clearTimeout(timer)
      controller.abort()
    }
    // Read once per visit to the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const status = state.kind === 'read' ? state.status : null
  const observed = status?.external_calls ?? null

  const fill =
    state.kind === 'reading'
      ? 'bg-control-strong'
      : state.kind === 'unreachable'
        ? 'bg-critical'
        : !status!.monitor_active
          ? 'bg-approval'
          : observed === 0
            ? 'bg-sovereign'
            : 'bg-critical'

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[var(--radius)] bg-surface px-4 py-3 shadow-[var(--elev-0)]"
    >
      <p className="flex items-center gap-2 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
        <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', fill)} />
        This machine, now
        <span className="ml-auto normal-case tracking-normal">GET /api/status</span>
      </p>
      <p
        className={cn(
          'mt-2 text-body',
          state.kind === 'read' && observed !== 0 && status!.monitor_active ? 'text-critical-text' : 'text-foreground',
        )}
      >
        {state.kind === 'reading' && 'Asking the workbench service…'}
        {state.kind === 'unreachable' &&
          'The workbench service did not answer this browser, so there is no reading, and signing in will fail until it is running.'}
        {status &&
          (!status.monitor_active
            ? 'The egress monitor is not running, so there is no egress figure to show.'
            : observed === 0
              ? "No connection from the workbench's processes has been seen leaving the loopback ranges."
              : `${observed} connection${observed === 1 ? '' : 's'} from the workbench's processes ${observed === 1 ? 'has' : 'have'} been seen leaving the loopback ranges.`)}
      </p>
      {status && (
        <p className="mt-1 font-mono text-ledger text-foreground-muted">
          sampling since {stamp(status.monitored_since)} · checked {time(status.checked_at)}
        </p>
      )}
    </div>
  )
}
