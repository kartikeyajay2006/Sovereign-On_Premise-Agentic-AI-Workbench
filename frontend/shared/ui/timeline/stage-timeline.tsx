'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Density, StageState } from '@/shared/ui/types'

export type { StageState } from '@/shared/ui/types'

export interface Stage {
  id: string
  /** "04" — fixed, so the rail is legible before anything has run. */
  index: string
  label: string
  state: StageState
  /** ISO. Drives the measured dwell counter. Null until the stage starts. */
  at: string | null
  /** Frozen final elapsed. Null while running or never run. Never 0 as a stand-in. */
  elapsedMs: number | null
  /** One short clause, sentence case, backend-authored. Never templated here. */
  headline: string | null
  /**
   * An absent key renders nothing; a key set to 0 renders "0". Those are
   * different facts, which is why this is Partial rather than a full record
   * with zero defaults.
   */
  counts?: Partial<
    Record<'allow' | 'deny' | 'evidence' | 'claims' | 'conflicts' | 'candidates', number>
  >
  model?: string | null
}

export interface StageTimelineProps {
  /** Always the full set, always in canonical order, from t=0. */
  stages: Stage[]
  activeId?: string | null
  onSelect?: (id: string) => void
  density?: Density
  /** Renders a stage's panel inline beneath its row, so opening a stage
   *  never costs the reader the surrounding context. */
  renderPanel?: (stage: Stage) => ReactNode
}

/**
 * The stage board.
 *
 * Replaces agent-pipeline.tsx, which mapped its states to colours correctly
 * and then undid the work: a `0 0 8px` glow on done and failed, and
 * `animate-pulse` on held. Glow adds a weight channel that competes with
 * shape and fill, and pulsing `held` implies work is happening when the
 * system is in fact idle, waiting for a person. It also carried a
 * `progressPercent` gauge — we do not know what fraction of a run is
 * complete, and no product that ships agent runs claims to.
 *
 * Two distinctions here carry the whole demonstration:
 *
 *   denied != failed. A denial is the product working; a failure is a bug.
 *   Denied is the only state given a 2px ring, a solid fill and an inverted
 *   glyph — three channels at once. Conflating them means either crashes
 *   look like security, or security looks like a crash.
 *
 *   blocked != skipped != pending. Skipped says the system chose not to run
 *   it. Blocked says the system correctly stopped upstream, so it never got
 *   its turn. Pending says we do not know yet.
 *
 * Every row is unambiguous with the colour column deleted: no two states
 * share all of {glyph, ring style, fill, connector}.
 */

type MarkerSpec = {
  glyph: string
  /** Tailwind/arbitrary classes for the 18px marker. */
  marker: string
  /** Label colour — always a -text variant, never a raw status hue. */
  label: string
  connector: 'idle' | 'drawn' | 'severed'
  /** Appended to the label. `blocked` says so in words, not only in colour. */
  suffix?: string
}

const MARKER: Record<StageState, MarkerSpec> = {
  pending: {
    glyph: '',
    marker: 'border border-control-strong',
    label: 'text-foreground-muted',
    connector: 'idle',
  },
  active: {
    glyph: '',
    marker: 'border border-active',
    label: 'text-foreground',
    connector: 'idle',
  },
  done: {
    glyph: '✓',
    marker: 'border border-sovereign bg-sovereign text-[var(--on-sovereign)]',
    label: 'text-foreground',
    connector: 'drawn',
  },
  held: {
    glyph: '⏸',
    marker: 'border border-approval bg-approval-surface text-approval-text',
    label: 'text-approval-text',
    connector: 'idle',
  },
  denied: {
    // The only state with a 2px ring, a solid fill and an inverted glyph.
    glyph: '⛔',
    marker: 'border-2 border-critical bg-critical text-[var(--on-critical)]',
    label: 'text-critical-text',
    connector: 'severed',
  },
  failed: {
    glyph: '✕',
    marker: 'border border-critical bg-critical-surface text-critical-text',
    label: 'text-critical-text',
    connector: 'severed',
  },
  skipped: {
    glyph: '—',
    marker: 'border border-dashed border-line-strong text-foreground-muted',
    label: 'text-foreground-muted',
    connector: 'idle',
  },
  blocked: {
    glyph: '⊘',
    marker: 'border border-dashed border-line-strong text-foreground-muted',
    label: 'text-foreground-muted',
    connector: 'severed',
    suffix: 'not reached',
  },
  unavailable: {
    glyph: '?',
    marker: 'border border-line-default text-foreground-muted',
    label: 'text-foreground-muted',
    connector: 'idle',
  },
}

const PAD: Record<Density, string> = {
  comfortable: 'py-[var(--pad-comfortable)]',
  compact: 'py-[var(--pad-compact)]',
  dense: 'py-[var(--pad-dense)]',
}

/** Human-readable, and only ever from a real measurement. */
function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Time actually spent in the active stage, counted from the timestamp the
 * backend reported.
 *
 * This is a measurement, not an animation. It is the honest alternative to a
 * progress bar: we genuinely do not know how long a stage will take, but we
 * do know exactly how long it has been running, and saying so holds
 * attention without asserting anything false.
 */
function StageDwell({ at }: { at: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [])

  const started = Date.parse(at)
  if (Number.isNaN(started)) return null
  const elapsed = Math.max(0, now - started)

  return (
    <span className="tabular text-meta text-foreground-muted" aria-label="time in this stage">
      {formatElapsed(elapsed)}
    </span>
  )
}

function StageMarker({ state }: { state: StageState }) {
  const spec = MARKER[state]
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] leading-none',
        spec.marker,
      )}
    >
      {state === 'active' ? (
        <span className="sov-pulse h-1.5 w-1.5 rounded-full bg-active" />
      ) : (
        spec.glyph
      )}
    </span>
  )
}

export function StageTimeline({
  stages,
  activeId = null,
  onSelect,
  density = 'compact',
  renderPanel,
}: StageTimelineProps) {
  return (
    <ol className="grouped" role="list">
      {stages.map((s, i) => {
        const spec = MARKER[s.state]
        const isLast = i === stages.length - 1
        const selected = activeId === s.id
        const interactive = Boolean(onSelect)

        const row = (
          <div
            className={cn(
              'grid grid-cols-[18px_24px_minmax(0,1fr)_auto] items-start gap-[var(--space-4)] px-[var(--space-5)]',
              PAD[density],
            )}
          >
            <div className="flex flex-col items-center">
              <StageMarker state={s.state} />
              {/* The causal link. A connector is drawn out of a stage that
                  completed; out of a denied, failed or blocked stage it is
                  not. The absence of the line is the statement — the flow
                  stopped here. */}
              {!isLast && (
                <span
                  data-state={spec.connector}
                  className={cn(
                    'mt-1 w-px flex-1 self-center',
                    spec.connector === 'drawn' && 'bg-sovereign',
                    spec.connector === 'idle' && 'bg-line-default',
                    spec.connector === 'severed' && 'bg-transparent',
                  )}
                  style={
                    spec.connector === 'severed'
                      ? {
                          backgroundImage:
                            'repeating-linear-gradient(to bottom, var(--line-strong) 0 2px, transparent 2px 5px)',
                        }
                      : undefined
                  }
                />
              )}
            </div>

            <span className="font-mono text-meta text-foreground-muted">{s.index}</span>

            <div className="min-w-0">
              <span className={cn('text-body font-medium', spec.label)}>
                {s.label}
                {spec.suffix && (
                  <span className="ml-2 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                    {spec.suffix}
                  </span>
                )}
              </span>
              {s.headline && (
                <p className="mt-0.5 max-w-[66ch] text-ui text-foreground-secondary">
                  {s.headline}
                </p>
              )}
              {s.counts && Object.keys(s.counts).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                  {Object.entries(s.counts).map(([k, v]) => (
                    <span key={k}>
                      {k} <span className="tabular text-foreground">{v}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 justify-self-end">
              {s.model && <span className="font-mono text-meta text-foreground-muted">{s.model}</span>}
              {/* A measured reading or nothing. There is no placeholder. */}
              {s.state === 'active' && s.at ? (
                <StageDwell at={s.at} />
              ) : s.elapsedMs !== null ? (
                <span className="tabular text-meta text-foreground-muted">
                  {formatElapsed(s.elapsedMs)}
                </span>
              ) : null}
            </div>
          </div>
        )

        return (
          <li
            key={s.id}
            aria-current={s.state === 'active' ? 'step' : undefined}
            className={cn(!isLast && 'grouped-row')}
          >
            {interactive ? (
              <button
                type="button"
                onClick={() => onSelect?.(s.id)}
                aria-expanded={renderPanel ? selected : undefined}
                className={cn(
                  'hover-decay block w-full text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                  selected && 'bg-[var(--selected-surface)]',
                )}
              >
                {row}
              </button>
            ) : (
              row
            )}
            {renderPanel && selected && <div className="px-[var(--space-5)] pb-[var(--space-5)]">{renderPanel(s)}</div>}
          </li>
        )
      })}
    </ol>
  )
}
