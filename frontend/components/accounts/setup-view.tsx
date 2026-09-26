'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRole } from '@/components/role-context'
import { createOwner, readSetupStatus, refusal } from './api'
import { ActionButton, AuthHeading, AuthShell, Field, FormError, RecordedNote } from './auth-shell'
import { passwordProblem } from './passwords'

type Status = 'reading' | 'needed' | 'done' | 'unreachable'

/**
 * First run: create the administrator who will let everyone else in.
 *
 * Two steps, token then account. The token proves the person at this screen
 * can read the machine the service runs on -- it is only ever written to
 * storage/setup-token and the service's console -- which is the one thing
 * that distinguishes the plant's owner from anyone else who can reach the
 * port on a host with no accounts yet. The service checks it when the
 * account is sent (there is no endpoint that answers "is this token right?"
 * on its own, which would be a free oracle); a wrong one comes back to step
 * one with the service's refusal.
 *
 * Once an administrator exists the service refuses this for good, and the
 * page says so rather than showing a form that cannot work.
 */
export function SetupView() {
  const router = useRouter()
  const { adopt } = useRole()
  const [status, setStatus] = useState<Status>('reading')
  const [step, setStep] = useState<1 | 2>(1)
  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<{ step: 1 | 2; message: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    readSetupStatus(controller.signal)
      .then((body) => setStatus(body.needs_setup ? 'needed' : 'done'))
      .catch((err) => {
        if (!controller.signal.aborted) setStatus(err?.status === 0 ? 'unreachable' : 'needed')
      })
    return () => controller.abort()
  }, [])

  const toAccount = (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim()) {
      setError({ step: 1, message: 'Paste the setup token from storage/setup-token on this machine.' })
      return
    }
    setError(null)
    setStep(2)
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const problem = passwordProblem(password, confirm)
    if (!username.trim() || !displayName.trim()) {
      setError({ step: 2, message: 'Enter a username and the name people will see.' })
      return
    }
    if (problem) {
      setError({ step: 2, message: problem })
      return
    }
    setError(null)
    setBusy(true)
    try {
      const session = await createOwner({
        token: token.trim(),
        username: username.trim(),
        display_name: displayName.trim(),
        password,
      })
      adopt(session)
      router.replace('/admin/access')
    } catch (err: any) {
      setBusy(false)
      if (err?.status === 409 && /already set up/i.test(String(err?.detail ?? ''))) {
        setStatus('done')
        return
      }
      // A token refusal belongs on the token step; anything else on this one.
      const message = refusal(err, 'The service refused the setup.')
      if (/token/i.test(message)) {
        setStep(1)
        setError({ step: 1, message })
      } else {
        setError({ step: 2, message })
      }
    }
  }

  return (
    <AuthShell footer={<RecordedNote>The setup, and every refusal of it, is recorded.</RecordedNote>}>
      {status === 'reading' && <AuthHeading label="Owner setup" title="Asking this host…" />}

      {status === 'unreachable' && (
        <>
          <AuthHeading
            label="Owner setup"
            title="The service did not answer."
            lede="Start the workbench service on this machine, then reload this page."
          />
        </>
      )}

      {status === 'done' && (
        <>
          <AuthHeading
            label="Owner setup"
            title="This host is set up."
            lede="It already has an administrator, so the setup token no longer opens anything. Ask an administrator for an invitation, or request access."
          />
          <p className="mt-8 text-[0.9rem]">
            <Link href="/sign-in" className="hv-link">
              Go to sign in
            </Link>
          </p>
        </>
      )}

      {status === 'needed' && step === 1 && (
        <>
          <AuthHeading
            label="Owner setup · Step 1 of 2"
            title="Claim this host"
            lede={
              <>
                No one administers this workbench yet. When the service started it wrote a one-time token to{' '}
                <span className="font-mono text-[0.85em] text-foreground">storage/setup-token</span> and printed it in its
                console. It lapses 24 hours after it was issued; restarting the service issues a new one.
              </>
            }
          />
          <form onSubmit={toAccount} className="mt-10 flex flex-col gap-5" noValidate>
            <Field
              label="Setup token"
              mono
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              error={error?.step === 1 ? error.message : undefined}
            />
            <ActionButton>Continue</ActionButton>
          </form>
        </>
      )}

      {status === 'needed' && step === 2 && (
        <>
          <AuthHeading
            label="Owner setup · Step 2 of 2"
            title="Your administrator account"
            lede="This account can invite people, decide access requests and deactivate accounts. It is the first entry on this host's audit chain about who may sign in."
          />
          <form onSubmit={create} className="mt-10 flex flex-col gap-5" noValidate>
            <Field
              label="Username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              hint="Lowercase letters, numbers, dots, hyphens or underscores; or an email address."
            />
            <Field
              label="Display name"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <Field
              label="Password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              hint="At least 8 characters."
            />
            <Field
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {error?.step === 2 && <FormError>{error.message}</FormError>}
            <ActionButton busy={busy} busyLabel="Creating…">
              Create administrator
            </ActionButton>
            <button
              type="button"
              onClick={() => {
                setStep(1)
                setError(null)
              }}
              className="hv-link w-fit text-[0.85rem]"
            >
              Back to the token
            </button>
          </form>
        </>
      )}
    </AuthShell>
  )
}
