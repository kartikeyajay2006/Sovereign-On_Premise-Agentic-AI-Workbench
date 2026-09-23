'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * A statement that fills in as it is scrolled through.
 *
 * Words start at the page's receded ink and reach full ink one at a time,
 * driven by scroll position rather than by a timer. Nothing moves and nothing
 * fades in from nothing: the sentence is legible at every scroll position,
 * including the first frame, on a printed page, and for anyone who never
 * scrolls it. What changes is only weight of ink.
 *
 * That constraint is the difference between this and the usual version of the
 * effect, which starts at opacity zero and hides the sentence from a reader
 * who arrives mid-page — the same failure the Reveal component was fixed for.
 *
 * Reserved for one sentence per page. An effect that tracks the scrollbar is
 * a claim that this line is worth the attention; used twice it is worth none.
 */
export function ScrollRevealText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const ref = useRef<HTMLParagraphElement | null>(null)
  /** 0 to 1 across the element's pass through the viewport. */
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setProgress(1)
      return
    }

    let frame = 0
    const measure = () => {
      frame = 0
      const rect = node.getBoundingClientRect()
      // Runs from the line entering the lower third to it reaching the
      // upper third: it completes while the sentence is still on screen,
      // rather than finishing as it leaves.
      const start = window.innerHeight * 0.85
      const end = window.innerHeight * 0.35
      const raw = (start - rect.top) / (start - end)
      setProgress(Math.max(0, Math.min(1, raw)))
    }

    const onScroll = () => {
      // Coalesced onto a frame: scroll fires far faster than paint, and this
      // host is running local inference on the same core.
      if (!frame) frame = window.requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  const words = text.split(' ')
  // A word is lit slightly before its own share of the bar is reached, so the
  // leading edge is a soft front of two or three words rather than one word
  // flicking over at a time.
  const lit = progress * (words.length + 3)

  return (
    <p ref={ref} className={cn('text-balance', className)}>
      {words.map((word, i) => {
        const strength = Math.max(0, Math.min(1, lit - i))
        return (
          <span
            key={`${word}-${i}`}
            style={{
              // Interpolating between two theme tokens, so the sentence
              // stays inside the palette at every point of the sweep.
              color: `color-mix(in oklab, var(--foreground) ${Math.round(strength * 100)}%, var(--foreground-muted))`,
              transition: 'color var(--micro) var(--ease-micro)',
            }}
          >
            {word}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        )
      })}
    </p>
  )
}
