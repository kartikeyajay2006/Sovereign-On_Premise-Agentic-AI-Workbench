'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRole } from '@/components/role-context'
import { ThemeToggle } from '@/components/theme-toggle'
import { Wordmark } from './wordmark'

const NAV = [
  { href: '#use-cases', label: 'Use cases' },
  { href: '#chain', label: 'How it works' },
  { href: '#product', label: 'Product' },
  { href: '#proof', label: 'Security' },
  { href: '#limits', label: 'Limits' },
] as const

/**
 * The public header: the mark, four anchors, and two ways in.
 *
 * It sits on a near-opaque ground rather than a backdrop blur -- a blurred
 * sticky bar repaints on every scroll frame -- and grows a hairline only
 * once the page has moved. While it is over the hero's dark band it has no
 * ground at all and takes the dark palette, so the band runs to the top of
 * the window; an observer on the band, not a scroll listener, says when.
 */
export function LandingHeader() {
  // `authenticated` is false on the server render and during the initial
  // load, so the default labels are the ones a cold visitor needs.
  const { authenticated } = useRole()
  const [scrolled, setScrolled] = useState(false)
  // True on first paint: the page opens on the band.
  const [overBand, setOverBand] = useState(true)

  useEffect(() => {
    // Every full-bleed night ground -- the hero's band, the night sections,
    // the footer -- marks itself data-band. The header is dark over any of
    // them: a pale bar over a night section read as a hole in the page.
    const bands = Array.from(document.querySelectorAll<HTMLElement>('[data-band]'))
    if (bands.length === 0 || typeof IntersectionObserver === 'undefined') {
      setOverBand(false)
      return
    }
    let io: IntersectionObserver | null = null
    const under = new Set<Element>()
    const watch = () => {
      io?.disconnect()
      under.clear()
      // The observed strip is the header's own 64px at the top of the window.
      const bottom = Math.max(0, window.innerHeight - 64)
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) under.add(entry.target)
            else under.delete(entry.target)
          }
          setOverBand(under.size > 0)
        },
        { rootMargin: `0px 0px -${bottom}px 0px` },
      )
      for (const band of bands) io.observe(band)
    }
    watch()
    window.addEventListener('resize', watch)
    return () => {
      io?.disconnect()
      window.removeEventListener('resize', watch)
    }
  }, [])

  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        setScrolled(window.scrollY > 4)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <header
      data-theme={overBand ? 'dark' : undefined}
      className={`ae-header${scrolled ? ' scrolled' : ''}${overBand ? ' over-band' : ''}`}
    >
      <div className="ae-shell row">
        <Link
          href="/"
          aria-label="AEGIS — home"
          className="flex items-center rounded-full focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
        >
          <Wordmark />
        </Link>

        <nav aria-label="Sections" className="ae-nav">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {authenticated ? null : (
            <Link href="/sign-in" className="ae-btn ghost sm hidden sm:inline-flex">
              Sign in
            </Link>
          )}
          <Link href={authenticated ? '/console' : '/sign-in'} className="ae-btn primary sm">
            {authenticated ? 'Open workbench' : 'Get started'}
          </Link>
        </div>
      </div>
    </header>
  )
}
