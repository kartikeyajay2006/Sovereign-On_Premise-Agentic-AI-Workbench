'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import { request } from '@/lib/api'
import { roleName } from '@/lib/presentation'
import type { User } from '@/lib/types'
import { ErrorState } from '@/shared/ui/data/error-state'
import { useRole } from '@/components/role-context'
import { cn } from '@/lib/utils'
import { readSetupStatus } from '@/components/accounts/api'
import { ActionButton, AuthHeading, AuthShell, Field, FormError, RecordedNote } from '@/components/accounts/auth-shell'
import { HostStatus, siteName, usePublicStatus } from './host-status'

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
        nextAction="No answer came back, so this says nothing about your password. Start the backend on this machine, then sign in again."
        identifier={{ label: 'api', value: api }}
      />
    </div>
  )
}

/** A refused sign-in, in words that do not say which half was wrong. */
function refusedMessage(err: any): string {
  // A lockout is the service's own sentence, with its wait; anything else is
  // one message for both fields. Saying which half was wrong tells an
  // attacker which usernames exist on this host.
  if (err?.status === 429 && typeof err?.detail === 'string') return err.detail
  return 'That username and password do not match an active account on this host.'
}

/**
 * Sign in.
 *
 * Identifier first, then password, the way a plant's other systems ask: one
 * field and Continue, then the password for that name. Nothing is asked of
 * the service between the two steps -- a "no such user" at step one would
 * tell anyone at the screen which names exist here -- so the name is only
 * checked, with the password, when both are sent.
 *
 * Above the form, the site's configured name (or "this host" until the
 * service has said it). Below, the two other doors, quietly: an invitation
 * code, or a request for access. There is no sign-up. Every account on a
 * production host is an administrator's decision, and the page does not
 * offer a path the backend refuses.
 *
 * On a demo host the seeded accounts are listed, folded away under "Demo
 * accounts", from GET /api/auth/directory -- which lists them only while
 * demo mode is on, so a production host shows no list rather than a list of
 * accounts it does not have.
 *
 * A host that has never been set up has no one to sign in as, so the page
 * sends the visitor to /setup when GET /api/setup/status says so.
 */
export function SignInView({ api }: { api: string }) {
  const router = useRouter()
  const { login } = useRole()
  const host = usePublicStatus()
  const site = siteName(host)

  const [step, setStep] = useState<'identify' | 'password'>('identify')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState<SignInError | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [demo, setDemo] = useState<User[]>([])
  const passwordRef = useRef<HTMLInputElement>(null)
  const usernameRef = useRef<HTMLInputElement>(null)

  // First run: nobody to sign in as yet. A failed read leaves the form up;
  // the host line below already says the service did not answer.
  useEffect(() => {
    const controller = new AbortController()
    readSetupStatus(controller.signal)
      .then((status) => {
        if (status.needs_setup) router.replace('/setup')
      })
      .catch(() => {})
    return () => controller.abort()
  }, [router])

  useEffect(() => {
    const controller = new AbortController()
    request<User[]>('/auth/directory', { signal: controller.signal })
      .then((users) => setDemo(Array.isArray(users) ? users : []))
      .catch(() => setDemo([]))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (step === 'password') passwordRef.current?.focus()
    else usernameRef.current?.focus()
  }, [step])

  const identify = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) {
      setError({ at: 'form', unreachable: false, message: 'Enter your username.' })
      return
    }
    setError(null)
    setStep('password')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!password) {
      setError({ at: 'form', unreachable: false, message: 'Enter your password.' })
      return
    }
    setError(null)
    setBusy('form')
    try {
      await login(username.trim().toLowerCase(), password)
      router.push(nextPath())
    } catch (err: any) {
      setError(err?.status === 0 ? { at: 'form', unreachable: true } : { at: 'form', unreachable: false, message: refusedMessage(err) })
      setBusy(null)
    }
  }

  const signInAs = async (account: User) => {
    if (busy) return
    setError(null)
    setBusy(account.username)
    try {
      await login(account.username)
      router.push(nextPath())
    } catch (err: any) {
      setError(
        err?.status === 0
          ? { at: 'demo', unreachable: true }
          : { at: 'demo', unreachable: false, message: `The ${account.username} account did not accept the demo password on this host.` },
      )
      setBusy(null)
    }
  }

  const change = () => {
    setStep('identify')
    setPassword('')
    setError(null)
  }

  return (
    <AuthShell
      footer={
        <>
          <HostStatus state={host} />
          <RecordedNote>Every sign-in is recorded.</RecordedNote>
        </>
      }
    >
      <AuthHeading label="Sign in to" title={site ?? 'this host'} />

      {step === 'identify' ? (
        <form onSubmit={identify} className="mt-10 flex flex-col gap-5" noValidate>
          <Field
            ref={usernameRef}
            label="Username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={error?.at === 'form' && !error.unreachable ? error.message : undefined}
          />
          <ActionButton>Continue</ActionButton>
        </form>
      ) : (
        <form onSubmit={submit} className="mt-10 flex flex-col gap-5" noValidate>
          {/* The name travels with the password, for the browser's password manager too. */}
          <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
          <div className="flex items-center justify-between gap-3 border-y border-line-subtle py-3">
            <div className="min-w-0">
              <p className="hv-label m-0">Username</p>
              <p className="m-0 mt-1 truncate font-mono text-[0.9rem] text-foreground">{username.trim().toLowerCase()}</p>
            </div>
            <button type="button" onClick={change} className="hv-link shrink-0 text-[0.85rem]">
              Change
            </button>
          </div>
          <Field
            ref={passwordRef}
            label="Password"
            name="password"
            type={reveal ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error?.at === 'form' && !error.unreachable ? error.message : undefined}
            action={
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? 'Hide password' : 'Show password'}
                aria-pressed={reveal}
                className="flex size-6 items-center justify-center text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground"
              >
                {reveal ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
              </button>
            }
          />
          <ActionButton busy={busy === 'form'} busyLabel="Signing in…" disabled={busy !== null}>
            Sign in
          </ActionButton>
        </form>
      )}
      {error?.at === 'form' && error.unreachable && <ServiceUnreachable api={api} className="mt-5" />}

      <p className="mt-8 text-[0.86rem] leading-[1.6] text-foreground-secondary">
        Have an invitation code?{' '}
        <Link href="/invite" className="hv-link">
          Accept it
        </Link>
        <span aria-hidden className="px-2 text-foreground-muted">
          ·
        </span>
        No account?{' '}
        <Link href="/request-access" className="hv-link">
          Request access
        </Link>
      </p>

      {demo.length > 0 && (
        <details className="group mt-10 border-t border-line-subtle pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline-2 focus-visible:outline-foreground [&::-webkit-details-marker]:hidden">
            <span className="hv-label">Demo accounts · {demo.length}</span>
            <ChevronRight aria-hidden className="size-3.5 text-foreground-muted transition-transform group-open:rotate-90 motion-reduce:transition-none" />
          </summary>
          <p className="mt-3 text-[0.8rem] leading-[1.5] text-foreground-muted">
            Seeded for demo mode. Each uses the shared demo password.
          </p>
          <ul className="mt-3 flex flex-col border-t border-line-subtle">
            {demo.map((account) => {
              const pending = busy === account.username
              return (
                <li key={account.id} className="border-b border-line-subtle">
                  <button
                    type="button"
                    onClick={() => void signInAs(account)}
                    disabled={busy !== null}
                    aria-busy={pending || undefined}
                    className={cn(
                      'group/row flex w-full items-center gap-3 px-1 py-2 text-left transition-colors',
                      'hover:bg-[color-mix(in_oklab,var(--foreground)_5%,transparent)]',
                      'focus-visible:outline-2 focus-visible:outline-foreground disabled:cursor-default',
                      busy !== null && !pending && 'opacity-50',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-[0.88rem] text-foreground">{account.display_name}</span>
                    <span className="hidden font-mono text-[0.72rem] text-foreground-muted sm:inline">{roleName(account.role)}</span>
                    <span className="w-[9.5rem] shrink-0 truncate text-right font-mono text-[0.75rem] text-foreground-secondary">
                      {account.username}
                    </span>
                    {pending ? (
                      <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin text-foreground-muted motion-reduce:animate-none" />
                    ) : (
                      <ChevronRight aria-hidden className="size-3.5 shrink-0 text-foreground-muted group-hover/row:text-action-text" />
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
              <div className="mt-3">
                <FormError>{error.message}</FormError>
              </div>
            ))}
        </details>
      )}
    </AuthShell>
  )
}
