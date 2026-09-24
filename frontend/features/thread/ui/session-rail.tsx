'use client'

import { memo, useEffect, useState } from 'react'
import { MessageSquarePlus, RotateCw, Search } from 'lucide-react'
import { api } from '@/lib/api'
import type { TaskSummary } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Append, AppendScope, type AppendTone } from '@/shared/motion'

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

/** A run's state as a dot: the colour says what it came to, the title says it in words. */
const OUTCOME_DOT: Record<string, string> = {
  awaiting_approval: 'bg-approval',
  approved: 'bg-sovereign',
  delivered: 'bg-sovereign',
  rejected: 'bg-critical',
  failed: 'bg-critical',
  blocked: 'bg-critical',
  cancelled: 'bg-control-strong',
}

/** Today, Yesterday, Previous 7 days, Earlier: the grouping every chat history uses. */
function dayGroup(iso: string, now = new Date()): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return 'Earlier'
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 24 * 60 * 60 * 1000
  if (then.getTime() >= start) return 'Today'
  if (then.getTime() >= start - day) return 'Yesterday'
  if (then.getTime() >= start - 7 * day) return 'Previous 7 days'
  return 'Earlier'
}

const FINISHED = new Set(['awaiting_approval', 'approved', 'delivered', 'rejected', 'failed', 'blocked', 'cancelled'])

/**
 * The light a run arrives in when it joins the list while the list is on
 * screen: running while it runs, then what it came to -- the same reading
 * its status word gives, and nothing else.
 */
function arrivalTone(status: string, following: boolean): AppendTone {
  if (following || !FINISHED.has(status)) return 'active'
  if (status === 'delivered' || status === 'approved') return 'sovereign'
  if (status === 'awaiting_approval') return 'approval'
  if (status === 'rejected' || status === 'failed' || status === 'blocked') return 'critical'
  return 'neutral'
}

/**
 * How often the list is read again while a run it shows is unfinished. A
 * status in this list is a reading taken when the list was fetched; without
 * a re-read, a run left to finish in the background said "executing" until
 * something else happened to refresh the rail.
 */
const UNFINISHED_REFRESH_MS = 10_000

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
  /** The run the thread is attached to and following live, if any. */
  runningTaskId?: string | null
  /** Load a past run into the thread. */
  onOpen: (taskId: string) => void
  /** Clear the thread for a new question. */
  onNew: () => void
  /** Bumped by the caller when a run starts or finishes, so the list picks it up. */
  refreshKey?: number
}

export const SessionRail = memo(function SessionRail({
  activeTaskId,
  runningTaskId = null,
  onOpen,
  onNew,
  refreshKey = 0,
}: SessionRailProps) {
  const [runs, setRuns] = useState<TaskSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  // A filter over the runs already read, by the words of the question.
  const [query, setQuery] = useState('')

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
  }, [refreshKey, tick])

  const needle = query.trim().toLowerCase()
  const shown = needle
    ? runs.filter((task) =>
        [task.prompt, task.skill ? `/${task.skill.id} ${task.skill.input}` : ''].some((text) => text.toLowerCase().includes(needle)),
      )
    : runs

  const unfinished = runs.some((task) => !FINISHED.has(String(task.status).toLowerCase()))
  useEffect(() => {
    if (!unfinished) return
    const id = window.setTimeout(() => setTick((n) => n + 1), UNFINISHED_REFRESH_MS)
    return () => window.clearTimeout(id)
  }, [unfinished, runs])

  return (
    <aside
      aria-label="Past runs"
      // Sticky under the fixed header, so the list stays in reach however
      // long the thread beside it grows. Sized against the shell's own
      // inset rather than a literal, which is right under either header.
      className="sticky top-[var(--shell-top)] hidden h-[calc(100dvh-var(--shell-top))] w-[264px] shrink-0 flex-col self-start border-r border-line-subtle bg-surface-sunken lg:flex"
    >
      <div className="px-3 pb-2 pt-3">
        <button
          type="button"
          onClick={onNew}
          className="flex h-10 w-full items-center gap-2.5 rounded-[12px] border border-line-subtle bg-surface px-3 text-[13.5px] font-medium text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.04)] transition-[border-color,box-shadow] duration-150 hover:border-line-default hover:shadow-[0_2px_8px_-2px_oklch(0_0_0/0.1)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.99]"
        >
          <MessageSquarePlus className="size-4 text-foreground-secondary" aria-hidden />
          New run
        </button>
        <label className="relative mt-2 block">
          <span className="sr-only">Search runs</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-foreground-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search runs"
            className="h-9 w-full rounded-[10px] bg-transparent pl-8 pr-3 text-[13px] text-foreground placeholder:text-foreground-muted transition-colors hover:bg-[color-mix(in_oklab,var(--foreground)_4%,var(--background))] focus:bg-surface focus:shadow-[0_0_0_1px_var(--line-default)] focus:outline-none"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {/*
          Keyed by the read, so the first list -- and a list shown again
          after a failed read -- mounts with its rows and none of them move.
          Only a run that joins a list already on screen appends.
        */}
        <AppendScope key={loading ? 'reading' : error ? 'failed' : 'read'}>
          {loading ? (
            <p className="px-2 py-2 text-[13px] text-foreground-muted">Loading runs…</p>
          ) : error ? (
            <p className="flex items-start gap-1.5 px-1 py-2 text-meta text-critical-text">
              <RotateCw className="mt-0.5 size-3 shrink-0" aria-hidden />
              {error}
            </p>
          ) : runs.length === 0 ? (
            <p className="px-2 py-2 text-[13px] text-foreground-muted">No runs yet on this host.</p>
          ) : shown.length === 0 ? (
            <p className="px-2 py-2 text-[13px] text-foreground-muted">No run matches “{query.trim()}”.</p>
          ) : (
            <ul className="flex list-none flex-col gap-px p-0">
              {shown.map((task, i) => {
                const active = task.id === activeTaskId
                const status = String(task.status).toLowerCase()
                // The one run this tab is watching live says so; any other
                // unfinished run shows the status it had when last read.
                const following = task.id === runningTaskId
                const group = dayGroup(task.created_at)
                const firstOfGroup = i === 0 || dayGroup(shown[i - 1].created_at) !== group
                const stateWords = following ? 'in progress' : status.replace(/_/g, ' ')
                return (
                  // APPEND: runsVersion -- a run dispatched here, or started
                  // elsewhere, joins the top of the list lit in its state.
                  <Append
                    as="li"
                    key={task.id}
                    index={i}
                    tone={arrivalTone(status, following)}
                    className="rounded-[10px]"
                  >
                    {firstOfGroup ? (
                      <p className="px-2.5 pb-1.5 pt-4 text-[12px] font-medium text-foreground-muted">{group}</p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onOpen(task.id)}
                      aria-current={active ? 'true' : undefined}
                      title={`${task.skill ? `/${task.skill.id} ${task.skill.input}` : task.prompt} (${stateWords}, ${relativeTime(task.created_at)})`}
                      className={cn(
                        'flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left transition-colors duration-100',
                        'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
                        active ? 'bg-surface-sunken' : 'hover:bg-[color-mix(in_oklab,var(--foreground)_4%,var(--background))]',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          following
                            ? 'animate-pulse bg-active motion-reduce:animate-none'
                            : OUTCOME_DOT[status] ?? (FINISHED.has(status) ? 'bg-control-strong' : 'bg-active'),
                        )}
                      />
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-[13.5px]',
                          active ? 'font-medium text-foreground' : 'text-foreground-secondary',
                        )}
                      >
                        {task.skill ? (
                          <>
                            <span className="font-mono text-[12.5px] text-foreground-muted">/{task.skill.id}</span> {task.skill.input}
                          </>
                        ) : (
                          task.prompt
                        )}
                      </span>
                      <span className="sr-only">
                        {stateWords}, {relativeTime(task.created_at)}
                      </span>
                    </button>
                  </Append>
                )
              })}
            </ul>
          )}
        </AppendScope>
      </div>
    </aside>
  )
})
