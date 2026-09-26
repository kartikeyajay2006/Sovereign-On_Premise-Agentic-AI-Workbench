'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRole } from '@/components/role-context'
import { roleName } from '@/lib/presentation'
import { acceptInvite, acceptReset, codeFromFragment, refusal } from './api'
import { ActionButton, AuthHeading, AuthShell, Field, FormError, RecordedNote } from './auth-shell'
import { passwordProblem } from './passwords'

/**
 * Accept an invitation: a code an administrator issued, which already fixes
 * the role and department. The person chooses only their name and password.
 *
 * The code arrives in the link's fragment (/invite#code=…), which a browser
 * never sends to any server, so it is not in the console server's request
 * log. It is read once on arrival and can also be typed. The role is not
 * shown before accepting: the service has no "what is this code for?"
 * endpoint, which would let anyone probe codes without spending one. It is
 * shown after, from the session the service returns.
 */
export function InviteView() {
  const router = useRouter()
  const { adopt } = useRole()
  const [code, setCode] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [joined, setJoined] = useState<{ role: string; department: string } | null>(null)

  useEffect(() => {
    const fromLink = codeFromFragment()
    if (fromLink) setCode(fromLink)
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!code.trim() || !username.trim()) {
      setError('Enter the invitation code and the username you want.')
      return
    }
    const problem = passwordProblem(password, confirm)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setBusy(true)
    try {
      const session = await acceptInvite({
        code: code.trim(),
        username: username.trim(),
        password,
        display_name: displayName.trim() || undefined,
      })
      adopt(session)
      setJoined({ role: session.user.role, department: session.user.department })
      window.setTimeout(() => router.replace('/console'), 1800)
    } catch (err) {
      setBusy(false)
      setError(refusal(err, 'The service did not accept the invitation.'))
    }
  }

  if (joined) {
    return (
      <AuthShell footer={<RecordedNote>Your acceptance is recorded, with who invited you.</RecordedNote>}>
        <AuthHeading
          label="Invitation accepted"
          title="You're in."
          lede={
            <>
              Signed in as {roleName(joined.role)}, {joined.department}, as your administrator set it. Opening the thread…
            </>
          }
        />
      </AuthShell>
    )
  }

  return (
    <AuthShell footer={<RecordedNote>Every code tried here is recorded.</RecordedNote>}>
      <AuthHeading
        label="Accept an invitation"
        title="Join this workbench"
        lede="Your administrator chose your role and department when they invited you. Choose the name you sign in with and a password."
      />
      <form onSubmit={submit} className="mt-10 flex flex-col gap-5" noValidate>
        <Field
          label="Invitation code"
          mono
          autoComplete="off"
          spellCheck={false}
          placeholder="AEGIS-XXXX-XXXX-XXXX"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
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
          hint="Optional if your administrator already entered it."
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
        {error && <FormError>{error}</FormError>}
        <ActionButton busy={busy} busyLabel="Accepting…">
          Accept invitation
        </ActionButton>
      </form>
      <p className="mt-8 text-[0.86rem] text-foreground-secondary">
        Already have an account?{' '}
        <Link href="/sign-in" className="hv-link">
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}

/**
 * Set a new password with a one-time reset code from an administrator. There
 * is no "forgot password" link anywhere: an air-gapped host has no mail to
 * send one by, so a reset is a person asking their administrator, who issues
 * this code on the People screen.
 */
export function ResetView() {
  const router = useRouter()
  const { adopt } = useRole()
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const fromLink = codeFromFragment()
    if (fromLink) setCode(fromLink)
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!code.trim()) {
      setError('Enter the reset code your administrator gave you.')
      return
    }
    const problem = passwordProblem(password, confirm)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setBusy(true)
    try {
      const session = await acceptReset({ code: code.trim(), password })
      adopt(session)
      router.replace('/console')
    } catch (err) {
      setBusy(false)
      setError(refusal(err, 'The service did not accept the reset code.'))
    }
  }

  return (
    <AuthShell footer={<RecordedNote>The reset is recorded, and signs out every other session.</RecordedNote>}>
      <AuthHeading
        label="Password reset"
        title="Set a new password"
        lede="Use the one-time code your administrator issued. Setting the password signs out anywhere the old one was in use."
      />
      <form onSubmit={submit} className="mt-10 flex flex-col gap-5" noValidate>
        <Field
          label="Reset code"
          mono
          autoComplete="off"
          spellCheck={false}
          placeholder="RESET-XXXX-XXXX-XXXX"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Field
          label="New password"
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
        {error && <FormError>{error}</FormError>}
        <ActionButton busy={busy} busyLabel="Saving…">
          Set password
        </ActionButton>
      </form>
    </AuthShell>
  )
}
