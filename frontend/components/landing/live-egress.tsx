'use client'

import { useEffect, useRef, useState } from 'react'
import { STATS } from './copy'

/**
 * The egress cell of the stat band: how many connections the egress monitor
 * has seen leave this host, read by the visitor's browser from GET
 * /api/status, and read again every 20 s while the band is on screen.
 *
 * Before the first reading, and whenever the host cannot be read, the cell
 * shows the count the run's own closing record wrote down, labelled as that,
 * so the band never prints a number nobody measured. A reading is shown as it
 * is; the roll runs only when a later reading differs from the one before it,
 * never from zero on load.
 */

interface PublicStatus {
  external_calls: number
  monitored_since: string
}

function isStatus(value: unknown): value is PublicStatus {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.external_calls === 'number' && typeof v.monitored_since === 'string'
}

/** "2026-09-24T06:01:27.1+00:00" -> "06:01". */
const hhmm = (iso: string) => /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? null

const POLL_MS = 20_000

export function LiveEgress({ recorded }: { recorded: { value: number; seq: number } | null }) {
  const [live, setLive] = useState<PublicStatus | null>(null)
  const [previous, setPrevious] = useState<number | null>(null)
  const [turn, setTurn] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const last = useRef<number | null>(null)

  useEffect(() => {
    let visible = true
    let timer = 0
    let controller: AbortController | null = null

    const read = () => {
      controller?.abort()
      controller = new AbortController()
      const abort = window.setTimeout(() => controller?.abort(), 2500)
      fetch('/api/status', { signal: controller.signal, cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error('status'))))
        .then((body: unknown) => {
          if (!isStatus(body)) return
          const before = last.current
          last.current = body.external_calls
          if (before !== null && before !== body.external_calls) {
            setPrevious(before)
            setTurn((n) => n + 1)
          }
          setLive(body)
        })
        .catch(() => {})
        .finally(() => window.clearTimeout(abort))
    }
    const schedule = () => {
      window.clearTimeout(timer)
      if (visible && document.visibilityState === 'visible') timer = window.setTimeout(tick, POLL_MS)
    }
    const tick = () => {
      read()
      schedule()
    }

    read()
    schedule()
    const io =
      typeof IntersectionObserver === 'undefined' || !root.current
        ? null
        : new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
            schedule()
          })
    if (io && root.current) io.observe(root.current)
    document.addEventListener('visibilitychange', schedule)
    return () => {
      window.clearTimeout(timer)
      controller?.abort()
      io?.disconnect()
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [])

  const value = live ? live.external_calls : (recorded?.value ?? null)
  const line = live
    ? STATS.egress.live(hhmm(live.monitored_since))
    : recorded
      ? STATS.egress.recorded(recorded.seq)
      : STATS.egress.reading

  return (
    <div ref={root} className={`cell${live && live.external_calls > 0 ? ' breach' : ''}`}>
      <small>{STATS.egress.label}</small>
      <b aria-live="polite">
        {value === null ? (
          '—'
        ) : (
          <>
            <span className="lp-roll" key={turn} data-rolled={previous !== null && turn > 0 ? '' : undefined}>
              {previous !== null && turn > 0 ? (
                <span className="was" aria-hidden>
                  {previous}
                </span>
              ) : null}
              <i className="now">{value}</i>
            </span>{' '}
            {STATS.egress.unit(value)}
          </>
        )}
      </b>
      <span className="sub">{line}</span>
    </div>
  )
}
