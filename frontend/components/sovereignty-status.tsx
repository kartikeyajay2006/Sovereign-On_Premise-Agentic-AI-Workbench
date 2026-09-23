'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { api } from '@/lib/api'
import type { SovereigntyStatus as SovereigntyStatusType, SystemHealth } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * The posture indicator in the global header.
 *
 * This component is on every screen, so anything it asserts is asserted
 * everywhere. It previously hardcoded four of its six rows — "Sandbox
 * confinement: CONTAINED", "Audit hash chain: VALID", a "Verified" heading and
 * "0 OUTBOUND PACKETS · Nothing leaves this host" — none of which were read
 * from the API. Every row below is either read from the API or absent, and a
 * failed read says so.
 *
 * It also used to read once, when the header mounted, and then show that
 * reading for the rest of the session. The header mounts once per sign-in,
 * so a posture sampled at 09:00 was still on screen at 17:00 with nothing to
 * say it was eight hours old. It now re-samples the egress monitor every 30
 * seconds while the tab is visible, which is one cheap request, and takes a
 * fresh reading of everything when the panel is opened. The sample time is
 * always printed under the rows.
 */

type Posture = {
  sovereignty: SovereigntyStatusType | null
  health: SystemHealth | null
  reachable: boolean
  /** The egress read was abandoned unanswered, which is not the same as refused. */
  timedOut: boolean
  loading: boolean
}

const UNKNOWN = '—'
const RESAMPLE_MS = 30_000

class NoAnswer extends Error {}

/**
 * Stop waiting after `ms`. The request itself is not cancelled, since these
 * calls go through lib/api.ts without a signal; the pill just stops claiming
 * it is still reading. /api/health was measured at up to 20 s during a run.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new NoAnswer()), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

type Tone = 'sovereign' | 'critical' | 'approval' | undefined

const TONE_TEXT: Record<Exclude<Tone, undefined>, string> = {
  sovereign: 'text-sovereign-text',
  critical: 'text-critical-text',
  approval: 'text-approval-text',
}

export function SovereigntyStatus({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState<string | null>(null)
  const [posture, setPosture] = useState<Posture>({
    sovereignty: null,
    health: null,
    reachable: false,
    timedOut: false,
    loading: true,
  })
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  /** `withHealth`: /api/health spawns a sandbox probe, so it is read on demand. */
  const sample = useCallback(async (withHealth: boolean) => {
    const [sovereignty, health] = await Promise.allSettled([
      withTimeout(api.sovereigntyStatus(), 10_000),
      withHealth ? withTimeout(api.health(), 25_000) : Promise.reject(new Error('not requested')),
    ])
    setPosture((prev) => ({
      sovereignty: sovereignty.status === 'fulfilled' ? sovereignty.value : null,
      health: health.status === 'fulfilled' ? health.value : withHealth ? null : prev.health,
      reachable:
        sovereignty.status === 'fulfilled' || (withHealth && health.status === 'fulfilled'),
      timedOut: sovereignty.status === 'rejected' && sovereignty.reason instanceof NoAnswer,
      loading: false,
    }))
  }, [])

  useEffect(() => {
    setOrigin(window.location.host)
    void sample(true)
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void sample(false)
    }, RESAMPLE_MS)
    return () => window.clearInterval(id)
  }, [sample])

  useEffect(() => {
    if (!open) return
    void sample(true)
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, sample])

  const { sovereignty, health, reachable, loading, timedOut } = posture

  // The pill only claims a posture the API reported. While the read is in
  // flight, or if it failed, it says so rather than showing a green light.
  const monitored = sovereignty?.monitor_active === true
  // external_api_calls, internet_requests and unapproved_connections are the
  // same counter in backend/security/sovereignty.py: non-loopback connections
  // observed on the API's process tree. It is named for what it is.
  const observed = sovereignty?.unapproved_connections

  const pillFill = loading
    ? 'bg-control-strong'
    : !reachable
      ? timedOut
        ? 'bg-approval'
        : 'bg-critical'
      : monitored && sovereignty?.sovereign
        ? 'bg-sovereign'
        : 'bg-approval'

  const pillLabel = loading
    ? 'Reading…'
    : !reachable
      ? timedOut
        ? 'No answer'
        : 'Service unreachable'
      : !sovereignty
        ? 'No egress reading'
        : monitored
          ? 'Monitored'
          : 'Not monitored'

  const rows: { label: string; value: string; tone?: Tone }[] = [
    { label: 'Served from', value: origin ?? UNKNOWN },
    {
      label: 'Non-loopback connections',
      value: observed === undefined ? UNKNOWN : String(observed),
      tone: observed === undefined ? undefined : observed === 0 ? 'sovereign' : 'critical',
    },
    {
      label: 'Loopback, last sample',
      value:
        sovereignty?.local_connections === undefined ? UNKNOWN : String(sovereignty.local_connections),
    },
    {
      label: 'Egress monitor',
      value: sovereignty === null ? UNKNOWN : monitored ? 'active' : 'inactive',
      tone: sovereignty === null || monitored ? undefined : 'approval',
    },
    { label: 'Sandbox runtime', value: health?.sandbox_runtime ?? UNKNOWN },
    {
      label: 'Audit hash chain',
      value:
        health?.audit_chain_valid === undefined ? UNKNOWN : health.audit_chain_valid ? 'valid' : 'BROKEN',
      tone:
        health?.audit_chain_valid === undefined
          ? undefined
          : health.audit_chain_valid
            ? 'sovereign'
            : 'critical',
    },
  ]

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Egress posture: ${pillLabel}`}
        title={
          sovereignty
            ? `${sovereignty.unapproved_connections} non-loopback connections observed since ${new Date(sovereignty.monitored_since).toLocaleString()}`
            : undefined
        }
        className={cn(
          'hover-decay flex h-8 items-center gap-2 whitespace-nowrap rounded-[var(--radius)] px-2 hover:bg-surface-sunken',
          'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
          compact && 'px-1',
        )}
      >
        <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', pillFill)} />
        <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-secondary">
          {pillLabel}
        </span>
        {observed !== undefined && (
          <span
            className={cn(
              'tabular font-mono text-ledger uppercase tracking-[var(--ls-ledger)]',
              observed === 0 ? 'text-foreground-muted' : 'text-critical-text',
            )}
          >
            {observed} egress
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Egress posture"
          className="absolute right-0 top-[calc(100%+8px)] z-[var(--z-menu)] w-72 max-w-[calc(100vw-32px)] overflow-hidden rounded-[var(--radius-md-token)] bg-surface shadow-[var(--elev-2)] animate-in slide-in-from-top-1 duration-[var(--standard)] ease-[var(--ease-standard)] motion-reduce:animate-none"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-4 py-3">
            <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
              Egress posture
            </span>
            <span className="flex items-center gap-2 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-secondary">
              <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', pillFill)} />
              {pillLabel}
            </span>
          </div>

          {!reachable && !loading ? (
            <p className="px-4 py-3 text-ui text-foreground-secondary">
              The workbench service did not answer. Nothing on this panel is current, so no posture is
              shown.
            </p>
          ) : (
            <dl>
              {rows.map((r) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between gap-4 border-b border-line-subtle px-4 py-2 last:border-b-0"
                >
                  <dt className="text-ui text-foreground-secondary">{r.label}</dt>
                  <dd
                    className={cn(
                      'tabular truncate font-mono text-ui',
                      r.tone ? TONE_TEXT[r.tone] : 'text-foreground',
                    )}
                  >
                    {r.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-line-subtle px-4 py-2">
            <p className="font-mono text-ledger text-foreground-muted">
              {sovereignty?.last_checked
                ? `sampled ${new Date(sovereignty.last_checked).toLocaleTimeString()}`
                : 'not sampled'}
            </p>
            <Link
              href="/security"
              onClick={() => setOpen(false)}
              className="hover-decay flex items-center gap-1 rounded-[var(--radius-xs)] px-1 text-ui text-foreground-secondary hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              Assurance
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
