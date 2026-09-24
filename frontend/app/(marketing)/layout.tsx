import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { LandingFooter } from '@/components/landing/landing-footer'
import { LandingHeader } from '@/components/landing/landing-header'
import { META } from '@/components/landing/copy'
import './landing.css'

export const metadata: Metadata = {
  title: META.title,
  description: META.description,
  openGraph: {
    title: 'AEGIS',
    description: META.description,
    // No og:image. A social card would have to be generated, and until it can
    // be generated locally a missing card beats one that fetches a font.
  },
}

/**
 * The public shell: header, page, footer.
 *
 * There is no AuthGuard here and no auto-redirect to /console for a visitor
 * who already has a session: a redirect makes this page unreachable for the
 * one person most likely to want to send its URL to someone else. The header's
 * button reads "Open workbench" instead.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    // The public page is drawn on one ground, night, whatever the app's theme.
    <div data-theme="dark" className="lp relative flex min-h-dvh flex-col overflow-x-clip">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-[7px] focus:bg-foreground focus:px-4 focus:py-2 focus:text-body focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <LandingHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <LandingFooter />
    </div>
  )
}
