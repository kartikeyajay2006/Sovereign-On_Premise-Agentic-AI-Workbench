import { request } from '@/lib/api'
import type { Session } from '@/lib/types'

/*
 * Account provisioning, through the shared transport so auth and errors
 * behave as everywhere else. Shapes are the backend's
 * (backend/core/schemas.py, backend/api/routes/accounts.py); nothing here
 * adds a field the service did not send.
 *
 * The unauthenticated calls -- setup, invitations, resets, access requests
 * -- return a Session where the service signs the new account straight in;
 * the caller hands it to useRole().adopt().
 */

export type CodeStatus = 'open' | 'used' | 'expired' | 'revoked'
export type RequestState = 'pending' | 'approved' | 'rejected'

export interface InviteRecord {
  id: string
  role: string
  department: string
  display_name: string | null
  status: CodeStatus
  created_by: string
  created_at: string
  expires_at: string
  used_at: string | null
  used_by: string | null
  revoked_at: string | null
  revoked_by: string | null
}

export interface InviteIssued {
  invite: InviteRecord
  /** Returned once, here. The service keeps only its hash. */
  code: string
  accept_path: string
}

export interface AccessRequestRecord {
  id: string
  username: string
  display_name: string
  requested_role: string
  reason: string
  status: RequestState
  created_at: string
  decided_at: string | null
  decided_by: string | null
  granted_role: string | null
  granted_department: string | null
  decision_reason: string | null
}

export interface AccessRequestStatus {
  id: string
  status: RequestState
  created_at: string
  decided_at: string | null
  /** A rejection's reason, as the administrator wrote it. */
  reason: string | null
}

export interface AccountRecord {
  id: string
  username: string
  display_name: string
  role: string
  department: string
  active: boolean
  created_at: string
  origin: string | null
  provisioned_by: string | null
  pending_request: boolean
}

export interface PasswordResetIssued {
  user_id: string
  username: string
  code: string
  accept_path: string
  expires_at: string
}

export interface DirectoryStatus {
  enabled: boolean
  configured: boolean
  url: string | null
  base_dn: string | null
  detail: string
}

/** The slice of GET /api/policies the People screen offers as choices. */
export interface PolicyChoices {
  roles: Record<string, { description?: string }>
  departments: Array<{ id: string; label: string }>
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

// ------------------------------------------------------------ public doors
export function readSetupStatus(signal?: AbortSignal) {
  return request<{ needs_setup: boolean }>('/setup/status', { signal, cache: 'no-store' })
}

export function createOwner(body: { token: string; username: string; display_name: string; password: string }) {
  return request<Session>('/setup/owner', json(body))
}

export function acceptInvite(body: { code: string; username: string; password: string; display_name?: string }) {
  return request<Session>('/invites/accept', json(body))
}

export function acceptReset(body: { code: string; password: string }) {
  return request<Session>('/password-resets/accept', json(body))
}

export function requestAccess(body: {
  username: string
  display_name: string
  requested_role: string
  reason: string
  password: string
}) {
  return request<AccessRequestStatus>('/access-requests', json(body))
}

export function readRequestStatus(id: string, signal?: AbortSignal) {
  return request<AccessRequestStatus>(`/access-requests/${encodeURIComponent(id)}/status`, {
    signal,
    cache: 'no-store',
  })
}

// -------------------------------------------------------- administration
export function readAccessRequests(signal: AbortSignal) {
  return request<AccessRequestRecord[]>('/admin/access-requests', { signal })
}

export function approveRequest(id: string, role: string, department: string) {
  return request<AccessRequestRecord>(`/admin/access-requests/${encodeURIComponent(id)}/approve`, json({ role, department }))
}

export function rejectRequest(id: string, reason: string) {
  return request<AccessRequestRecord>(`/admin/access-requests/${encodeURIComponent(id)}/reject`, json({ reason }))
}

export function readInvites(signal: AbortSignal) {
  return request<InviteRecord[]>('/admin/invites', { signal })
}

export function createInvite(body: { role: string; department: string; display_name?: string; expires_hours: number }) {
  return request<InviteIssued>('/admin/invites', json(body))
}

export function revokeInvite(id: string) {
  return request<InviteRecord>(`/admin/invites/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function readAccounts(signal: AbortSignal) {
  return request<AccountRecord[]>('/admin/users', { signal })
}

export function setActive(id: string, active: boolean) {
  return request<AccountRecord>(`/admin/users/${encodeURIComponent(id)}/${active ? 'activate' : 'deactivate'}`, {
    method: 'POST',
  })
}

export function issueReset(id: string) {
  return request<PasswordResetIssued>(`/admin/users/${encodeURIComponent(id)}/reset-password`, json({ expires_hours: 24 }))
}

export function readDirectory(signal: AbortSignal) {
  return request<DirectoryStatus>('/admin/directory', { signal })
}

export function readPolicyChoices(signal: AbortSignal) {
  return request<PolicyChoices>('/policies', { signal })
}

/** The service's own message from a failed call, or a fallback in its voice. */
export function refusal(err: unknown, fallback: string): string {
  const e = err as { status?: number; detail?: unknown }
  if (e?.status === 0) return 'The workbench service did not answer. Check that it is running, then try again.'
  if (typeof e?.detail === 'string' && e.detail) return e.detail
  return fallback
}

/** The code from `#code=…` on this page's URL, which never reaches a server. */
export function codeFromFragment(): string {
  if (typeof window === 'undefined') return ''
  const hash = window.location.hash.replace(/^#/, '')
  return new URLSearchParams(hash).get('code') ?? ''
}
