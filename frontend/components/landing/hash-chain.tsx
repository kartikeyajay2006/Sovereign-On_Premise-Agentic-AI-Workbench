'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { digest, field, parseLexemes, replaceAtom, without, type Lexeme } from './audit-hash'
import { ACTION_FILL, CARD, FOCUS, MONO_LABEL, MONO_META } from './tokens'

export interface StoredRecord {
  sequence: number
  /** The line exactly as it sits in the audit log. The only input to the hash. */
  line: string
}

/**
 * Strings, with {placeholders} filled here. They cross from the server page to
 * this client component, and only serialisable values can.
 */
export interface HashChainLabels {
  heading: string
  source: string
  idle: string
  /** {records}, {links} */
  verified: string
  /** {seq} */
  broken: string
  /** {next}. Appended to `broken` when a record follows the break. */
  brokenNext: string
  recomputed: string
  stored: string
  matches: string
  differs: string
  /** {seq} */
  link: string
  /** {seq} */
  linkBroken: string
  storedLine: string
  tamper: string
  restore: string
}

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))

export interface HashChainProps {
  records: StoredRecord[]
  /**
   * The one edit the reader may make: which record, the path to one value in
   * it, and what to write there. Written as data so the page, not this
   * component, decides what the demonstration changes -- and null when the
   * page found nothing honest to offer, in which case there is no button.
   */
  edit: { sequence: number; path: string[]; value: string } | null
  labels: HashChainLabels
  className?: string
}

interface Checked {
  sequence: number
  tree: Lexeme
  prev: string | null
  stored: string | null
  recomputed: string | null
  /** Recomputed equals stored. */
  intact: boolean
  /** This record's prev equals the stored hash of the record above it. Null for the first. */
  linked: boolean | null
}

const short = (hash: string | null) => (hash ? `${hash.slice(0, 8)}…` : '—')

/**
 * A value rendered the way the log stores it -- ", " and ": " between tokens,
 * keys in their stored order -- with strings decoded so an escaped em dash
 * reads as a dash. Display only: the hash is never computed from this.
 */
function Value({ node, path, changed }: { node: Lexeme; path: string[]; changed: string[] | null }): ReactNode {
  if (node.kind === 'atom') {
    const isChanged = changed !== null && changed.length === path.length && changed.every((part, i) => part === path[i])
    let text = node.text
    if (text.startsWith('"')) {
      try {
        text = JSON.stringify(JSON.parse(text) as string)
      } catch {
        // Leave the stored spelling if it will not decode.
      }
    }
    return isChanged ? (
      <span className="rounded-[2px] bg-critical-surface px-0.5 text-critical-text">{text}</span>
    ) : (
      text
    )
  }
  if (node.kind === 'array') {
    return (
      <>
        [
        {node.items.map((item, i) => (
          <Fragment key={i}>
            {i > 0 ? ', ' : null}
            <Value node={item} path={[...path, String(i)]} changed={changed} />
          </Fragment>
        ))}
        ]
      </>
    )
  }
  return (
    <>
      {'{'}
      {node.entries.map(([key, value], i) => {
        const name = JSON.parse(key) as string
        return (
          <Fragment key={key}>
            {i > 0 ? ', ' : null}
            {key}: <Value node={value} path={[...path, name]} changed={changed} />
          </Fragment>
        )
      })}
      {'}'}
    </>
  )
}

function entry(tree: Lexeme, key: string): Lexeme | null {
  if (tree.kind !== 'object') return null
  const found = tree.entries.find(([name]) => JSON.parse(name) === key)
  return found ? found[1] : null
}

/**
 * Three consecutive records from the audit log, re-hashed in the reader's
 * browser.
 *
 * Everything this reports is computed here, now, from the stored lines: each
 * record's SHA-256 over its predecessor's hash and its own canonical body --
 * the arithmetic backend/core/audit.py does -- compared with the hash stored
 * beside it, and each record's prev compared with the hash above it. Nothing
 * is precomputed into the fixture, so "matches" on this card is the reader's
 * measurement and not ours.
 *
 * The edit is the argument. It rewrites one value in the reader's copy -- the
 * failed verification made to say it passed -- and recomputes. The record
 * stops hashing to its stored value, which is exactly where verify_chain on
 * the server would report the break. Nothing leaves the page.
 *
 * Results are revealed one record at a time, a standard-tier step apart. The
 * hashing itself takes well under a millisecond; the stagger is only so the
 * links can be read in the order the chain is built, and under reduced motion
 * there is none.
 */
export function HashChain({ records, edit, labels, className }: HashChainProps) {
  const [edited, setEdited] = useState(false)
  const [computed, setComputed] = useState(false)
  const [revealed, setRevealed] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const timers = useRef<number[]>([])

  const checked = useMemo<Checked[]>(() => {
    const out: Checked[] = []
    records.forEach((record, i) => {
      let tree = parseLexemes(record.line)
      if (edit && edited && record.sequence === edit.sequence) {
        tree = replaceAtom(tree, edit.path, edit.value) ?? tree
      }
      const prev = field(tree, 'prev_hash')
      const stored = field(tree, 'hash')
      const recomputed = prev !== null ? digest(prev, without(tree, 'hash')) : null
      out.push({
        sequence: record.sequence,
        tree,
        prev,
        stored,
        recomputed,
        intact: recomputed !== null && recomputed === stored,
        linked: i === 0 ? null : prev !== null && prev === out[i - 1].stored,
      })
    })
    return out
  }, [records, edited, edit])

  const reveal = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer)
    timers.current = []
    setComputed(true)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !rootRef.current) {
      setRevealed(records.length)
      return
    }
    const step = parseFloat(getComputedStyle(rootRef.current).getPropertyValue('--standard')) || 200
    setRevealed(1)
    for (let i = 2; i <= records.length; i += 1) {
      timers.current.push(window.setTimeout(() => setRevealed(i), step * (i - 1)))
    }
  }, [records.length])

  // Recompute the first time the card is on screen. A reader who never
  // scrolls here is not shown a verdict nobody computed.
  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      reveal()
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        observer.disconnect()
        reveal()
      },
      { threshold: 0.35 },
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
      for (const timer of timers.current) window.clearTimeout(timer)
    }
  }, [reveal])

  // Mirrors verify_chain: walk forward, and the first record whose prev or
  // whose own hash does not hold is where the chain breaks.
  const breakIndex = checked.findIndex((record) => record.linked === false || !record.intact)
  const allShown = computed && revealed >= checked.length
  const after = breakIndex === -1 ? undefined : checked[breakIndex + 1]
  const verdict = !allShown
    ? labels.idle
    : breakIndex === -1
      ? fill(labels.verified, { records: checked.length, links: checked.length - 1 })
      : fill(labels.broken, { seq: checked[breakIndex].sequence }) +
        (after ? fill(labels.brokenNext, { next: after.sequence }) : '')

  return (
    <div ref={rootRef} className={cn('flex flex-col gap-4', className)}>
      <div className={cn(CARD, 'overflow-hidden')}>
        <div className="flex h-9 items-center justify-between gap-3 border-b border-border px-3">
          <span className={MONO_LABEL}>{labels.heading}</span>
          <span className={cn(MONO_META, 'truncate')}>{labels.source}</span>
        </div>

        <ol className="m-0 list-none p-0">
          {checked.map((record, i) => {
            const shown = computed && revealed > i
            const detail = entry(record.tree, 'detail')
            const category = field(record.tree, 'category')
            const action = field(record.tree, 'action')
            const at = field(record.tree, 'at')
            return (
              <li key={record.sequence}>
                {i > 0 ? (
                  // The link to the record above: this record's prev against
                  // that record's stored hash.
                  <div className="flex items-center gap-3 px-3 py-1.5">
                    <span
                      aria-hidden
                      className={cn(
                        'ml-[5px] h-5 w-px origin-top transition-[transform,background-color] duration-[var(--standard)] ease-[var(--ease-standard)] motion-reduce:transition-none',
                        !shown ? 'scale-y-50 bg-line-default' : record.linked ? 'scale-y-100 bg-foreground/60' : 'scale-y-100 bg-critical',
                      )}
                    />
                    <span
                      className={cn(
                        MONO_META,
                        shown && record.linked === false && 'text-critical-text',
                        shown && record.linked === true && 'text-foreground-secondary',
                      )}
                    >
                      {!shown
                        ? fill(labels.link, { seq: checked[i - 1].sequence })
                        : record.linked
                          ? `${fill(labels.link, { seq: checked[i - 1].sequence })} · ${labels.matches}`
                          : fill(labels.linkBroken, { seq: checked[i - 1].sequence })}
                    </span>
                  </div>
                ) : null}

                <div className={cn('border-line-subtle px-3 py-3', i > 0 && 'border-t')}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="m-0 font-mono text-ui text-foreground">
                      seq {record.sequence}
                      <span className="text-foreground-secondary">
                        {' '}
                        · {category} · {action}
                      </span>
                    </p>
                    {at ? <p className={cn(MONO_META, 'm-0')}>{at.replace('T', ' ').slice(0, 19)} UTC</p> : null}
                  </div>

                  {detail ? (
                    <p className="m-0 mt-2 break-words font-mono text-meta leading-[18px] text-foreground-secondary">
                      <span className="text-foreground-muted">detail </span>
                      <Value
                        node={detail}
                        path={['detail']}
                        changed={edit && edited && record.sequence === edit.sequence ? edit.path : null}
                      />
                    </p>
                  ) : null}

                  <dl className="m-0 mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-meta leading-[18px]">
                    <dt className="text-foreground-muted">prev</dt>
                    <dd className="m-0 truncate text-foreground-secondary" title={record.prev ?? undefined}>
                      {short(record.prev)}
                    </dd>
                    <dt className="text-foreground-muted">{labels.stored}</dt>
                    <dd className="m-0 truncate text-foreground" title={record.stored ?? undefined}>
                      {short(record.stored)}
                    </dd>
                    <dt className="text-foreground-muted">{labels.recomputed}</dt>
                    <dd
                      className={cn(
                        'm-0 truncate',
                        !shown ? 'text-foreground-muted' : record.intact ? 'text-sovereign-text' : 'text-critical-text',
                      )}
                      title={shown ? (record.recomputed ?? undefined) : undefined}
                    >
                      {/* Unknown until computed, and printed as unknown. */}
                      {!shown ? '—' : `${short(record.recomputed)} · ${record.intact ? labels.matches : labels.differs}`}
                    </dd>
                  </dl>

                  <details className="group mt-2.5">
                    <summary
                      className={cn(
                        MONO_META,
                        // 24px tall, 44px on touch: a disclosure is a target
                        // like any other, however small its label.
                        'inline-flex min-h-6 cursor-pointer list-none items-center gap-1.5 rounded-[2px] hover:text-foreground pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden',
                        FOCUS,
                      )}
                    >
                      <span aria-hidden className="transition-transform duration-[var(--micro)] group-open:rotate-90 motion-reduce:transition-none">
                        ›
                      </span>
                      {labels.storedLine}
                    </summary>
                    <pre className="m-0 mt-2 whitespace-pre-wrap break-all font-mono text-ledger leading-[16px] text-foreground-muted">
                      {records[i].line}
                    </pre>
                  </details>
                </div>
              </li>
            )
          })}
        </ol>

        {/*
          Verdict above the control, always: the cell is under 500px wide even
          on a desktop, too narrow to put a sentence and a button side by side.
        */}
        <div className="flex flex-col items-start gap-3 border-t border-border px-3 py-3">
          <p
            aria-live="polite"
            className={cn(
              'm-0 text-ui leading-[18px]',
              !allShown ? 'text-foreground-muted' : breakIndex === -1 ? 'text-foreground' : 'text-critical-text',
            )}
          >
            {verdict}
          </p>
          {edit ? (
            <button
              type="button"
              onClick={() => {
                setEdited((value) => !value)
                reveal()
              }}
              className={cn(
                'inline-flex h-9 shrink-0 items-center justify-center rounded-[4px] px-3 text-ui font-medium pointer-coarse:h-11',
                'transition-[background-color,color,box-shadow] duration-[var(--micro)] ease-[var(--ease-micro)] hover:duration-0 motion-reduce:transition-none',
                edited
                  ? 'bg-transparent text-foreground shadow-[0_0_0_1px_var(--control-default)] hover:shadow-[0_0_0_1px_var(--control-strong)]'
                  : ACTION_FILL,
                FOCUS,
              )}
            >
              {edited ? labels.restore : labels.tamper}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
