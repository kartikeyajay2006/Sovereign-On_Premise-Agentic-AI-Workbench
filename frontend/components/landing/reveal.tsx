import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface RevealProps {
  children: ReactNode
  /** A stagger step, not a millisecond value. Capped at 2. */
  step?: 0 | 1 | 2
  className?: string
}

/**
 * A block settling into its section, one step behind the heading. It has no
 * observer of its own: the section's RevealSection adds `ae-in` once it is
 * reached. Hidden only on a scripted page (see globals.css).
 */
export function Reveal({ children, step = 0, className }: RevealProps) {
  return (
    <div className={cn('ae-reveal', className)} style={{ transitionDelay: `${0.08 + step * 0.08}s` }}>
      {children}
    </div>
  )
}
