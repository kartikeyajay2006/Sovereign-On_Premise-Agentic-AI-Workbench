'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { CARD, MONO_LABEL, MONO_META } from './tokens'

export interface ChainEntry {
  sequence: number
  category: string
  action: string
  prev: string
  hash: string
}

export interface ChainAppendProps {
  /** Two consecutive records: the one already there, and the one appended to it. */
  previous: ChainEntry
  appended: ChainEntry
  label: string
  source: string
  caption?: string
  className?: string
}

const short = (hash: string) => `${hash.slice(0, 8)}…`

function ms(node: HTMLElement, token: string, fallback: number): number {
  const value = parseFloat(getComputedStyle(node).getPropertyValue(token))
  return Number.isFinite(value) ? value : fallback
}

/**
 * Two records of the run's audit chain, and the link between them.
 *
 * The layout does the explaining. Each record prints its prev and its hash on
 * lines of their own, so the earlier record's hash sits directly above the
 * later record's prev, and the bracket joins two identical strings. That
 * equality is the whole mechanism, and it is shown rather than asserted: both
 * values are the stored ones, and the bracket is only drawn when they are
 * equal -- this component compares them before it draws anything.
 *
 * The motion is the append. The first time the later record is fully on
 * screen it drops into its slot and the link draws to it, on the spatial
 * tier: a record arriving at the end of the log, in the order the log is
 * written. It plays once. Before it plays, and without JavaScript, in print
 * or under reduced motion, the card is simply in its final state -- the
 * animation only ever runs from a state the reader has not yet seen.
 */
export function ChainAppend({ previous, appended, label, source, caption, className }: ChainAppendProps) {
  const appendedRefs = useRef<Array<HTMLParagraphElement | null>>([])
  const linkRef = useRef<HTMLSpanElement | null>(null)
  const linked = appended.prev === previous.hash

  useEffect(() => {
    const lines = appendedRefs.current.filter((node): node is HTMLParagraphElement => node !== null)
    const last = lines[lines.length - 1]
    if (!last || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        const style = getComputedStyle(last)
        const spatial = ms(last, '--spatial', 300)
        const standard = ms(last, '--standard', 200)
        // APPEND, as the landing shows it: the record drops the house
        // --shift-md into its slot at full opacity. Ink never fades in, so
        // the hash is legible on every frame of the drop.
        const drop = ms(last, '--shift-md', 8)
        for (const line of lines) {
          line.animate([{ transform: `translateY(-${drop}px)` }, { transform: 'none' }], {
            duration: spatial,
            easing: style.getPropertyValue('--ease-spatial').trim() || 'ease-out',
          })
        }
        linkRef.current?.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], {
          duration: standard,
          delay: spatial * 0.6,
          easing: style.getPropertyValue('--ease-standard').trim() || 'ease-out',
          fill: 'backwards',
        })
      },
      // The last line fully on screen, not the card merely entering: the
      // append is at the bottom of the card and should play where it is seen.
      { threshold: 1 },
    )
    observer.observe(last)
    return () => observer.disconnect()
  }, [])

  // Every line is its own grid row, so the bracket below spans real line
  // heights: an event line that wraps to two lines makes its row taller and
  // the bracket longer, and its ends stay on the two hash lines.
  const line = 'col-start-2 m-0 min-w-0'
  const hashLine = cn(line, 'truncate')

  return (
    <figure className={cn('m-0 flex flex-col', className)}>
      <div className={cn(CARD, 'overflow-hidden')}>
        <div className="flex h-9 items-center justify-between gap-3 border-b border-border px-3">
          <span className={MONO_LABEL}>{label}</span>
          <span className={cn(MONO_META, 'truncate')}>{source}</span>
        </div>

        <div className="grid grid-cols-[18px_minmax(0,1fr)] px-3 py-3 font-mono text-ui leading-[20px] text-foreground-secondary">
          <p className={cn(line, 'row-start-1')}>
            <span className="text-foreground">seq {previous.sequence}</span> · {previous.category} ·{' '}
            <span className="break-all">{previous.action}</span>
          </p>
          <p className={cn(hashLine, 'row-start-2')} title={previous.prev}>
            prev {short(previous.prev)}
          </p>
          <p className={cn(hashLine, 'row-start-3')} title={previous.hash}>
            hash <span className="text-foreground">{short(previous.hash)}</span>
          </p>

          {/*
            From the middle of the earlier record's hash line (row 3) to the
            middle of the later record's prev line (row 5): three rows, less a
            half line at each end.
          */}
          {linked ? (
            <span
              ref={linkRef}
              aria-hidden
              className="col-start-1 row-start-3 row-end-6 my-[10px] ml-[3px] w-[9px] origin-top border-y border-l border-foreground/55"
            />
          ) : null}

          <p
            ref={(node) => {
              appendedRefs.current[0] = node
            }}
            className={cn(line, 'row-start-4')}
          >
            <span className="text-foreground">seq {appended.sequence}</span> · {appended.category} ·{' '}
            <span className="break-all">{appended.action}</span>
          </p>
          <p
            ref={(node) => {
              appendedRefs.current[1] = node
            }}
            className={cn(hashLine, 'row-start-5')}
            title={appended.prev}
          >
            prev <span className="text-foreground">{short(appended.prev)}</span>
          </p>
          <p
            ref={(node) => {
              appendedRefs.current[2] = node
            }}
            className={cn(hashLine, 'row-start-6')}
            title={appended.hash}
          >
            hash {short(appended.hash)}
          </p>
        </div>
      </div>
      {caption ? <figcaption className="mt-3 text-body text-foreground-secondary">{caption}</figcaption> : null}
    </figure>
  )
}
