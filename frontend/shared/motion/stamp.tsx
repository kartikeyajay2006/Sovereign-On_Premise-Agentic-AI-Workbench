import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * STAMP: a decision the service has just recorded, landing on its label.
 *
 * The mark's corner brackets close onto the label in the label's own tone
 * (hv-lock, 280ms) and stay there. `event` is a change count
 * (useChangeCount): zero draws nothing, so a decision that was already
 * recorded when the screen was read is shown plain, never stamped. Pass a
 * count that only moves on the server-confirmed change, never on the
 * click that asked for it.
 */
export function Stamp({ event, className, children }: { event: number; className?: string; children: ReactNode }) {
  return (
    <span className={cn('relative inline-flex items-center', className)}>
      {children}
      {event > 0 ? <span key={event} aria-hidden data-tone="current" className="hv-lock-frame hv-lock" /> : null}
    </span>
  )
}
