'use client'

import Link from 'next/link'
import { AegisLogo } from '@/components/aegis-logo'
import { useRole } from '@/components/role-context'
import { LandingButton } from './landing-button'
import { SHELL } from './tokens'

const NAV = [
  { href: '#chain', label: 'Product' },
  { href: '#proof', label: 'Proof' },
  { href: '#limits', label: 'Limits' },
] as const

/**
 * Static markup, sticky, no scroll listener.
 *
 * The bottom border is always present. The "border appears on scroll" trick
 * needs a listener and buys nothing.
 *
 * The wordmark is Geist Sans, not AegisLogo's own `full` variant: that variant
 * sets "AGENTIC WORKBENCH" in 9px mono at 0.34em tracking under the name, which
 * at header size is costume. The mark itself is good, so the mark is what is
 * reused.
 */
export function LandingHeader() {
  // `authenticated` is false on the server render and during the initial load,
  // so the default label is the one a cold visitor needs. The swap to "Open
  // workbench" costs one frame, and the alternative is reading a session cookie
  // on the server for a marketing page.
  const { authenticated } = useRole()

  // The ground was hardcoded to the light paper value, so the header stayed
  // white when the palette went dark. A token, so it follows the theme
  // instead of needing to be remembered.
  return (
    <header
      className="sticky top-0 z-50 border-b border-line-default backdrop-blur-[12px]"
      style={{ background: 'color-mix(in srgb, var(--background) 88%, transparent)' }}
    >
      <div className={`${SHELL} flex h-14 items-center justify-between gap-4 md:h-16`}>
        <Link
          href="/"
          aria-label="AEGIS — home"
          className="flex items-center gap-2.5 rounded-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <AegisLogo variant="mark" size={26} />
          <span className="text-answer font-medium tracking-[-0.01em] text-foreground">AEGIS</span>
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-6 lg:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-[2px] text-body text-foreground-secondary transition-colors duration-[150ms] hover:text-foreground hover:duration-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-4 focus-visible:ring-offset-background motion-reduce:transition-none"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* 40px at mobile, 32px from `sm`: the header control is a touch target
            before it is a desktop affordance. */}
        <LandingButton
          href={authenticated ? '/console' : '/sign-in'}
          size="md"
          className="sm:h-8 sm:px-3 sm:text-ui"
        >
          {authenticated ? 'Open workbench' : 'Sign in'}
        </LandingButton>
      </div>
    </header>
  )
}
