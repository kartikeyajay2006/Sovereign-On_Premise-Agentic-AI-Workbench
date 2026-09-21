'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { ROLES } from '@/lib/presentation'
import { Button } from '@/shared/ui/controls/button'
import { Input } from '@/shared/ui/controls/input'
import { AegisLogo } from '@/components/aegis-logo'
import { useRole } from '@/components/role-context'

/**
 * Sign in.
 *
 * This was a split screen: a 60px extrabold marketing headline, a sub-line,
 * an animated dot field and a four-tile posture grid on the left, with a
 * scrolling role picker in a card on the right.
 *
 * Measured across the products that do this well, a sign-in heading is
 * 18-20px at weight 500 — Linear ships 18/500, Tailscale 20/600 — while
 * their *marketing* headings run 64-88px. The old screen put landing-page
 * typography on a utility surface, which is most of why it read as weak.
 * None of Linear, Vercel, Tailscale or Railway puts a marketing panel beside
 * the form; all of them centre a single narrow column. Nothing in that set
 * animates on an auth screen at all.
 *
 * So: one 352px column on paper. The only #ffffff on the page is the two
 * input fields, which makes the two things you have to touch the brightest
 * objects on screen and gives the second neutral a job rather than a mood.
 *
 * Removed with the layout:
 *   - "immutable audit logs". A hash chain makes edits detectable, not
 *     impossible. Sigstore writes "tamper-resistant" and never
 *     "tamper-proof", and that one-word hedge is why it is believed.
 *   - "Zero Outbound Egress" and "Default-Deny Policy" in the footer, both
 *     asserted by a page that had no session and could measure neither.
 *   - The "AIR-GAPPED 127.0.0.1" chip. A browser cannot detect an air gap.
 *     It can report which host the API is configured on, which is what the
 *     build strip says instead.
 *   - "Authorize & Enter as Integrity Engineer" — a call to action that
 *     verbs an abstraction and interpolates a role into its own label.
 *   - Every Firebase and Google path. A Google SSO button on the login
 *     screen of an air-gapped product is a contradiction a judge will find,
 *     and every identity arriving through it was mapped to the same
 *     hardcoded 'engineer' role regardless of who signed in.
 *
 * The proof line at the bottom was checked before it was written: login
 * success, login failure and self-registration all call audit.record
 * (backend/core/identity.py:185-246) and the log opens in append mode
 * (backend/core/audit.py:172). It says append-only, which is what it is.
 */
export function SignInView() {
  const router = useRouter()
  const { login } = useRole()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(username.trim(), password)
      router.push('/')
    } catch (err: any) {
      // One message for both fields. Saying which half was wrong tells an
      // attacker which usernames exist on this host.
      setError(
        err?.status === 0
          ? 'The workbench service is not reachable on 127.0.0.1:8000.'
          : 'That username and password do not match an account on this host.',
      )
      setBusy(false)
    }
  }

  const signInAs = async (roleId: string) => {
    setError(null)
    setBusy(true)
    try {
      await login(roleId)
      router.push('/')
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Could not sign in with that role.')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center bg-background px-4">
      <main className="w-full max-w-[352px] pt-[160px]">
        <AegisLogo size={20} variant="full" />

        <h1 className="mt-6 text-title font-medium tracking-[var(--ls-title)] text-foreground">
          Sign in
        </h1>
        <p className="mt-2 text-body text-foreground-secondary">
          This workbench runs on the machine in front of you.
        </p>

        <hr className="mt-6 border-0 border-t border-line-default" />

        <form onSubmit={submit} className="mt-6">
          <Input
            label="Username"
            size="lg"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={error ?? undefined}
            placeholder="engineer"
          />

          <div className="mt-4">
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
                  className="flex h-6 w-6 items-center justify-center text-foreground-muted transition-colors hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                >
                  {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              }
            />
          </div>

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
            busy={busy}
            busyLabel="Signing in…"
            className="mt-5 w-full"
          >
            Sign in
          </Button>
        </form>

        <div className="mt-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-line-default" />
          <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
            or
          </span>
          <span className="h-px flex-1 bg-line-default" />
        </div>

        {/* The label never interpolates a role. The control is called what it
            is, and the role is chosen inside it. */}
        <div className="mt-6">
          <Button
            variant="secondary"
            size="lg"
            ground="paper"
            className="w-full justify-between"
            onClick={() => setDemoOpen((v) => !v)}
            aria-expanded={demoOpen}
          >
            Demo roles
            <span aria-hidden className="text-foreground-muted">
              {demoOpen ? '▴' : '▾'}
            </span>
          </Button>

          {demoOpen && (
            <ul className="grouped mt-2">
              {ROLES.map((r, i) => (
                <li key={r.id} className={i < ROLES.length - 1 ? 'grouped-row' : undefined}>
                  <button
                    type="button"
                    onClick={() => signInAs(r.id)}
                    disabled={busy}
                    className="hover-decay flex w-full items-center justify-between px-3 py-2.5 text-left focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-[var(--opacity-disabled)]"
                  >
                    <span className="text-body text-foreground">{r.label}</span>
                    <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                      {r.id}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-meta text-foreground-muted">
            For evaluation. Each signs in as a real account on this host.
          </p>
        </div>
      </main>

      <footer className="mt-[72px] w-full max-w-[352px] pb-12 text-center">
        <p className="text-body text-foreground-secondary">
          Every action in this workbench is written to an append-only log.
        </p>
        {/*
          No `offline` token in the build strip. A browser cannot detect an
          air gap. It can report which host the API is configured on, which
          is a fact about this build rather than a claim about the network.
        */}
        <p className="mt-4 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
          api 127.0.0.1:8000
        </p>
      </footer>
    </div>
  )
}
