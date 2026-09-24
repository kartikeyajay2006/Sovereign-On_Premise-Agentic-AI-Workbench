'use client'

import { memo } from 'react'
import type { EvidenceItem, ModelUsage, PipelineStage, VerificationCheck } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSecondClock } from '@/shared/motion'
import { MODEL_STAGE_TO_ROW } from '../model/board'
import type { AssistantTurn } from '../model/types'
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

/** A stage, said once it has happened. */
const DONE: Record<string, string> = {
  classify: 'Classified the request',
  plan: 'Planned the run',
  read: 'Read the attachments',
  retrieve: 'Searched the knowledge base',
  sandbox: 'Ran code in the sandbox',
  draft: 'Drafted the answer',
  verify: 'Checked every claim',
}

/** A stage, said while it happens. */
const ACTIVE: Record<string, string> = {
  classify: 'Reading the request',
  plan: 'Planning',
  read: 'Reading the attachments',
  retrieve: 'Searching the knowledge base',
  sandbox: 'Running code in the sandbox',
  draft: 'Drafting',
  verify: 'Checking every claim',
}

/** The verifier's checks, in the words a reader uses. */
export const CHECK_WORDS: Record<string, string> = {
  source_verification: 'Sources',
  calculation_verification: 'Calculations',
  code_verification: 'Code',
  page_citation_verification: 'Pages',
  document_verification: 'Document',
  hallucination_check: 'Grounding',
}

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
function citeLabel(item: EvidenceItem): string {
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

function Result({ children, tone }: { children: React.ReactNode; tone?: 'critical' }) {
  return (
    <div className={cn('flex gap-2 pl-[0.35rem]', tone === 'critical' ? 'text-critical-text' : 'text-foreground-muted')}>
      <span aria-hidden className="select-none">
        ⎿
      </span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  )
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
            {CHECK_WORDS[name] ?? name.replace(/_/g, ' ')}
            <span className="sr-only">{check.passed ? ' passed' : ' failed'}</span>
          </span>
        )
      })}
    </span>
  )
}

const SHOWN = new Set(['done', 'active', 'failed', 'denied'])

export const RunTranscript = memo(function RunTranscript({ turn }: { turn: AssistantTurn }) {
  const conversation = turn.profile?.taskType === 'conversation'
  const lines = turn.stages.filter((s) => SHOWN.has(s.status))
  const waiting = turn.outcome === 'running' && turn.queue !== null && turn.queue.ahead > 0

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
        const active = stage.status === 'active' && turn.outcome === 'running'
        const failed = stage.status === 'failed' || stage.status === 'denied'
        // The checks ran, and found something: the line says so in its bullet.
        const flagged = stage.id === 'verify' && !active && turn.verification.some((c) => !c.passed)
        const calls = callsFor(turn.usage, stage.id)
        let title = active ? ACTIVE[stage.id] ?? stage.name : DONE[stage.id] ?? stage.name
        if (stage.id === 'draft' && conversation) title = active ? 'Replying' : 'Replied'
        if (failed) title = `${ACTIVE[stage.id] ?? stage.name} failed`

        let note: string | null = null
        if (stage.id === 'classify' && turn.profile) {
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

        const sources = stage.id === 'retrieve' && !active ? turn.evidence.filter((e) => /^S\d+$/.test(e.id)) : []

        return (
          <li key={stage.id} className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2">
              {active ? (
                <Spinner />
              ) : (
                <span
                  aria-hidden
                  className={cn('inline-block w-[1ch] text-center', failed || flagged ? 'text-critical-text' : 'text-sovereign-text')}
                >
                  ●
                </span>
              )}
              <span className={cn('min-w-0 flex-1', active ? 'ae-shimmer font-medium' : failed ? 'text-critical-text' : 'text-foreground')}>
                {title}
                {active ? '…' : ''}
                {note && <span className="text-foreground-muted"> · {note}</span>}
              </span>
              <span className="tabular shrink-0 text-foreground-muted">
                {active ? <Dwell stage={stage} /> : stage.elapsedMs !== null ? formatSeconds(stage.elapsedMs) : null}
              </span>
            </div>

            {sources.length > 0 && (
              <Result>
                {sources.slice(0, 4).map(citeLabel).join(' · ')}
                {sources.length > 4 ? ` · +${sources.length - 4} more` : ''}
              </Result>
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
    </ol>
  )
})
