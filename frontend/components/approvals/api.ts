import { request } from '@/lib/api'
import type { Task, TaskSummary } from '@/lib/types'

/*
 * The approval screen's own calls, through the shared transport so auth and
 * errors behave the same, but each one takes an AbortSignal: every read on
 * this screen has a bounded wait (shared/ui/data/reading.tsx) and a read that
 * is abandoned must actually stop.
 *
 * Shapes are the backend's: GET /api/approvals and GET /api/tasks/{id}
 * return Task, GET /api/tasks returns TaskSummary, POST /tasks/{id}/approve
 * takes ApprovalDecisionRequest and returns the updated Task
 * (backend/api/routes/tasks.py, backend/core/schemas.py).
 */

/** Held tasks this role may decide. 403 without approval.read. */
export function readHeld(signal: AbortSignal) {
  return request<Task[]>('/approvals', { signal })
}

/**
 * Recent runs, for the decided half of the queue. The route's own ceiling is
 * whatever `limit` asks for; 200 keeps the page to one small read.
 */
export const RUNS_LIMIT = 200

export function readRuns(signal: AbortSignal) {
  return request<TaskSummary[]>(`/tasks?limit=${RUNS_LIMIT}`, { signal })
}

export function readTask(id: string, signal?: AbortSignal) {
  return request<Task>(`/tasks/${encodeURIComponent(id)}`, { signal })
}

export function recordDecision(
  id: string,
  decision: 'approve' | 'reject' | 'revise',
  note: string,
  reviewDigest: string | null = null,
) {
  const comment = note.trim()
  return request<Task>(`/tasks/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decision: decision === 'revise' ? 'request_revision' : decision,
      comment: comment || null,
      // The version the reviewer read; the service refuses a decision on
      // a run that has changed since (proof/certificate.py review_digest).
      review_digest: reviewDigest,
    }),
  })
}
