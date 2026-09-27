'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRole } from '@/components/role-context'
import { NAV } from './copy'
import { Wordmark } from './wordmark'

/**
 * The public header: the mark, the anchors in mono capitals, and the way in.
 *
 * Clear while the page is at its top; a near-opaque ground and a 1px rule
 * once anything has scrolled under it. No backdrop blur: a blurred sticky bar
 * repaints on every scroll frame.
 *
 * The page reads as chapters, and the header says which one is on screen:
 * the anchors carry their chapter number and the current one is lit, and a
 * 1px lime line along the header's foot fills as the page is read. Both
 * follow the reader's own scroll, so neither moves on its own.
 */
export function LandingHeader() {
  // `authenticated` is false on the server render and during the first load,
  // so the labels a cold visitor needs are the default.
  const { authenticated } = useRole()
  const [scrolled, setScrolled] = useState(false)
  const [progress, setProgress] = useState(0)
  const [current, setCurrent] = useState<string | null>(null)

  useEffect(() => {
    let frame = 0
    const read = () => {
      frame = 0
      setScrolled(window.scrollY > 8)
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0)
      // The chapter whose top has passed a third of the way down the screen.
      const line = window.innerHeight / 3
      let on: string | null = null
      for (const item of NAV) {
        const el = document.getElementById(item.href.slice(1))
        if (el && el.getBoundingClientRect().top <= line) on = item.href
      }
      setCurrent(on)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <header className={`lp-header${scrolled ? ' scrolled' : ''}`}>
      <div className="lp-shell row">
        <Link href="/" aria-label="AEGIS — home" className="lp-home">
          <Wordmark intro />
        </Link>

        <nav aria-label="Sections" className="lp-nav">
          {NAV.map((item, i) => (
            <a key={item.href} href={item.href} aria-current={current === item.href ? 'location' : undefined}>
              <span className="n" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="end">
          {authenticated ? null : (
            <Link href="/sign-in" className="lp-nav-link">
              Sign in
            </Link>
          )}
          <Link href={authenticated ? '/console' : '/sign-in'} className="lp-btn primary sm">
            {authenticated ? 'Open the workbench' : 'Get started'}
          </Link>
        </div>
      </div>
      <span aria-hidden className="lp-progress" style={{ transform: `scaleX(${progress})` }} />
    </header>
  )
}
