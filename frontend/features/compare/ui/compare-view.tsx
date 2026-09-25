'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { api, request } from '@/lib/api'
import type { TaskSummary } from '@/lib/types'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/shared/ui/data/empty-state'
import { LEDGER_MUTED } from '@/shared/ui/data/ledger'
import { FailureState, ReadingLine, useReading } from '@/shared/ui/data/reading'
import type { Change, CompareSide, RunComparison } from '../model/types'

/**
 * Compare: two runs side by side, with every difference named.
 *
 * The rows come from GET /api/runs/compare, which reads both records (and
 * their certificates' provenance, where one is stored) and names each
 * configuration and outcome that differs: models and their digests, policy,
 * formula versions, evidence, figures, verification, approval, timing and
 * the answer. A property a run did not record reads "not recorded"; it is
 * never shown as equal to the other run's.
 *
 * Opened from a run's Compare action with ?b=<run>: when that run is a
 * re-run, its original is filled in as A.
 */

const SELECT = cn(
  'h-8 w-full min-w-0 rounded-[var(--radius-xs)] border border-line-default bg-surface px-2 text-ui text-foreground',
  'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
)

function label(run: TaskSummary): string {
  const when = new Date(run.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
  const text = run.skill ? `/${run.skill.id} ${run.skill.input}` : run.prompt
  return `${when} · ${run.id.slice(0, 8)} · ${text.slice(0, 70)}`
}

function Picker({
  name,
  value,
  runs,
  onChange,
}: {
  name: string
  value: string | null
  runs: TaskSummary[]
  onChange: (id: string) => void
}) {
  const known = value && !runs.some((r) => r.id === value)
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className={LEDGER_MUTED}>Run {name}</span>
      <select className={SELECT} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Choose a run
        </option>
        {known && <option value={value}>{value}</option>}
        {runs.map((run) => (
          <option key={run.id} value={run.id}>
            {label(run)}
          </option>
        ))}
      </select>
    </label>
  )
}

function Side({ name, side }: { name: string; side: CompareSide }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="flex flex-wrap items-baseline gap-x-3 font-mono text-meta text-foreground-muted">
        <span className={LEDGER_MUTED}>Run {name}</span>
        <Link href={`/proof?run=${side.task_id}`} className="underline decoration-line-strong underline-offset-2 hover:text-foreground">
          {side.task_id.slice(0, 8)}
        </Link>
        <span>{side.status.replace(/_/g, ' ')}</span>
        <span>{new Date(side.created_at).toLocaleString()}</span>
      </p>
      <div className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-xs)] border border-line-default bg-surface-sunken p-3 text-body text-foreground">
        {side.answer ?? <span className="text-foreground-muted">No answer was recorded.</span>}
      </div>
    </div>
  )
}

function Cell({ value, changed }: { value: string; changed: boolean }) {
  const absent = value === 'not recorded'
  return (
    <td
      className={cn(
        'break-all px-3 py-2 align-top font-mono text-meta',
        absent ? 'text-foreground-muted' : changed ? 'text-foreground' : 'text-foreground-secondary',
      )}
    >
      {value}
    </td>
  )
}

function ChangeTable({ rows }: { rows: Change[] }) {
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        <col className="w-[28%]" />
        <col className="w-[36%]" />
        <col className="w-[36%]" />
      </colgroup>
      <thead>
        <tr className="border-b border-line-default text-left">
          <th className={cn(LEDGER_MUTED, 'px-3 py-2 font-normal')}>Aspect</th>
          <th className={cn(LEDGER_MUTED, 'px-3 py-2 font-normal')}>Run A</th>
          <th className={cn(LEDGER_MUTED, 'px-3 py-2 font-normal')}>Run B</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={`${row.label}-${i}`} className="border-b border-line-subtle">
            <td className="px-3 py-2 align-top">
              <p className={cn('text-ui', row.changed ? 'text-approval-text' : 'text-foreground')}>
                {row.changed && <span className="mr-1.5 font-mono text-meta">changed</span>}
                {row.label}
              </p>
              {row.note && <p className="text-meta text-foreground-muted">{row.note}</p>}
            </td>
            <Cell value={row.a} changed={row.changed} />
            <Cell value={row.b} changed={row.changed} />
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function CompareScreen() {
  const params = useSearchParams()
  const router = useRouter()
  const a = params.get('a')
  const b = params.get('b')
  const [changedOnly, setChangedOnly] = useState(true)

  const runs = useReading<TaskSummary[]>(() => api.listTasks(100), [])

  // Opened from a run with only ?b=: a re-run's original is the obvious A.
  useEffect(() => {
    if (!b || a) return
    let live = true
    api
      .getTask(b)
      .then((task) => {
        if (live && task.parent_task_id) router.replace(`/compare?a=${task.parent_task_id}&b=${b}`)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [a, b, router])

  const comparison = useReading<RunComparison>(
    (signal) =>
      request<RunComparison>(`/runs/compare?a=${encodeURIComponent(a ?? '')}&b=${encodeURIComponent(b ?? '')}`, {
        signal,
      }),
    [a, b],
    { enabled: Boolean(a && b) },
  )
  const data = comparison.data

  const choose = (which: 'a' | 'b', id: string) => {
    const next = new URLSearchParams(params.toString())
    next.set(which, id)
    router.replace(`/compare?${next.toString()}`)
  }

  const groups = data
    ? ['Configuration', 'Outcome'].map((group) => ({
        group,
        rows: data.changes.filter((c) => c.group === group && (!changedOnly || c.changed)),
        total: data.changes.filter((c) => c.group === group).length,
      }))
    : []

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Compare"
        description="Two runs side by side. Every configuration and outcome that differs is named; what a run did not record says so, and is never shown as equal."
        meta={
          data
            ? [
                { label: 'Differences', value: data.changed, tone: data.changed ? 'approval' : 'default' },
                { label: 'Relation', value: data.linked ? 'B re-ran A' : 'unrelated runs' },
                { label: 'Evidence in both', value: data.evidence.common },
              ]
            : undefined
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Picker name="A" value={a} runs={runs.data ?? []} onChange={(id) => choose('a', id)} />
          <Picker name="B" value={b} runs={runs.data ?? []} onChange={(id) => choose('b', id)} />
        </div>
      </PageHeader>

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-4 pb-16 pt-6 sm:px-6">
        {!a || !b ? (
          <EmptyState
            title="Choose two runs"
            body="Pick run A and run B above. From a run in the thread, Compare fills in B, and A too when B is a re-run."
          />
        ) : data ? (
          <>
            <label className="flex items-center gap-2 text-ui text-foreground-secondary">
              <input type="checkbox" checked={changedOnly} onChange={(e) => setChangedOnly(e.target.checked)} />
              Show only what changed
            </label>
            {groups.map(({ group, rows, total }) => (
              <section key={group} aria-label={group} className="flex flex-col gap-2">
                <h2 className={LEDGER_MUTED}>
                  {group} · {rows.length} of {total}
                </h2>
                {rows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <ChangeTable rows={rows} />
                  </div>
                ) : (
                  <p className="text-body text-foreground-muted">No {group.toLowerCase()} differences.</p>
                )}
              </section>
            ))}
            {(data.evidence.only_a.length > 0 || data.evidence.only_b.length > 0) && (
              <section aria-label="Evidence differences" className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {(['only_a', 'only_b'] as const).map((key) => (
                  <div key={key} className="flex flex-col gap-1">
                    <h2 className={LEDGER_MUTED}>Evidence only in run {key === 'only_a' ? 'A' : 'B'}</h2>
                    {data.evidence[key].length > 0 ? (
                      <ul className="list-inside list-disc text-meta text-foreground-secondary">
                        {data.evidence[key].map((item, i) => (
                          <li key={`${item}-${i}`} className="break-words">
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-meta text-foreground-muted">None.</p>
                    )}
                  </div>
                ))}
              </section>
            )}
            <section aria-label="Answers" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Side name="A" side={data.a} />
              <Side name="B" side={data.b} />
            </section>
          </>
        ) : comparison.status === 'failed' ? (
          <FailureState failure={comparison.failure!} what="the comparison" retry={comparison.reload} />
        ) : (
          <ReadingLine what="the two runs" source="GET /api/runs/compare" startedAt={comparison.startedAt} />
        )}
      </div>
    </div>
  )
}
