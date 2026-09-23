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
 * A reveal that can only ever ADD to a visible page.
 *
 * The previous version started at `opacity-0` and waited for an
 * IntersectionObserver to set `data-inview`. That put eleven content blocks —
 * the three-pillar explanation, the stage table, the proof artifacts, the
 * limits list — at opacity zero on first paint, so the page was a sequence of
 * headings separated by several hundred pixels of nothing until you scrolled
 * each one into view.
 *
 * That is not merely a screenshot artifact, though it is that too: a full-page
 * capture, a print, a PDF and a pre-scrolled projector all render it blank. It
 * is also a page whose content depends on JavaScript running, an observer
 * firing, and a scroll actually happening — on a marketing page whose entire
 * argument is that you should not have to take anything on faith.
 *
 * So the content is visible from first paint. The animation is applied by a
 * class the observer ADDS once, not by a state the element starts in. If the
 * observer never fires, if JS fails, if the page is captured without
 * scrolling, the reader still sees everything. Motion is decoration here and
 * decoration must never be load-bearing.
 *
 * On the spatial tier -- var(--spatial), var(--ease-spatial) -- because a
 * block entering the page is a thing occupying space, and that is the tier's
 * definition in globals.css. It used to run on its own 320ms and its own
 * curve, a fourth duration beside the three the product has. The travel is
 * --shift-md and the step is --stagger, both of which globals.css already
 * zeroes under reduced motion, so the contract holds even before the
 * motion-reduce classes below apply.
 */
export function Reveal({ children, step = 0, className }: RevealProps) {
  const { ref, inView } = useReveal<HTMLDivElement>()

  return (
    <div
      ref={ref}
      data-inview={inView ? 'true' : 'false'}
      style={{ transitionDelay: `calc(var(--stagger) * ${step})` }}
      className={cn(
        // Visible first. The transition only ever runs from here to here.
        'opacity-100 transition-[opacity,transform] duration-[var(--spatial)] ease-[var(--ease-spatial)]',
        // The lift is the whole effect, and it is 8px. An element that has not
        // been seen yet sits fractionally low and settles; one that is already
        // on screen at load simply never moves.
        'translate-y-[var(--shift-md)] data-[inview=true]:translate-y-0',
        'motion-reduce:translate-y-0 motion-reduce:transition-none motion-reduce:[transition-delay:0ms]',
        className,
      )}
    >
      {children}
    </div>
  )
}
