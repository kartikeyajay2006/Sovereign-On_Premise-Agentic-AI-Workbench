import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Content that opens out of the thing that owns it: a refusal's reason,
 * a conflicted claim's two sources, a folded work log.
 *
 * Grid rows from 0fr to 1fr, the one layout animation the product allows,
 * because it is the only way to reach an element's intrinsic height and it
 * costs one grid track. Closed content is `inert`: it cannot be focused,
 * clicked or read aloud while it is not on screen.
 *
 * `tempo="hold"` uses the refusal's 480ms settle rather than the spatial
 * tier, so a denial's reason opens in step with the board dimming around
 * it and the two read as one event.
 */
export function Disclose({
  open,
  tempo = 'spatial',
  id,
  className,
  children,
}: {
  open: boolean
  tempo?: 'spatial' | 'hold'
  id?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      id={id}
      className={cn('aegis-disclose', className)}
      data-open={open ? 'true' : 'false'}
      data-tempo={tempo === 'hold' ? 'hold' : undefined}
    >
      <div inert={!open}>{children}</div>
    </div>
  )
}
