'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { STATS } from './copy'

/**
 * How many connections the egress monitor has seen leave this host, read by
 * the visitor's browser from GET /api/status, and read again every 20 s while
 * the reading is on screen. Two faces share the one reading: the hero's stat
 * cell and the footer's chip.
 *
 * Before the first reading, and whenever the host cannot be read, each shows
 * the count the run's own closing record wrote down, labelled as that, so the
 * page never prints a number nobody measured. A reading is shown as it is;
 * the roll runs only when a later reading differs from the one before it,
 * never from zero on load.
 */

interface PublicStatus {
  external_calls: number
  monitored_since: string
}

type Recorded = { value: number; seq: number } | null

function isStatus(value: unknown): value is PublicStatus {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.external_calls === 'number' && typeof v.monitored_since === 'string'
}

/** "2026-09-24T06:01:27.1+00:00" -> "06:01". */
const hhmm = (iso: string) => /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? null

const POLL_MS = 20_000

function useEgressReading(root: RefObject<HTMLElement | null>, recorded: Recorded) {
  const [live, setLive] = useState<PublicStatus | null>(null)
  const [previous, setPrevious] = useState<number | null>(null)
  const [turn, setTurn] = useState(0)
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
  }, [root])

  const value = live ? live.external_calls : (recorded?.value ?? null)
  const line = live
    ? STATS.egress.live(hhmm(live.monitored_since))
    : recorded
      ? STATS.egress.recorded(recorded.seq)
      : STATS.egress.reading
  return { live, value, line, previous, turn, breach: live !== null && live.external_calls > 0 }
}

/** The hero's stat cell. */
export function LiveEgress({ recorded }: { recorded: Recorded }) {
  const root = useRef<HTMLDivElement>(null)
  const { value, line, previous, turn, breach } = useEgressReading(root, recorded)

  return (
    <div ref={root} className={`cell${breach ? ' breach' : ''}`}>
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

/** The footer's chip: the same reading, one line. The dot is green only for a live zero. */
export function EgressChip({ recorded }: { recorded: Recorded }) {
  const root = useRef<HTMLParagraphElement>(null)
  const { live, value, line, breach } = useEgressReading(root, recorded)
  const tone = breach ? 'breach' : live ? 'live' : 'recorded'

  return (
    <p ref={root} className="lp-egress-chip" data-tone={tone}>
      <i aria-hidden />
      <span aria-live="polite">
        {STATS.egress.label} {value === null ? '—' : `${value} ${STATS.egress.unit(value)}`}
      </span>
      <span className="sub">{line}</span>
    </p>
  )
}
