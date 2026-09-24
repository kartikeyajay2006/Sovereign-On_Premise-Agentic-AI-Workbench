import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Light } from './light'

/**
 * REFUSE: a policy denial, settling.
 *
 * A refusal is the system working, so it is drawn as a state that has
 * settled, not as an alarm. It becomes the loudest thing on screen by
 * subtraction: everything else in its scope recedes to --opacity-dim over
 * the 480ms hold, while the refused object draws a critical rule down its
 * leading edge and takes a critical light that blooms once and rests as a
 * rim. There is no shake, no flash and no pulse, and nothing keeps moving
 * once it has settled.
 *
 * A refusal is not a failure. A run that crashed is a bug and is drawn
 * quietly, with its error; do not use this for it.
 *
 * Usage:
 *
 *   <DimScope dimmed={refused}>
 *     <Stage data-dim-item ... />
 *     <Refused data-dim-item data-dim-keep>...reason...</Refused>
 *   </DimScope>
 *
 * Give the refused content a left padding of at least 12px to clear the
 * rule. The reason itself can open with <Disclose tempo="hold">.
 */
export function Refused({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <Light
      {...rest}
      tone="critical"
      rest="rim"
      bloomOnMount
      className={cn('aegis-refuse', className)}
    >
      <span aria-hidden className="aegis-refuse-rule" />
      {children}
    </Light>
  )
}

/**
 * The scope whose other members recede when something in it is refused.
 * Mark each member `data-dim-item`, and the one that stays lit
 * `data-dim-keep`. One attribute on the scope drives every member, so the
 * dim is one decision, not eleven.
 */
export function DimScope({
  dimmed,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { dimmed: boolean; children: ReactNode }) {
  return (
    <div {...rest} className={cn('aegis-dim-scope', className)} data-dimmed={dimmed ? '' : undefined}>
      {children}
    </div>
  )
}
