import type { RequiredSignature, Task, TaskSummary } from '@/lib/types'

/**
 * The approval queue, as the backend actually records it.
 *
 * Three states and only three, each read from the task, never inferred from
 * the screen's own history:
 *
 *   held      status == awaiting_approval (GET /api/approvals)
 *   approved  a person released it: the orchestrator only holds a task when
 *             approval.required is true, and decide_approval moves a held
 *             task to `delivered` on approve. So a delivered run whose
 *             summary says approval_required was released by a human; one
 *             that never needed approval is delivered with required false
 *             and never appears here.
 *   rejected  status == rejected, which only decide_approval sets.
 *
 * (backend/agents/orchestrator.py:1116-1140, backend/api/task_service.py:514-540)
 */
export type Decision = 'held' | 'approved' | 'rejected' | 'returned'

export interface QueueItem {
  id: string
  prompt: string
  /** Null when the record carries no name. Never a placeholder. */
  submittedBy: string | null
  createdAt: string
  /** What the classifier assigned. Null when the run was never classified. */
  sensitivity: string | null
  decision: Decision
  /** The full record. Null for a decided run until it is opened. */
  task: Task | null
  deliverableCount: number
}

export const SENSITIVITY_ORDER = ['normal', 'confidential', 'sensitive', 'restricted'] as const

export function decisionOf(task: Task): Decision {
  const status = String(task.status).toLowerCase()
  if (status === 'awaiting_approval') return 'held'
  if (task.approval?.decision === 'revision_requested' || status === 'revision_requested') return 'returned'
  if (task.approval?.decision === 'rejected' || status === 'rejected') return 'rejected'
  return 'approved'
}

export function fromTask(task: Task): QueueItem {
  return {
    id: task.id,
    prompt: task.prompt,
    submittedBy: task.user_display_name || null,
    createdAt: task.created_at,
    sensitivity: task.profile?.sensitivity || null,
    decision: decisionOf(task),
    task,
    deliverableCount: task.deliverables?.length ?? 0,
  }
}

/** A decided run from the task list, or null if the summary is not one. */
export function fromSummary(summary: TaskSummary): QueueItem | null {
  const status = String(summary.status).toLowerCase()
  if (!summary.approval_required) return null
  const decision: Decision | null =
    status === 'rejected'
      ? 'rejected'
      : status === 'revision_requested'
        ? 'returned'
        : status === 'delivered' || status === 'approved'
          ? 'approved'
          : null
  if (!decision) return null
  return {
    id: summary.id,
    prompt: summary.prompt,
    submittedBy: summary.user_display_name || null,
    createdAt: summary.created_at,
    sensitivity: summary.sensitivity || null,
    decision,
    task: null,
    deliverableCount: summary.deliverable_count,
  }
}

/**
 * One queue from the two sources. A full record, whether it came from the
 * queue endpoint, was opened, or was returned by a decision, always wins
 * over a summary, because it is the newer reading of the same task.
 */
export function mergeQueue(
  held: Task[],
  runs: TaskSummary[] | null,
  records: ReadonlyMap<string, Task>,
): QueueItem[] {
  const byId = new Map<string, QueueItem>()
  for (const summary of runs ?? []) {
    const item = fromSummary(summary)
    if (item) byId.set(item.id, item)
  }
  for (const task of held) byId.set(task.id, fromTask(task))
  for (const task of records.values()) {
    if (byId.has(task.id)) byId.set(task.id, fromTask(task))
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

/**
 * The signature a held run is still waiting for, or null.
 *
 * A High finding needs the Head of Inspection's recommendation and then the
 * Plant Manager's approval (policies/approval-rules.yaml). Read from the
 * record's own signatures, never counted from this screen's history.
 */
export function awaitingSignature(task: Task | null | undefined): RequiredSignature | null {
  if (!task || String(task.status).toLowerCase() !== 'awaiting_approval') return null
  const plan = task.approval?.required_signatures ?? []
  const signed = task.approval?.signatures ?? []
  return plan.length > signed.length ? plan[signed.length] : null
}

/**
 * The signature an approval would give when it is not the last one needed,
 * or null. Approving then records a signature and releases nothing.
 */
export function interimSignature(task: Task | null | undefined): RequiredSignature | null {
  const next = awaitingSignature(task)
  const needed = task?.approval?.required_signatures?.length ?? 0
  const given = task?.approval?.signatures?.length ?? 0
  return next && given < needed - 1 ? next : null
}

/** "4m", "3h", "2d": how long ago, from a measured timestamp. */
export function ago(iso: string, now = Date.now()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 60) return 'now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

export function stamp(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** backend policy reasons are written "rule_name: description". */
export function splitReason(reason: string): { rule: string | null; text: string } {
  const at = reason.indexOf(': ')
  if (at <= 0) return { rule: null, text: reason }
  return { rule: reason.slice(0, at), text: reason.slice(at + 2) }
}

export function formatSize(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
