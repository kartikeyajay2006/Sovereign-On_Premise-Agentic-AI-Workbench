'use client'

import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import type { HarnessChildView } from '../../model/types'
import { LANES, laneView, type LaneId, type LaneItem, type Timeline, type Tone } from '../../model/timeline'
import { OUTCOME } from '../outcome'
import { documentCode, sectionName } from '../format'
import { BODY, LABEL, LABEL_STRONG, MONO, PANE, PANE_HEAD } from './style'

const TONE_FILL: Record<Tone, string> = {
  neutral: 'bg-foreground-secondary',
  ok: 'bg-[var(--hv-ok)]',
  held: 'bg-[var(--hv-held)]',
  critical: 'bg-[var(--hv-critical)]',
}
const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-foreground-secondary',
  ok: 'text-[var(--hv-ok)]',
  held: 'text-[var(--hv-held)]',
  critical: 'text-[var(--hv-critical)]',
}

/** Seconds between two backend timestamps, to one decimal. */
function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

/** How much of the draft's tail the REASON lane shows. */
const TAIL_CHARS = 72

export interface StageLanesProps {
  child: HarnessChildView | null
  timeline: Timeline
  loaded: boolean
  error: string | null
  /** Following the child the worker is running now. */
  live: boolean
  /** Replay cursor: a moment the timeline holds, or null for all of it. */
  until: number | null
  step: { index: number; total: number } | null
  focusedLane: LaneId
}

/**
 * The live child's stages as parallel lanes on one time axis.
 *
 * Every bar is a measured span: a stage from its own mark to the next, a
 * model call from its start for the latency the runtime reported, a tool
 * from its start for the duration the registry measured. The axis runs from
 * the first thing heard to the last, both backend timestamps. A span still
 * open is drawn to the last moment heard with an open right edge; it is
 * never stretched by the browser's clock.
 *
 * Scan runs on RETRIEVE only while the live child is in its retrieval
 * stage, and stops the moment the next stage mark arrives. REASON shows
 * the tail of the draft as it streams, with a caret, and only while live:
 * the stream is what the owner already sees in the thread, and it is
 * dropped here when the child settles, because a held draft is not
 * re-published through the harness.
 */
export function StageLanes({ child, timeline, loaded, error, live, until, step, focusedLane }: StageLanesProps) {
  const view = laneView(timeline, until)
  const { t0, tEnd } = view
  const span = t0 !== null && tEnd !== null ? Math.max(tEnd - t0, 1) : 1
  const pos = (t: number) => (t0 === null ? 0 : ((t - t0) / span) * 100)
  const replaying = until !== null
  const liveNow = live && !replaying && timeline.finished === null
  const byLane = (lane: LaneId) => view.items.filter((item) => item.lane === lane)
  const focusedItems = byLane(focusedLane)
  const showHits = Boolean(child?.released) || live

  const token = timeline.token
  const tail =
    liveNow && token && view.openStage === 'reason'
      ? token.stage === 'drafting'
        ? token.text.slice(-TAIL_CHARS)
        : null
      : null

  const noStageMarks = loaded && !live && timeline.stages.length === 0 && (timeline.models.length > 0 || timeline.tools.length > 0)

  return (
    <section aria-label="Stage lanes" className={cn(PANE, 'min-h-[260px]')}>
      <header className={PANE_HEAD}>
        <h2 className={LABEL_STRONG}>
          Stage lanes{child ? ` · #${child.index}` : ''}
        </h2>
        <span className={cn(LABEL, 'flex items-center gap-2')}>
          {replaying && step ? (
            <span className="text-foreground">
              replay · step {step.index + 1}/{step.total}
            </span>
          ) : liveNow ? (
            <span className="text-action">live</span>
          ) : child ? (
            <span>{OUTCOME[child.outcome].label}</span>
          ) : null}
        </span>
      </header>

      {!child ? (
        <p className={cn(BODY, 'px-3 py-4 text-foreground-secondary')}>No child has been submitted yet.</p>
      ) : !child.task_id ? (
        <p className={cn(BODY, 'px-3 py-4 text-foreground-secondary')}>
          #{child.index} was never submitted, so there is nothing to replay.
        </p>
      ) : error && timeline.firstAt === null ? (
        <p className={cn(BODY, 'px-3 py-4 text-[var(--hv-critical)]')}>The record could not be read: {error}</p>
      ) : !loaded && timeline.firstAt === null ? (
        <p className={cn(LABEL, 'px-3 py-4')}>Reading #{child.index}&rsquo;s record…</p>
      ) : (
        <>
          <p className={cn(BODY, 'truncate border-b border-line-subtle px-3 py-1 text-foreground-secondary')} title={child.label}>
            {child.label}
          </p>
          {/* Axis: both ends are backend timestamps, and so is the span. */}
          <div className="grid grid-cols-[76px_132px_minmax(0,1fr)] border-b border-line-subtle">
            <span className={cn(LABEL, 'px-3 leading-6')}>t</span>
            <span />
            <span className={cn(MONO, 'flex h-6 items-center justify-between pr-3 text-foreground-muted')}>
              <span>+0.0s</span>
              <span>{t0 !== null && tEnd !== null ? `+${seconds(tEnd - t0)}` : '—'}</span>
            </span>
          </div>
          <ol className="flex list-none flex-col p-0">
            {LANES.map((lane) => {
              const items = byLane(lane.id)
              const chip = view.chips[lane.id]
              const scanning = lane.id === 'retrieve' && liveNow && view.openStage === 'retrieve'
              const focused = lane.id === focusedLane
              return (
                <li
                  key={lane.id}
                  className={cn(
                    'grid h-7 grid-cols-[76px_132px_minmax(0,1fr)] border-b border-line-subtle last:border-b-0',
                    focused && 'bg-surface-sunken',
                  )}
                >
                  <span
                    className={cn(
                      LABEL,
                      'flex items-center border-l-2 px-3',
                      focused ? 'border-foreground text-foreground' : 'border-transparent',
                    )}
                  >
                    {lane.label}
                  </span>
                  <span className={cn(MONO, 'flex min-w-0 items-center gap-1.5 pr-2 text-foreground-secondary')}>
                    {scanning ? (
                      <span className="hv-scan-label font-mono text-[11px] uppercase tracking-[0.1em]">retrieving</span>
                    ) : lane.id === 'retrieve' && timeline.evidence.length > 0 ? (
                      <span>{timeline.evidence.length} hits</span>
                    ) : chip ? (
                      <>
                        <span className="truncate border border-line-default px-1 leading-4" title={chip.model}>
                          {chip.model}
                        </span>
                        {chip.tokensPerSecond !== null && (
                          <span className="shrink-0 text-foreground-muted">{chip.tokensPerSecond.toFixed(1)} tok/s</span>
                        )}
                      </>
                    ) : null}
                  </span>
                  {/* SCAN: only while the live child's retrieval stage holds. */}
                  <span className={cn('relative min-w-0 overflow-hidden', scanning && 'hv-scan')}>
                    {items.map((item) => (
                      <LaneMark key={item.key} item={item} pos={pos} live={liveNow} />
                    ))}
                    {lane.id === 'reason' && liveNow && view.openStage === 'reason' && token && (
                      <span
                        className={cn(MONO, 'pointer-events-none absolute inset-y-0 right-2 flex max-w-[70%] items-center text-foreground')}
                        title="The draft as it streams. Live only; not kept by the harness."
                      >
                        <span className="truncate [direction:rtl]">
                          <bdi>{tail ?? `${token.stage} · ${token.text.length} chars`}</bdi>
                        </span>
                        {/* CARET: the tail of a live token stream. */}
                        <span aria-hidden className="hv-caret text-foreground" />
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
          </ol>

          {/* Inspector: the focused lane's items, in measured figures. */}
          <div className="flex min-h-7 flex-col gap-0.5 border-t border-line-default px-3 py-1.5">
            <span className={LABEL}>
              {LANES.find((lane) => lane.id === focusedLane)?.label} · {focusedItems.length} item
              {focusedItems.length === 1 ? '' : 's'} · h/l to move
            </span>
            {focusedItems.slice(0, 6).map((item) => (
              <span key={item.key} className={cn(MONO, 'truncate text-foreground-secondary')} title={item.detail}>
                +{t0 !== null ? seconds(item.start - t0) : '—'}
                {item.end !== null && item.end !== item.start ? ` → +${seconds(item.end - (t0 ?? item.end))} (${seconds(item.end - item.start)})` : item.end === null ? ' → open' : ''}{' '}
                · <span className={TONE_TEXT[item.tone]}>{item.kind}</span> · {item.detail || item.label}
              </span>
            ))}
            {focusedLane === 'retrieve' && showHits && timeline.evidence.length > 0 && (
              <ul className="flex list-none flex-col p-0">
                {timeline.evidence.slice(0, 6).map((hit) => (
                  <li key={hit.id} className={cn(MONO, 'truncate text-foreground-secondary')}>
                    {hit.id} · {documentCode(hit.document)} · {sectionName(hit.location) || '—'} · score{' '}
                    <span className="text-foreground">{hit.score !== null ? hit.score.toFixed(3) : '—'}</span>
                  </li>
                ))}
              </ul>
            )}
            {noStageMarks && (
              <span className={cn(BODY, 'text-foreground-muted')}>
                This record predates stage marks: only its model and tool calls, which carry their own start times, are
                drawn.
              </span>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function LaneMark({ item, pos, live }: { item: LaneItem; pos: (t: number) => number; live: boolean }) {
  const left = pos(item.start)
  const right = item.end === null ? 100 : pos(item.end)
  const width = Math.max(right - left, 0)
  const style = { left: `${left}%`, width: `max(${width}%, ${item.kind === 'mark' ? 1 : 2}px)` } as CSSProperties
  const open = item.end === null

  if (item.kind === 'mark') {
    return (
      <span className="absolute inset-y-1 flex items-center" style={{ left: `${left}%` }} title={item.detail || item.label}>
        <span aria-hidden className={cn('h-full w-px', TONE_FILL[item.tone])} />
        <span className={cn(MONO, 'ml-1 whitespace-nowrap text-[10px]', TONE_TEXT[item.tone])}>{item.label}</span>
      </span>
    )
  }
  if (item.kind === 'model') {
    return (
      <span
        aria-hidden
        className="absolute bottom-[3px] h-[3px] bg-foreground-secondary"
        style={style}
        title={item.detail}
      />
    )
  }
  if (item.kind === 'tool') {
    return (
      <span
        className={cn(
          'absolute top-[9px] h-[10px] border bg-background',
          item.tone === 'critical' ? 'border-[var(--hv-critical)]' : 'border-foreground',
          open && 'border-r-0',
        )}
        style={style}
        title={item.detail}
      />
    )
  }
  return (
    <span
      className={cn(
        'absolute top-[5px] flex h-[14px] items-center overflow-hidden border px-1',
        open && live ? 'border-action bg-transparent' : 'border-line-strong bg-foreground/10',
        open && 'border-r-0',
      )}
      style={style}
      title={item.detail ? `${item.label} · ${item.detail}` : item.label}
    >
      <span className={cn(MONO, 'truncate text-[10px] text-foreground-secondary')}>{item.label}</span>
    </span>
  )
}
