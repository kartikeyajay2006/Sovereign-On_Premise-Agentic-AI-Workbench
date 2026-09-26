'use client'

import { memo, useEffect, useRef } from 'react'
import type { EvidenceItem, ModelUsage, PipelineStage, VerificationCheck } from '@/lib/types'
import { checkLabel } from '@/lib/presentation'
import { cn } from '@/lib/utils'
import { Append, useSecondClock } from '@/shared/motion'
import { MODEL_STAGE_TO_ROW, STAGE_ACTIVE, STAGE_DONE } from '../model/board'
import type { AssistantTurn } from '../model/types'
import { CiteChip } from './cite-chip'
import { formatCount, formatRate, formatSeconds } from '../model/usage'

/**
 * The run as a transcript: a line per stage that ran, and under it, after a
 * ⎿, what came back.
 *
 * It is the shape a coding agent reports its work in, in a terminal, and it
 * is borrowed for the same reason: a bullet that appears when a step has
 * happened, with its result hanging under it, reads as a record rather than
 * a progress bar. Only what the backend reported is written. A stage that
 * did not run has no line -- a greyed-out row for it read as a step taken
 * and skipped -- and the one under way says what it is doing, for as long
 * as it has been doing it.
 */

const DONE = STAGE_DONE
const ACTIVE = STAGE_ACTIVE

/**
 * The compute row's words, from what the registry actually did. The
 * engineering phase also walks a drawing's graph and records where sources
 * contradict each other; "Computed with registered formulas" over a run that
 * withheld every figure, or only read a P&ID, would say something it did not.
 */
function computeTitle(turn: AssistantTurn, active: boolean): string {
  if (turn.assessment?.status === 'conflicted') {
    return active ? 'Checking the formula inputs' : 'Withheld the calculation: sources disagree'
  }
  if (turn.assessment?.status === 'cannot_calculate') {
    return active ? 'Checking the formula inputs' : 'Could not calculate from the evidence'
  }
  if (turn.topology && !turn.assessment) {
    return active ? "Walking the drawing's graph" : "Walked the drawing's graph"
  }
  return active ? ACTIVE.compute : DONE.compute
}

/** The verifier's checks, in the words a reader uses: see lib/presentation. */
export { CHECK_WORDS } from '@/lib/presentation'

/**
 * The glyph a working line carries. It turns on the compositor: the glyph
 * it replaced was swapped by a timer eight times a second, a render and a
 * repaint each, while the model held the CPU. Still, for a reader who asked
 * for less motion.
 */
function Spinner() {
  return (
    <span aria-hidden className="ae-spin inline-block w-[1ch] text-center text-[var(--accent-glyph,var(--foreground))]">
      ✻
    </span>
  )
}

/**
 * Time in the stage under way: the backend's own start, counted on this
 * clock in whole seconds. The stage's measured time replaces it, to the
 * tenth, once the stage ends.
 */
function Dwell({ stage }: { stage: PipelineStage }) {
  const now = useSecondClock()
  const start = stage.at ? Date.parse(stage.at) : Number.NaN
  if (Number.isNaN(start)) return null
  return <>{Math.floor(((stage.elapsedMs ?? 0) + Math.max(0, now - start)) / 1000)}s</>
}

/** "SOP-INS-014 §2.2" from a document title and a "section: 2.2 …" location. */
export function citeLabel(item: EvidenceItem): string {
  const code = (item.source_document ?? '').split(' — ')[0].trim() || item.id
  // "section: 1. Purpose" names section 1, not "1.".
  const section = item.location?.match(/section:\s*(\d+(?:\.\d+)*)/i)?.[1]
  return section ? `${code} §${section}` : code
}

/** The calls a row made, in order. */
function callsFor(usage: readonly ModelUsage[], row: string): ModelUsage[] {
  return usage.filter((u) => MODEL_STAGE_TO_ROW[u.stage] === row)
}

/** One call's cost, as the runtime reported it; a figure it did not report is left out. */
function callLine(call: ModelUsage): string {
  const name = call.display_name || call.model
  if (call.cancelled) return `${name} · stopped after ${formatSeconds(call.latency_ms)}`
  const parts = [name]
  if (call.prompt_tokens !== null) parts.push(`${formatCount(call.prompt_tokens)} in`)
  if (call.output_tokens !== null) parts.push(`${formatCount(call.output_tokens)} out`)
  if (call.tokens_per_second !== null) parts.push(formatRate(call.tokens_per_second))
  if (call.load_ms !== null && call.load_ms >= 1000) parts.push(`loaded in ${formatSeconds(call.load_ms)}`)
  return parts.join(' · ')
}

const RESULT_TONE = {
  critical: 'text-critical-text',
  approval: 'text-approval-text',
} as const

function Result({
  children,
  tone,
  title,
  arrival,
}: {
  children: React.ReactNode
  tone?: keyof typeof RESULT_TONE
  title?: string
  /**
   * Set for a line an event added while the reader watched: its place in
   * the batch that arrived with it. It mounts with the Append motion; a
   * line read from the record (outside a live AppendScope) lands still.
   */
  arrival?: number
}) {
  const body = (
    <>
      <span aria-hidden className="select-none">
        ⎿
      </span>
      <span className="min-w-0 flex-1 break-words" title={title}>
        {children}
      </span>
    </>
  )
  const className = cn('flex gap-2 pl-[0.35rem]', tone ? RESULT_TONE[tone] : 'text-foreground-muted')
  if (arrival === undefined) return <div className={className}>{body}</div>
  return (
    <Append index={arrival} className={cn('thread-sub', className)}>
      {body}
    </Append>
  )
}

/**
 * Each new line's place in the batch it arrived with, for the stagger.
 * A line seen in an earlier render is not new; the ones first seen in this
 * render are numbered in order. Append fixes the number at mount, so a
 * later batch does not renumber a line still settling.
 */
function useArrival(): (key: string) => number {
  const committed = useRef(new Set<string>())
  const fresh: string[] = []
  useEffect(() => {
    for (const key of fresh) committed.current.add(key)
  })
  return (key: string) => {
    if (committed.current.has(key)) return 0
    const at = fresh.indexOf(key)
    if (at !== -1) return at
    fresh.push(key)
    return fresh.length - 1
  }
}

/** Sources listed one per line before the rest are counted. */
const SOURCES_SHOWN = 5

function figure(value: number, digits = 2): string {
  return String(Number(value.toFixed(digits)))
}

/**
 * The registry's result as one line: only the fields it computed, and the C
 * item that carries the governing figure. A decision withheld for a conflict
 * says so and computes nothing; one missing an input names the input.
 */
function calculationLine(turn: AssistantTurn): { text: string; cite: string | null } | null {
  const a = turn.assessment
  if (!a) return null
  const governing =
    turn.calculations.find((r) => a.governing_location && r.subject === `${a.subject} · ${a.governing_location}`)
      ?.evidence_id ?? a.evidence_ids?.[0] ?? null
  if (a.status === 'conflicted') return { text: 'withheld: sources disagree', cite: null }
  if (a.status === 'cannot_calculate') {
    return { text: `cannot calculate: missing ${a.missing.join(', ') || 'required inputs'}`, cite: governing }
  }
  const parts: string[] = []
  if (a.governing_location) parts.push(a.governing_location)
  if (typeof a.governing_rate_mm_yr === 'number') parts.push(`${figure(a.governing_rate_mm_yr, 4)} mm/y`)
  if (typeof a.remaining_life_years === 'number') parts.push(`${figure(a.remaining_life_years)} y remaining`)
  if (a.severity) parts.push(a.severity.charAt(0).toUpperCase() + a.severity.slice(1))
  if (a.withdraw_from_service) parts.push('withdraw from service')
  else if (a.next_due) parts.push(`next ${a.next_due}`)
  if (parts.length === 0) return null
  return { text: parts.join(' · '), cite: governing }
}

function Checks({ checks }: { checks: VerificationCheck[] }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5">
      {checks.map((check, i) => {
        const name = check.name ?? check.kind ?? check.label ?? `check ${i + 1}`
        return (
          <span key={`${name}-${i}`} title={check.detail} className={check.passed ? undefined : 'text-critical-text'}>
            <span aria-hidden className={check.passed ? 'text-sovereign-text' : undefined}>
              {check.passed ? '✓' : '✕'}
            </span>{' '}
            {checkLabel(name)}
            <span className="sr-only">{check.passed ? ' passed' : ' failed'}</span>
          </span>
        )
      })}
    </span>
  )
}

const SHOWN = new Set(['done', 'active', 'failed', 'denied'])

// A redaction and a plain pass are both policy `allow`; the reason beside it
// says which ("Each value is redacted…"), so the label does not guess.
const SCAN_DECISION: Record<string, string> = {
  allow: 'recorded',
  require_approval: 'held for a person',
  deny: 'blocked',
}

export const RunTranscript = memo(function RunTranscript({
  turn,
  onCite,
}: {
  turn: AssistantTurn
  /** Opens a cited item in the rail. */
  onCite?: (id: string) => void
}) {
  const conversation = turn.profile?.taskType === 'conversation'
  const known = new Set(turn.evidence.map((e) => e.id))
  const calculation = calculationLine(turn)
  const running = turn.outcome === 'running'
  const arrival = useArrival()
  const noted = new Set(turn.notes.map((n) => n.stage))
  // A skipped stage is shown only when the backend said why: that is a
  // decision the run made, and the reason is the record of it. One the
  // end-of-run sweep marked skipped because nothing reported it stays out.
  // A stage with no stage event of its own -- reading a text attachment is a
  // tool call -- is shown as working once an event under it has arrived.
  const lines = turn.stages.filter(
    (s) =>
      SHOWN.has(s.status) ||
      (s.status === 'skipped' && Boolean(s.detail)) ||
      (s.status === 'pending' && running && noted.has(s.id)),
  )
  const waiting = running && turn.queue !== null && turn.queue.ahead > 0
  // Once the run has ended, a content-scanning finding is listed in full
  // under "Content scanned"; its live line would say it twice.
  const scanReasons = running ? [] : turn.scans.map((scan) => scan.reason).filter(Boolean)
  const notesFor = (row: string) =>
    turn.notes.filter(
      (n) => n.stage === row && !(n.kind === 'policy' && scanReasons.some((r) => (n.title ?? n.text).includes(r))),
    )

  if (lines.length === 0 && !waiting) return null

  return (
    <ol
      aria-label="What the run did"
      className="thread-log m-0 flex list-none flex-col gap-1.5 rounded-[14px] border border-line-subtle px-3.5 py-3 font-mono text-[12.5px] leading-[1.6]"
    >
      {waiting && turn.queue && (
        <li className="flex items-baseline gap-2 text-foreground-secondary">
          <Spinner />
          <span>
            Waiting for the local worker · {turn.queue.ahead} run{turn.queue.ahead === 1 ? '' : 's'} ahead
          </span>
        </li>
      )}
      {lines.map((stage) => {
        const active = (stage.status === 'active' || stage.status === 'pending') && running
        const failed = stage.status === 'failed' || stage.status === 'denied'
        const skipped = stage.status === 'skipped'
        // The checks ran, and found something: the line says so in its bullet.
        const flagged = stage.id === 'verify' && !active && turn.verification.some((c) => !c.passed)
        const calls = callsFor(turn.usage, stage.id)
        let title = active ? ACTIVE[stage.id] ?? stage.name : DONE[stage.id] ?? stage.name
        if (stage.id === 'compute') title = computeTitle(turn, active)
        if (stage.id === 'draft' && conversation) title = active ? 'Replying' : 'Replied'
        if (failed) title = `${ACTIVE[stage.id] ?? stage.name} failed`
        // Skipped by the run's own decision, or cut off by a stop.
        // A backend skip enters with no start time; a stopped stage had one.
        if (skipped) title = turn.outcome === 'cancelled' && stage.at ? `${stage.name} stopped` : `${stage.name} skipped`

        let note: string | null = null
        if (skipped) {
          note = null
        } else if (stage.id === 'classify' && turn.profile) {
          note = `${turn.profile.taskType.replace(/_/g, ' ')} · ${turn.profile.sensitivity}`
        } else if (stage.id === 'retrieve' && !active) {
          const passages = turn.evidence.filter((e) => e.kind === 'knowledge_base' || /^S\d+$/.test(e.id)).length
          note = `${passages} passage${passages === 1 ? '' : 's'}`
        } else if (stage.id === 'verify' && !active && turn.verification.length > 0) {
          const passed = turn.verification.filter((c) => c.passed).length
          note = `${passed} of ${turn.verification.length} passed`
        } else if (stage.id === 'read' && turn.request && turn.request.attachments.length > 0) {
          note = `${turn.request.attachments.length} file${turn.request.attachments.length === 1 ? '' : 's'}`
        }

        // Listed as they arrive, not when the stage closes: what retrieval
        // found is on screen while the run goes on to use it.
        const sources = stage.id === 'retrieve' ? turn.evidence.filter((e) => /^S\d+$/.test(e.id)) : []
        const notes = notesFor(stage.id)

        return (
          <li key={stage.id} className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2">
              {active ? (
                <Spinner />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    'inline-block w-[1ch] text-center',
                    skipped ? 'text-foreground-muted' : failed || flagged ? 'text-critical-text' : 'text-sovereign-text',
                  )}
                >
                  {skipped ? '○' : '●'}
                </span>
              )}
              <span
                className={cn(
                  'min-w-0 flex-1',
                  active ? 'ae-shimmer font-medium' : failed ? 'text-critical-text' : skipped ? 'text-foreground-secondary' : 'text-foreground',
                )}
              >
                {title}
                {active ? '…' : ''}
                {note && <span className="text-foreground-muted"> · {note}</span>}
              </span>
              <span className="tabular shrink-0 text-foreground-muted">
                {active ? <Dwell stage={stage} /> : stage.elapsedMs !== null ? formatSeconds(stage.elapsedMs) : null}
              </span>
            </div>

            {/* The backend's own words for what the stage is doing, or why it
                did not run. Never templated here. */}
            {(active || skipped) && stage.detail && <Result>{stage.detail}</Result>}
            {stage.id === 'compute' && calculation && (
              <Result
                key={`calc:${calculation.text}`}
                arrival={arrival(`calc:${calculation.text}`)}
                tone={turn.assessment?.status === 'calculated' ? undefined : 'approval'}
              >
                <span className={turn.assessment?.status === 'calculated' ? 'text-foreground' : undefined}>
                  {calculation.text}
                </span>
                {calculation.cite && (
                  <>
                    {' '}
                    <CiteChip id={calculation.cite} resolved={known.has(calculation.cite)} onCite={onCite} trace={turn.id} />
                  </>
                )}
              </Result>
            )}
            {notes.map((n) => (
              <Result key={n.key} tone={n.tone} title={n.title} arrival={arrival(n.key)}>
                {n.text}
              </Result>
            ))}
            {sources.slice(0, SOURCES_SHOWN).map((item) => (
              <Result key={`source:${item.id}`} arrival={arrival(`source:${item.id}`)} title={item.source_document}>
                <span className="text-foreground-secondary">{item.id}</span> {citeLabel(item)}
              </Result>
            ))}
            {sources.length > SOURCES_SHOWN && (
              <Result>+{sources.length - SOURCES_SHOWN} more</Result>
            )}
            {calls.map((call, i) => (
              <Result key={`${call.started_at}-${i}`}>{callLine(call)}</Result>
            ))}
            {active && stage.id === 'plan' && turn.streamProgress && (
              <Result>{formatCount(turn.streamProgress.chars)} characters received</Result>
            )}
            {stage.id === 'verify' && !active && turn.verification.length > 0 && (
              <Result>
                <Checks checks={turn.verification} />
              </Result>
            )}
            {failed && turn.error && <Result tone="critical">{turn.error}</Result>}
          </li>
        )
      })}
      {turn.scans.length > 0 && turn.outcome !== 'running' && (
        <li className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <span
              aria-hidden
              className={cn(
                'inline-block w-[1ch] text-center',
                turn.scans.some((scan) => scan.decision === 'deny') ? 'text-critical-text' : 'text-approval-text',
              )}
            >
              ●
            </span>
            <span className="min-w-0 flex-1 text-foreground">
              Content scanned
              <span className="text-foreground-muted">
                {' '}
                · {turn.scans.length} boundar{turn.scans.length === 1 ? 'y' : 'ies'} acted on
              </span>
            </span>
          </div>
          {turn.scans.map((scan, i) => (
            <Result key={`${scan.boundary}-${i}`} tone={scan.decision === 'deny' ? 'critical' : undefined}>
              <span title={scan.rule ?? undefined}>
                {scan.boundary} · {SCAN_DECISION[scan.decision] ?? scan.decision} · {scan.reason}
              </span>
            </Result>
          ))}
        </li>
      )}
    </ol>
  )
})
