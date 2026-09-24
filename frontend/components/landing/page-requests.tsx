'use client'

import { useEffect, useState } from 'react'

/**
 * Every request this page has made, counted by the reader's own browser.
 *
 * Read from the Resource Timing buffer -- the same list the network tab
 * draws -- plus the page's own navigation, grouped by host. If anything went
 * anywhere but this page's own host it is listed by name, in the same size
 * as the rest; nothing here assumes the answer. It keeps counting as images
 * and scripts load while the reader scrolls.
 */

interface Reading {
  total: number
  hosts: Array<{ host: string; count: number }>
  recent: Array<{ host: string; path: string }>
  self: string
}

function read(): Reading {
  const entries = [
    ...(performance.getEntriesByType('navigation') as PerformanceEntry[]),
    ...(performance.getEntriesByType('resource') as PerformanceEntry[]),
  ]
  const counts = new Map<string, number>()
  const recent: Array<{ host: string; path: string }> = []
  for (const entry of entries) {
    let url: URL
    try {
      url = new URL(entry.name)
    } catch {
      continue
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
    counts.set(url.host, (counts.get(url.host) ?? 0) + 1)
    recent.push({ host: url.host, path: `${url.pathname}${url.search ? '?…' : ''}` })
  }
  const hosts = [...counts.entries()].map(([host, count]) => ({ host, count })).sort((a, b) => b.count - a.count)
  return {
    total: hosts.reduce((sum, h) => sum + h.count, 0),
    hosts,
    recent: recent.slice(-4).reverse(),
    self: window.location.host,
  }
}

export function PageRequests() {
  const [reading, setReading] = useState<Reading | null>(null)

  useEffect(() => {
    setReading(read())
    if (typeof PerformanceObserver === 'undefined') return
    const observer = new PerformanceObserver(() => setReading(read()))
    try {
      observer.observe({ type: 'resource', buffered: false })
    } catch {
      return
    }
    return () => observer.disconnect()
  }, [])

  if (!reading) {
    return <p className="ae-req-line">Counting this page’s requests…</p>
  }

  const others = reading.hosts.filter((h) => h.host !== reading.self)
  return (
    <div className="ae-req">
      <p className="ae-req-figure">
        <span className="n">{reading.total}</span>
        <span className="u">request{reading.total === 1 ? '' : 's'} so far</span>
      </p>
      <p className={others.length === 0 ? 'ae-req-line ok' : 'ae-req-line no'}>
        {others.length === 0
          ? `All of them to ${reading.self}, the host that served this page.`
          : `${others.reduce((s, h) => s + h.count, 0)} went elsewhere: ${others.map((h) => h.host).join(', ')}.`}
      </p>
      <ul className="ae-req-list" aria-label="The most recent requests">
        {reading.recent.map((entry, n) => (
          <li key={`${entry.path}-${n}`} className={entry.host === reading.self ? undefined : 'no'}>
            <span className="host">{entry.host}</span>
            {entry.path}
          </li>
        ))}
      </ul>
    </div>
  )
}
