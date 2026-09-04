'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRole } from '@/components/role-context'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { authenticated, loading } = useRole()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/sign-in')
    }
  }, [authenticated, loading, router])

  // Show nothing while checking auth state
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-[3px] bg-foreground">
            <span className="h-2.5 w-2.5 rounded-[1px] border border-primary-foreground" />
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground-muted animate-pulse">
            Verifying session…
          </span>
        </div>
      </div>
    )
  }

  // Don't render protected content if not authenticated
  if (!authenticated) return null

  return <>{children}</>
}
