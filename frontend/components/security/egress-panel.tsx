'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { LEDGER_MUTED, Readout, ReadoutRow } from '@/shared/ui/data/ledger'
import type { InterfaceReading, SovereigntyStatus } from './api'

/** Seconds since a timestamp, recounted each second. Only this re-renders. */
export function Ago({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return <>—</>
  const s = Math.max(0, Math.round((now - then) / 1000))
  return <>{s < 90 ? `${s} s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`}</>
}

export function stamp(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const LOOPBACK = (address: string) => address.startsWith('127.') || address === '::1'

/**
 * Loopback is decided from the addresses the interface actually holds. The
 * service's own `loopback` flag is `name.startswith("lo")`, which is true on
 * Linux and false for Windows' "Loopback Pseudo-Interface 1".
 */
function classify(reading: InterfaceReading) {
  const external = reading.addresses.filter((a) => !LOOPBACK(a))
  return { external, loopbackOnly: reading.addresses.length > 0 && external.length === 0 }
}

/**
 * How the egress figure is taken, updating as the monitor samples.
 *
 * The figure itself -- the only counter the monitor keeps -- is the verdict
 * at the top of the screen. This is what sits behind it: the sampling as
 * observed, what a sample cannot see, any connection it did see, and the
 * host's own network, which the figure is not a statement about.
 */
export function EgressPanel({ status, live }: { status: SovereigntyStatus; live: boolean }) {
  // The sampling interval as observed between the last two samples, rather
  // than the configured value restated as though it had been measured.
  const [gap, setGap] = useState<number | null>(null)
  const previous = useRef(status.last_checked)
  useEffect(() => {
    const a = Date.parse(previous.current)
    const b = Date.parse(status.last_checked)
    if (!Number.isNaN(a) && !Number.isNaN(b) && b > a) setGap((b - a) / 1000)
    previous.current = status.last_checked
  }, [status.last_checked])
  const interfaces = Object.entries(status.interfaces).sort(([a], [b]) => a.localeCompare(b))
  const upExternal = interfaces.filter(([, r]) => r.up && classify(r).external.length > 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-[var(--radius)] bg-surface p-5 shadow-[var(--elev-0)]">
        <ReadoutRow>
          <Readout
            label="Monitor"
            value={status.monitor_active ? 'sampling' : 'not running'}
            tone={status.monitor_active ? 'default' : 'approval'}
          />
          <Readout label="Since" value={stamp(status.monitored_since)} hint={status.monitored_since} />
          <Readout label="Last sample" value={<Ago iso={status.last_checked} />} hint={status.last_checked} />
          <Readout
            label="Apart"
            value={gap === null ? '—' : `${gap.toFixed(1)} s`}
            tone={gap === null ? 'muted' : 'default'}
            hint="Time between the last two samples this page received"
          />
          <Readout
            label="Loopback now"
            value={status.local_connections}
            hint="Loopback connections in the most recent sample"
          />
          <Readout
            label="Stream"
            value={live ? 'live' : 'not connected'}
            tone={live ? 'default' : 'muted'}
            hint="New samples arrive over the event stream while it is connected"
          />
        </ReadoutRow>
        <p className="max-w-[80ch] text-ui text-foreground-secondary">
          Sampled from the workbench&rsquo;s own processes at an interval. A connection that opens and closes
          between samples is not seen, and a monitor that cannot read the connection table reports an empty list,
          which looks the same as a clean one.
        </p>
      </div>

      {status.violations.length > 0 && (
        <section aria-label="Connections observed" className="flex flex-col gap-2">
          <h3 className={cn(LEDGER_MUTED, 'text-critical-text')}>Most recent non-loopback connections</h3>
          <ul className="overflow-hidden rounded-[var(--radius)] bg-surface shadow-[0_0_0_1px_var(--critical-border)]">
            {status.violations.map((v, i) => (
              <li key={`${v.laddr}-${v.raddr}-${i}`} className="flex flex-col gap-1 border-b border-line-subtle px-4 py-3 last:border-b-0">
                <span className="break-all font-mono text-ui text-foreground">
                  {v.laddr} → {v.raddr ?? 'no peer'}
                </span>
                <span className="font-mono text-ledger text-foreground-muted">
                  {v.process ?? 'unknown process'}
                  {v.pid !== null ? ` · pid ${v.pid}` : ''} · {v.status}
                </span>
                <span className="text-ui text-foreground-secondary">{v.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {interfaces.length > 0 && (
        <section aria-label="Host interfaces" className="flex flex-col gap-2">
          {/*
            The sentence about the host is what a reader needs; the adapters
            behind it -- six rows of raw addresses on a laptop -- are one
            click away rather than the largest thing on the screen.
          */}
          <p className="max-w-[80ch] text-ui text-foreground-muted">
            {upExternal.length > 0
              ? `${upExternal.length} interface${upExternal.length === 1 ? ' is' : 's are'} up with a non-loopback address, so this host is attached to a network. The figure above is about the workbench's own connections; it is not a statement that the machine is physically isolated.`
              : 'No interface is up with a non-loopback address in this reading.'}
          </p>
          <details className="group">
            <summary className={cn(LEDGER_MUTED, 'w-fit cursor-pointer list-none select-none hover:text-foreground [&::-webkit-details-marker]:hidden')}>
              Network interfaces · {interfaces.length} <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
            </summary>
          <ul className="mt-2 overflow-hidden rounded-[var(--radius)] bg-surface shadow-[var(--elev-0)]">
            {interfaces.map(([name, reading]) => {
              const { external, loopbackOnly } = classify(reading)
              return (
                <li
                  key={name}
                  className="grid grid-cols-1 gap-x-4 gap-y-1 border-b border-line-subtle px-4 py-2 last:border-b-0 sm:grid-cols-[minmax(0,220px)_72px_minmax(0,1fr)]"
                >
                  <span className="truncate text-ui text-foreground" title={name}>
                    {name}
                  </span>
                  <span className={cn('font-mono text-ledger uppercase tracking-[var(--ls-ledger)]', reading.up ? 'text-foreground-secondary' : 'text-foreground-muted')}>
                    {reading.up ? 'up' : 'down'}
                  </span>
                  <span className="min-w-0 break-all font-mono text-ui text-foreground-muted">
                    {reading.addresses.length === 0
                      ? 'no address'
                      : loopbackOnly
                        ? `${reading.addresses.join(', ')} (loopback)`
                        : external.join(', ')}
                  </span>
                </li>
              )
            })}
          </ul>
          </details>
        </section>
      )}
    </div>
  )
}
