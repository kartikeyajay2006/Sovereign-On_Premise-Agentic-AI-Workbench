'use client'

import { memo, useEffect, useState, type ReactNode } from 'react'
import { ChevronRight, Download, Lock } from 'lucide-react'
import { StageTimeline } from '@/shared/ui/timeline/stage-timeline'
import { ErrorState } from '@/shared/ui/data/error-state'
import { cn } from '@/lib/utils'
import type { EvidenceItem, ModelDescriptor } from '@/lib/types'
import type { AssistantTurn as AssistantTurnModel } from '../model/types'
import { AnswerActions } from './answer-actions'
import { UsageFooter } from './usage-footer'

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
 * So there is no skeleton and no progress bar. What moves during a run is
 * all measured: stage rows changing state, a dwell counter counting real
 * elapsed time on the active stage, evidence rows accumulating as they are
 * retrieved, the draft in its own provisional register, and -- under it --
 * each model call's cost as the runtime reports it.
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
  rejected: 'REJECTED',
  denied: 'DENIED',
  failed: 'FAILED',
  blocked: 'BLOCKED',
  cancelled: 'STOPPED',
}

const OUTCOME_TONE: Record<AssistantTurnModel['outcome'], string> = {
  running: 'text-active-text',
  delivered: 'text-sovereign-text',
  held: 'text-approval-text',
  rejected: 'text-critical-text',
  denied: 'text-critical-text',
  failed: 'text-critical-text',
  blocked: 'text-foreground-muted',
  cancelled: 'text-foreground-muted',
}

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
 * Deliberately not a markdown library. Three inline forms are handled, and
 * nothing is parsed as HTML, so a document that arrives carrying markup
 * cannot inject anything: every branch produces a text node inside an
 * element this function chose.
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

type Cite = ((id: string) => void) | null

/**
 * Inline text with its citations resolved. A citation that resolves to
 * recorded evidence is a button; one that resolves to nothing is marked on
 * the sentence rather than linked. With no `onCite` -- the draft -- they are
 * plain text, because a draft's citations have not been checked yet.
 */
function Inline({ text, known, onCite }: { text: string; known: Set<string>; onCite: Cite }) {
  const parts = text.split(/(\[[SFVCE]\d+\])/g)
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[([SFVCE]\d+)\]$/)
        if (!m) return <InlineMarkdown key={i} text={p} />
        const id = m[1]
        if (!onCite) {
          return (
            <span key={i} className="font-mono text-[0.85em] text-foreground-muted">
              {p}
            </span>
          )
        }
        if (!known.has(id)) {
          // A citation that leads nowhere is a finding about the answer,
          // not a link, so it is marked rather than linked -- but as a mark
          // on the sentence rather than a box beside it. Five bordered chips
          // reading "S1 unresolved" outweighed the prose they annotated,
          // inverting what the reader is meant to come away with. The
          // tooltip carries the detail.
          return (
            <sup
              key={i}
              title={`No evidence with id ${id} was recorded for this run. This citation supports nothing.`}
              className="mx-px cursor-help font-mono text-[0.68em] text-critical-text decoration-dotted underline-offset-2 [text-decoration-line:underline]"
            >
              {id}
            </sup>
          )
        }
        return (
          <button
            key={i}
            type="button"
            onClick={() => onCite(id)}
            className="hover-decay mx-px rounded-[var(--radius-xs)] bg-surface px-1 align-super font-mono text-[0.68em] text-foreground-secondary hover:bg-surface-sunken hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            {id}
          </button>
        )
      })}
    </>
  )
}

const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+/
const HEADING = /^\s*#{1,6}\s+/

type Block =
  | { kind: 'text'; lines: string[] }
  | { kind: 'list'; ordered: boolean; start: number; items: string[] }
  | { kind: 'heading'; text: string }

/**
 * Paragraphs, lists and headings -- the three block shapes a local model
 * writes. A paragraph used to be the only one: a bulleted list arrived as
 * one run-on line of "- a - b - c", because a single newline inside a <p>
 * is whitespace. Still no HTML and still no library: lines are sorted into
 * blocks and each block is text nodes inside elements chosen here.
 *
 * A list continues across a blank line, and a numbered one keeps the number
 * it was written with, so "1. a", blank, "2. b" does not render as two
 * lists that both begin at 1.
 */
function blocksOf(text: string): Block[] {
  const blocks: Block[] = []
  for (const paragraph of text.split(/\n{2,}/)) {
    if (!paragraph.trim()) continue
    for (const line of paragraph.split('\n')) {
      if (!line.trim()) continue
      const last = blocks[blocks.length - 1]
      if (HEADING.test(line)) {
        blocks.push({ kind: 'heading', text: line.replace(HEADING, '') })
      } else if (LIST_ITEM.test(line)) {
        const number = line.match(/^\s*(\d+)/)
        const ordered = number !== null
        const item = line.replace(LIST_ITEM, '')
        if (last && last.kind === 'list' && last.ordered === ordered) last.items.push(item)
        else blocks.push({ kind: 'list', ordered, start: number ? Number(number[1]) : 1, items: [item] })
      } else if (last && last.kind === 'text') {
        last.lines.push(line)
      } else {
        blocks.push({ kind: 'text', lines: [line] })
      }
    }
    // A blank line ends a paragraph: the next text line opens a new one.
    if (blocks[blocks.length - 1]?.kind === 'text') blocks.push({ kind: 'text', lines: [] })
  }
  return blocks.filter((b) => b.kind !== 'text' || b.lines.length > 0)
}

function Prose({
  text,
  known,
  onCite,
  className,
  tail,
}: {
  text: string
  known: Set<string>
  onCite: Cite
  className: string
  /** Rendered at the end of the last block: the draft's caret. */
  tail?: ReactNode
}) {
  const blocks = blocksOf(text)
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, bi) => {
        const end = bi === blocks.length - 1 ? tail : null
        if (block.kind === 'heading') {
          return (
            <p key={bi} className={cn(className, 'font-medium text-foreground')}>
              <Inline text={block.text} known={known} onCite={onCite} />
              {end}
            </p>
          )
        }
        if (block.kind === 'list') {
          const items = block.items.map((item, ii) => (
            <li key={ii} className="pl-1 marker:text-foreground-muted">
              <Inline text={item} known={known} onCite={onCite} />
              {ii === block.items.length - 1 ? end : null}
            </li>
          ))
          // Block lists with space-y rather than flex: an <li> keeps its
          // marker only while it is laid out as a list item.
          return block.ordered ? (
            <ol key={bi} start={block.start} className={cn(className, 'list-decimal space-y-1 pl-6')}>
              {items}
            </ol>
          ) : (
            <ul key={bi} className={cn(className, 'list-disc space-y-1 pl-5')}>
              {items}
            </ul>
          )
        }
        return (
          <p key={bi} className={className}>
            {block.lines.map((line, li) => (
              <span key={li}>
                {li > 0 && <br />}
                <Inline text={line} known={known} onCite={onCite} />
              </span>
            ))}
            {end}
          </p>
        )
      })}
    </div>
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
  // Full ink. This is the one thing on the screen the whole pipeline exists
  // to produce; it was set in secondary while the status rows above it were
  // not, which told the eye the machinery mattered more.
  return (
    <Prose
      text={text}
      known={known}
      onCite={onCite}
      className="text-answer leading-[var(--lh-answer)] text-foreground"
    />
  )
}

/** The stage rows, mapped once for both the live and the folded view. */
function RunLog({ stages }: { stages: AssistantTurnModel['stages'] }) {
  return (
    <StageTimeline
      stages={stages.map((s) => ({
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
  )
}

const NO_EVIDENCE = new Set<string>()

export const AssistantTurn = memo(function AssistantTurn({
  turn,
  onCite,
  onRerun,
  busy = false,
  canReview = false,
  models = null,
}: {
  turn: AssistantTurnModel
  onCite?: (turnId: string, evidenceId: string) => void
  onRerun?: (turnId: string) => void
  /** Another run is in flight, so this one cannot be re-run yet. */
  busy?: boolean
  canReview?: boolean
  models?: ModelDescriptor[] | null
}) {
  const running = turn.outcome === 'running'
  const denied = turn.outcome === 'denied'
  const blocked = turn.outcome === 'blocked'
  const failed = turn.outcome === 'failed'
  const cancelled = turn.outcome === 'cancelled'
  // Only an answer that finished its checks is shown as one. A stopped run
  // can carry a drafted answer in its record; it never finished verifying.
  const showsAnswer =
    turn.answer !== null &&
    (turn.outcome === 'delivered' || turn.outcome === 'held' || turn.outcome === 'rejected')

  const verifiedCount = turn.verification.filter((v) => v.passed).length
  const checkCount = turn.verification.length
  const verifying = turn.stages.some((s) => s.id === 'verify' && s.status === 'active')
  const cite = onCite ? (id: string) => onCite(turn.id, id) : () => {}

  return (
    <article className="flex flex-col gap-4">
      {/* ── Zone 1 — run header ───────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-default pb-2 font-mono text-meta">
        <span className={cn('font-medium uppercase tracking-[var(--ls-meta)]', OUTCOME_TONE[turn.outcome])}>
          {running && turn.stopRequested ? 'STOPPING' : OUTCOME_LABEL[turn.outcome]}
        </span>

        <span className="flex items-center gap-4 text-foreground-muted">
          {/* No verdict strip while running. There are no verdicts yet, and
              zeroes would be five specific claims we cannot make. */}
          {checkCount > 0 && (
            <span className="tabular">
              {verifiedCount}/{checkCount} checks passed
            </span>
          )}
          {running && turn.stream === 'live' ? (
            <RunElapsed startedAt={turn.startedAt} />
          ) : !running && turn.elapsedMs !== null ? (
            <span className="tabular">{(turn.elapsedMs / 1000).toFixed(1)}s</span>
          ) : null}
          {/* The case this label exists for: a run that still reads as
              running but is no longer attached to anything that would tell
              us otherwise. On a finished turn it said nothing a reader
              needed, and on every one of them. */}
          {running && turn.stream === 'closed' && (
            <span title="This turn is not attached to the event stream, so it is not updating.">
              detached
            </span>
          )}
        </span>
      </header>

      {/* ── Zone 2 — the work log ─────────────────────────────────────── */}
      {/*
        Expanded while the run is live, collapsed once it is not.

        Seven rows is the right amount of detail for the minutes you spend
        watching a run and the wrong amount afterwards: four of them are
        typically stages that never ran, so a finished turn was spending
        ~350px -- more than the answer -- on greyed-out placeholders. The
        detail is not deleted, it is folded, because the point of the log is
        that it can be checked. The answer gets to be the biggest thing on
        the screen, which for an answering product it always should have been.
      */}
      {running ? (
        <RunLog stages={turn.stages} />
      ) : (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 py-1 font-mono text-meta text-foreground-muted transition-colors hover:text-foreground-secondary [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="size-3 shrink-0 transition-transform duration-[var(--micro)] ease-[var(--ease-micro)] group-open:rotate-90"
              aria-hidden
            />
            <span className="uppercase tracking-[var(--ls-meta)]">Work log</span>
            <span className="tabular">
              {turn.stages.filter((s) => s.status === 'done').length} of {turn.stages.length} stages
            </span>
          </summary>
          <div className="pt-2">
            <RunLog stages={turn.stages} />
          </div>
        </details>
      )}

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
      ) : blocked ? (
        /*
          Not "refused by policy". A run is blocked when no model could be
          routed to one of its stages, and the reason is as often a runtime
          that is not running, or a model that is not installed, as it is a
          classification rule. The backend's reason follows verbatim; the
          heading claims only what is true of every case.
        */
        <div className="border-l-2 border-line-strong pl-4">
          <p className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
            Blocked — no eligible model
          </p>
          <p className="mt-1.5 text-body text-foreground">
            {turn.denialReason || 'No installed, approved model could serve a stage of this run.'}
          </p>
        </div>
      ) : failed ? (
        <ErrorState
          headline="The run did not complete."
          nextAction="The stage that failed is marked above. Dispatch again once the cause is resolved."
          detail={turn.error ?? undefined}
          identifier={turn.taskId ? { label: 'Task', value: turn.taskId } : undefined}
        />
      ) : cancelled ? (
        <div className="border-l-2 border-line-strong pl-4">
          <p className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
            Stopped
          </p>
          <p className="mt-1.5 text-body text-foreground-secondary">
            {turn.denialReason && turn.denialReason !== 'Stopped at your request.'
              ? turn.denialReason
              : 'Stopped at your request.'}{' '}
            A stopped run releases no answer: it ended before finishing the checks an answer is
            released on.
          </p>
        </div>
      ) : showsAnswer ? (
        <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-1 duration-[var(--dur-enter)] ease-[var(--ease-enter)]">
          {turn.outcome === 'rejected' && (
            <p className="border-l-2 border-critical-border pl-3 text-body text-foreground-secondary">
              <span className="text-critical-text">Rejected at review</span>
              {turn.approval?.reviewerName ? ` by ${turn.approval.reviewerName}` : ''}
              {turn.approval?.comment ? `: “${turn.approval.comment}”.` : '.'}
              {turn.deliverable ? ' Its deliverable was not released.' : ''}
            </p>
          )}
          <AnswerProse text={turn.answer as string} evidence={turn.evidence} onCite={cite} />
        </div>
      ) : !running ? (
        <p className="text-body text-foreground-secondary">This run finished without an answer.</p>
      ) : turn.streamingDraft ? (
        /*
          The draft, live, in a register that cannot be mistaken for the
          answer: receded ink, a rail, and a label that says what it is. The
          thesis above is unchanged -- this text is never promoted, it is
          replaced when the checked answer arrives. What it buys is the four
          minutes of a CPU run not being a blank rectangle.
        */
        <div className="border-l-2 border-line-strong pl-4">
          <p className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
            {verifying ? 'Draft — verifying its claims before release' : 'Drafting — not yet verified'}
          </p>
          <div className="mt-2">
            <Prose
              text={turn.streamingDraft}
              known={NO_EVIDENCE}
              onCite={null}
              className="text-body text-foreground-secondary"
              tail={
                verifying ? null : (
                  <span
                    aria-hidden
                    className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-foreground-muted motion-safe:animate-pulse"
                  />
                )
              }
            />
          </div>
        </div>
      ) : (
        /*
          Reserved, not absent. The region holds its height while the answer
          is null so the column does not jump when the verified answer lands.
          One sentence, no spinner, no shimmer.
        */
        <div className="flex min-h-[48px] flex-col justify-center gap-1.5">
          <p className="text-body text-foreground-secondary">
            {turn.queue && turn.queue.ahead > 0
              ? `Waiting to start: ${turn.queue.ahead} run${turn.queue.ahead === 1 ? '' : 's'} ahead of this one on the local worker.`
              : 'Answer withheld until claim verification completes.'}
          </p>
          {turn.streamProgress && (
            /*
              Planning is the longest stage of a CPU run and produced
              nothing on screen. This is a measured count of characters
              actually received, not a simulated progress bar -- it moves
              because the model is producing, and it stops when it stops.
            */
            <p className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
              {turn.streamProgress.stage} ·{' '}
              <span className="tabular">{turn.streamProgress.chars.toLocaleString()}</span> chars
            </p>
          )}
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

          {/* The record's own release flag decides, not the outcome: a
              rejected run's document was never released, and a Download
              button on it was a link to a 403. */}
          {!turn.deliverable.released ? (
            <span
              className={cn(
                'flex items-center gap-1.5 font-mono text-meta',
                turn.outcome === 'rejected' ? 'text-critical-text' : 'text-approval-text',
              )}
            >
              <Lock className="h-3 w-3" aria-hidden />
              {turn.outcome === 'rejected' ? 'not released' : 'held for review'}
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

      {/* ── Zone 5 — what to do with it, and what it cost ─────────────── */}
      {(!running ||
        turn.usage.length > 0 ||
        turn.modelChoices.some((c) => c.preferenceHonoured === false)) && (
        <footer className="flex flex-col gap-2">
          {!running && (
            <AnswerActions
              answer={showsAnswer ? turn.answer : null}
              evidence={turn.evidence}
              onRerun={turn.request && onRerun ? () => onRerun(turn.id) : undefined}
              rerunDisabled={busy}
              held={turn.outcome === 'held'}
              approverRoles={turn.approval?.approverRoles ?? []}
              reasons={turn.approval?.reasons ?? []}
              canReview={canReview}
            />
          )}
          <UsageFooter usage={turn.usage} choices={turn.modelChoices} models={models} />
        </footer>
      )}
    </article>
  )
})
