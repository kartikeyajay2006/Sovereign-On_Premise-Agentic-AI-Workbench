'use client'

import { useEffect, useRef, useState } from 'react'
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
 * from the API. api.auditChain() existed and was never called, so a chain that
 * had actually been broken still displayed VALID, overriding the audit screen
 * that had gone to real trouble to model UNVERIFIED as a state.
 *
 * It also defaulted its counters with `?? 0` and `?? 3`, which meant a backend
 * that was unreachable rendered as a host with zero external calls and three
 * healthy loopback connections.
 *
 * Every row below is now either read from the API or absent, and a failed
 * read says so.
 */

type Posture = {
  sovereignty: SovereigntyStatusType | null
  health: SystemHealth | null
  reachable: boolean
  loading: boolean
}

const UNKNOWN = '—'

export function SovereigntyStatus({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [posture, setPosture] = useState<Posture>({
    sovereignty: null,
    health: null,
    reachable: false,
    loading: true,
  })
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([api.sovereigntyStatus(), api.health()]).then(
      ([sovereignty, health]) => {
        if (cancelled) return
        setPosture({
          sovereignty: sovereignty.status === 'fulfilled' ? sovereignty.value : null,
          health: health.status === 'fulfilled' ? health.value : null,
          reachable:
            sovereignty.status === 'fulfilled' || health.status === 'fulfilled',
          loading: false,
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const { sovereignty, health, reachable, loading } = posture

  // The pill only claims a posture the API reported. While the read is in
  // flight, or if it failed, it says so rather than showing a green light.
  const monitored = sovereignty?.monitor_active === true
  const externalCalls = sovereignty?.external_api_calls

  const pillTone = !reachable
    ? 'var(--critical)'
    : monitored && sovereignty?.sovereign
      ? 'var(--sovereign)'
      : 'var(--approval)'

  const pillLabel = loading
    ? 'Reading…'
    : !reachable
      ? 'Service unreachable'
      : monitored
        ? 'Monitored'
        : 'Not monitored'

  const rows: { label: string; value: string; tone?: string }[] = [
    { label: 'Host', value: '127.0.0.1' },
    {
      label: 'External connections',
      value: externalCalls === undefined ? UNKNOWN : String(externalCalls),
      tone:
        externalCalls === undefined
          ? undefined
          : externalCalls === 0
            ? 'var(--sovereign)'
            : 'var(--critical)',
    },
    {
      label: 'Local connections',
      value:
        sovereignty?.local_connections === undefined
          ? UNKNOWN
          : String(sovereignty.local_connections),
    },
    {
      label: 'Egress monitor',
      value: sovereignty === null ? UNKNOWN : monitored ? 'active' : 'inactive',
      tone: sovereignty === null ? undefined : monitored ? undefined : 'var(--approval)',
    },
    {
      label: 'Sandbox runtime',
      value: health?.sandbox_runtime ?? UNKNOWN,
    },
    {
      label: 'Audit hash chain',
      value:
        health?.audit_chain_valid === undefined
          ? UNKNOWN
          : health.audit_chain_valid
            ? 'valid'
            : 'BROKEN',
      tone:
        health?.audit_chain_valid === undefined
          ? undefined
          : health.audit_chain_valid
            ? 'var(--sovereign)'
            : 'var(--critical)',
    },
  ]

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Sovereignty status"
        /*
          No border. This sat in the header as an outlined chip beside the
          account menu, so two bordered boxes competed for the same corner
          and neither read as the control. The dot is the signal and it is
          already the only coloured thing here; the box added nothing but
          weight. whitespace-nowrap because "0 External" was wrapping under
          "MONITORED" and stacking the chip two lines tall.
        */
        className={cn(
          'group flex items-center gap-2 whitespace-nowrap rounded-[var(--radius-xs)] px-2 py-1.5 transition-colors hover:bg-surface-sunken',
          compact && 'px-1.5',
        )}
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: pillTone }}
        />
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-foreground-secondary">
          {pillLabel}
        </span>
        {externalCalls !== undefined && (
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-foreground-muted">
            {externalCalls} ext
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-[90] w-72 border border-border bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.14)]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground-muted">
              Sovereignty
            </span>
            <span
              className="font-mono text-[10px] uppercase tracking-[0.16em]"
              style={{ color: pillTone }}
            >
              {pillLabel}
            </span>
          </div>

          {!reachable && !loading ? (
            <div className="px-4 py-3">
              <p className="text-[12px] leading-relaxed text-foreground-secondary">
                The workbench service did not answer. Nothing on this panel is
                current, so no posture is shown.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[12px] text-foreground-secondary">{r.label}</span>
                  <span
                    className="font-mono text-[12px]"
                    style={{ color: r.tone ?? 'var(--foreground)' }}
                  >
                    {r.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-border px-4 py-2.5">
            <p className="font-mono text-[10px] leading-relaxed text-foreground-muted">
              {sovereignty?.last_checked
                ? `Sampled ${new Date(sovereignty.last_checked).toLocaleTimeString()}`
                : 'Not sampled'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
