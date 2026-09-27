'use client'

import { useEffect, useRef } from 'react'

/**
 * The name at 6% ink with a lime seal, closing the page. When it first comes
 * into view the hero's scan line crosses it once, top to bottom, and the seal
 * ticks on behind it: the page ends on the motion it opened with.
 *
 * Plays once. Without JavaScript, before hydration and under reduced motion,
 * nothing is armed and CSS draws the finished frame: the word and its seal.
 */
export function FooterGiant({ word }: { word: string }) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return
    el.dataset.play = 'armed'
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        el.dataset.play = 'on'
        io.disconnect()
      },
      { threshold: 0.35 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={root} className="lp-giant" aria-hidden>
      <span className="word">
        {word}
        <i className="seal" />
      </span>
      <i className="scan" />
    </div>
  )
}
