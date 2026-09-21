'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SovereigntyStatus } from './sovereignty-status'
import { RoleSwitcher } from './role-switcher'
import { AegisLogo } from './aegis-logo'

/**
 * Seven tabs become five.
 *
 * Ask and Tasks are gone because the thread absorbed both. Two dispatchers
 * was always a product smell — Ask was the console with the deliverable
 * format fixed to "answer" — and a task is now simply an assistant turn, so
 * a separate list of them is a second place to look for something already on
 * screen. Both paths redirect to the thread rather than 404, since an open
 * tab or a bookmark should land somewhere useful.
 *
 * Registry becomes Knowledge and Security becomes Assurance: both are named
 * for what a user goes there to do rather than for the subsystem behind
 * them.
 */
const LINKS = [
  // The thread moved off `/` when the public landing page took the front door.
  { href: '/console', label: 'Thread' },
  { href: '/approvals', label: 'Approvals' },
  { href: '/registry', label: 'Knowledge' },
  { href: '/security', label: 'Assurance' },
  { href: '/audit', label: 'Audit' },
]

export function Navigation() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  // The `href === '/'` exact-match special case is gone with the route: every
  // link now has a real path segment, so a prefix match is correct for all of
  // them and nothing matches everything.
  const isActive = (href: string) => pathname.startsWith(href)

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-[80] px-3 pt-3 sm:px-5 sm:pt-4">
      {/*
        No backdrop-filter. A full-width blur re-samples everything beneath
        it on every frame anything under it changes — and what scrolls under
        this bar is a live stage board. Against flat warm paper the result
        was visually near-indistinguishable from an opaque tint, so the cost
        bought nothing.
      */}
      <nav
        className="pointer-events-auto mx-auto flex max-w-[1400px] items-center justify-between gap-4 rounded-[12px] border border-border/80 px-4 py-2.5 shadow-[0_4px_30px_rgba(0,0,0,0.05)] sm:px-5"
        style={{ background: 'color-mix(in srgb, var(--surface) 92%, transparent)' }}
      >
        {/* Brand */}
        {/* Inside the app the mark goes to the console, not out to the public
            page. Clicking a logo should not sign you out of the room. */}
        <Link
          href="/console"
          className="group flex items-center transition-transform hover:scale-[1.01]"
        >
          <AegisLogo size={30} variant="compact" />
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => {
            const active = isActive(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'relative px-3.5 py-1.5 font-sans text-[13px] font-medium transition-colors',
                  active
                    ? 'text-foreground'
                    : 'text-foreground-muted hover:text-foreground',
                )}
              >
                {l.label}
                {/* No glow on the active rule. An ink bar is already the
                    strongest mark here; a shadow under it only blurs its
                    edge. */}
                {active && (
                  <span className="absolute inset-x-3.5 -bottom-1 h-[2px] bg-foreground" />
                )}
              </Link>
            )
          })}
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="hidden sm:block">
            <SovereigntyStatus />
          </div>
          <div className="block">
            <RoleSwitcher />
          </div>
          <button
            aria-label="Menu"
            onClick={() => setMobileOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-foreground lg:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="pointer-events-auto mx-auto mt-2 max-w-[1400px] rounded-[10px] border border-border bg-surface p-3 shadow-[0_12px_40px_rgba(0,0,0,0.1)] animate-in fade-in slide-in-from-top-2 duration-200 lg:hidden">
          <div className="grid grid-cols-2 gap-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'border px-3 py-2.5 text-[13px] transition-colors',
                  isActive(l.href)
                    ? 'border-border-strong bg-surface-sunken text-foreground'
                    : 'border-border text-foreground-secondary hover:bg-surface-sunken',
                )}
              >
                {l.label}
              </Link>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2.5 border-t border-border pt-3">
            <SovereigntyStatus />
            <RoleSwitcher />
          </div>
        </div>
      )}
    </header>
  )
}
