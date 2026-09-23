'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRole } from '@/components/role-context'
import { ThemeToggle } from '@/components/theme-toggle'
import { Wordmark } from './wordmark'

const NAV = [
  { href: '#product', label: 'Product' },
  { href: '#chain', label: 'How it works' },
  { href: '#proof', label: 'Security' },
  { href: '#limits', label: 'Limits' },
] as const

/**
 * The public header: the mark, four anchors, and two ways in.
 *
 * It sits on a near-opaque ground rather than a backdrop blur -- a blurred
 * sticky bar repaints on every scroll frame -- and grows a hairline only
 * once the page has moved.
 */
export function LandingHeader() {
  // `authenticated` is false on the server render and during the initial
  // load, so the default labels are the ones a cold visitor needs.
  const { authenticated } = useRole()
  const [scrolled, setScrolled] = useState(false)

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
    <header className={`ae-header${scrolled ? ' scrolled' : ''}`}>
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
