'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface GallerySlide {
  id: string
  label: string
  title: string
  body: string
  /** Screenshots of the running product, captured on this host. */
  light: string
  dark: string
  alt: string
}

/** How long each screen stays before the next, while the gallery is in view. */
const DWELL_MS = 6500

/**
 * The workbench, screen by screen.
 *
 * Real screenshots of the product, captured on the demo host in both themes
 * and swapped with the page's own theme. The gallery advances on its own
 * while it is on screen and the pointer is not over it, with a hairline under
 * the chosen tab filling for as long as the screen stays; choosing a tab
 * takes over. Nothing plays off screen or under reduced motion.
 */
export function ProductGallery({ slides }: { slides: GallerySlide[] }) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(false)
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [manual, setManual] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const playing = visible && !paused && !reduced && !manual
  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % slides.length), DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [playing, index, slides.length])

  const current = slides[index]

  return (
    <div
      ref={root}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className="flex flex-col items-center"
      style={{ ['--ae-dwell' as string]: `${DWELL_MS}ms` }}
    >
      <div role="tablist" aria-label="Screens of the workbench" className="ae-tabs">
        {slides.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-controls={`gallery-${slide.id}`}
            onClick={() => {
              setIndex(i)
              setManual(true)
            }}
            className="ae-tab"
          >
            {slide.label}
            {/* keyed by index so the fill restarts for each screen */}
            <span key={`${slide.id}-${index}`} aria-hidden className={cn('dwell', playing && i === index && 'run')} />
          </button>
        ))}
      </div>

      <div className="mt-6 min-h-[3.4em] max-w-[62ch] text-center" aria-live="polite">
        <p className="m-0 text-[1.05rem] font-semibold tracking-[-0.015em] text-foreground">{current.title}</p>
        <p className="ae-body mx-auto mt-1 text-[0.95rem]">{current.body}</p>
      </div>

      <div className="ae-frame ae-tilt-in mt-8 w-full rounded-[24px] p-[clamp(10px,2.2vw,28px)]">
        <div className="ae-stage">
          {slides.map((slide, i) => (
            <div key={slide.id} id={`gallery-${slide.id}`} role="tabpanel" aria-hidden={i !== index} className={cn('ae-slide', i === index && 'on')}>
              <Image src={slide.light} alt={slide.alt} width={1440} height={900} sizes="(min-width: 1200px) 1100px, 100vw" className="ae-shot-light" loading={i === 0 ? 'eager' : 'lazy'} />
              <Image src={slide.dark} alt={slide.alt} width={1440} height={900} sizes="(min-width: 1200px) 1100px, 100vw" className="ae-shot-dark" loading="lazy" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
