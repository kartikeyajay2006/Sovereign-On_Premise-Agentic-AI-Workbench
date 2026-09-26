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
 */
export function LandingHeader() {
  // `authenticated` is false on the server render and during the first load,
  // so the labels a cold visitor needs are the default.
  const { authenticated } = useRole()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`lp-header${scrolled ? ' scrolled' : ''}`}>
      <div className="lp-shell row">
        <Link href="/" aria-label="AEGIS — home" className="lp-home">
          <Wordmark intro />
        </Link>

        <nav aria-label="Sections" className="lp-nav">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
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
    </header>
  )
}
