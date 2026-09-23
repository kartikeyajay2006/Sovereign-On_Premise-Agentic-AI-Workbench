'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import { ROLES } from '@/lib/presentation'
import type { RoleId } from '@/lib/types'
import { Button } from '@/shared/ui/controls/button'
import { Input } from '@/shared/ui/controls/input'
import { AegisLogo } from '@/components/aegis-logo'
import { useRole } from '@/components/role-context'
import { cn } from '@/lib/utils'
import { HostStatus } from './host-status'

/**
 * Where to go after signing in: the path the guard bounced from, if it is a
 * path inside this app. Anything else, including another origin written as
 * `//host`, goes to the thread, so the parameter cannot be used as an open
 * redirect.
 */
function nextPath(): string {
  if (typeof window === 'undefined') return '/console'
  const next = new URLSearchParams(window.location.search).get('next')
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/sign-in')) return '/console'
  return next
}

/**
 * Sign in.
 *
 * Still one narrow column, for the reasons the last version gave: a sign-in
 * is a utility surface, and none of the products that do it well put a
 * marketing panel beside the form. What was generic about it was that it
 * could have been any product's. Three things now make it this one:
 *
 *   - Before anyone signs in, the page shows what the machine reports about
 *     itself, read from the public GET /api/status and labelled as such, in
 *     the same terms the Assurance screen uses. If the service does not
 *     answer, that is what it says, and no reassuring figure stands in.
 *   - The demo accounts are listed with what each role is for, because on
 *     this product the role is the point: an engineer can run a task and
 *     cannot release it; a reviewer can.
 *   - The footer states the one thing a sign-in here always does. Success
 *     and failure are both written to the hash-chained audit log
 *     (backend/core/identity.py records login_succeeded and login_failed).
 *
 * The old headline copy, the "AIR-GAPPED" chip and the Google SSO button stay
 * gone; each asserted something a browser cannot know.
 */
export function SignInView() {
  const router = useRouter()
  const { login } = useRole()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  // Where the error belongs, so it is shown beside the thing that caused it.
  const [error, setError] = useState<{ at: 'form' | 'demo'; message: string } | null>(null)
  const [busy, setBusy] = useState<'form' | RoleId | null>(null)
  const [origin, setOrigin] = useState<string | null>(null)

  useEffect(() => {
    setOrigin(window.location.host)
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!username.trim() || !password) {
      setError({ at: 'form', message: 'Enter a username and a password.' })
      return
    }
    setError(null)
    setBusy('form')
    try {
      await login(username.trim(), password)
      router.push(nextPath())
    } catch (err: any) {
      // One message for both fields. Saying which half was wrong tells an
      // attacker which usernames exist on this host.
      setError({
        at: 'form',
        message:
          err?.status === 0
            ? 'The workbench service is not reachable from this browser.'
            : 'That username and password do not match an account on this host.',
      })
      setBusy(null)
    }
  }

  const signInAs = async (roleId: RoleId) => {
    if (busy) return
    setError(null)
    setBusy(roleId)
    try {
      await login(roleId)
      router.push(nextPath())
    } catch (err: any) {
      setError({
        at: 'demo',
        message:
          err?.status === 0
            ? 'The workbench service is not reachable from this browser.'
            : `The ${roleId} account did not accept the demo password on this host.`,
      })
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background px-4">
      <main className="mx-auto w-full max-w-[400px] flex-1 pb-12 pt-[10vh]">
        <AegisLogo size={24} variant="full" />

        <h1 className="mt-8 text-title font-medium tracking-[var(--ls-title)] text-foreground">Sign in</h1>
        <p className="mt-1 text-body text-foreground-secondary">
          to the workbench served by the machine in front of you.
        </p>

        <div className="mt-6">
          <HostStatus />
        </div>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
          <Input
            label="Username"
            size="lg"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={error?.at === 'form' ? error.message : undefined}
            placeholder="engineer"
          />
          <Input
            label="Password"
            size="lg"
            type={reveal ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            labelAction={
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? 'Hide password' : 'Show password'}
                aria-pressed={reveal}
                className="hover-decay flex h-6 w-6 items-center justify-center rounded-[var(--radius-xs)] text-foreground-muted hover:text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
              >
                {reveal ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
              </button>
            }
          />

          {/*
            No "Forgot?" link. There is no password-reset path in a build with
            no mail transport, and a link to nothing is the smallest possible
            version of the contradiction this page exists to avoid.
          */}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            ground="paper"
            busy={busy === 'form'}
            busyLabel="Signing in…"
            disabled={busy !== null && busy !== 'form'}
            className="mt-1 w-full"
          >
            Sign in
          </Button>
        </form>

        <section aria-labelledby="demo-heading" className="mt-10">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-line-default" />
            <h2
              id="demo-heading"
              className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted"
            >
              Or a demo account
            </h2>
            <span className="h-px flex-1 bg-line-default" />
          </div>

          <ul className="mt-4 overflow-hidden rounded-[var(--radius)] bg-surface shadow-[var(--elev-0)]">
            {ROLES.map((r) => {
              const pending = busy === r.id
              return (
                <li key={r.id} className="border-b border-line-subtle last:border-b-0">
                  <button
                    type="button"
                    onClick={() => void signInAs(r.id)}
                    disabled={busy !== null}
                    aria-busy={pending || undefined}
                    className={cn(
                      'hover-decay group flex w-full items-center gap-3 px-4 py-3 text-left',
                      'hover:bg-surface-sunken focus-visible:shadow-[inset_0_0_0_2px_var(--foreground)] focus-visible:outline-none',
                      'disabled:cursor-default',
                      busy !== null && !pending && 'opacity-[var(--opacity-disabled)]',
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-baseline gap-2">
                        <span className="text-body font-medium text-foreground">{r.label}</span>
                        <span className="font-mono text-ledger text-foreground-muted">{r.id}</span>
                      </span>
                      <span className="text-ui text-foreground-secondary">{r.description}</span>
                    </span>
                    {pending ? (
                      <Loader2 aria-hidden className="h-3.5 w-3.5 shrink-0 animate-spin text-foreground-muted motion-reduce:animate-none" />
                    ) : (
                      <ArrowRight
                        aria-hidden
                        className="h-3.5 w-3.5 shrink-0 text-foreground-muted opacity-0 transition-opacity duration-[var(--micro)] ease-[var(--ease-micro)] group-hover:opacity-100 group-focus-visible:opacity-100"
                      />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-ui text-foreground-muted">
            For evaluation. Each signs in to the seeded account of that name with the demo password. Try
            the engineer to run a task and the reviewer to release it.
          </p>
          {error?.at === 'demo' && (
            <p role="alert" className="mt-2 text-ui text-critical-text">
              {error.message}
            </p>
          )}
        </section>
      </main>

      <footer className="mx-auto w-full max-w-[400px] pb-8">
        <p className="text-ui text-foreground-secondary">
          Every sign-in attempt, accepted or refused, is written to the hash-chained audit log on this host.
        </p>
        <p className="mt-2 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
          {origin ? `served from ${origin}` : ' '}
        </p>
      </footer>
    </div>
  )
}
