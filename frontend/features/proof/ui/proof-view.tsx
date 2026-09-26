'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowUpRight, GitCompare } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { request } from '@/lib/api'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/shared/ui/data/empty-state'
import { LEDGER_MUTED } from '@/shared/ui/data/ledger'
import { FailureState, ReadingLine, useReading } from '@/shared/ui/data/reading'
import type { ProofEntry, ProofRow, ProofTone, ProofView } from '../model/types'

/**
 * Proof Mode: one run's chain on one screen, request to signed certificate.
 *
 * Every link is a row read from GET /api/runs/{id}/proof, which copies it
 * from the run record or verifies it from the certificate on disk. A link
 * with nothing recorded says why in words, in the muted tone, and draws no
 * figure: an empty link is a fact about the run, not a gap to fill. Each
 * row opens to the records behind its one-line summary.
 */

const DOT: Record<ProofTone, string> = {
  ok: 'bg-sovereign',
  attention: 'bg-approval',
  fail: 'bg-critical',
  none: 'border border-line-strong bg-surface',
}

const TEXT: Record<ProofTone, string> = {
  ok: 'text-sovereign-text',
  attention: 'text-approval-text',
  fail: 'text-critical-text',
  none: 'text-foreground-muted',
}

const WORD: Record<ProofTone, string> = {
  ok: 'holds',
  attention: 'attention',
  fail: 'failed',
  none: 'not recorded',
}

const LINK = cn(
  'hover-decay inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-xs)] border border-line-default px-2.5 text-ui text-foreground-secondary',
  'hover:bg-surface-sunken hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
)

function Entry({ entry }: { entry: ProofEntry }) {
  return (
    <li className="flex gap-3 py-2">
      <span aria-hidden className={cn('mt-[7px] size-1.5 shrink-0 rounded-full', DOT[entry.tone])} />
      <div className="min-w-0 flex-1">
        <p className="text-body text-foreground">
          {entry.id && <span className="mr-2 font-mono text-meta text-foreground-muted">{entry.id}</span>}
          {entry.title}
        </p>
        {entry.detail && (
          <p className="mt-0.5 whitespace-pre-line break-words text-meta text-foreground-secondary">{entry.detail}</p>
        )}
        {entry.meta.length > 0 && (
          <p className="mt-0.5 break-all font-mono text-meta text-foreground-muted">{entry.meta.join(' · ')}</p>
        )}
      </div>
    </li>
  )
}

function Row({ row, index, last }: { row: ProofRow; index: number; last: boolean }) {
  const hasDetail = row.facts.length > 0 || row.entries.length > 0
  const head = (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
      <span className={cn(LEDGER_MUTED, 'w-44 shrink-0')}>
        {String(index + 1).padStart(2, '0')} · {row.label}
      </span>
      <span className={cn('min-w-0 flex-1 text-body', row.empty ? 'text-foreground-muted' : 'text-foreground')}>
        {row.empty ?? row.summary}
      </span>
      <span className={cn('shrink-0 font-mono text-meta', TEXT[row.tone])}>{WORD[row.tone]}</span>
    </div>
  )

  return (
    <li className="relative flex gap-4">
      {/* The chain: one dot per link, joined down the left edge. */}
      <div aria-hidden className="relative flex w-3 shrink-0 justify-center">
        <span className={cn('relative z-10 mt-[18px] size-2.5 rounded-full', DOT[row.tone])} />
        {!last && <span className="absolute bottom-0 top-[18px] w-px bg-line-default" />}
      </div>
      <div className="min-w-0 flex-1 border-b border-line-subtle">
        {hasDetail ? (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-start gap-2 py-3 hover:bg-surface-sunken/50 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none">
              {head}
            </summary>
            <div className="flex flex-col gap-3 pb-4 pl-0 sm:pl-48">
              {row.facts.length > 0 && (
                <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-[minmax(10rem,max-content)_1fr]">
                  {row.facts.map((fact) => (
                    <div key={fact.label} className="contents">
                      <dt className="text-meta text-foreground-muted">{fact.label}</dt>
                      <dd className={cn('min-w-0 break-all text-meta text-foreground', fact.mono && 'font-mono')}>
                        {fact.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {row.entries.length > 0 && (
                <ul className="divide-y divide-line-subtle">
                  {row.entries.map((entry, i) => (
                    <Entry key={`${entry.id ?? ''}-${i}`} entry={entry} />
                  ))}
                </ul>
              )}
            </div>
          </details>
        ) : (
          <div className="flex items-start gap-2 py-3">{head}</div>
        )}
      </div>
    </li>
  )
}

export function ProofScreen() {
  const params = useSearchParams()
  const runId = params.get('run')
  const proof = useReading<ProofView>(
    (signal) => request<ProofView>(`/runs/${encodeURIComponent(runId ?? '')}/proof`, { signal }),
    [runId],
    { enabled: Boolean(runId) },
  )
  const view = proof.data

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Proof"
        description="One run's chain, request to signed certificate. Every row is read from the run record or verified from its certificate; a link with nothing recorded says so."
        meta={
          view
            ? [
                { label: 'Run', value: view.task_id.slice(0, 8), hint: view.task_id },
                { label: 'Status', value: view.status.replace(/_/g, ' ') },
                { label: 'Received', value: new Date(view.created_at).toLocaleString() },
              ]
            : undefined
        }
        actions={
          view && (
            <>
              <Link href={`/console?run=${view.task_id}`} className={LINK}>
                Open run
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
              {view.parent_task_id && (
                <Link href={`/compare?a=${view.parent_task_id}&b=${view.task_id}`} className={LINK}>
                  <GitCompare className="size-3.5" aria-hidden />
                  Compare with original
                </Link>
              )}
            </>
          )
        }
      />

      <div className="mx-auto w-full max-w-[1100px] px-4 pb-16 pt-6 sm:px-6">
        {!runId ? (
          <EmptyState
            title="No run chosen"
            body="Open a run in the thread and choose Proof, or add ?run=<id> to this address."
            action={<Link href="/console" className={LINK}>Go to the thread</Link>}
          />
        ) : view ? (
          <ol aria-label="Chain of custody" className="flex flex-col">
            {view.rows.map((row, index) => (
              <Row key={row.key} row={row} index={index} last={index === view.rows.length - 1} />
            ))}
          </ol>
        ) : proof.status === 'failed' ? (
          <FailureState failure={proof.failure!} what="this run's proof" retry={proof.reload} />
        ) : (
          <ReadingLine what="this run's proof" source={`GET /api/runs/${runId}/proof`} startedAt={proof.startedAt} />
        )}
      </div>
    </div>
  )
}
