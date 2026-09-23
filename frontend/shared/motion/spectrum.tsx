'use client'

import { memo, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'

/**
 * THE SPECTRUM: a set of records, one cell each, coloured by what each one
 * measurably came to.
 *
 * This is where the interface is most colourful, and it is the place
 * colour carries the most information: a harness of twenty-four items is
 * twenty-four facts, and the strip shows all of them at a glance -- how
 * many proved, how many are held for a person, which one was refused, how
 * many have not run. A progress bar would say "62%"; this says which 62%.
 *
 * Nine states, the product's own vocabulary, and no two share both a fill
 * style and a hue:
 *
 *   pending  empty cell, control edge      not reached yet
 *   active   active fill, lit              running now (at most a few)
 *   proved   sovereign fill                every material claim held up
 *   review   approval edge, approval tint  delivered, but a person should look
 *   held     approval fill                 waiting for a person's decision
 *   refused  critical fill                 policy said no -- the system working
 *   failed   critical edge, critical tint  it broke -- a bug, not a refusal
 *   neutral  muted fill                    delivered, nothing to check
 *   skipped  a dash                        never submitted, or cancelled
 *
 * A cell that settles blooms once in its tone and cools, which is VERIFY's
 * tick. Cells present when the strip first renders do not bloom: they were
 * read, not reached.
 *
 * It is a summary, and it is labelled as one. Assistive technology hears
 * the counts; the list the strip sits above carries each item's glyph and
 * words. It is not interactive, so a strip of two hundred cells is not two
 * hundred tab stops.
 */

export type SpectrumState =
  | 'pending'
  | 'active'
  | 'proved'
  | 'review'
  | 'held'
  | 'refused'
  | 'failed'
  | 'neutral'
  | 'skipped'

export interface SpectrumCell {
  key: string
  state: SpectrumState
  /** Shown on hover: "Q7 · SOP-INS-014 §4.2". */
  label?: string
}

const ORDER: SpectrumState[] = [
  'proved',
  'review',
  'held',
  'refused',
  'failed',
  'neutral',
  'active',
  'pending',
  'skipped',
]

const WORDS: Record<SpectrumState, string> = {
  proved: 'proved',
  review: 'to review',
  held: 'held',
  refused: 'refused',
  failed: 'failed',
  neutral: 'nothing to check',
  active: 'running',
  pending: 'not reached',
  skipped: 'not run',
}

/** States a cell can settle into. Reaching one of these is the tick. */
const SETTLED = new Set<SpectrumState>(['proved', 'review', 'held', 'refused', 'failed', 'neutral'])

export function summarise(cells: SpectrumCell[]): string {
  const counts = new Map<SpectrumState, number>()
  for (const cell of cells) counts.set(cell.state, (counts.get(cell.state) ?? 0) + 1)
  return ORDER.filter((state) => counts.has(state))
    .map((state) => `${counts.get(state)} ${WORDS[state]}`)
    .join(', ')
}

export function Spectrum({
  cells,
  label,
  size = 10,
  className,
}: {
  cells: SpectrumCell[]
  /** What the cells are: "Harness items". The counts are appended. */
  label: string
  /** Cell edge in px. 10 by default; 8 for a dense strip in a row. */
  size?: number
  className?: string
}) {
  const summary = cells.length === 0 ? 'none' : summarise(cells)
  return (
    <div
      role="img"
      aria-label={`${label}, ${cells.length}: ${summary}`}
      className={cn('aegis-strip', className)}
      style={{ '--cell': `${size}px` } as CSSProperties}
    >
      {cells.map((cell) => (
        <Cell key={cell.key} state={cell.state} label={cell.label} />
      ))}
    </div>
  )
}

const Cell = memo(function Cell({ state, label }: { state: SpectrumState; label?: string }) {
  const [seen, setSeen] = useState(state)
  const [ticks, setTicks] = useState(0)

  // A change of state is the event. Derived in render, so the tick is in
  // the same frame as the new fill.
  if (seen !== state) {
    setSeen(state)
    if (SETTLED.has(state)) setTicks((n) => n + 1)
  }

  return (
    <span
      className="aegis-strip-cell"
      data-state={state}
      title={label ? `${label} · ${WORDS[state]}` : WORDS[state]}
    >
      {ticks > 0 && <span key={ticks} aria-hidden className="aegis-strip-tick" />}
    </span>
  )
})
