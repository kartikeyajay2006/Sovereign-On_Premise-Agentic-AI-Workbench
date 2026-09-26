'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { MeasuredNumber } from '@/shared/motion'
import type { HarnessChildView, HarnessOutcome, HarnessRunView } from '../../model/types'
import { OUTCOME } from '../outcome'
import { LABEL, LABEL_STRONG, MONO } from './style'

/**
 * The run rail: one square per child, in submission order.
 *
 * Five looks, each read from the child's recorded outcome and nothing else:
 * hollow for not yet run, a lime outline for the one child the worker is
 * running, ok, held and critical fills for how a settled child came out.
 * A delivery with claims untraced is an amber outline, not a fill: it was
 * released, and it is for a person to look at. A child that never ran is
 * a dashed hollow. The glyph inside says the same thing without hue.
 *
 * There is only ever one lime cell. Children run one at a time, and the
 * rail must never suggest otherwise.
 */
type CellLook = 'pending' | 'running' | 'ok' | 'partial' | 'held' | 'critical' | 'neutral' | 'skipped'

const LOOK: Record<HarnessOutcome, CellLook> = {
  pending: 'pending',
  queued: 'pending',
  running: 'running',
  supported: 'ok',
  partially_supported: 'partial',
  released_unverified: 'partial',
  no_material_claims: 'neutral',
  held: 'held',
  rejected: 'critical',
  refused: 'critical',
  failed: 'critical',
  cancelled: 'skipped',
  not_submitted: 'skipped',
}

const CELL: Record<CellLook, string> = {
  pending: 'border border-foreground-muted/60 bg-transparent text-foreground-muted',
  running: 'border border-action bg-transparent text-action',
  ok: 'border border-[var(--hv-ok)] bg-[var(--hv-ok)] text-black',
  partial: 'border border-[var(--hv-held)] bg-transparent text-[var(--hv-held)]',
  held: 'border border-[var(--hv-held)] bg-[var(--hv-held)] text-black',
  critical: 'border border-[var(--hv-critical)] bg-[var(--hv-critical)] text-black',
  neutral: 'border border-foreground-muted bg-foreground-muted text-black',
  skipped: 'border border-dashed border-foreground-muted/60 bg-transparent text-foreground-muted',
}

export function cellLook(outcome: HarnessOutcome): CellLook {
  return LOOK[outcome]
}

export function RunRail({
  run,
  selected,
  onSelect,
  aggregating,
}: {
  run: HarnessRunView
  selected: number | null
  onSelect: (index: number) => void
  aggregating: boolean
}) {
  // What each child was when the rail first drew. Only a change from that
  // is an event the rail saw, and only a change ticks: a run opened after
  // its children settled shows them settled, without motion.
  const initial = useRef<Map<string, HarnessOutcome> | null>(null)
  if (initial.current === null) {
    initial.current = new Map(run.children.map((child) => [child.key, child.outcome]))
  }
  const counts = run.tally.counts
  const current = run.children.find((child) => child.index === run.current_index) ?? null

  return (
    <section aria-label="Run rail" className="flex flex-col gap-2 border-b border-line-default px-4 py-3">
      <ol className="flex list-none flex-wrap gap-1 p-0" aria-label="Children, one per item">
        {run.children.map((child) => (
          <li key={child.key}>
            <RailCell
              child={child}
              selected={child.index === selected}
              changed={LOOK[initial.current!.get(child.key) ?? child.outcome] !== LOOK[child.outcome]}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ol>
      <p className={cn(LABEL, 'flex flex-wrap items-center gap-x-3 gap-y-1')}>
        <span className="hv-roll inline-flex items-baseline gap-1">
          settled{' '}
          <MeasuredNumber value={run.tally.settled} className={cn(MONO, 'text-foreground')} />
          <span className="text-foreground-muted">/{run.tally.total}</span>
        </span>
        <span aria-hidden>·</span>
        <span className="hv-roll inline-flex items-baseline gap-1">
          supported <MeasuredNumber value={counts.supported} className={cn(MONO, 'text-[var(--hv-ok)]')} />
        </span>
        <span aria-hidden>·</span>
        <span className="hv-roll inline-flex items-baseline gap-1">
          partial{' '}
          <MeasuredNumber value={counts.partially_supported} className={cn(MONO, 'text-[var(--hv-held)]')} />
        </span>
        {counts.held > 0 && (
          <>
            <span aria-hidden>·</span>
            <span className="hv-roll inline-flex items-baseline gap-1">
              held <MeasuredNumber value={counts.held} className={cn(MONO, 'text-[var(--hv-held)]')} />
            </span>
          </>
        )}
        {counts.refused + counts.failed + counts.rejected > 0 && (
          <>
            <span aria-hidden>·</span>
            <span className="hv-roll inline-flex items-baseline gap-1">
              refused / failed{' '}
              <MeasuredNumber
                value={counts.refused + counts.failed + counts.rejected}
                className={cn(MONO, 'text-[var(--hv-critical)]')}
              />
            </span>
          </>
        )}
        {current && current.outcome === 'queued' && (
          <span className={LABEL_STRONG}>
            · #{current.index} queued
            {current.queue_ahead !== null ? ` · ${current.queue_ahead} ahead` : ''}
          </span>
        )}
        {aggregating && <span className={LABEL_STRONG}>· aggregating · writing the report</span>}
      </p>
    </section>
  )
}

function RailCell({
  child,
  selected,
  changed,
  onSelect,
}: {
  child: HarnessChildView
  selected: boolean
  changed: boolean
  onSelect: (index: number) => void
}) {
  const look = LOOK[child.outcome]
  const spec = OUTCOME[child.outcome]
  const glyph = look === 'pending' || look === 'running' || look === 'skipped' ? '' : spec.glyph
  return (
    <button
      type="button"
      onClick={() => onSelect(child.index)}
      aria-label={`#${child.index} ${child.label}: ${spec.label}`}
      aria-pressed={selected}
      title={`#${child.index} · ${spec.label} · ${child.label}`}
      className={cn(
        'relative flex size-4 items-center justify-center rounded-none p-0 font-mono text-[9px] leading-none',
        'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-foreground',
        selected && 'outline outline-1 outline-offset-2 outline-foreground',
      )}
    >
      {/* TICK: keyed on the look, so a change the rail saw remounts the
          fill and replays the two-step tick. An unchanged cell never has
          the class. */}
      <span
        key={look}
        aria-hidden
        className={cn('absolute inset-0 flex items-center justify-center', CELL[look], changed && 'hv-tick')}
      >
        {glyph}
      </span>
    </button>
  )
}
