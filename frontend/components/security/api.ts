import { request } from '@/lib/api'

/*
 * The Assurance screen's calls, with shapes transcribed from the backend.
 *
 * GET /api/sovereignty returns SovereigntyStatus (backend/core/schemas.py).
 * Three of its counters are the same number: external_api_calls,
 * internet_requests and unapproved_connections are all the monitor's
 * violation total (backend/security/sovereignty.py, status()). The screen
 * shows the one real counter once, under its real name. The two fields that
 * were never readings (cloud_llm_calls, data_leaving_host_bytes) are gone
 * from the backend, and monitor_active is false whenever the last sample
 * took no reading, with monitor_error saying why.
 */

export interface NetworkConnection {
  laddr: string
  raddr: string | null
  status: string
  pid: number | null
  process: string | null
  allowed: boolean
  reason: string
}

/** SovereigntyMonitor.interfaces(): psutil's view of the host's interfaces. */
export interface InterfaceReading {
  up: boolean
  /** Name-based (`startswith("lo")`), which misses Windows' loopback adapter. */
  loopback: boolean
  addresses: string[]
}

export interface SovereigntyStatus {
  sovereign: boolean
  external_api_calls: number
  internet_requests: number
  dns_requests: number
  unapproved_connections: number
  local_connections: number
  monitored_since: string
  last_checked: string
  violations: NetworkConnection[]
  monitor_active: boolean
  monitor_error?: string | null
  interfaces: Record<string, InterfaceReading>
}

export interface SandboxCheck {
  name: string
  target: string
  passed: boolean
  detail: string
}

/**
 * GET /api/sovereignty/sandbox-test (Sandbox.self_test_report). `reason` is
 * present only when the host is not assessable; `backend` names the limit
 * mechanism that was actually usable, or "none".
 */
export interface SandboxReport {
  checks: SandboxCheck[]
  passed: number
  total: number
  assessable: boolean
  overall: string
  reason?: string
  all_passed: boolean
  backend?: string
  duration_ms: number
  ran_at: string
}

export interface RolePolicy {
  description?: string
  permissions?: string[]
  inherits?: string
  max_data_classification?: string
}

export interface ToolPolicy {
  description?: string
  allowed_roles?: string[]
  max_data_classification?: string
  side_effects?: string
  requires_approval?: boolean
  constraints?: Record<string, unknown>
}

export interface ApprovalRule {
  name: string
  description?: string
  approver_roles?: string[]
  requires_deliverable?: boolean
  match?: Record<string, unknown>
}

/** GET /api/policies: the policy files, as loaded by the service. */
export interface Policies {
  roles: Record<string, RolePolicy>
  tools: Record<string, ToolPolicy>
  hard_denied_actions: string[]
  classification_levels: { id: string; rank: number; label?: string; description?: string }[]
  approval_rules: ApprovalRule[]
  egress: { allowed_destinations?: string[]; loopback_only?: boolean; monitored_ports?: number[] }
}

export function readSovereignty(signal?: AbortSignal) {
  return request<SovereigntyStatus>('/sovereignty', { signal })
}

export function runSandboxTest(signal?: AbortSignal) {
  return request<SandboxReport>('/sovereignty/sandbox-test', { signal })
}

export function readPolicies(signal?: AbortSignal) {
  return request<Policies>('/policies', { signal })
}

/** A sample from the event stream, checked before it replaces a reading. */
export function isSovereigntyStatus(value: unknown): value is SovereigntyStatus {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.unapproved_connections === 'number' &&
    typeof v.monitor_active === 'boolean' &&
    typeof v.last_checked === 'string' &&
    typeof v.monitored_since === 'string'
  )
}
