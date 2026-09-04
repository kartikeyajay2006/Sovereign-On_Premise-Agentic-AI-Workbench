import type { ReactNode } from 'react'
import { Navigation } from '@/components/navigation'
import { SiteFooter } from '@/components/site-footer'
import { AuthGuard } from '@/components/auth-guard'
import { AnimatedTechnicalBackground } from '@/components/animated-technical-background'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="relative flex min-h-dvh flex-col overflow-x-hidden">
        {/* Ambient Moving Dotted Pattern with radial vignette mask */}
        <AnimatedTechnicalBackground className="opacity-40" />

        {/* Ambient Top Glow / Depth */}
        <div
          aria-hidden
          className="pointer-events-none fixed -top-40 left-1/2 -translate-x-1/2 h-[600px] w-full max-w-[1200px] rounded-full bg-gradient-to-b from-[var(--sovereign)]/5 via-transparent to-transparent blur-3xl -z-10"
        />

        <Navigation />
        <main className="relative z-10 flex-1 pt-[76px]">{children}</main>
        <SiteFooter />
      </div>
    </AuthGuard>
  )
}


