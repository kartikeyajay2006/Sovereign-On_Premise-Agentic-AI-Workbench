'use client'

import { useState, type ReactNode } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { useRole } from '@/components/role-context'
import { useToast } from '@/components/toast'
import { roleName } from '@/lib/presentation'
import { cn } from '@/lib/utils'
import { FailureState, ReadingLine, clockTime, useReading, type Reading } from '@/shared/ui/data/reading'
import { EmptyState } from '@/shared/ui/data/empty-state'
import {
  approveRequest,
  createInvite,
  issueReset,
  readAccessRequests,
  readAccounts,
  readDirectory,
  readInvites,
  readPolicyChoices,
  refusal,
  rejectRequest,
  revokeInvite,
  setActive,
  type AccessRequestRecord,
  type AccountRecord,
  type InviteRecord,
  type PolicyChoices,
} from './api'

type Option = { value: string; label: string }

function when(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function roleOptions(choices: PolicyChoices | null): Option[] {
  return Object.keys(choices?.roles ?? {}).map((id) => ({ value: id, label: roleName(id) }))
}

function departmentOptions(choices: PolicyChoices | null): Option[] {
  return (choices?.departments ?? []).map((d) => ({ value: d.id, label: d.label }))
}

function Select({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Option[]
  disabled?: boolean
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="hv-label">{label}</span>
      <select
        value={value}
        disabled={disabled || options.length === 0}
        onChange={(e) => onChange(e.target.value)}
        className="hv-input sm"
      >
        {options.length === 0 && <option value="">—</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function Section({ title, lede, children, aside }: { title: string; lede: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 border-b border-line-default pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[1.25rem] font-light tracking-[-0.01em] text-foreground [font-stretch:88%]">{title}</h2>
          <p className="mt-1 max-w-[72ch] text-body text-foreground-secondary">{lede}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** The three honest outcomes of a read, then the content. */
function Read<T>({
  reading,
  what,
  source,
  children,
}: {
  reading: Reading<T>
  what: string
  source: string
  children: (data: T) => ReactNode
}) {
  if (reading.data !== null) return <>{children(reading.data)}</>
  if (reading.status === 'failed' && reading.failure)
    return <FailureState failure={reading.failure} what={what} retry={reading.reload} />
  return <ReadingLine what={what} source={source} startedAt={reading.startedAt} />
}

/**
 * A one-time code, shown in the response that issued it and nowhere else.
 * The service keeps only its hash, so closing this panel is the last time
 * anyone can read it; the panel says so, and offers the code and its link to
 * copy.
 */
function IssuedCode({ title, code, path, onClose }: { title: string; code: string; path: string; onClose: () => void }) {
  const { push } = useToast()
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const link = typeof window === 'undefined' ? path : `${window.location.origin}${path}`

  const copy = async (what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'code' ? code : link)
      setCopied(what)
    } catch {
      push({ tone: 'critical', title: 'This browser did not allow copying', detail: 'Select the text and copy it by hand.' })
    }
  }

  return (
    <div role="status" className="hv-panel flex flex-col gap-3 border-[color-mix(in_oklab,var(--action)_55%,transparent)] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="hv-label m-0">{title} · shown once</p>
        <button type="button" onClick={onClose} aria-label="Close" className="text-foreground-muted hover:text-foreground">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <p className="hv-code m-0 select-all">{code}</p>
      <p className="m-0 break-all font-mono text-[0.72rem] text-foreground-secondary select-all">{link}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="hv-btn sm" onClick={() => void copy('code')}>
          {copied === 'code' ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          Copy code
        </button>
        <button type="button" className="hv-btn quiet sm" onClick={() => void copy('link')}>
          {copied === 'link' ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          Copy link
        </button>
      </div>
      <p className="m-0 text-ui text-foreground-muted">
        The service stores only a hash of this code. Hand it to the person directly; once this panel is closed it cannot be
        shown again.
      </p>
    </div>
  )
}

const STATE_TONE: Record<string, string> = {
  open: 'text-action-text',
  pending: 'text-approval-text',
  approved: 'text-sovereign-text',
  active: 'text-sovereign-text',
  used: 'text-foreground-secondary',
  expired: 'text-foreground-muted',
  revoked: 'text-critical-text',
  rejected: 'text-critical-text',
  inactive: 'text-critical-text',
}

function State({ value }: { value: string }) {
  return <span className={cn('font-mono text-ledger uppercase tracking-[var(--ls-ledger)]', STATE_TONE[value])}>{value}</span>
}

// ------------------------------------------------------------ requests
function RequestRow({
  request,
  choices,
  onDecided,
}: {
  request: AccessRequestRecord
  choices: PolicyChoices | null
  onDecided: (record: AccessRequestRecord) => void
}) {
  const { push } = useToast()
  const roles = roleOptions(choices)
  const departments = departmentOptions(choices)
  const [role, setRole] = useState(request.requested_role)
  const [department, setDepartment] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const chosenDepartment = department || departments[0]?.value || ''

  const approve = async () => {
    setBusy('approve')
    try {
      const record = await approveRequest(request.id, role, chosenDepartment)
      push({ tone: 'sovereign', title: `${request.username} approved`, detail: `${roleName(role)}, ${chosenDepartment}. The account can sign in now.` })
      onDecided(record)
    } catch (err) {
      push({ tone: 'critical', title: 'Not approved', detail: refusal(err, 'The service refused the approval.') })
      setBusy(null)
    }
  }

  const reject = async () => {
    if (reason.trim().length < 3) {
      push({ tone: 'critical', title: 'Give a reason', detail: 'The requester is shown it.' })
      return
    }
    setBusy('reject')
    try {
      const record = await rejectRequest(request.id, reason.trim())
      push({ tone: 'default', title: `${request.username} not approved`, detail: 'The pending account was removed.' })
      onDecided(record)
    } catch (err) {
      push({ tone: 'critical', title: 'Not rejected', detail: refusal(err, 'The service refused the rejection.') })
      setBusy(null)
    }
  }

  return (
    <li className="flex flex-col gap-3 border-b border-line-subtle py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-body font-medium text-foreground">{request.display_name}</span>
        <span className="font-mono text-ui text-foreground-secondary">{request.username}</span>
        <span className="text-ui text-foreground-muted">asked for {roleName(request.requested_role)}</span>
        <span className="ml-auto font-mono text-ledger text-foreground-muted">{when(request.created_at)}</span>
      </div>
      <p className="m-0 max-w-[80ch] border-l-2 border-line-default pl-3 text-body text-foreground-secondary">{request.reason}</p>
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,12rem)_auto_auto]">
        <Select label="Role" value={role} onChange={setRole} options={roles} disabled={busy !== null} />
        <Select label="Department" value={chosenDepartment} onChange={setDepartment} options={departments} disabled={busy !== null} />
        <button type="button" className="hv-btn sm" disabled={busy !== null || !roles.length} onClick={() => void approve()}>
          {busy === 'approve' ? 'Approving…' : 'Approve'}
        </button>
        <button type="button" className="hv-btn quiet sm" disabled={busy !== null} onClick={() => setRejecting((v) => !v)}>
          Reject…
        </button>
      </div>
      {rejecting && (
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="flex flex-col gap-1.5">
            <span className="hv-label">Reason, shown to the requester</span>
            <input className="hv-input sm" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button type="button" className="hv-btn danger sm" disabled={busy !== null} onClick={() => void reject()}>
            {busy === 'reject' ? 'Rejecting…' : 'Reject request'}
          </button>
        </div>
      )}
    </li>
  )
}

function RequestsSection({
  requests,
  choices,
  onDecided,
}: {
  requests: Reading<AccessRequestRecord[]>
  choices: PolicyChoices | null
  /** A decision activates or removes an account; the account list re-reads. */
  onDecided: () => void
}) {
  const replace = (record: AccessRequestRecord) => {
    requests.setData((rows) => (rows ?? []).map((row) => (row.id === record.id ? record : row)))
    onDecided()
  }
  return (
    <Section
      title="Access requests"
      lede="People who asked for an account. Each is inactive until you approve it; the role and department are yours to choose, whatever was asked for."
    >
      <Read reading={requests} what="the access requests" source="GET /api/admin/access-requests">
        {(rows) => {
          const pending = rows.filter((row) => row.status === 'pending')
          const decided = rows.filter((row) => row.status !== 'pending').slice(0, 20)
          return (
            <>
              {pending.length === 0 ? (
                <EmptyState title="No requests waiting." body="New requests appear here when someone uses Request access on the sign-in screen." />
              ) : (
                <ul className="flex flex-col border-t border-line-subtle">
                  {pending.map((request) => (
                    <RequestRow key={request.id} request={request} choices={choices} onDecided={replace} />
                  ))}
                </ul>
              )}
              {decided.length > 0 && (
                <details className="group">
                  <summary className="hv-label cursor-pointer py-2">Recently decided · {decided.length}</summary>
                  <ul className="flex flex-col border-t border-line-subtle">
                    {decided.map((row) => (
                      <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line-subtle py-2 text-ui">
                        <State value={row.status} />
                        <span className="text-foreground">{row.display_name}</span>
                        <span className="font-mono text-foreground-secondary">{row.username}</span>
                        <span className="text-foreground-muted">
                          {row.status === 'approved'
                            ? `as ${roleName(row.granted_role ?? '')}, ${row.granted_department ?? '—'}`
                            : `“${row.decision_reason ?? ''}”`}
                          {' '}by {row.decided_by ?? '—'}
                        </span>
                        <span className="ml-auto font-mono text-ledger text-foreground-muted">{when(row.decided_at)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )
        }}
      </Read>
    </Section>
  )
}

// ------------------------------------------------------------ invitations
const EXPIRY: Option[] = [
  { value: '24', label: '24 hours' },
  { value: '72', label: '3 days' },
  { value: '168', label: '7 days' },
]

function InvitesSection({ invites, choices }: { invites: Reading<InviteRecord[]>; choices: PolicyChoices | null }) {
  const { push } = useToast()
  const roles = roleOptions(choices)
  const departments = departmentOptions(choices)
  const [role, setRole] = useState('operator')
  const [department, setDepartment] = useState('')
  const [name, setName] = useState('')
  const [hours, setHours] = useState('72')
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState<{ code: string; path: string } | null>(null)
  const chosenRole = roles.some((r) => r.value === role) ? role : roles[0]?.value ?? ''
  const chosenDepartment = department || departments[0]?.value || ''

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const result = await createInvite({
        role: chosenRole,
        department: chosenDepartment,
        display_name: name.trim() || undefined,
        expires_hours: Number(hours),
      })
      setIssued({ code: result.code, path: result.accept_path })
      invites.setData((rows) => [result.invite, ...(rows ?? [])])
      setName('')
    } catch (err) {
      push({ tone: 'critical', title: 'No invitation issued', detail: refusal(err, 'The service refused the invitation.') })
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (invite: InviteRecord) => {
    try {
      const record = await revokeInvite(invite.id)
      invites.setData((rows) => (rows ?? []).map((row) => (row.id === record.id ? record : row)))
      push({ tone: 'default', title: 'Invitation revoked', detail: 'Its code no longer opens anything.' })
    } catch (err) {
      push({ tone: 'critical', title: 'Not revoked', detail: refusal(err, 'The service refused the revocation.') })
    }
  }

  return (
    <Section
      title="Invitations"
      lede="Fix the role and department, then hand over a one-time code. Whoever redeems it gets exactly that, and the chain records who invited them."
    >
      <form onSubmit={create} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <Select label="Role" value={chosenRole} onChange={setRole} options={roles} disabled={busy} />
        <Select label="Department" value={chosenDepartment} onChange={setDepartment} options={departments} disabled={busy} />
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="hv-label">Name (optional)</span>
          <input className="hv-input sm" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </label>
        <Select label="Expires after" value={hours} onChange={setHours} options={EXPIRY} disabled={busy} />
        <button type="submit" className="hv-btn sm" disabled={busy || !roles.length || !departments.length}>
          {busy ? 'Issuing…' : 'Create invitation'}
        </button>
      </form>

      {issued && <IssuedCode title="Invitation code" code={issued.code} path={issued.path} onClose={() => setIssued(null)} />}

      <Read reading={invites} what="the invitations" source="GET /api/admin/invites">
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState title="No invitations issued yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-ui">
                <thead>
                  <tr className="border-b border-line-default">
                    {['State', 'Role', 'Department', 'Name', 'Issued by', 'Expires', 'Used by', ''].map((h) => (
                      <th key={h} scope="col" className="hv-label py-2 pr-4 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((invite) => (
                    <tr key={invite.id} className="border-b border-line-subtle">
                      <td className="py-2 pr-4">
                        <State value={invite.status} />
                      </td>
                      <td className="py-2 pr-4 text-foreground">{roleName(invite.role)}</td>
                      <td className="py-2 pr-4 text-foreground-secondary">{invite.department}</td>
                      <td className="py-2 pr-4 text-foreground-secondary">{invite.display_name ?? '—'}</td>
                      <td className="py-2 pr-4 font-mono text-foreground-secondary">{invite.created_by}</td>
                      <td className="py-2 pr-4 font-mono text-ledger text-foreground-muted">{when(invite.expires_at)}</td>
                      <td className="py-2 pr-4 font-mono text-foreground-secondary">{invite.used_by ?? '—'}</td>
                      <td className="py-2 text-right">
                        {invite.status === 'open' && (
                          <button type="button" className="hv-btn danger sm" onClick={() => void revoke(invite)}>
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Read>
    </Section>
  )
}

// ---------------------------------------------------------------- users
function AccountsSection({ accounts }: { accounts: Reading<AccountRecord[]> }) {
  const { push } = useToast()
  const { user } = useRole()
  const [busy, setBusy] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ username: string; code: string; path: string } | null>(null)

  const toggle = async (account: AccountRecord) => {
    setBusy(account.id)
    try {
      const record = await setActive(account.id, !account.active)
      accounts.setData((rows) => (rows ?? []).map((row) => (row.id === record.id ? record : row)))
      push({
        tone: 'default',
        title: record.active ? `${record.username} activated` : `${record.username} deactivated`,
        detail: record.active ? 'The account can sign in again.' : 'Its sessions were ended and it can no longer sign in.',
      })
    } catch (err) {
      push({ tone: 'critical', title: 'No change made', detail: refusal(err, 'The service refused the change.') })
    } finally {
      setBusy(null)
    }
  }

  const reset = async (account: AccountRecord) => {
    setBusy(account.id)
    try {
      const result = await issueReset(account.id)
      setIssued({ username: result.username, code: result.code, path: result.accept_path })
    } catch (err) {
      push({ tone: 'critical', title: 'No reset code issued', detail: refusal(err, 'The service refused the reset.') })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section
      title="Accounts"
      lede="Everyone who can sign in to this host, and how each account came to exist. Deactivating ends the account's sessions at once; nothing is deleted."
    >
      {issued && (
        <IssuedCode
          title={`Reset code for ${issued.username}`}
          code={issued.code}
          path={issued.path}
          onClose={() => setIssued(null)}
        />
      )}
      <Read reading={accounts} what="the accounts" source="GET /api/admin/users">
        {(rows) => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-ui">
              <thead>
                <tr className="border-b border-line-default">
                  {['State', 'Name', 'Username', 'Role', 'Department', 'Came from', ''].map((h) => (
                    <th key={h} scope="col" className="hv-label py-2 pr-4 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((account) => {
                  const self = account.id === user?.id
                  return (
                    <tr key={account.id} className="border-b border-line-subtle">
                      <td className="py-2 pr-4">
                        <State value={account.pending_request ? 'pending' : account.active ? 'active' : 'inactive'} />
                      </td>
                      <td className="py-2 pr-4 text-foreground">
                        {account.display_name}
                        {self && <span className="ml-2 text-foreground-muted">(you)</span>}
                      </td>
                      <td className="py-2 pr-4 font-mono text-foreground-secondary">{account.username}</td>
                      <td className="py-2 pr-4 text-foreground-secondary">{roleName(account.role)}</td>
                      <td className="py-2 pr-4 text-foreground-secondary">{account.department}</td>
                      <td className="py-2 pr-4 font-mono text-ledger text-foreground-muted">
                        {account.origin ?? 'not recorded'}
                        {account.provisioned_by ? ` · ${account.provisioned_by}` : ''}
                      </td>
                      <td className="py-2 text-right">
                        {account.pending_request ? (
                          <span className="text-ui text-foreground-muted">decide the request above</span>
                        ) : (
                          <span className="inline-flex gap-2">
                            {account.active && (
                              <button
                                type="button"
                                className="hv-btn quiet sm"
                                disabled={busy !== null}
                                onClick={() => void reset(account)}
                              >
                                Reset password
                              </button>
                            )}
                            {!self && (
                              <button
                                type="button"
                                className={cn('hv-btn sm', account.active ? 'danger' : 'quiet')}
                                disabled={busy !== null}
                                onClick={() => void toggle(account)}
                              >
                                {account.active ? 'Deactivate' : 'Activate'}
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Read>
    </Section>
  )
}

/**
 * People: who can sign in to this host, and the decisions that put them
 * there.
 *
 * The access-request queue, invitations and the account list, each read
 * from the service and each change made through it, so every approval,
 * rejection, invitation, revocation, deactivation and reset lands on the
 * audit chain with the administrator who made it. The header's figures are
 * counts of what was read, never a default: a read that has not answered
 * shows a dash. The directory line says what the build can do with the
 * AD/LDAP declaration -- today, nothing -- in the service's own words.
 */
export function AdminAccessView() {
  const requests = useReading((signal) => readAccessRequests(signal), [])
  const invites = useReading((signal) => readInvites(signal), [])
  const accounts = useReading((signal) => readAccounts(signal), [])
  const choices = useReading((signal) => readPolicyChoices(signal), [])
  const directory = useReading((signal) => readDirectory(signal), [])

  const pending = requests.data ? requests.data.filter((r) => r.status === 'pending').length : null
  const open = invites.data ? invites.data.filter((i) => i.status === 'open').length : null
  const active = accounts.data ? accounts.data.filter((a) => a.active).length : null

  return (
    <div className="flex flex-col">
      <PageHeader
        title="People"
        description="Who can sign in to this host. Every account here traces to an administrator's decision, and every decision is on the audit chain."
        meta={[
          { label: 'Waiting', value: pending, tone: pending ? 'approval' : 'default', hint: requests.readAt ? `GET /api/admin/access-requests, ${clockTime(requests.readAt)}` : undefined },
          { label: 'Open invitations', value: open, hint: invites.readAt ? `GET /api/admin/invites, ${clockTime(invites.readAt)}` : undefined },
          { label: 'Active accounts', value: active, hint: accounts.readAt ? `GET /api/admin/users, ${clockTime(accounts.readAt)}` : undefined },
        ]}
      />
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-12 px-4 pb-16 pt-6 sm:px-6">
        <RequestsSection requests={requests} choices={choices.data} onDecided={accounts.reload} />
        <InvitesSection invites={invites} choices={choices.data} />
        <AccountsSection accounts={accounts} />
        <Section
          title="Directory"
          lede="Signing in against the plant's AD/LDAP, with roles from group membership, is the preferred path for a plant that runs one."
        >
          <Read reading={directory} what="the directory status" source="GET /api/admin/directory">
            {(status) => (
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-ui">
                <dt className="hv-label">State</dt>
                <dd className="m-0">
                  <State value={status.configured ? 'configured' : 'not configured'} />
                </dd>
                <dt className="hv-label">Declared</dt>
                <dd className="m-0 font-mono text-foreground-secondary">
                  {status.enabled ? 'enabled' : 'disabled'} in config/app.yaml · identity.directory
                  {status.url ? ` · ${status.url}` : ''}
                </dd>
                <dt className="hv-label">Service says</dt>
                <dd className="m-0 text-foreground-secondary">{status.detail}</dd>
              </dl>
            )}
          </Read>
        </Section>
      </div>
    </div>
  )
}
