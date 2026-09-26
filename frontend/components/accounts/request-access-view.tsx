'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ROLES } from '@/lib/presentation'
import { readRequestStatus, refusal, requestAccess, type AccessRequestStatus } from './api'
import { ActionButton, AuthHeading, AuthShell, Field, FormError, RecordedNote, SelectField, TextField, clock } from './auth-shell'
import { passwordProblem } from './passwords'

/** How often the waiting page asks. A person is deciding; there is no hurry to measure. */
const POLL_MS = 15_000

/** This browser's last request, so reopening the page returns to its status. */
const STORAGE_KEY = 'aegis-access-request'

/**
 * The presentation roles, with the backend's name for the administrator.
 * The requested role is a note for the administrator, who picks the real
 * one when approving; it is never granted by asking.
 */
const ROLE_CHOICES = ROLES.map((role) => ({
  value: role.id === 'admin' ? 'administrator' : role.id,
  label: role.label,
}))

function requestFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('request')
  if (fromHash) return fromHash
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function remember(id: string | null) {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private windows and blocked storage: the fragment still holds it.
  }
  const url = id ? `${window.location.pathname}#request=${encodeURIComponent(id)}` : window.location.pathname
  window.history.replaceState(null, '', url)
}

/**
 * Request access: ask an administrator for an account.
 *
 * The form creates the account the service will hold -- inactive, with only
 * the password's hash -- and a request in the administrator's queue. Nothing
 * here can switch it on. Afterwards the page becomes the request's status,
 * read from GET /api/access-requests/{id}/status every 15 seconds until an
 * administrator decides, and it shows when it last asked rather than a
 * spinner that would move whether or not anything was read.
 */
export function RequestAccessView() {
  const [requestId, setRequestId] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    setRequestId(requestFromLocation())
    setChecked(true)
  }, [])

  if (!checked) return <AuthShell>{null}</AuthShell>
  return requestId ? (
    <RequestStatus
      id={requestId}
      onForget={() => {
        remember(null)
        setRequestId(null)
      }}
    />
  ) : (
    <RequestForm
      onSubmitted={(id) => {
        remember(id)
        setRequestId(id)
      }}
    />
  )
}

function RequestForm({ onSubmitted }: { onSubmitted: (id: string) => void }) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('operator')
  const [reason, setReason] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!username.trim() || !displayName.trim() || !reason.trim()) {
      setError('Enter a username, your name, and why you need access.')
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
      const status = await requestAccess({
        username: username.trim(),
        display_name: displayName.trim(),
        requested_role: role,
        reason: reason.trim(),
        password,
      })
      onSubmitted(status.id)
    } catch (err) {
      setBusy(false)
      setError(refusal(err, 'The service did not accept the request.'))
    }
  }

  return (
    <AuthShell footer={<RecordedNote>Your request, and its decision, are recorded.</RecordedNote>}>
      <AuthHeading
        label="Request access"
        title="Ask for an account"
        lede="An administrator on this host reads every request and decides your role and department. Until then the account cannot sign in."
      />
      <form onSubmit={submit} className="mt-10 flex flex-col gap-5" noValidate>
        <Field
          label="Username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          hint="Lowercase letters, numbers, dots, hyphens or underscores; or an email address."
        />
        <Field label="Display name" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <SelectField label="Role you need" value={role} onChange={setRole} options={ROLE_CHOICES} />
        <TextField
          label="Why you need access"
          value={reason}
          maxLength={1000}
          onChange={(e) => setReason(e.target.value)}
          hint="Your team, your supervisor, what you will use it for. The administrator sees exactly this."
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 8 characters. You will sign in with it once the request is approved."
        />
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && <FormError>{error}</FormError>}
        <ActionButton busy={busy} busyLabel="Sending…">
          Send request
        </ActionButton>
      </form>
      <p className="mt-8 text-[0.86rem] text-foreground-secondary">
        Have an invitation code instead?{' '}
        <Link href="/invite" className="hv-link">
          Accept it
        </Link>
      </p>
    </AuthShell>
  )
}

type Poll =
  | { kind: 'reading' }
  | { kind: 'read'; status: AccessRequestStatus; at: number }
  | { kind: 'failed'; message: string; at: number; last: AccessRequestStatus | null }

function RequestStatus({ id, onForget }: { id: string; onForget: () => void }) {
  const [poll, setPoll] = useState<Poll>({ kind: 'reading' })

  const read = useCallback(
    (signal?: AbortSignal) =>
      readRequestStatus(id, signal)
        .then((status) => setPoll({ kind: 'read', status, at: Date.now() }))
        .catch((err) => {
          if (signal?.aborted) return
          setPoll((previous) => ({
            kind: 'failed',
            message: refusal(err, 'The service did not return this request.'),
            at: Date.now(),
            last: previous.kind === 'read' ? previous.status : previous.kind === 'failed' ? previous.last : null,
          }))
        }),
    [id],
  )

  const current = poll.kind === 'read' ? poll.status : poll.kind === 'failed' ? poll.last : null
  const decided = current !== null && current.status !== 'pending'
  const unknown = poll.kind === 'failed' && /not found/i.test(poll.message)

  useEffect(() => {
    const controller = new AbortController()
    void read(controller.signal)
    return () => controller.abort()
  }, [read])

  // Every 15 s while undecided, and not at all once there is an answer.
  useEffect(() => {
    if (decided || unknown) return
    const timer = window.setInterval(() => void read(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [decided, unknown, read])

  const footer = (
    <>
      <p className="hv-label m-0">
        Request <span className="text-foreground-secondary">{id}</span>
      </p>
      {poll.kind !== 'reading' && (
        <p className="m-0 text-[0.8rem] text-foreground-muted">
          {poll.kind === 'read' ? `Checked ${clock(poll.at)}` : `Last attempt ${clock(poll.at)} failed: ${poll.message}`}
          {!decided && !unknown && ' · asked again every 15 s'}
        </p>
      )}
      <RecordedNote>The decision is recorded, with who made it.</RecordedNote>
    </>
  )

  if (unknown) {
    return (
      <AuthShell footer={footer}>
        <AuthHeading
          label="Request access"
          title="This request is not on this host."
          lede="The service has no request with this id. It may have been made on another host."
        />
        <button type="button" onClick={onForget} className="hv-btn quiet mt-8 w-full">
          Make a new request
        </button>
      </AuthShell>
    )
  }

  if (current?.status === 'approved') {
    return (
      <AuthShell footer={footer}>
        <AuthHeading
          label="Request access · Approved"
          title="You can sign in."
          lede="An administrator approved your request and set your role and department. Sign in with the username and password you chose."
        />
        <Link href="/sign-in" className="hv-btn mt-8 w-full" onClick={onForget}>
          Go to sign in
        </Link>
      </AuthShell>
    )
  }

  if (current?.status === 'rejected') {
    return (
      <AuthShell footer={footer}>
        <AuthHeading label="Request access · Not approved" title="Your request was not approved." />
        {current.reason && (
          <div className="hv-panel mt-8 p-4">
            <p className="hv-label m-0">Reason given</p>
            <p className="m-0 mt-2 text-[0.92rem] leading-[1.55] text-foreground">{current.reason}</p>
          </div>
        )}
        <p className="mt-6 text-[0.88rem] leading-[1.55] text-foreground-secondary">
          The account it created has been removed. You can ask again, or ask an administrator for an invitation.
        </p>
        <button type="button" onClick={onForget} className="hv-btn quiet mt-6 w-full">
          Make a new request
        </button>
      </AuthShell>
    )
  }

  return (
    <AuthShell footer={footer}>
      <AuthHeading
        label="Request access · Pending"
        title="Waiting for approval"
        lede={
          poll.kind === 'reading'
            ? 'Asking this host about your request…'
            : 'Your request is in the administrators’ queue. This page checks for a decision every 15 seconds; you can also close it and come back.'
        }
      />
      {current && (
        <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y border-line-subtle py-4">
          <dt className="hv-label">Asked</dt>
          <dd className="m-0 font-mono text-[0.8rem] text-foreground-secondary">{new Date(current.created_at).toLocaleString()}</dd>
          <dt className="hv-label">State</dt>
          <dd className="m-0 font-mono text-[0.8rem] text-foreground">pending</dd>
        </dl>
      )}
      <button type="button" onClick={onForget} className="hv-link mt-6 w-fit text-[0.85rem]">
        Forget this request on this browser
      </button>
    </AuthShell>
  )
}
