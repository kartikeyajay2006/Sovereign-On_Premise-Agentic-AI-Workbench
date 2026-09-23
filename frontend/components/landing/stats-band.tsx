'use client'

import { useEffect, useRef, useState } from 'react'

export interface Stat {
  label: string
  value: string
  suffix?: string
  sub: string
}

/** The leading number of a value like "195.2" or "3/4", and how to print it. */
function parse(value: string): { target: number; decimals: number; rest: string } | null {
  const m = value.match(/^(\d+(?:\.\d+)?)(.*)$/)
  if (!m) return null
  const decimals = m[1].includes('.') ? m[1].split('.')[1].length : 0
  return { target: Number(m[1]), decimals, rest: m[2] }
}

/**
 * A figure that counts up from zero once, when it is first seen, and lands on
 * the value the record holds. The printed value is the record's from the
 * first render for anything that is not scripted -- a print, a screen reader,
 * reduced motion -- and the count only animates toward it.
 */
function Figure({ value }: { value: string }) {
  const parsed = parse(value)
  const [shown, setShown] = useState(value)
  const el = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!parsed || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const node = el.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    let frame = 0
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        io.disconnect()
        const start = performance.now()
        const duration = 1100
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / duration)
          const eased = 1 - Math.pow(1 - t, 3)
          setShown(`${(parsed.target * eased).toFixed(parsed.decimals)}${parsed.rest}`)
          if (t < 1) frame = requestAnimationFrame(step)
        }
        setShown(`${(0).toFixed(parsed.decimals)}${parsed.rest}`)
        frame = requestAnimationFrame(step)
      },
      { threshold: 0.4 },
    )
    io.observe(node)
    return () => {
      io.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
    // The value is fixed for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <span ref={el} aria-label={value}>
      <span aria-hidden>{shown}</span>
    </span>
  )
}

/**
 * Four numbers, each read from the run record by the page. This component
 * draws what it is handed and invents nothing, so a figure the record
 * cannot supply is dropped by the caller rather than drawn as a placeholder.
 */
export function StatsBand({ stats, label, className }: { stats: Stat[]; label: string; className?: string }) {
  if (stats.length === 0) return null
  return (
    <dl aria-label={label} className={`ae-stats m-0 ${className ?? ''}`}>
      {stats.map((stat) => (
        <div key={stat.label} className="ae-stat">
          <dd className="v m-0 tabular-nums">
            <Figure value={stat.value} />
            {stat.suffix ? <small>{stat.suffix}</small> : null}
          </dd>
          <dt className="l">{stat.label}</dt>
          <dd className="s m-0">{stat.sub}</dd>
        </div>
      ))}
    </dl>
  )
}
