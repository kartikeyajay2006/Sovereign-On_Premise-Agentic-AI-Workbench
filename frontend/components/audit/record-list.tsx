'use client'

import { memo } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Append, Refused } from '@/shared/motion'
import type { AuditRecord } from './api'

export type RowCheck = 'pending' | 'ok' | 'fail' | undefined

const CHECK: Record<Exclude<RowCheck, undefined>, { glyph: string; className: string; label: string }> = {
  pending: { glyph: '·', className: 'text-foreground-muted', label: 'not yet recomputed' },
  ok: { glyph: '✓', className: 'text-sovereign-text', label: 'recomputed in this browser' },
  fail: { glyph: '✕', className: 'text-critical-text', label: 'does not recompute' },
}

function time(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * The link from this record to the one before it, checked against the
 * predecessor when this page holds it. When it does not (a filter, or a role
 * that reads only its own records) the link is shown and left unjudged.
 */
function LinkLine({ record, predecessor }: { record: AuditRecord; predecessor: AuditRecord | null }) {
  if (record.prev_hash === '0'.repeat(64)) {
    return <span className="text-foreground-muted">genesis: the first record commits to no predecessor</span>
  }
  if (!predecessor) {
    return (
      <span className="text-foreground-muted">
        #{record.sequence - 1} is not in this list, so the link is shown and not compared here
      </span>
    )
  }
  return predecessor.hash === record.prev_hash ? (
    <span className="text-sovereign-text">equals the hash of #{predecessor.sequence}</span>
  ) : (
    <span className="text-critical-text">does not equal the hash of #{predecessor.sequence}</span>
  )
}

/**
 * One record. `index` is its place in the list, which for a newest-first
 * list is also its place in any batch a re-read appended, since new records
 * arrive at the top.
 *
 * When the browser check finds the chain broken, the first failing record
 * is REFUSED (a critical rule down its edge, and a light that settles to a
 * rim) and every record after it in the chain is a dim item: the check
 * cannot vouch for anything past the break, while everything before it
 * still verifies.
 */
export const RecordRow = memo(function RecordRow({
  record,
  predecessor,
  open,
  check,
  index,
  afterBreak,
  firstBreak,
  onToggle,
}: {
  record: AuditRecord
  predecessor: AuditRecord | null
  open: boolean
  check: RowCheck
  index: number
  /** Later in the chain than the first record that failed to recompute. */
  afterBreak: boolean
  /** The first record that failed to recompute. */
  firstBreak: boolean
  onToggle: (id: string) => void
}) {
  const detail = record.detail && Object.keys(record.detail).length > 0 ? record.detail : null
  const mark = check ? CHECK[check] : null

  const body = (
    <>
      <button
        type="button"
        onClick={() => onToggle(record.id)}
        aria-expanded={open}
        className={cn(
          'hover-decay grid w-full grid-cols-[16px_minmax(0,1fr)_16px] items-start gap-x-3 px-4 py-2 text-left',
          'lg:grid-cols-[16px_64px_80px_120px_minmax(0,1fr)_160px_96px_16px] lg:items-center',
          'focus-visible:shadow-[inset_0_0_0_2px_var(--foreground)] focus-visible:outline-none',
          open ? 'bg-[var(--selected-surface)]' : 'hover:bg-surface-sunken',
        )}
      >
        <span
          aria-label={mark ? mark.label : undefined}
          title={mark ? mark.label : undefined}
          className={cn('pt-0.5 text-center font-mono text-ui lg:pt-0', mark?.className)}
        >
          {mark?.glyph ?? ''}
        </span>

        {/* Stacked below 1024px, where eight columns leave the action a
            few characters wide. From lg: one ledger row per record. */}
        <span className="flex min-w-0 flex-col gap-0.5 lg:hidden">
          <span className="flex items-baseline gap-2 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
            <span className="tabular text-foreground">#{record.sequence}</span>
            <span className="truncate">{record.category}</span>
            <span className="tabular ml-auto shrink-0">{time(record.at)}</span>
          </span>
          <span className="truncate text-body text-foreground">{record.action}</span>
          <span className="truncate font-mono text-ledger text-foreground-muted">
            {record.actor}
            {record.actor_role ? ` (${record.actor_role})` : ''} · {record.hash.slice(0, 8)}…
          </span>
        </span>

        <span className="tabular hidden font-mono text-ui text-foreground lg:block">#{record.sequence}</span>
        <time dateTime={record.at} title={record.at} className="tabular hidden font-mono text-ui text-foreground-muted lg:block">
          {time(record.at)}
        </time>
        <span className="hidden truncate font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted lg:block">
          {record.category}
        </span>
        <span className="hidden min-w-0 lg:block">
          <span className="block truncate text-body text-foreground">{record.action}</span>
        </span>
        <span className="hidden truncate font-mono text-ui text-foreground-secondary lg:block" title={record.actor_role ?? undefined}>
          {record.actor}
        </span>
        <span className="hidden truncate font-mono text-ui text-foreground-muted lg:block" title={record.hash}>
          {record.hash.slice(0, 8)}…
        </span>
        <ChevronRight
          aria-hidden
          className={cn(
            'mt-0.5 h-3.5 w-3.5 text-foreground-muted transition-transform duration-[var(--micro)] ease-[var(--ease-micro)] motion-reduce:transition-none lg:mt-0',
            open && 'rotate-90',
          )}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-4 bg-[var(--selected-surface)] px-4 pb-4 pt-2 lg:pl-[44px]">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                This record&rsquo;s hash
              </dt>
              <dd className="break-all font-mono text-ui text-foreground">{record.hash}</dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                Commits to (prev_hash)
              </dt>
              <dd className="break-all font-mono text-ui text-foreground">{record.prev_hash}</dd>
              <dd className="text-ui">
                <LinkLine record={record} predecessor={predecessor} />
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                Recorded at
              </dt>
              <dd className="break-all font-mono text-ui text-foreground-secondary">{record.at}</dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                Actor · task
              </dt>
              <dd className="break-all font-mono text-ui text-foreground-secondary">
                {record.actor}
                {record.actor_role ? ` (${record.actor_role})` : ''} · {record.task_id ?? 'no task'}
              </dd>
            </div>
          </dl>
          {detail && (
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                Detail, as stored
              </p>
              <pre className="max-h-72 overflow-auto rounded-[var(--radius)] bg-surface-sunken p-3 font-mono text-meta text-foreground-secondary">
                {JSON.stringify(detail, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </>
  )

  return (
    // APPEND: an audit record the backend wrote after this list was read
    // (the export a browser check makes, or any action taken meanwhile),
    // arriving on a re-read. Rows present at the first read do not move.
    <Append
      as="li"
      index={index}
      id={`record-${record.id}`}
      data-dim-item={afterBreak ? '' : undefined}
      className="scroll-mt-20 border-b border-line-subtle last:border-b-0"
    >
      {firstBreak ? (
        // REFUSE: the browser check reporting this record does not
        // recompute. The row's own 16px inset clears the 2px rule.
        <Refused data-dim-keep="">{body}</Refused>
      ) : (
        body
      )}
    </Append>
  )
})
