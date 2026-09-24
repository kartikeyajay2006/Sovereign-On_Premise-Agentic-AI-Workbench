'use client'

import {
  createElement,
  useEffect,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
} from 'react'

// useLayoutEffect warns during server rendering; the server needs neither.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

type RevealSectionProps<T extends ElementType> = {
  as?: T
  className?: string
  children: ReactNode
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>

/**
 * A block of the public page that settles in once, when it is reached.
 *
 * It adds `ae-in` to itself; globals.css turns that into a single fade-up
 * for every `.ae-reveal` inside it, opacity and transform only. Nothing is
 * hidden unless the page is scripted (html[data-js], set by the boot script
 * in app/layout.tsx), so a print, a PDF or a page whose JavaScript failed
 * shows everything. A block already on screen at hydration settles before
 * paint; `?snap` settles every block at once, for a screenshot that cannot
 * scroll.
 */
export function RevealSection<T extends ElementType = 'section'>({
  as,
  className,
  children,
  ...rest
}: RevealSectionProps<T>) {
  const ref = useRef<HTMLElement | null>(null)

  useIsomorphicLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (new URLSearchParams(window.location.search).has('snap') || (r.top < window.innerHeight && r.bottom > 0)) {
      el.classList.add('ae-in')
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el || el.classList.contains('ae-in')) return
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('ae-in')
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('ae-in')
            io.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return createElement(as ?? 'section', { ...rest, className, ref }, children)
}
