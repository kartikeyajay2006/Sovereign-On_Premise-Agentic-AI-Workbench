'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useRole } from '@/components/role-context'
import { AegisLogo } from '@/components/aegis-logo'

/** After this long the check explains itself instead of just waiting. */
const SLOW_AFTER_MS = 6000

/**
 * Keeps signed-out visitors out of the app screens.
 *
 * Two changes. The redirect now carries the path it came from, so signing in
 * from a link to /approvals lands on /approvals rather than on the thread.
 * And the waiting state no longer pulses "Verifying session…" for ever: the
 * session check is one request to the service with no timeout of its own,
 * and when that service is starting up or pinned by a model run it can hang.
 * After six seconds it says what it is waiting for and offers the way out.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { authenticated, loading } = useRole()
  const router = useRouter()
  const pathname = usePathname()
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!loading && !authenticated) {
      const next = pathname && pathname !== '/sign-in' ? `?next=${encodeURIComponent(pathname)}` : ''
      router.replace(`/sign-in${next}`)
    }
  }, [authenticated, loading, router, pathname])

  useEffect(() => {
    if (!loading) {
      setSlow(false)
      return
    }
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [loading])

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div role="status" className="flex max-w-[360px] flex-col items-start gap-3">
          <AegisLogo size={20} variant="mark" iconClassName="text-foreground-muted" />
          <p className="text-body text-foreground-secondary">Checking your session…</p>
          {slow && (
            <>
              <p className="text-body text-foreground-muted">
                The workbench service has not answered{' '}
                <span className="font-mono text-ui text-foreground-secondary">GET /api/auth/me</span>{' '}
                yet. It may still be starting, or busy with a model run on this machine.
              </p>
              <Link
                href="/sign-in"
                className="text-body text-foreground underline decoration-line-strong underline-offset-4 hover:decoration-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
              >
                Go to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    )
  }

  // Don't render protected content if not authenticated
  if (!authenticated) return null

  return <>{children}</>
}
