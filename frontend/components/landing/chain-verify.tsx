'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { digest, field, parseLexemes, without } from './audit-hash'
import { CHAIN_VERIFY } from './copy'

export interface VerifyRecord {
  seq: number
  category: string
  action: string
  /** The record exactly as it sits in the log. */
  line: string
}

const short = (hash: string | null) => (hash ? hash.slice(0, 8) : '—')
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))

/**
 * The hash-chain verify strip: five boxes, prev → hash, with a lime segment
 * running along them once the chain checks out.
 *
 * The boxes are what the capture holds, and no more: the record before the
 * run's tail, known only by the hash the first tail record points at; the
 * tail's three records, each re-hashed here, in this browser, the way
 * backend/core/audit.py hashes it; and the run's sealed head, compared with
 * the hash of the last record. The segment advances 120ms a box over the
 * boxes that verified and stops, critical, at the first that did not. It runs
 * once, when the strip is first on screen; under reduced motion the result is
 * drawn at once.
 */
export function ChainVerify({ records, head }: { records: VerifyRecord[]; head: string | null }) {
  const [computed, setComputed] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => {
    return records.map((record, n) => {
      const tree = parseLexemes(record.line)
      const prev = field(tree, 'prev_hash')
      const stored = field(tree, 'hash')
      const here = prev !== null ? digest(prev, without(tree, 'hash')) : null
      return { ...record, prev, stored, here, n }
    })
  }, [records])

  useEffect(() => {
    const el = root.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setComputed(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setComputed(true)
          io.disconnect()
        }
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Box 0 is the record before the tail; boxes 1..n the tail; the last, the head.
  const first = rows[0]
  const last = rows.at(-1) ?? null
  const verdicts = rows.map((row, i) => {
    const intact = row.here !== null && row.here === row.stored
    const linked = i === 0 ? true : row.prev === rows[i - 1].stored
    return intact && linked
  })
  const headOk = head !== null && last !== null && last.stored === head
  const boxes = [true, ...verdicts, headOk]
  const breakAt = boxes.findIndex((ok) => !ok)
  const reached = breakAt === -1 ? boxes.length : breakAt
  const verdict = !computed
    ? CHAIN_VERIFY.idle
    : breakAt === -1
      ? fill(CHAIN_VERIFY.verified, { n: rows.length })
      : fill(CHAIN_VERIFY.broken, { at: breakAt === boxes.length - 1 ? CHAIN_VERIFY.head : `#${rows[breakAt - 1].seq}` })

  const state = (i: number) => (!computed ? undefined : i < reached ? 'ok' : i === breakAt ? 'no' : undefined)

  return (
    <div ref={root} className="lp-verify" data-done={computed ? '' : undefined} style={{ ['--reach' as string]: computed ? reached : 0, ['--boxes' as string]: boxes.length } as CSSProperties}>
      <ol className="boxes">
        {/* Not re-hashed: the capture holds its hash, not its body. */}
        <li data-state={computed ? 'anchor' : undefined} style={{ ['--i' as string]: 0 } as CSSProperties}>
          <p className="seq">{first ? `#${first.seq - 1}` : CHAIN_VERIFY.before}</p>
          <p className="what">{CHAIN_VERIFY.beforeLine}</p>
          <p className="h">
            <span>hash</span> {short(first?.prev ?? null)}
          </p>
        </li>
        {rows.map((row, i) => (
          <li key={row.seq} data-state={state(i + 1)} style={{ ['--i' as string]: i + 1 } as CSSProperties}>
            <p className="seq">#{row.seq}</p>
            <p className="what">
              {row.category} · {row.action}
            </p>
            <p className="h">
              <span>prev</span> {short(row.prev)}
            </p>
            <p className="h">
              <span>hash</span> {computed ? short(row.here) : short(row.stored)}
            </p>
          </li>
        ))}
        <li data-state={state(boxes.length - 1)} style={{ ['--i' as string]: boxes.length - 1 } as CSSProperties}>
          <p className="seq">{CHAIN_VERIFY.head}</p>
          <p className="what">sealed</p>
          <p className="h">
            <span>hash</span> {short(head)}
          </p>
        </li>
      </ol>
      <div className="track" aria-hidden>
        <i />
      </div>
      <p className="verdict" aria-live="polite" data-broken={computed && breakAt !== -1 ? '' : undefined}>
        {verdict}
      </p>
    </div>
  )
}
