'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import { ROLES } from '@/lib/presentation'
import type { RoleId } from '@/lib/types'
import { Input } from '@/shared/ui/controls/input'
import { ErrorState } from '@/shared/ui/data/error-state'
import { AegisLogo } from '@/components/aegis-logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { useRole } from '@/components/role-context'
import { Wordmark } from '@/components/landing/wordmark'
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
 * A failed sign-in, shown beside what caused it. `unreachable` is the
 * service giving no answer at all, which is not a verdict on the password
 * and gets the failure path rather than a line under a field.
 */
type SignInError =
  | { at: 'form' | 'demo'; unreachable: true }
  | { at: 'form' | 'demo'; unreachable: false; message: string }

/**
 * The failure path, in ErrorState's structure: what happened, what to do,
 * and the address to act on. The address is where this server forwards the
 * sign-in (read from its configuration by the page), so it is offered as the
 * thing to go and start, not as a measurement.
 */
function ServiceUnreachable({ api, className }: { api: string; className?: string }) {
  return (
    <div role="alert" className={className}>
      <ErrorState
        headline="The workbench service is not reachable from this browser."
        nextAction="The sign-in got no answer, so this says nothing about the password. Start the backend on this machine, then sign in again."
        identifier={{ label: 'api', value: api }}
      />
    </div>
  )
}

function initials(label: string) {
  return label
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/**
 * Sign in.
 *
 * One quiet column, the way the best product sign-ins are: the mark, a
 * plain heading, the form, and one ink action. Below it, the demo accounts,
 * each with what its role is for -- on this product the role is the point:
 * an engineer can run a task and cannot release it; a reviewer can -- and one
 * line reporting what this machine says about itself, read live.
 *
 * There is no sign-up and the page says so: accounts on an air-gapped host
 * are provisioned on that host, and a registration form would promise a path
 * the backend does not have. The same goes for "forgot password": no mail
 * transport, no link to nothing.
 */
export function SignInView({ api }: { api: string }) {
  const router = useRouter()
  const { login } = useRole()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  // Where the error belongs, so it is shown beside the thing that caused it.
  const [error, setError] = useState<SignInError | null>(null)
  const [busy, setBusy] = useState<'form' | RoleId | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!username.trim() || !password) {
      setError({ at: 'form', unreachable: false, message: 'Enter a username and a password.' })
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
      setError(
        err?.status === 0
          ? { at: 'form', unreachable: true }
          : { at: 'form', unreachable: false, message: 'That username and password do not match an account on this host.' },
      )
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
      setError(
        err?.status === 0
          ? { at: 'demo', unreachable: true }
          : { at: 'demo', unreachable: false, message: `The ${roleId} account did not accept the demo password on this host.` },
      )
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="ae-shell flex h-16 items-center justify-between">
        <Link
          href="/"
          aria-label="AEGIS — home"
          className="rounded-full focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
        >
          <Wordmark />
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 justify-center px-5 pb-16 pt-8 sm:pt-14">
        <div className="w-full max-w-[400px]">
          <div className="ae-load-1 text-center">
            <AegisLogo variant="mark" size={52} className="mx-auto" />
            <h1 className="mt-6 text-[1.7rem] font-semibold tracking-[-0.03em] text-foreground">Sign in to AEGIS</h1>
            <p className="mt-2 text-[0.95rem] text-foreground-secondary">Use the account provisioned for you on this host.</p>
          </div>

          <form onSubmit={submit} className="ae-load-2 mt-9 flex flex-col gap-4" noValidate>
            <Input
              label="Username"
              size="lg"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={error?.at === 'form' && !error.unreachable ? error.message : undefined}
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
                  className="flex size-6 items-center justify-center rounded-full text-foreground-muted transition-colors hover:text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
                >
                  {reveal ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                </button>
              }
            />
            <button type="submit" disabled={busy !== null} aria-busy={busy === 'form' || undefined} className="ae-btn primary mt-2 w-full">
              {busy === 'form' ? (
                <>
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  Signing in…
                </>
              ) : (
                'Continue'
              )}
            </button>
            {error?.at === 'form' && error.unreachable && <ServiceUnreachable api={api} />}
          </form>

          <section aria-labelledby="demo-heading" className="ae-load-3 mt-10">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-line-subtle" />
              <h2 id="demo-heading" className="text-[0.82rem] font-normal text-foreground-muted">
                or try a demo account
              </h2>
              <span className="h-px flex-1 bg-line-subtle" />
            </div>

            <ul className="mt-4 flex flex-col gap-1.5">
              {ROLES.map((r) => {
                const pending = busy === r.id
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => void signInAs(r.id)}
                      disabled={busy !== null}
                      aria-busy={pending || undefined}
                      className={cn(
                        'group flex w-full items-center gap-3 rounded-[14px] border border-line-subtle bg-surface px-3 py-2.5 text-left',
                        'transition-[border-color,box-shadow,transform] duration-150',
                        'hover:border-line-default hover:shadow-[0_1px_2px_oklch(0_0_0/0.04),0_8px_20px_-12px_oklch(0_0_0/0.18)]',
                        'focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none active:scale-[0.99]',
                        'disabled:cursor-default',
                        busy !== null && !pending && 'opacity-50',
                      )}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-[0.75rem] font-semibold text-foreground">
                        {initials(r.label)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[0.92rem] font-medium text-foreground">{r.label}</span>
                          <span className="text-[0.75rem] text-foreground-muted">{r.id}</span>
                        </span>
                        <span className="mt-0.5 block text-[0.8rem] leading-[1.45] text-foreground-secondary">{r.description}</span>
                      </span>
                      {pending ? (
                        <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-foreground-muted motion-reduce:animate-none" />
                      ) : (
                        <ChevronRight
                          aria-hidden
                          className="size-4 shrink-0 text-foreground-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground"
                        />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
            {error?.at === 'demo' &&
              (error.unreachable ? (
                <ServiceUnreachable api={api} className="mt-4" />
              ) : (
                <p role="alert" className="mt-3 text-[0.85rem] text-critical-text">
                  {error.message}
                </p>
              ))}
          </section>

          <div className="ae-load-4 mt-10 flex flex-col gap-3 border-t border-line-subtle pt-5">
            <HostStatus />
            <p className="text-[0.8rem] leading-[1.5] text-foreground-muted">
              No self sign-up: accounts are provisioned on this host. Every attempt, accepted or refused, is written to
              its hash-chained audit log.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
