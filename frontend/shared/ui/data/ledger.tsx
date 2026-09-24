import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The mono label that sits over machine-issued data: a sequence number, a
 * hash, a latency, a count.
 *
 * One definition, because these screens had drifted into four trackings
 * between 0.12em and 0.34em. At 10px the design system's --ls-ledger (0.06em)
 * is what keeps a label legible on a projector; anything wider stops reading
 * as a label and starts reading as costume.
 */
export const LEDGER = 'font-mono text-ledger uppercase tracking-[var(--ls-ledger)]'
export const LEDGER_MUTED = `${LEDGER} text-foreground-muted`

/**
 * Status hues name a state the system found. As text each one uses its
 * `-text` variant, which is the only form that clears contrast on this ground.
 */
export type Tone = 'default' | 'secondary' | 'muted' | 'sovereign' | 'active' | 'approval' | 'critical'

export const TONE_TEXT: Record<Tone, string> = {
  default: 'text-foreground',
  secondary: 'text-foreground-secondary',
  muted: 'text-foreground-muted',
  sovereign: 'text-sovereign-text',
  active: 'text-active-text',
  approval: 'text-approval-text',
  critical: 'text-critical-text',
}


/**
 * One reading, inline: `LABEL value`.
 *
 * `hint` becomes the title, and is where a reading says how it was taken.
 * The value is rendered as given; this component never substitutes one.
 */
export function Readout({
  label,
  value,
  tone = 'default',
  hint,
  className,
}: {
  label: string
  value: ReactNode
  tone?: Tone
  hint?: string
  className?: string
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-baseline gap-2', className)} title={hint}>
      <span className={cn(LEDGER_MUTED, 'shrink-0')}>{label}</span>
      <span className={cn('tabular min-w-0 font-mono text-ui', TONE_TEXT[tone])}>{value}</span>
    </span>
  )
}

/** A row of readouts that wraps rather than overflowing at phone width. */
export function ReadoutRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-baseline gap-x-6 gap-y-1', className)}>{children}</div>
}
