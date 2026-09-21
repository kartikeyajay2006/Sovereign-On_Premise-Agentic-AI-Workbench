'use client'

import type { ReactNode } from 'react'
import { useReveal } from '@/hooks/use-reveal'
import { cn } from '@/lib/utils'

export interface RevealProps {
  children: ReactNode
  /** A stagger step, not a millisecond value. Capped at 2. */
  step?: 0 | 1 | 2
  className?: string
}

/**
 * The landing page's own scroll reveal.
 *
 * The global `.reveal` in globals.css runs 700ms over a 14px translate, which
 * at any real scroll speed arrives visibly late -- the content reads as sitting
 * underneath the scroll rather than attached to it. This is 320ms over 8px, and
 * it is a `transition` rather than an `animation`, so reduced motion is handled
 * by a class on the element instead of by a global !important override.
 *
 * globals.css is not modified. The app keeps the old `.reveal`; this page just
 * does not use it.
 */
export function Reveal({ children, step = 0, className }: RevealProps) {
  const { ref, inView } = useReveal<HTMLDivElement>()

  return (
    <div
      ref={ref}
      data-inview={inView ? 'true' : 'false'}
      style={{ transitionDelay: `${step * 60}ms` }}
      className={cn(
        'translate-y-2 opacity-0 transition-[opacity,transform] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        'data-[inview=true]:translate-y-0 data-[inview=true]:opacity-100',
        // Under reduced motion the element is simply present from first paint:
        // no transform, no fade, no delay, and crucially no dependence on the
        // observer ever firing.
        'motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none motion-reduce:[transition-delay:0ms]',
        className,
      )}
    >
      {children}
    </div>
  )
}
