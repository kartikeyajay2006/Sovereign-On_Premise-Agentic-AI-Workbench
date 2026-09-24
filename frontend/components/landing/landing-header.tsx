'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRole } from '@/components/role-context'
import { Wordmark } from './wordmark'

const NAV = [
  { href: '#how', label: 'How it works' },
  { href: '#use-cases', label: 'Use cases' },
  { href: '#product', label: 'Product' },
  { href: '#proof', label: 'Security' },
  { href: '#limits', label: 'Limits' },
] as const

/**
 * The public header: the mark, five anchors, and the way in.
 *
 * Clear while the page is at its top, over the scene; a near-opaque ground
 * and a hairline once anything has scrolled under it. No backdrop blur: a
 * blurred sticky bar repaints on every scroll frame.
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
