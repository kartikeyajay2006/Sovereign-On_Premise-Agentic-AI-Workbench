'use client'

import { useState, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { MotionTag } from './appear'

/**
 * LIGHT: a state reached, and a state that holds.
 *
 * The product's colour is spent in two registers. A fill says what state
 * an object is in. A light says the state was just reached -- it blooms
 * in the state's emission colour and cools -- or that it holds, as a
 * resting rim. Light is the one thing in this interface allowed to fade in
 * and out, because it is never content: whatever it lights carries its
 * state in words or a glyph as well, so the light can be crushed by a
 * projector, dropped by reduced motion or lost in greyscale and nothing
 * is lost with it.
 *
 * It only ever blooms on an event. `bloomKey` is the event's identity --
 * a verdict, a decision id, a count -- and a change to it after mount is
 * what replays the bloom. A light never breathes, pulses or cycles on its
 * own.
 *
 * The glow follows the wrapper's box and its border-radius, so give the
 * wrapper the lit object's shape: its radius in className, and, as a span,
 * `inline-flex` or `inline-block` -- a plain inline span around a block
 * child is split into anonymous boxes and the glow will not fit it.
 */

export type LightTone = 'sovereign' | 'active' | 'approval' | 'critical' | 'action' | 'ink'

export interface LightProps extends HTMLAttributes<HTMLElement> {
  as?: MotionTag
  /** The state whose light this is. Null renders no light at all. */
  tone: LightTone | null
  /**
   * What stays after the bloom. `none` for an event that is over once it
   * has been seen (a row settled), `rim` for a state that holds (a run
   * refused, a chain that verified), `full` for the rare state that must
   * stay lit for as long as it is true.
   */
  rest?: 'none' | 'rim' | 'full'
  /**
   * The identity of the event that lights it. When it changes after
   * mount the light blooms again. Undefined means no event: the light
   * shows at its rest level and never blooms.
   */
  bloomKey?: string | number | null
  /** Bloom once on mount: for an object whose mounting IS the event. */
  bloomOnMount?: boolean
  children: ReactNode
}

export function Light({
  as: Tag = 'div',
  tone,
  rest = 'none',
  bloomKey,
  bloomOnMount = false,
  className,
  children,
  ...props
}: LightProps) {
  const [seen, setSeen] = useState(bloomKey)
  const [blooms, setBlooms] = useState(bloomOnMount ? 1 : 0)

  // Adjusting state from a changed prop during render, as React documents
  // for this case: the bloom is decided in the same render that shows the
  // new state, so the light can never lag a frame behind what it lights.
  if (seen !== bloomKey) {
    setSeen(bloomKey)
    if (bloomKey !== undefined && bloomKey !== null) setBlooms((n) => n + 1)
  }

  return (
    <Tag
      {...props}
      className={cn('aegis-light', className)}
      data-tone={tone ?? undefined}
      data-rest={rest}
    >
      {children}
      {tone && (
        <span
          // A new key remounts the halo, and remounting is what replays a
          // CSS animation without touching the element it lights.
          key={blooms}
          aria-hidden
          className="aegis-light-halo"
          data-bloom={blooms > 0 ? '' : undefined}
        />
      )}
    </Tag>
  )
}

/**
 * WITHHOLD -> RELEASE: the answer arriving once, already checked.
 *
 * While a run is in progress the answer region holds its height and says
 * the answer is withheld until verification completes; that part belongs
 * to the thread. This is the release: the checked answer mounts moving,
 * at full opacity, and the verdict it carries blooms around it once and
 * lets go. Sovereign when every check passed, approval when it was held
 * for a person, and no light at all when it was not verified, because an
 * unverified answer has earned nothing to glow about.
 *
 * Mount it with the answer, keyed by the run, so a reopened run is read
 * rather than released: pass `released={false}` for an answer that was
 * already on the record when the screen opened.
 */
export function Release({
  verdict,
  released = true,
  className,
  children,
}: {
  verdict: 'sovereign' | 'approval' | null
  /** False for an answer read from the record rather than just released. */
  released?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <Light
      tone={released ? verdict : null}
      rest="none"
      bloomOnMount={released}
      className={cn(released && 'aegis-appear', 'rounded-[var(--radius)]', className)}
    >
      {children}
    </Light>
  )
}
