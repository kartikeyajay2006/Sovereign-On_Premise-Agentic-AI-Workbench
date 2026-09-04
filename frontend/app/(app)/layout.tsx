import type { ReactNode } from 'react'
import { Navigation } from '@/components/navigation'
import { SiteFooter } from '@/components/site-footer'
import { AuthGuard } from '@/components/auth-guard'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-dvh flex-col">
        <Navigation />
        <main className="flex-1 pt-[76px]">{children}</main>
        <SiteFooter />
      </div>
    </AuthGuard>
  )
}
