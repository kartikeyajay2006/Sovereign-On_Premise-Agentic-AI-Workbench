'use client'

import { useEffect, useState } from 'react'

/**
 * Elapsed time, measured on the server's clock.
 *
 * A run's start is a server timestamp, so subtracting it from the browser's
 * clock would fold any skew between the two machines into the figure. The
 * view carries `server_time`; the counter advances from that reading by the
 * browser time that has passed since it arrived.
 *
 * A finished run returns its fixed duration and does not tick. Nothing here
 * projects forward: there is no estimate of time remaining anywhere in the
 * harness, because nothing measured supports one.
 */
export function useElapsed(
  startedAt: string | null,
  endedAt: string | null,
  serverTime: string | null,
  fetchedAt: number | null,
): number | null {
  const [now, setNow] = useState(() => Date.now())
  const ticking = !endedAt && Boolean(startedAt && serverTime && fetchedAt)

  useEffect(() => {
    if (!ticking) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [ticking])

  if (!startedAt) return null
  const start = Date.parse(startedAt)
  if (Number.isNaN(start)) return null
  if (endedAt) {
    const end = Date.parse(endedAt)
    return Number.isNaN(end) ? null : Math.max(0, end - start)
  }
  if (!serverTime || fetchedAt === null) return null
  const server = Date.parse(serverTime)
  if (Number.isNaN(server)) return null
  return Math.max(0, server + (now - fetchedAt) - start)
}
