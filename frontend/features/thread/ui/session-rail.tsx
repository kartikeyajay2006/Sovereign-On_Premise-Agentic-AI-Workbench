'use client'

import { useEffect, useState } from 'react'
import { MessageSquarePlus, RotateCw } from 'lucide-react'
import { api } from '@/lib/api'
import type { TaskSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Past runs, so the thread survives a reload.
 *
 * The console kept its turns in component state and nothing else. Closing the
 * tab, following a link or refreshing discarded every run you had done, and
 * the only way back to a finished answer was the orphaned /tasks screen that
 * no navigation links to. A workbench whose claim is that every run is
 * recorded should not lose your work when you press F5.
 *
 * These are tasks, not conversations: this backend has no thread entity, and
 * each run is independent. The rail says "runs" rather than borrowing the
 * word "chats", because pretending two consecutive questions share a context
 * they do not share would be the same kind of lie as an invented figure.
 */

const OUTCOME_TONE: Record<string, string> = {
  awaiting_approval: 'text-approval-text',
  approved: 'text-sovereign-text',
  delivered: 'text-sovereign-text',
  failed: 'text-critical-text',
  blocked: 'text-critical-text',
  cancelled: 'text-foreground-muted',
}

function relativeTime(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export interface SessionRailProps {
  /** The run currently shown in the thread, so it can be marked. */
  activeTaskId: string | null
  /** Load a past run into the thread. */
  onOpen: (taskId: string) => void
  /** Clear the thread for a new question. */
  onNew: () => void
  /** Bumped by the caller when a run finishes, so the list picks it up. */
  refreshKey?: number
}

export function SessionRail({ activeTaskId, onOpen, onNew, refreshKey = 0 }: SessionRailProps) {
  const [runs, setRuns] = useState<TaskSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .listTasks(40)
      .then((rows) => {
        if (!cancelled) {
          setRuns(rows || [])
          setError(null)
        }
      })
      // Named, not swallowed. An empty rail and an unreachable API look
      // identical otherwise, and one of them is a bug worth seeing.
      .catch((err) => !cancelled && setError(err?.detail || err?.message || 'Could not read past runs.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return (
    <aside
      aria-label="Past runs"
      className="hidden w-[248px] shrink-0 flex-col border-r border-line-subtle lg:flex"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
          Runs
        </span>
        <button
          type="button"
          onClick={onNew}
          className="hover-decay flex items-center gap-1.5 rounded-[var(--radius-xs)] px-2 py-1 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-secondary hover:bg-surface hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          <MessageSquarePlus className="size-3" aria-hidden />
          New
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {loading ? (
          <p className="px-1 py-2 font-mono text-meta text-foreground-muted">Reading…</p>
        ) : error ? (
          <p className="flex items-start gap-1.5 px-1 py-2 text-meta text-critical-text">
            <RotateCw className="mt-0.5 size-3 shrink-0" aria-hidden />
            {error}
          </p>
        ) : runs.length === 0 ? (
          <p className="px-1 py-2 text-meta text-foreground-muted">
            No runs yet on this host.
          </p>
        ) : (
          <ul className="flex list-none flex-col gap-0.5 p-0">
            {runs.map((task) => {
              const active = task.id === activeTaskId
              const status = String(task.status).toLowerCase()
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(task.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'hover-decay flex w-full flex-col gap-1 rounded-[var(--radius-xs)] px-2 py-2 text-left focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
                      active ? 'bg-surface' : 'hover:bg-surface',
                    )}
                  >
                    <span
                      className={cn(
                        'line-clamp-2 text-ui leading-[18px]',
                        active ? 'text-foreground' : 'text-foreground-secondary',
                      )}
                    >
                      {task.prompt}
                    </span>
                    <span className="flex items-center gap-2 font-mono text-ledger text-foreground-muted">
                      <span className={OUTCOME_TONE[status] ?? 'text-foreground-muted'}>
                        {status.replace(/_/g, ' ')}
                      </span>
                      <span aria-hidden>·</span>
                      <span>{relativeTime(task.created_at)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
