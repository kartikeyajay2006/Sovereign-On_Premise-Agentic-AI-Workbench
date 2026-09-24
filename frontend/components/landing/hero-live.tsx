'use client'

import { useEffect, useState } from 'react'

/**
 * One live reading in the hero: how many connections the egress monitor has
 * seen leave this host, and since when -- read by the visitor's browser from
 * GET /api/status as the page loads.
 *
 * It is shown only once it has been read. A page served without its backend
 * shows nothing here rather than a pleasant default, and the security
 * section below says plainly that the reading could not be taken.
 */

interface PublicStatus {
  external_calls: number
  monitored_since: string
  sovereign: boolean
}

function isStatus(value: unknown): value is PublicStatus {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.external_calls === 'number' && typeof v.monitored_since === 'string' && typeof v.sovereign === 'boolean'
}

/** "2026-09-24T06:01:27.1+00:00" -> "06:01 UTC". */
const clock = (iso: string) => /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? null

export function HeroLive({ className }: { className?: string }) {
  const [status, setStatus] = useState<PublicStatus | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 2500)
    fetch('/api/status', { signal: controller.signal, cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('status'))))
      .then((body: unknown) => {
        if (isStatus(body)) setStatus(body)
      })
      .catch(() => {})
      .finally(() => window.clearTimeout(timer))
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [])

  if (!status) return null
  const since = clock(status.monitored_since)
  const n = status.external_calls
  return (
    <p className={`lp-live ${n === 0 ? '' : 'breach'} ${className ?? ''}`} aria-live="polite">
      <span className="dot" aria-hidden />
      <span className="k">Live from this host</span>
      <span className="v">
        {n === 0 ? 'no connection has left it' : `${n} connection${n === 1 ? ' has' : 's have'} left it`}
        {since ? ` since ${since} UTC` : ''}
      </span>
    </p>
  )
}
