import type { ReactNode } from 'react'
import { Navigation } from '@/components/navigation'
import { SiteFooter } from '@/components/site-footer'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Navigation />
      <main className="flex-1 pt-[76px]">{children}</main>
      <SiteFooter />
    </div>
  )
}
