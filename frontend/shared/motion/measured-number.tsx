'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useReducedMotion } from './preferences'

/**
 * A number the backend measured, and nothing else.
 *
 * Three rules, and they are the whole component:
 *
 *  1. No reading, no number. A value that is null, undefined or not finite
 *     renders `absent` -- nothing by default, an em dash where a column
 *     needs one -- and never 0. Unknown is not zero.
 *
 *  2. The first reading appears; it does not count up. A figure that rolls
 *     up from zero to 42 on arrival shows forty-one values nobody measured
 *     and implies a discovery that had already finished.
 *
 *  3. A change ROLLS, it does not tween. Tweening 3 to 7 would put 4, 5 and
 *     6 on the screen, and none of them was ever a reading. Instead only
 *     the characters that changed move: the old glyph leaves and the new
 *     one arrives from the direction the value went, like a meter wheel. At
 *     every frame, every glyph on screen belongs either to the previous
 *     reading or to the current one.
 *
 * The digits animate aria-hidden; the real value is in a visually hidden
 * span beside them, so a screen reader hears a number, once.
 *
 * Set it in a monospace or tabular face (it applies `tabular` itself), so
 * a changing digit never nudges the ones beside it.
 */

export interface MeasuredNumberProps {
  value: number | null | undefined
  /** Turn the reading into text. Units belong here: `(v) => `${v} ms``. */
  format?: (value: number) => string
  /** What to show when there is no reading. Nothing, by default. */
  absent?: ReactNode
  /** Announce changes to assistive technology. Off by default. */
  live?: 'polite' | 'off'
  className?: string
}

function isReading(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * String() rather than toLocaleString(): a locale-formatted number can
 * differ between the server's render and the browser's, which is a
 * hydration mismatch, and grouping is a decision a caller should make on
 * purpose in `format`.
 */
const plain = (value: number) => String(value)

interface Roll {
  text: string | null
  value: number | null
  /** The previous reading's text, when this render is a change between two readings. */
  previous: string | null
  direction: 'up' | 'down'
  /** Bumped per change; remounting on it is what replays the roll. */
  change: number
}

export function MeasuredNumber({
  value,
  format = plain,
  absent = null,
  live = 'off',
  className,
}: MeasuredNumberProps) {
  const reduced = useReducedMotion()
  const reading = isReading(value) ? value : null
  const text = reading === null ? null : format(reading)

  const [roll, setRoll] = useState<Roll>(() => ({
    text,
    value: reading,
    previous: null,
    direction: 'up',
    change: 0,
  }))

  // Derived during render, as React documents for state that follows a
  // prop: the roll is decided in the same render that shows the new value.
  if (roll.text !== text) {
    const between = roll.text !== null && roll.value !== null && reading !== null
    setRoll({
      text,
      value: reading,
      previous: between ? roll.text : null,
      direction: between && reading! < roll.value! ? 'down' : 'up',
      change: roll.change + 1,
    })
  }

  if (text === null) {
    return absent === null ? null : <span className={className}>{absent}</span>
  }

  const still = roll.previous === null || reduced || roll.text !== text
  return (
    <span className={cn('tabular', className)}>
      <span className="sr-only" aria-live={live === 'polite' ? 'polite' : undefined}>
        {text}
      </span>
      <span aria-hidden key={roll.change}>
        {still ? text : <Rolled previous={roll.previous!} next={text} direction={roll.direction} />}
      </span>
    </span>
  )
}

/**
 * Right-aligned, because that is how a meter reads: when 9 becomes 10 the
 * units wheel turns and a tens wheel appears to its left.
 */
function Rolled({
  previous,
  next,
  direction,
}: {
  previous: string
  next: string
  direction: 'up' | 'down'
}) {
  const before = Array.from(previous)
  const after = Array.from(next)
  const offset = after.length - before.length

  return (
    <>
      {after.map((glyph, i) => {
        const j = i - offset
        const old = j >= 0 && j < before.length ? before[j] : ''
        if (old === glyph) return <span key={i}>{glyph}</span>
        return (
          <span key={i} className="aegis-roll" data-dir={direction}>
            <span className="aegis-roll-in">{glyph}</span>
            {old && <span className="aegis-roll-out">{old}</span>}
          </span>
        )
      })}
    </>
  )
}
