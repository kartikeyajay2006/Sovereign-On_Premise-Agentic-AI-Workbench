import type { ReactNode } from 'react'
import { Navigation } from '@/components/navigation'
import { SiteFooter } from '@/components/site-footer'
import { AuthGuard } from '@/components/auth-guard'
import { AnimatedTechnicalBackground } from '@/components/animated-technical-background'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="relative flex min-h-dvh flex-col overflow-x-hidden">
        <AnimatedTechnicalBackground className="opacity-40" />
        <Navigation />
        <main className="relative z-10 flex-1 pt-[76px]">{children}</main>
        <SiteFooter />
      </div>
    </AuthGuard>
  )
}

