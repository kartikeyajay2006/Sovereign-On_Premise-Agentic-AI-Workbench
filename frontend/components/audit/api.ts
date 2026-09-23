import { request } from '@/lib/api'

/*
 * Shapes transcribed from backend/core/schemas.py rather than borrowed from
 * lib/types.ts, whose AuditEvent marks sequence, at and prev_hash optional and
 * carries legacy aliases. The route declares response_model=AuditEvent, so
 * every field below is always present on the wire.
 */

/** One stored record. GET /api/audit returns these, newest first. */
export interface AuditRecord {
  sequence: number
  id: string
  at: string
  actor: string
  actor_role: string | null
  task_id: string | null
  category: string
  action: string
  detail: Record<string, unknown>
  prev_hash: string
  hash: string
}

/** GET /api/audit/chain: the server recomputing every hash in the file. */
export interface ChainStatus {
  valid: boolean
  events: number
  broken_at: number | null
  head_hash: string | null
  checked_at: string
}

export function readChain(signal?: AbortSignal) {
  return request<ChainStatus>('/audit/chain', { signal })
}

/**
 * Filtered server-side. A role with audit.read.own receives only records it
 * is the actor of, so its view of the chain has gaps by design.
 */
export function readRecords(
  params: { category?: string | null; search?: string | null; limit: number },
  signal?: AbortSignal,
) {
  const query = new URLSearchParams()
  if (params.category) query.set('category', params.category)
  if (params.search) query.set('search', params.search)
  query.set('limit', String(params.limit))
  return request<AuditRecord[]>(`/audit?${query.toString()}`, { signal })
}

/**
 * The raw JSON-lines file, exactly as stored. Requires audit.read.all, and
 * the route appends an `audit/exported` record before it reads the file, so
 * every export, including the one the browser check makes, is itself part
 * of the chain it returns.
 */
export function readExport(signal?: AbortSignal) {
  return request<string>('/audit/export', { signal })
}
