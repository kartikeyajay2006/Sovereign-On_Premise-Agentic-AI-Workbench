'use client'

import { useEffect, useState } from 'react'
import { Download, Lock } from 'lucide-react'
import { StageTimeline } from '@/shared/ui/timeline/stage-timeline'
import { ErrorState } from '@/shared/ui/data/error-state'
import { cn } from '@/lib/utils'
import type { EvidenceItem } from '@/lib/types'
import type { AssistantTurn as AssistantTurnModel } from '../model/types'

/**
 * One governed run, rendered as one turn.
 *
 * The ordering here is the point, and it is inverted from every other chat
 * product. Normally the prose is the content and the machinery is hidden.
 * Here the machinery IS the content while the run is live, and the prose
 * arrives at the end as one complete, already-verified object.
 *
 * That inversion is forced by an honesty constraint, not by taste. Streaming
 * tokens would show a reader unverified text and then retroactively badge it
 * as unsupported — the worst possible order of operations for a product
 * about verification. A skeleton would be worse: it implies content of that
 * shape is arriving, when retrieval might return nothing at all. And a
 * determinate progress bar for a local model's generation would be a number
 * we cannot compute.
 *
 * So there is no streamed prose, no skeleton and no progress bar. What moves
 * during the twenty to sixty seconds of a run is three things, all measured:
 * stage rows changing state, a dwell counter counting real elapsed time on
 * the active stage, and evidence rows accumulating as they are retrieved.
 */

/** Runs at 10Hz against the turn's own start time. Real elapsed, nothing else. */
function RunElapsed({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [])
  const started = Date.parse(startedAt)
  if (Number.isNaN(started)) return null
  const ms = Math.max(0, now - started)
  return <span className="tabular">{(ms / 1000).toFixed(1)}s</span>
}

const OUTCOME_LABEL: Record<AssistantTurnModel['outcome'], string> = {
  running: 'RUNNING',
  delivered: 'DELIVERED',
  held: 'HELD',
  denied: 'DENIED',
  failed: 'FAILED',
  blocked: 'BLOCKED',
  cancelled: 'CANCELLED',
}

const OUTCOME_TONE: Record<AssistantTurnModel['outcome'], string> = {
  running: 'text-active-text',
  delivered: 'text-sovereign-text',
  held: 'text-approval-text',
  denied: 'text-critical-text',
  failed: 'text-critical-text',
  blocked: 'text-foreground-muted',
  cancelled: 'text-foreground-muted',
}

/** Parses [S1]-style citations and marks any that resolve to nothing. */
/**
 * Renders one run of plain text, applying the small amount of inline
 * markdown a local model actually emits.
 *
 * The model returns markdown whether or not anyone asked it to, and printing
 * it raw put literal asterisks in the answer — "The severity applies as
 * **Medium** under SOP-MNT-022" — on the one piece of prose the whole
 * pipeline exists to produce. That is a small thing that makes the output
 * look unfinished.
 *
 * Deliberately not a markdown library. Three inline forms are handled, no
 * block constructs, and nothing is parsed as HTML, so a document that
 * arrives carrying markup cannot inject anything: every branch produces a
 * text node inside an element this function chose.
 */
function InlineMarkdown({ text }: { text: string }) {
  const tokens = text.split(/(\*\*[^*\n]+\*\*|(?<!\*)\*[^*\n]+\*(?!\*)|`[^`\n]+`)/g)
  return (
    <>
      {tokens.map((t, i) => {
        if (/^\*\*[^*\n]+\*\*$/.test(t)) {
          return (
            <strong key={i} className="font-medium text-foreground">
              {t.slice(2, -2)}
            </strong>
          )
        }
        if (/^`[^`\n]+`$/.test(t)) {
          return (
            <code
              key={i}
              className="rounded-[var(--radius-xs)] bg-surface-sunken px-1 font-mono text-meta"
            >
              {t.slice(1, -1)}
            </code>
          )
        }
        if (/^\*[^*\n]+\*$/.test(t)) {
          return <em key={i}>{t.slice(1, -1)}</em>
        }
        return <span key={i}>{t}</span>
      })}
    </>
  )
}

function AnswerProse({
  text,
  evidence,
  onCite,
}: {
  text: string
  evidence: EvidenceItem[]
  onCite: (id: string) => void
}) {
  const known = new Set(evidence.map((e) => e.id))

  // Blank lines are paragraph breaks. The model writes in paragraphs and
  // whitespace-pre-wrap rendered them as a single slab.
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0)

  return (
    <div className="flex flex-col gap-4">
      {paragraphs.map((para, pi) => {
        const parts = para.split(/(\[[SFVCXH]\d+\])/g)
        return (
          <p key={pi} className="text-answer leading-[var(--lh-answer)] text-foreground-secondary">
            {parts.map((p, i) => {
              const m = p.match(/^\[([SFVCXH]\d+)\]$/)
              if (!m) return <InlineMarkdown key={i} text={p} />
              const id = m[1]
              if (!known.has(id)) {
                // A citation that leads nowhere is a finding about the answer,
                // not a link. Rendering it as an ordinary chip lends the
                // sentence the appearance of support the verifier refused it.
                return (
                  <span
                    key={i}
                    title={`No evidence with id ${id} was recorded for this run.`}
                    className="mx-0.5 inline-flex items-center gap-1 border border-dashed border-critical-border px-1 align-middle font-mono text-meta text-critical-text"
                  >
                    <span className="line-through">{id}</span> unresolved
                  </span>
                )
              }
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onCite(id)}
                  className="hover-decay mx-0.5 inline-flex items-center border border-control-default px-1 align-middle font-mono text-meta text-foreground hover:border-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                >
                  {id}
                </button>
              )
            })}
          </p>
        )
      })}
    </div>
  )
}

export function AssistantTurn({
  turn,
  onCite,
}: {
  turn: AssistantTurnModel
  onCite?: (evidenceId: string) => void
}) {
  const running = turn.outcome === 'running'
  const denied = turn.outcome === 'denied'
  const failed = turn.outcome === 'failed'

  const verifiedCount = turn.verification.filter((v) => v.passed).length
  const checkCount = turn.verification.length

  return (
    <article className="flex flex-col gap-4">
      {/* ── Zone 1 — run header ───────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-default pb-2 font-mono text-meta">
        <span className={cn('font-medium uppercase tracking-[var(--ls-meta)]', OUTCOME_TONE[turn.outcome])}>
          {OUTCOME_LABEL[turn.outcome]}
        </span>

        <span className="flex items-center gap-4 text-foreground-muted">
          {/* No verdict strip while running. There are no verdicts yet, and
              zeroes would be five specific claims we cannot make. */}
          {checkCount > 0 && (
            <span className="tabular">
              {verifiedCount}/{checkCount} checks passed
            </span>
          )}
          {running ? (
            <RunElapsed startedAt={turn.startedAt} />
          ) : turn.elapsedMs !== null ? (
            <span className="tabular">{(turn.elapsedMs / 1000).toFixed(1)}s</span>
          ) : null}
          {turn.stream === 'closed' && !running && (
            <span title="This turn is no longer attached to the event stream.">detached</span>
          )}
        </span>
      </header>

      {/* ── Zone 2 — the work log ─────────────────────────────────────── */}
      <StageTimeline
        stages={turn.stages.map((s) => ({
          id: s.id,
          index: s.index,
          label: s.name,
          state: s.status,
          at: s.at,
          elapsedMs: s.elapsedMs,
          headline: s.detail ?? null,
          model: s.model || null,
        }))}
        density="compact"
      />

      {/* ── Zone 3 — the answer, or the reason there is none ──────────── */}
      {denied ? (
        <div className="border border-critical-border bg-critical-surface px-4 py-3">
          <p className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-critical-text">
            Refused by policy
          </p>
          <p className="mt-1.5 text-body text-foreground">
            {turn.denialReason || 'A rule prohibited this request. It was not executed.'}
          </p>
        </div>
      ) : failed ? (
        <ErrorState
          headline="The run did not complete."
          nextAction="The stage that failed is marked above. Dispatch again once the cause is resolved."
          detail={turn.error ?? undefined}
          identifier={turn.taskId ? { label: 'Task', value: turn.taskId } : undefined}
        />
      ) : turn.answer === null ? (
        /*
          Reserved, not absent. The region holds its height while the answer
          is null so the column does not jump when the verified answer lands.
          One sentence, no spinner, no shimmer — and it is not an apology for
          a missing feature. It is the product's thesis, stated on the screen
          a reviewer is guaranteed to be looking at, at the moment they are
          guaranteed to be watching. Every other AI product in the room is
          streaming text it has not checked.
        */
        <div className="flex min-h-[48px] items-center">
          <p className="text-body text-foreground-secondary">
            Answer withheld until claim verification completes.
          </p>
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-1 duration-[var(--dur-enter)] ease-[var(--ease-enter)]">
          <AnswerProse text={turn.answer} evidence={turn.evidence} onCite={onCite ?? (() => {})} />
        </div>
      )}

      {/* ── Zone 4 — the deliverable ──────────────────────────────────── */}
      {turn.deliverable && (
        <div className="grouped flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="flex min-w-0 items-center gap-2 font-mono text-meta">
            <span className="truncate-cell text-foreground">{turn.deliverable.filename}</span>
            <span className="tabular shrink-0 text-foreground-muted">
              {turn.deliverable.sizeKb} kB
            </span>
            <span className="truncate-cell shrink-0 text-foreground-muted">
              sha256:{turn.deliverable.sha256.slice(0, 8)}…
            </span>
          </span>

          {turn.outcome === 'held' ? (
            <span className="flex items-center gap-1.5 font-mono text-meta text-approval-text">
              <Lock className="h-3 w-3" aria-hidden /> held for review
            </span>
          ) : (
            <a
              href={turn.deliverable.download_url}
              className="btn"
              data-variant="secondary"
              data-size="sm"
              data-ground="paper"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Download
            </a>
          )}
        </div>
      )}
    </article>
  )
}
