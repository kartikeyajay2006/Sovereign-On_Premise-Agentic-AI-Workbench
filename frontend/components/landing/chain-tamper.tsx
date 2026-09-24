'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { atomAt, digest, field, parseLexemes, replaceAtom, without } from './audit-hash'

/**
 * Three records of the audit log, re-hashed in the reader's browser, with
 * one edit the reader can make and undo.
 *
 * Every verdict here is this browser's arithmetic, done when the card is on
 * screen: each record's SHA-256 over its predecessor's hash and its own
 * canonical body -- what backend/core/audit.py computes -- against the hash
 * stored beside it, and each record's prev against the hash of the record
 * before it. The edit rewrites one value in the reader's copy and hashes
 * again; the record stops matching its stored hash, and the next record
 * still points at the original. That is the whole of tamper evidence, shown
 * rather than claimed.
 *
 * The edit is offered only when the stored record holds the value it says it
 * changes, so the button never describes an edit the record could not have.
 */

export interface TamperRecord {
  sequence: number
  line: string
}

export interface TamperEdit {
  path: string[]
  /** The stored value, as it is spelled in the log: `"engineer"`. */
  from: string
  to: string
  label: string
}

export interface TamperLabels {
  restore: string
  verified: string
  broken: string
  brokenLast: string
  idle: string
}

const short = (hash: string | null) => (hash ? `${hash.slice(0, 8)}…` : '—')
const words = (atom: string | null) => (atom ? atom.replace(/^"|"$/g, '') : '—')
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))

export function ChainTamper({
  records,
  edit,
  labels,
}: {
  records: TamperRecord[]
  edit: TamperEdit
  labels: TamperLabels
}) {
  const [edited, setEdited] = useState(false)
  const [computed, setComputed] = useState(false)
  const [pulse, setPulse] = useState(0)
  const root = useRef<HTMLDivElement | null>(null)

  // The record the edit applies to: the first whose stored value is `from`.
  const target = useMemo(
    () => records.find((record) => atomAt(parseLexemes(record.line), edit.path) === edit.from)?.sequence ?? null,
    [records, edit],
  )

  const rows = useMemo(() => {
    const out: Array<{
      sequence: number
      category: string | null
      action: string | null
      value: string | null
      prev: string | null
      stored: string | null
      here: string | null
      intact: boolean
      linked: boolean | null
    }> = []
    records.forEach((record, n) => {
      let tree = parseLexemes(record.line)
      if (edited && record.sequence === target) tree = replaceAtom(tree, edit.path, edit.to) ?? tree
      const prev = field(tree, 'prev_hash')
      const stored = field(tree, 'hash')
      const here = prev !== null ? digest(prev, without(tree, 'hash')) : null
      out.push({
        sequence: record.sequence,
        category: field(tree, 'category'),
        action: field(tree, 'action'),
        value: atomAt(tree, edit.path),
        prev,
        stored,
        here,
        intact: here !== null && here === stored,
        linked: n === 0 ? null : prev !== null && prev === out[n - 1].stored,
      })
    })
    return out
  }, [records, edited, target, edit])

  // Hash when the card is first on screen: a reader who never scrolls here
  // is not shown a verdict nobody computed.
  useEffect(() => {
    const node = root.current
    if (!node) return
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
      { threshold: 0.3 },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [])

  const breakAt = rows.findIndex((row) => !row.intact || row.linked === false)
  const verdict = !computed
    ? labels.idle
    : breakAt === -1
      ? fill(labels.verified, { n: rows.length })
      : breakAt < rows.length - 1
        ? fill(labels.broken, { seq: rows[breakAt].sequence, next: rows[breakAt + 1].sequence })
        : fill(labels.brokenLast, { seq: rows[breakAt].sequence })

  return (
    <div ref={root} className="ae-tamper">
      <ol className="ae-tamper-chain">
        {rows.map((row, n) => {
          const broken = computed && !row.intact
          // The link to the record above breaks when this record's prev is not
          // that record's stored hash -- or when that record no longer hashes
          // to it, which is what an edit to it does.
          const linkBroken = computed && n > 0 && (row.linked === false || !rows[n - 1].intact)
          const isTarget = row.sequence === target
          return (
            <li key={row.sequence} className="ae-tamper-item">
              {n > 0 && (
                <span className={cn('ae-tamper-link', computed && (linkBroken ? 'no' : 'ok'))} aria-hidden>
                  <i />
                </span>
              )}
              <div
                key={isTarget ? `${row.sequence}-${pulse}` : row.sequence}
                className={cn('ae-tamper-block', broken && 'broken', isTarget && edited && 'edited')}
              >
                <p className="seq">
                  seq {row.sequence}
                  <span className={cn('state', computed && (row.intact ? 'ok' : 'no'))}>
                    {!computed ? '…' : row.intact ? '✓' : '✕'}
                  </span>
                </p>
                <p className="what">
                  {row.category} · {row.action}
                </p>
                <p className="field">
                  <span className="k">{edit.path.join('.')}</span>{' '}
                  <span className={cn('v', isTarget && edited && 'changed')}>{words(row.value)}</span>
                </p>
                <dl className="hashes">
                  <dt>prev</dt>
                  <dd className={cn(n > 0 && computed && (linkBroken ? 'no' : 'ok'))}>{short(row.prev)}</dd>
                  <dt>stored</dt>
                  <dd>{short(row.stored)}</dd>
                  <dt>here</dt>
                  <dd className={cn(computed && (row.intact ? 'ok' : 'no'))}>{computed ? short(row.here) : '—'}</dd>
                </dl>
              </div>
            </li>
          )
        })}
      </ol>

      <div className="ae-tamper-foot">
        <p aria-live="polite" className={cn('ae-tamper-verdict', computed && breakAt !== -1 && 'no')}>
          {verdict}
        </p>
        {target !== null && (
          <button
            type="button"
            className={cn('ae-btn sm', edited ? 'ghost' : 'primary')}
            onClick={() => {
              setEdited((value) => !value)
              setComputed(true)
              setPulse((p) => p + 1)
            }}
          >
            {edited ? labels.restore : `${edit.label}: ${words(edit.from)} → ${words(edit.to)}`}
          </button>
        )}
      </div>
    </div>
  )
}
