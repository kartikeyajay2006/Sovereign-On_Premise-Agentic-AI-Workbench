'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRole } from '@/components/role-context'
import { Wordmark } from './wordmark'

const NAV = [
  { href: '#use-cases', label: 'Use cases' },
  { href: '#chain', label: 'How it works' },
  { href: '#product', label: 'Product' },
  { href: '#proof', label: 'Security' },
  { href: '#limits', label: 'Limits' },
] as const

/**
 * The public header: the mark, five anchors, and the way in.
 *
 * It takes the ground it is over. Over a night band -- the hero, how a run
 * is proved, security, the close -- it is white on night, and clear while
 * the page is still at its top; over paper it is ink on paper with a
 * hairline. An observer on the bands says which, not a scroll listener, and
 * one passive listener marks whether the page has moved at all. No backdrop
 * blur: a blurred sticky bar repaints on every scroll frame.
 */
export function LandingHeader() {
  // `authenticated` is false on the server render and during the first load,
  // so the labels a cold visitor needs are the default.
  const { authenticated } = useRole()
  const [onNight, setOnNight] = useState(true)
  const [top, setTop] = useState(true)

  useEffect(() => {
    const bands = Array.from(document.querySelectorAll<HTMLElement>('[data-band]'))
    if (bands.length === 0 || typeof IntersectionObserver === 'undefined') {
      setOnNight(false)
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
          setOnNight(under.size > 0)
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
    const onScroll = () => setTop(window.scrollY < 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      data-theme={onNight ? 'dark' : 'light'}
      className={`lp-header${onNight ? ' on-night' : ''}${onNight && top ? ' top' : ''}`}
    >
      <div className="lp-shell row">
        <Link href="/" aria-label="AEGIS — home" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4">
          <Wordmark />
        </Link>

        <nav aria-label="Sections" className="lp-nav">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="end">
          {authenticated ? null : <Link href="/sign-in">Sign in</Link>}
          <Link href={authenticated ? '/console' : '/sign-in'} className="lp-btn primary sm">
            {authenticated ? 'Open the workbench' : 'Get started'}
          </Link>
        </div>
      </div>
    </header>
  )
}
