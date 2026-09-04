'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, X, Loader2, Download, ExternalLink } from 'lucide-react'
import { TASKS, DEFAULT_PIPELINE } from '@/lib/mock-data'
import { api } from '@/lib/api'
import type { Task, TaskRecord, TaskStatus, TaskSummary } from '@/lib/types'
import { PageHeader } from '@/components/page-header'
import { ClassificationTag, StatusIndicator, TechnicalLabel } from '@/components/primitives'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/utils'

const STATUS_FILTERS: (string | 'ALL')[] = [
  'ALL',
  'DELIVERED',
  'AWAITING APPROVAL',
  'EXECUTING',
  'FAILED',
  'BLOCKED',
]

function fmtDuration(ms: number) {
  if (!ms) return '0.00s'
  return `${(ms / 1000).toFixed(2)}s`
}

export function TasksView() {
  const { push } = useToast()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string>('ALL')
  const [type, setType] = useState<string>('ALL')
  const [activeSummary, setActiveSummary] = useState<TaskSummary | TaskRecord | null>(null)
  const [activeFullTask, setActiveFullTask] = useState<Task | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [rawSummaries, setRawSummaries] = useState<TaskSummary[]>([])
  const [loading, setLoading] = useState(true)

  // Load real tasks from backend
  useEffect(() => {
    let mounted = true
    api.listTasks(100)
      .then((data) => {
        if (mounted && data && data.length > 0) {
          setRawSummaries(data)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const handleCancelTask = async (taskId: string) => {
    try {
      await api.cancelTask(taskId)
      push({
        title: 'Task cancelled',
        detail: `Task ${taskId.slice(0, 8)} was stopped`,
        tone: 'critical',
      })
      api.listTasks(100).then((data) => setRawSummaries(data || []))
      const updated = await api.getTask(taskId)
      setActiveFullTask(updated)
    } catch (err: any) {
      push({
        title: 'Cancel failed',
        detail: err.message || 'Unable to cancel task',
        tone: 'critical',
      })
    }
  }

  // Map summaries to UI format, falling back to TASKS if empty
  const items: (TaskRecord | TaskSummary)[] = useMemo(() => {
    if (rawSummaries.length > 0) {
      return rawSummaries
    }
    return TASKS
  }, [rawSummaries])

  const types = useMemo(() => {
    const list = new Set<string>()
    items.forEach((t) => {
      const taskType = 'type' in t ? t.type : (t.task_type || 'analysis')
      if (taskType) list.add(taskType)
    })
    return ['ALL', ...Array.from(list)]
  }, [items])

  const rows = useMemo(() => {
    return items.filter((t) => {
      const q = query.trim().toLowerCase()
      const title = 'title' in t ? t.title : (t.prompt || '')
      const id = t.id || ''
      const actor = 'actor' in t ? t.actor : (t.user_display_name || 'operator')
      const taskStatus = (t.status || '').toUpperCase()
      const taskType = 'type' in t ? t.type : (t.task_type || 'analysis')

      const matchesQuery =
        !q ||
        title.toLowerCase().includes(q) ||
        id.toLowerCase().includes(q) ||
        actor.toLowerCase().includes(q)

      const matchesStatus =
        status === 'ALL' ||
        taskStatus === status.toUpperCase() ||
        (status === 'DELIVERED' && taskStatus === 'DELIVERED') ||
        (status === 'AWAITING APPROVAL' && taskStatus === 'AWAITING_APPROVAL') ||
        (status === 'EXECUTING' && (taskStatus === 'EXECUTING' || taskStatus === 'RUNNING'))

      const matchesType = type === 'ALL' || taskType.toLowerCase() === type.toLowerCase()
      return matchesQuery && matchesStatus && matchesType
    })
  }, [items, query, status, type])

  // Fetch full details when active item is selected
  const handleSelectTask = async (item: TaskRecord | TaskSummary) => {
    setActiveSummary(item)
    setActiveFullTask(null)
    setLoadingDetail(true)
    try {
      const full = await api.getTask(item.id)
      setActiveFullTask(full)
    } catch {
      // Mock fallback: no additional details loaded
    } finally {
      setLoadingDetail(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Execution Archive"
        title="Tasks"
        description="Every agent run recorded locally with models, tools, latency and cryptographic audit references."
        meta={[
          { label: 'Total runs', value: String(items.length) },
          {
            label: 'Delivered',
            value: String(
              items.filter((t) => (t.status || '').toUpperCase().includes('DELIVER')).length
            ),
          },
          {
            label: 'Held',
            value: String(
              items.filter((t) => (t.status || '').toUpperCase().includes('APPROVAL')).length
            ),
          },
          { label: 'Retention', value: 'ON-HOST' },
        ]}
      />

      <div className="mx-auto max-w-[1400px] px-5 py-10 lg:px-10">
        {/* Controls */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2.5 border border-border bg-surface px-3.5 py-2.5 lg:w-80">
            <Search className="h-4 w-4 text-foreground-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search task, ID or actor…"
              className="w-full bg-transparent text-[13px] text-foreground placeholder:text-foreground-muted focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Status</span>
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  'border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors',
                  status === s
                    ? 'border-foreground bg-foreground text-primary-foreground'
                    : 'border-border text-foreground-secondary hover:border-foreground',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Type</span>
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                'border px-2.5 py-1 text-[11px] transition-colors',
                type === t
                  ? 'border-foreground text-foreground'
                  : 'border-border text-foreground-muted hover:border-foreground hover:text-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="mt-8 overflow-x-auto border border-border">
          <table className="w-full min-w-[880px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-sunken text-left">
                {['ID', 'Prompt / Task', 'Actor', 'Type', 'Sensitivity', 'Status', 'Date'].map((h) => (
                  <th key={h} className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((t) => {
                const title = 'title' in t ? t.title : t.prompt
                const actor = 'actor' in t ? t.actor : (t.user_display_name || 'operator')
                const classification = 'classification' in t ? t.classification : (t.sensitivity || 'CONFIDENTIAL')
                const taskType = 'type' in t ? t.type : (t.task_type || 'analysis')
                const started = 'started' in t ? t.started : (t.created_at ? new Date(t.created_at).toLocaleDateString() : 'Today')

                return (
                  <tr
                    key={t.id}
                    onClick={() => handleSelectTask(t)}
                    className="cursor-pointer bg-surface transition-colors hover:bg-surface-sunken"
                  >
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[12px] text-foreground">
                      {t.id.length > 12 ? `${t.id.slice(0, 8)}…` : t.id}
                    </td>
                    <td className="max-w-md truncate px-4 py-3.5 text-[13px] text-foreground">
                      {title}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[12px] text-foreground-secondary">
                      {actor}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[11px] uppercase text-foreground-muted">
                      {taskType}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <ClassificationTag level={classification as any} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <StatusIndicator status={t.status as any} pulse={(t.status || '').toUpperCase().includes('RUNNING')} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[11px] text-foreground-muted">
                      {started}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center font-mono text-[12px] text-foreground-muted">
                    No task records matched your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Task detail drawer */}
      {activeSummary && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <TechnicalLabel>Task Inspection</TechnicalLabel>
              <span className="font-mono text-[12px] text-foreground">{activeSummary.id}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveSummary(null)
                setActiveFullTask(null)
              }}
              className="border border-border p-1.5 text-foreground transition-colors hover:border-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {loadingDetail ? (
              <div className="flex h-40 items-center justify-center gap-2 font-mono text-[12px] text-foreground-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading task details…
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Prompt</span>
                  <p className="mt-1 text-[14px] leading-relaxed text-foreground">
                    {'title' in activeSummary ? activeSummary.title : activeSummary.prompt}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Status</span>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusIndicator status={activeSummary.status as any} />
                      {['running', 'pending', 'classified', 'executing', 'RUNNING', 'PENDING'].includes(String(activeSummary.status)) && (
                        <button
                          type="button"
                          onClick={() => handleCancelTask(activeSummary.id)}
                          className="border border-critical/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-critical transition-colors hover:bg-critical hover:text-white"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Actor</span>
                    <p className="mt-1 font-mono text-[12px] text-foreground">
                      {'actor' in activeSummary ? activeSummary.actor : (activeSummary.user_display_name || 'operator')}
                    </p>
                  </div>
                </div>

                {activeFullTask?.answer && (
                  <div className="border-t border-border pt-4">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Answer</span>
                    <p className="mt-2 whitespace-pre-wrap border border-border bg-surface p-4 text-[13px] leading-relaxed text-foreground-secondary">
                      {activeFullTask.answer}
                    </p>
                  </div>
                )}

                {activeFullTask?.deliverables && activeFullTask.deliverables.length > 0 && (
                  <div className="border-t border-border pt-4">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Deliverables</span>
                    <div className="mt-2 flex flex-col gap-2">
                      {activeFullTask.deliverables.map((d) => (
                        <div key={d.filename} className="flex items-center justify-between border border-border bg-surface p-3">
                          <span className="text-[13px] font-medium text-foreground">{d.filename}</span>
                          <a
                            href={d.download_url || api.getDeliverableUrl(activeFullTask.id, d.filename)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 font-mono text-[11px] text-sovereign hover:underline"
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeFullTask?.tool_calls && activeFullTask.tool_calls.length > 0 && (
                  <div className="border-t border-border pt-4">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Tool Invocations ({activeFullTask.tool_calls.length})</span>
                    <div className="mt-2 divide-y divide-border border border-border bg-surface">
                      {activeFullTask.tool_calls.map((t, idx) => (
                        <div key={idx} className="p-3 text-[12px]">
                          <div className="flex items-center justify-between font-mono">
                            <span className="text-foreground">{t.tool}</span>
                            <span className="text-foreground-muted">{t.duration_ms}ms</span>
                          </div>
                          <p className="mt-1 text-foreground-secondary">{t.output_summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
