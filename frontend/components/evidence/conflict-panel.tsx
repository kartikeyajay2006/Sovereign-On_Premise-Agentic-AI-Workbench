'use client'

import { useState } from 'react'
import { GitCompareArrows, Scale } from 'lucide-react'
import { request } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/shared/ui/controls/button'
import type { ConflictRecord, Task } from '@/lib/types'

/**
 * Where the sources disagree, shown side by side.
 *
 * The workbench never chooses between two records silently. An input
 * conflict withholds every figure that depends on it until a person picks a
 * value; that choice becomes H evidence and the formulas recompute from it.
 * A revision conflict (a record written against a superseded procedure) is
 * settled by rule in favour of the revision in force, and listed so a reader
 * sees it happened. A fact conflict (two sources stating different values for
 * one attribute of one tag or clause) withholds the claims that take a side
 * until a person chooses, through the same form.
 */

export function resolveConflict(
  taskId: string,
  conflictId: string,
  choice: { candidate: number | null; value: string | null; reason: string },
) {
  return request<Task>(
    `/tasks/${encodeURIComponent(taskId)}/conflicts/${encodeURIComponent(conflictId)}/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(choice),
    },
  )
}

const STATUS: Record<ConflictRecord['status'], { label: string; tone: string }> = {
  unresolved: { label: 'Unresolved · decision withheld', tone: 'text-critical-text' },
  resolved: { label: 'Resolved by a person', tone: 'text-sovereign-text' },
  auto_resolved: { label: 'Settled by rule', tone: 'text-foreground-secondary' },
}

function Chip({ id, onCite }: { id: string | null | undefined; onCite?: (id: string) => void }) {
  if (!id) return null
  return (
    <button
      type="button"
      onClick={() => onCite?.(id)}
      className="hover-decay inline-flex h-5 items-center rounded-full bg-surface-sunken px-1.5 font-mono text-[11px] font-semibold text-foreground hover:bg-[color-mix(in_oklab,var(--foreground)_9%,var(--background))] focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
      title={`Open ${id}`}
    >
      {id}
    </button>
  )
}

function ResolveForm({
  taskId,
  conflict,
  onResolved,
}: {
  taskId: string
  conflict: ConflictRecord
  onResolved: (task: Task) => void
}) {
  const [candidate, setCandidate] = useState<number | 'own' | null>(null)
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready =
    candidate !== null && reason.trim().length >= 8 && (candidate !== 'own' || value.trim().length > 0)

  const submit = async () => {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      const task = await resolveConflict(taskId, conflict.id, {
        candidate: candidate === 'own' ? null : candidate,
        value: candidate === 'own' ? value.trim() : null,
        reason: reason.trim(),
      })
      onResolved(task)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The resolution was not recorded.')
    } finally {
      setBusy(false)
    }
  }

  const unit = conflict.candidates.find((c) => c.unit)?.unit
  return (
    <fieldset className="mt-3 flex flex-col gap-2 border-t border-line-subtle pt-3">
      <legend className="sr-only">Resolve {conflict.id}</legend>
      <p className="text-ui text-foreground-secondary">
        {conflict.kind === 'fact'
          ? 'Choose the value that is correct. It is recorded as H evidence under your name, and claims that state it are then checked against that record.'
          : 'Choose the value the decision should use. It is recorded as H evidence under your name, and every figure is recomputed from it by the same formulas.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {conflict.candidates.map((option, index) => (
          <label
            key={index}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-[var(--radius)] border px-2.5 py-1.5 text-ui',
              candidate === index ? 'border-foreground text-foreground' : 'border-line-default text-foreground-secondary',
            )}
          >
            <input
              type="radio"
              name={`resolve-${conflict.id}`}
              checked={candidate === index}
              onChange={() => setCandidate(index)}
              className="accent-[var(--foreground)]"
            />
            <span className="font-medium tabular">{option.stated ?? String(option.value)}</span>
            {option.evidence_id && <span className="font-mono text-[11px] text-foreground-muted">{option.evidence_id}</span>}
          </label>
        ))}
        <label
          className={cn(
            'flex cursor-pointer items-center gap-2 rounded-[var(--radius)] border px-2.5 py-1.5 text-ui',
            candidate === 'own' ? 'border-foreground text-foreground' : 'border-line-default text-foreground-secondary',
          )}
        >
          <input
            type="radio"
            name={`resolve-${conflict.id}`}
            checked={candidate === 'own'}
            onChange={() => setCandidate('own')}
            className="accent-[var(--foreground)]"
          />
          A re-measured value
        </label>
      </div>
      {candidate === 'own' && (
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={unit ? `e.g. 9.6 ${unit}` : 'value'}
          aria-label="Re-measured value"
          className="h-8 max-w-[220px] rounded-[var(--radius)] border border-line-default bg-background px-2 text-ui text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
        />
      )}
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={2}
        aria-label="Reason for the resolution"
        placeholder="Why this value governs (recorded in the audit chain)"
        className="rounded-[var(--radius)] border border-line-default bg-background px-2 py-1.5 text-ui text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
      />
      {error && <p className="text-ui text-critical-text">{error}</p>}
      <div>
        <Button variant="primary" size="sm" ground="paper" disabled={!ready || busy} onClick={submit}>
          {busy ? 'Recording…' : conflict.kind === 'fact' ? `Resolve ${conflict.id}` : `Resolve ${conflict.id} and recompute`}
        </Button>
      </div>
    </fieldset>
  )
}

export function ConflictPanel({
  conflicts,
  taskId,
  canResolve = false,
  onResolved,
  onCite,
}: {
  conflicts: ConflictRecord[]
  taskId: string
  /** The viewer holds approval.decide for this run and did not submit it. */
  canResolve?: boolean
  onResolved?: (task: Task) => void
  onCite?: (id: string) => void
}) {
  if (conflicts.length === 0) return null
  const open = conflicts.filter((c) => c.status === 'unresolved' && c.impact === 'high')
  return (
    <section
      aria-label="Conflicting sources"
      className={cn('grouped flex flex-col gap-3 px-4 py-3', open.length ? 'wash-critical' : '')}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-ui font-medium text-foreground">
          <GitCompareArrows className="h-4 w-4 text-foreground-secondary" aria-hidden />
          {open.length
            ? `The sources disagree · ${open.length} decision${open.length === 1 ? '' : 's'} withheld`
            : 'Conflicting sources, reconciled'}
        </span>
        <span className="font-mono text-meta text-foreground-muted">never chosen silently</span>
      </header>
      <ol className="flex flex-col gap-4">
        {conflicts.map((conflict) => {
          const mark = STATUS[conflict.status]
          return (
            <li key={conflict.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-mono text-meta font-semibold text-foreground">{conflict.id}</span>
                <span className="text-ui font-medium text-foreground">{conflict.label}</span>
                <span className={cn('font-mono text-ledger uppercase tracking-[var(--ls-ledger)]', mark.tone)}>
                  {mark.label}
                </span>
                {conflict.impact === 'medium' && (
                  <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                    no formula reads it
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {conflict.candidates.map((candidate, index) => {
                  const chosen = conflict.resolution?.candidate === index || (conflict.status === 'auto_resolved' && index === conflict.candidates.length - 1)
                  return (
                    <div
                      key={index}
                      className={cn(
                        'flex min-w-0 flex-col gap-1 rounded-[var(--radius)] border px-3 py-2',
                        chosen ? 'border-foreground' : 'border-line-default',
                      )}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-body font-medium tabular text-foreground">
                          {candidate.stated ?? String(candidate.value)}
                        </span>
                        <Chip id={candidate.evidence_id} onCite={onCite} />
                        {chosen && (
                          <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-sovereign-text">
                            {conflict.status === 'auto_resolved' ? 'applied' : 'accepted'}
                          </span>
                        )}
                      </span>
                      {candidate.source_document && (
                        <span className="truncate text-meta text-foreground-secondary" title={candidate.source_document}>
                          {candidate.source_document}
                        </span>
                      )}
                      {candidate.locator && <span className="text-[12px] text-foreground-muted">{candidate.locator}</span>}
                      {candidate.source_text && (
                        <span className="truncate font-mono text-[11px] text-foreground-muted" title={candidate.source_text}>
                          “{candidate.source_text}”
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              {conflict.note && <p className="text-meta text-foreground-secondary">{conflict.note}</p>}
              {conflict.resolution && (
                <p className="flex flex-wrap items-center gap-1.5 text-meta text-foreground-secondary">
                  <Scale className="h-3.5 w-3.5" aria-hidden />
                  {conflict.resolution.resolved_by_name} ({conflict.resolution.resolved_by_role}) accepted{' '}
                  <span className="font-medium text-foreground">{conflict.resolution.stated}</span>:{' '}
                  {conflict.resolution.reason}
                  <Chip id={conflict.resolution.evidence_id} onCite={onCite} />
                </p>
              )}
              {conflict.status === 'unresolved' && conflict.impact === 'high' && canResolve && onResolved && (
                <ResolveForm taskId={taskId} conflict={conflict} onResolved={onResolved} />
              )}
              {conflict.status === 'unresolved' && conflict.impact === 'high' && !canResolve && (
                <p className="text-meta text-foreground-muted">
                  Awaiting a reviewer: a different account holding approval.decide chooses the value, and the
                  decision is recomputed from it.
                </p>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
