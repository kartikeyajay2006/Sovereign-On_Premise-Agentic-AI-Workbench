'use client'

import Link from 'next/link'
import { RotateCw } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { request } from '@/lib/api'
import { cn } from '@/lib/utils'
import { LEDGER_MUTED } from '@/shared/ui/data/ledger'
import { FailureState, ReadingLine, clockTime, useReading } from '@/shared/ui/data/reading'
import type { Measurements, Metric, MetricSource } from '../model/types'

/**
 * Measurements: every figure the workbench can show about itself.
 *
 * Each row is computed by GET /api/measurements from an artifact the backend
 * produced -- usage records on runs, verification reports, audit events, the
 * latest red-team report, stored certificates -- and names it underneath, with
 * a link to the artifact where there is one. A metric with nothing behind it
 * reads "Not measured" with the reason, and draws no number.
 */

const LINK =
  'underline decoration-line-strong underline-offset-2 hover:text-foreground hover:decoration-foreground-muted'

function when(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

function Source({ source }: { source: MetricSource }) {
  // The audit API needs a permission the screen may not hold, and the audit
  // screen already reads it for whoever may; a report file is served as is.
  const href = source.kind === 'audit_event' ? '/audit' : source.kind === 'report_file' ? source.href : null
  const at = when(source.at)
  return (
    <p className="break-all font-mono text-meta text-foreground-muted">
      <span className="text-foreground-secondary">source </span>
      {href ? (
        <a href={href} className={LINK} target={source.kind === 'report_file' ? '_blank' : undefined} rel="noreferrer">
          {source.name}
        </a>
      ) : (
        source.name
      )}
      {source.path && ` · storage/${source.path}`}
      {at && ` · ${at}`}
      {source.sha256 && ` · sha256 ${source.sha256.slice(0, 16)}…`}
      {source.run_ids.length > 0 && (
        <>
          {' · runs '}
          {source.run_ids.slice(0, 5).map((id, i) => (
            <span key={id}>
              {i > 0 && ', '}
              <Link href={`/proof?run=${id}`} className={LINK}>
                {id.slice(0, 8)}
              </Link>
            </span>
          ))}
          {source.run_ids.length > 5 && ` +${source.run_ids.length - 5}`}
        </>
      )}
    </p>
  )
}

function MetricRow({ metric }: { metric: Metric }) {
  const measured = metric.status === 'measured'
  return (
    <li className="grid grid-cols-1 gap-x-6 gap-y-1 py-3 sm:grid-cols-[14rem_1fr]">
      <div className="flex flex-col">
        <span className="text-body text-foreground">{metric.label}</span>
        {metric.sample && <span className="font-mono text-meta text-foreground-muted">{metric.sample}</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p
          className={cn(
            'tabular font-mono text-body',
            !measured
              ? 'text-foreground-muted'
              : metric.verdict === 'good'
                ? 'text-sovereign-text'
                : metric.verdict === 'bad'
                  ? 'text-critical-text'
                  : 'text-foreground',
          )}
        >
          {measured ? metric.display : 'Not measured'}
        </p>
        {metric.reason && (
          <p className={cn('text-meta', measured ? 'text-foreground-secondary' : 'text-foreground-muted')}>
            {metric.reason}
          </p>
        )}
        {metric.breakdown.length > 0 && (
          <p className="font-mono text-meta text-foreground-secondary">
            {metric.breakdown.map((part) => `${part.label} ${part.display}`).join(' · ')}
          </p>
        )}
        {metric.source && <Source source={metric.source} />}
      </div>
    </li>
  )
}

export function MeasurementsView() {
  const reading = useReading<Measurements>((signal) => request<Measurements>('/measurements', { signal }), [])
  const data = reading.data
  const groups = data
    ? data.metrics.reduce<Array<[string, Metric[]]>>((acc, metric) => {
        const found = acc.find(([group]) => group === metric.group)
        if (found) found[1].push(metric)
        else acc.push([metric.group, [metric]])
        return acc
      }, [])
    : []
  const measured = data ? data.metrics.filter((m) => m.status === 'measured').length : null

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Measurements"
        description="Every figure here is computed from an artifact this host produced, and names it. A figure with nothing behind it says Not measured, and why."
        meta={
          data
            ? [
                { label: 'Scope', value: data.scope },
                { label: 'Runs', value: data.runs_considered },
                { label: 'Measured', value: `${measured} of ${data.metrics.length}` },
                { label: 'Computed', value: clockTime(reading.readAt), hint: data.generated_at },
              ]
            : undefined
        }
        actions={
          <button
            type="button"
            onClick={reading.reload}
            disabled={reading.status === 'reading' || reading.refreshing}
            className="btn"
            data-variant="secondary"
            data-size="sm"
          >
            <RotateCw className="size-3.5" aria-hidden />
            Recompute
          </button>
        }
      />

      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 pb-16 pt-6 sm:px-6">
        {data ? (
          groups.map(([group, metrics]) => (
            <section key={group} aria-label={group} className="flex flex-col">
              <h2 className={cn(LEDGER_MUTED, 'border-b border-line-default pb-2')}>{group}</h2>
              <ul className="divide-y divide-line-subtle">
                {metrics.map((metric) => (
                  <MetricRow key={metric.id} metric={metric} />
                ))}
              </ul>
            </section>
          ))
        ) : reading.status === 'failed' ? (
          <FailureState failure={reading.failure!} what="the measurements" retry={reading.reload} />
        ) : (
          <ReadingLine what="the measurements" source="GET /api/measurements" startedAt={reading.startedAt} />
        )}
      </div>
    </div>
  )
}
