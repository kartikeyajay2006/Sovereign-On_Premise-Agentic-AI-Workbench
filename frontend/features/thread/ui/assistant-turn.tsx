'use client'

import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { BookOpen, ChevronDown, ChevronRight, Download, Lock } from 'lucide-react'
import { ErrorState } from '@/shared/ui/data/error-state'
import { DimScope, Disclose, Light, Refused, Release, Seal, useSecondClock } from '@/shared/motion'
import { cn } from '@/lib/utils'
import type { DeliverableContent, EvidenceItem, ModelDescriptor } from '@/lib/types'
import type { AssistantTurn as AssistantTurnModel } from '../model/types'
import { AegisLogo } from '@/components/aegis-logo'
import { AnswerActions } from './answer-actions'
import { IntegrityCard } from './integrity-card'
import { ClaimList } from '@/components/evidence/claim-list'
import { ConflictPanel } from '@/components/evidence/conflict-panel'
import { RunTranscript, citeLabel } from './run-transcript'
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

/**
 * Real elapsed against the turn's own start, in whole seconds, on the
 * page's one second clock. The run's measured duration, to the tenth,
 * replaces it when the run ends.
 */
function RunElapsed({ startedAt }: { startedAt: string }) {
  const now = useSecondClock()
  const started = Date.parse(startedAt)
  if (Number.isNaN(started)) return null
  return <span className="tabular">{Math.floor(Math.max(0, now - started) / 1000)}s</span>
}

const OUTCOME_LABEL: Record<AssistantTurnModel['outcome'], string> = {
  running: 'Working',
  delivered: 'Delivered',
  held: 'Held for review',
  rejected: 'Rejected',
  denied: 'Refused by policy',
  failed: 'Failed',
  blocked: 'Blocked',
  cancelled: 'Stopped',
}

/** The outcome as a pill: the fill says the state, the words say it too. */
const OUTCOME_PILL: Record<AssistantTurnModel['outcome'], string> = {
  running: 'bg-active-surface text-active-text',
  delivered: 'bg-sovereign-surface text-sovereign-text',
  held: 'bg-approval-surface text-approval-text',
  rejected: 'bg-critical-surface text-critical-text',
  denied: 'bg-critical-surface text-critical-text',
  failed: 'bg-critical-surface text-critical-text',
  blocked: 'bg-surface-sunken text-foreground-secondary',
  cancelled: 'bg-surface-sunken text-foreground-secondary',
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
 *
 * `trace` is the run the citations belong to. Every run numbers its
 * evidence from S1, so a trace id is the run and the citation together,
 * and hovering one run's [S1] never lights another run's source.
 */
function Inline({
  text,
  known,
  onCite,
  trace = null,
}: {
  text: string
  known: Set<string>
  onCite: Cite
  trace?: string | null
}) {
  // Anything written as a citation, including a malformed one like [V2.1],
  // so a marker that points at nothing is marked as such, never passed off
  // as prose.
  const parts = text.split(/(\[[A-Z]{1,3}\d+(?:\.\d+)*\])/g)
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[([A-Z]{1,3}\d+(?:\.\d+)*)\]$/)
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
            // TRACE: pairs the chip with its row in the evidence rail.
            data-trace={trace ? `${trace}:${id}` : undefined}
            className="mx-0.5 inline-flex h-[19px] items-center rounded-[6px] bg-surface-sunken px-1.5 align-[2px] text-[11px] font-semibold leading-none text-foreground-secondary transition-colors hover:bg-foreground hover:text-background focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
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
  trace = null,
}: {
  text: string
  known: Set<string>
  onCite: Cite
  className: string
  /** Rendered at the end of the last block: the draft's caret. */
  tail?: ReactNode
  /** The run whose citations these are, for tracing them to the rail. */
  trace?: string | null
}) {
  const blocks = blocksOf(text)
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, bi) => {
        const end = bi === blocks.length - 1 ? tail : null
        if (block.kind === 'heading') {
          return (
            <p key={bi} className={cn(className, 'font-medium text-foreground')}>
              <Inline text={block.text} known={known} onCite={onCite} trace={trace} />
              {end}
            </p>
          )
        }
        if (block.kind === 'list') {
          const items = block.items.map((item, ii) => (
            <li key={ii} className="pl-1 marker:text-foreground-muted">
              <Inline text={item} known={known} onCite={onCite} trace={trace} />
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
                <Inline text={line} known={known} onCite={onCite} trace={trace} />
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
  trace,
}: {
  text: string
  evidence: EvidenceItem[]
  onCite: (id: string) => void
  trace: string
}) {
  const known = new Set(evidence.map((e) => e.id))
  // The small model sometimes opens an answer with the citation it then
  // repeats at the end of the sentence: "[S1] A vessel ... 48 months. [S1]".
  // The opening one is dropped from the display when the same id cites the
  // text after it, so nothing it supports goes uncited; the record keeps
  // the text as written.
  const opening = text.match(/^\s*\[([SFVCEH]\d+)\]\s*/)
  const shown = opening && text.slice(opening[0].length).includes(`[${opening[1]}]`) ? text.slice(opening[0].length) : text
  // Full ink. This is the one thing on the screen the whole pipeline exists
  // to produce; it was set in secondary while the status rows above it were
  // not, which told the eye the machinery mattered more.
  return (
    <Prose
      text={shown}
      known={known}
      onCite={onCite}
      trace={trace}
      className="text-answer leading-[var(--lh-answer)] text-foreground"
    />
  )
}

const NO_EVIDENCE = new Set<string>()

/**
 * What the answer cites, by the document and section each one is: the row
 * under an answer that every search product has, kept to what this answer
 * actually cites. The chips inside the prose say "S5"; this says what S5 is,
 * without opening anything. Three at most, and the rest by count.
 */
function SourcesRow({
  text,
  evidence,
  onCite,
  trace,
}: {
  text: string
  evidence: EvidenceItem[]
  onCite: (id: string) => void
  trace: string
}) {
  const ids = Array.from(new Set((text.match(/\[[SFVCEH]\d+\]/g) ?? []).map((m) => m.slice(1, -1))))
  const cited = ids
    .map((id) => evidence.find((e) => e.id === id))
    .filter((e): e is EvidenceItem => e !== undefined)
  if (cited.length === 0) return null
  const shown = cited.slice(0, 3)
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Sources this answer cites">
      {shown.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onCite(item.id)}
          data-trace={`${trace}:${item.id}`}
          title={item.source_document ?? undefined}
          className="hover-decay inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-surface-sunken px-2.5 text-[12.5px] text-foreground-secondary hover:bg-[color-mix(in_oklab,var(--foreground)_9%,var(--background))] hover:text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
        >
          <span className="font-semibold text-foreground">{item.id}</span>
          <span className="truncate">{citeLabel(item)}</span>
        </button>
      ))}
      {cited.length > shown.length && (
        <button
          type="button"
          onClick={() => onCite(cited[shown.length].id)}
          className="hover-decay inline-flex h-7 items-center rounded-full px-2 text-[12.5px] text-foreground-muted hover:text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
        >
          +{cited.length - shown.length} more
        </button>
      )}
    </div>
  )
}

/** The folded log's one line: what was checked, against how much, at a glance. */
function workSummary(turn: AssistantTurnModel): string {
  const parts: string[] = []
  const checks = turn.verification
  if (checks.length > 0) {
    const passed = checks.filter((c) => c.passed).length
    parts.push(
      passed === checks.length
        ? `${passed} of ${checks.length} checks passed`
        : `${checks.length - passed} of ${checks.length} checks failed`,
    )
  }
  const sources = turn.evidence.filter((e) => /^S\d+$/.test(e.id)).length
  if (sources > 0) parts.push(`${sources} source${sources === 1 ? '' : 's'} searched`)
  if (parts.length === 0) parts.push('How it was answered')
  return parts.join(' · ')
}

/**
 * The generated file should not be a dead end. This is the exact structured
 * source sent to the renderer, kept beside the file so a reader can assess an
 * approval note without leaving the thread or downloading Office software.
 *
 * It deliberately does not attempt to emulate DOCX pagination or tables. The
 * file remains the release artifact; this is its accessible reading view.
 */
function DeliverableReader({
  content,
  answer,
  evidence,
  onCite,
  trace,
}: {
  content: DeliverableContent | null
  answer: string | null
  evidence: EvidenceItem[]
  onCite: (id: string) => void
  trace: string
}) {
  const [open, setOpen] = useState(true)
  const known = new Set(evidence.map((item) => item.id))
  const sections = content?.sections?.filter((section) => section.heading || section.body || section.bullets?.length) ?? []
  const findings = content?.findings?.filter((finding) => finding.description || finding.severity || finding.reference) ?? []
  const hasDocumentContent = Boolean(
    content?.title || content?.summary || sections.length || findings.length || content?.recommendation || content?.approval_statement,
  )

  // Older records predate structured preview storage. They still deserve a
  // useful in-place reading path, but are labelled as the verified answer so
  // nobody mistakes it for a recovered copy of the generated document.
  const heading = hasDocumentContent ? 'Read the note here' : 'Read the verified answer here'
  const description = hasDocumentContent
    ? 'This is the structured source rendered into the attached file.'
    : 'This run predates document previews; the checked answer is shown here instead.'

  return (
    <div className="basis-full border-t border-line-default pt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="hover-decay flex w-full items-center justify-between gap-3 text-left focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
      >
        <span className="flex min-w-0 items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 shrink-0 text-foreground-secondary" aria-hidden />
          <span className="min-w-0">
            <span className="block text-ui font-medium text-foreground">{heading}</span>
            <span className="block truncate text-meta text-foreground-muted">{description}</span>
          </span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-foreground-muted transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <section className="mt-3 border-l-2 border-line-strong pl-4 pr-1" aria-label={heading}>
          {hasDocumentContent ? (
            <div className="flex flex-col gap-5">
              {content?.title && (
                <div>
                  <h3 className="text-heading font-medium tracking-[-0.018em] text-foreground">{content.title}</h3>
                  {content.reference && <p className="mt-1 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">Reference · {content.reference}</p>}
                </div>
              )}
              {content?.summary && (
                <div>
                  <p className="mb-1.5 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">Executive summary</p>
                  <Prose text={content.summary} known={known} onCite={onCite} trace={trace} className="text-body leading-[var(--lh-answer)] text-foreground" />
                </div>
              )}
              {sections.map((section, index) => (
                <div key={`${section.heading ?? 'section'}-${index}`}>
                  {section.heading && <h4 className="mb-1.5 text-ui font-medium text-foreground">{section.heading}</h4>}
                  {section.body && <Prose text={section.body} known={known} onCite={onCite} trace={trace} className="text-body leading-[var(--lh-answer)] text-foreground" />}
                  {section.bullets && section.bullets.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-body leading-[var(--lh-answer)] text-foreground">
                      {section.bullets.map((bullet, bulletIndex) => (
                        <li key={bulletIndex}><Inline text={bullet} known={known} onCite={onCite} trace={trace} /></li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {findings.length > 0 && (
                <div>
                  <p className="mb-1.5 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">Findings</p>
                  <ul className="divide-y divide-line-subtle border-y border-line-subtle">
                    {findings.map((finding, index) => (
                      <li key={index} className="py-2.5 text-body text-foreground">
                        {finding.description && <Inline text={finding.description} known={known} onCite={onCite} trace={trace} />}
                        {(finding.severity || finding.reference) && (
                          <span className="mt-1 flex flex-wrap gap-x-2 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                            {finding.severity && <span>{finding.severity}</span>}
                            {finding.reference && <Inline text={finding.reference} known={known} onCite={onCite} trace={trace} />}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {content?.recommendation && (
                <div>
                  <p className="mb-1.5 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">Recommendation</p>
                  <Prose text={content.recommendation} known={known} onCite={onCite} trace={trace} className="text-body leading-[var(--lh-answer)] text-foreground" />
                </div>
              )}
              {content?.approval_statement && (
                <div className="border-l-2 border-approval pl-3">
                  <p className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-approval-text">Approval sought</p>
                  <p className="mt-1 text-body leading-[var(--lh-answer)] text-foreground"><Inline text={content.approval_statement} known={known} onCite={onCite} trace={trace} /></p>
                </div>
              )}
            </div>
          ) : answer ? (
            <AnswerProse text={answer} evidence={evidence} onCite={onCite} trace={trace} />
          ) : (
            <p className="text-body text-foreground-muted">No readable content was recorded for this file.</p>
          )}
        </section>
      )}
    </div>
  )
}

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
  const held = turn.outcome === 'held'
  // What the answer's release lights, read from the record: held for a
  // person is amber whatever its checks said, delivered with every check
  // passed is green, and anything else has earned no light at all.
  const verdict = held
    ? 'approval'
    : turn.outcome === 'delivered' && checkCount > 0 && verifiedCount === checkCount
      ? 'sovereign'
      : null
  const heldForReview = held && turn.deliverable !== null && !turn.deliverable.released

  /*
    The work log is open while the run is live and folds to one line when an
    answer is released, the way a coding agent's steps collapse once it has
    replied. A run that ended any other way -- refused, failed, stopped --
    keeps it open, because then the log is the explanation. A run opened
    from the record starts folded.
  */
  const foldable = !running && (turn.outcome === 'delivered' || held || turn.outcome === 'rejected')
  const [logOpen, setLogOpen] = useState(!foldable)
  const wasRunning = useRef(running)
  useEffect(() => {
    if (wasRunning.current && !running) setLogOpen(!foldable)
    wasRunning.current = running
  }, [running, foldable])

  return (
    <article className="flex flex-col gap-4">
      {/* ── Zone 1 — run header ───────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <AegisLogo variant="mark" size={26} />
        {/* LIGHT: settle() reading awaiting_approval -- HELD blooms once as
            the run is held while it is watched. The key is the run, which a
            held run opened from the record already has, so it stays unlit. */}
        <Light
          as="span"
          tone={held ? 'approval' : null}
          bloomKey={held ? turn.taskId : null}
          className={cn(
            'inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium',
            OUTCOME_PILL[turn.outcome],
          )}
        >
          <span aria-hidden className={cn('size-1.5 rounded-full bg-current', running && 'animate-pulse motion-reduce:animate-none')} />
          {running && turn.stopRequested ? 'Stopping' : OUTCOME_LABEL[turn.outcome]}
        </Light>

        <span className="flex items-center gap-3 text-[12.5px] text-foreground-muted">
          {running && turn.stream === 'live' ? (
            <RunElapsed startedAt={turn.startedAt} />
          ) : !running && turn.elapsedMs !== null ? (
            <span className="tabular">{(turn.elapsedMs / 1000).toFixed(1)} s</span>
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

        {foldable && (
          <button
            type="button"
            aria-expanded={logOpen}
            onClick={() => setLogOpen((open) => !open)}
            className="hover-decay -mx-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[12.5px] text-foreground-muted hover:text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
          >
            {workSummary(turn)}
            <ChevronRight
              aria-hidden
              className={cn(
                'size-3.5 transition-transform duration-[var(--micro)] ease-[var(--ease-micro)]',
                logOpen && 'rotate-90',
              )}
            />
          </button>
        )}
      </header>

      {/*
        REFUSE: a policy denial settles here. The work log recedes and the
        refusal alone stays lit, so the one thing left to read is the reason.
        The scope is always present, so a refusal dims the log where it
        stands instead of remounting it.
      */}
      <DimScope dimmed={denied} className="flex flex-col">
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
        <div data-dim-item className={cn('ae-fold', logOpen && 'open')} inert={!logOpen}>
          <div className="min-h-0 overflow-hidden">
            <div className="flex flex-col gap-2 pb-4">
              <RunTranscript turn={turn} />
              {/* What it cost, folded with the steps it was spent on. */}
              {!running && (
                <UsageFooter usage={turn.usage} choices={[]} models={models} workedMs={turn.elapsedMs} withNotes={false} />
              )}
            </div>
          </div>
        </div>

        {/* ── Zone 3 — the answer, or the reason there is none ──────────── */}
        {denied ? (
          /*
            The label is ink, not critical-text: on the refusal's wash that
            measured 4.47:1, under AA for 10px type. The state is carried by
            the critical rule drawn down the edge and the rim that stays.
          */
          <Refused data-dim-item data-dim-keep className="wash-critical py-3 pl-4 pr-4">
            <p className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground">
              Refused by policy
            </p>
            {/* The reason opens in step with the board receding, if it
                arrives after the refusal itself. */}
            <Disclose tempo="hold" open={Boolean(turn.denialReason)}>
              <p className="pt-1.5 text-body text-foreground">{turn.denialReason}</p>
            </Disclose>
            {!turn.denialReason && (
              <p className="mt-1.5 text-body text-foreground-secondary">The service recorded no reason.</p>
            )}
          </Refused>
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
          /*
            RELEASE: settle() -- the checked answer arrives once. It rises into
            place at full opacity and its verdict blooms around it and lets
            go. A run opened from the record was read, not released, so its
            answer is simply there. The padding gives the light room; the
            negative margin keeps the text on the column's edge.
          */
          <Release verdict={verdict} released={turn.releasedLive} className="-mx-3 -my-2 flex flex-col gap-3 px-3 py-2">
            {turn.outcome === 'rejected' && (
              <p className="border-l-2 border-critical-border pl-3 text-body text-foreground-secondary">
                <span className="text-critical-text">Rejected at review</span>
                {turn.approval?.reviewerName ? ` by ${turn.approval.reviewerName}` : ''}
                {turn.approval?.comment ? `: “${turn.approval.comment}”.` : '.'}
                {turn.deliverable ? ' Its deliverable was not released.' : ''}
              </p>
            )}
            <AnswerProse text={turn.answer as string} evidence={turn.evidence} onCite={cite} trace={turn.id} />
            <SourcesRow text={turn.answer as string} evidence={turn.evidence} onCite={cite} trace={turn.id} />
          </Release>
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
          <div className="border-l-2 border-line-default pl-4">
            <p className="text-[12.5px] text-foreground-muted">
              {verifying ? 'Draft · checking every claim before it is released' : 'Draft · not checked yet'}
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
                : 'The answer appears here once every claim in it is checked.'}
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
      </DimScope>

      {/* ── Zone 3½ — the integrity decision ──────────────────────────
          Computed by the formula registry from the evidence, not by the
          model: every figure carries the C item that holds its formula,
          inputs and hash. Shown once the run has settled, beside the answer
          it constrains. */}
      {turn.conflicts.length > 0 && !running && (
        <ConflictPanel conflicts={turn.conflicts} taskId={turn.taskId ?? ''} onCite={cite} />
      )}
      {turn.assessment && !running && (
        <IntegrityCard
          assessment={turn.assessment}
          records={turn.calculations}
          conflicts={turn.conflicts}
          onCite={cite}
        />
      )}
      {turn.claims.length > 0 && !running && <ClaimList claims={turn.claims} onCite={cite} />}

      {/* ── Zone 4 — the deliverable ──────────────────────────────────── */}
      {turn.deliverable && (
        <div
          className={cn(
            'grouped flex flex-wrap items-center justify-between gap-3 px-4 py-3',
            // Held for a person: the state falls across the row from its top
            // edge. On the wash the words stay ink and the lock carries the
            // hue, because approval-text has almost no margin there.
            heldForReview && 'wash-approval',
          )}
        >
          {/* Baseline, not centre: the seal carries its rule in padding
              under the hash, which would lift it off the line. */}
          <span className="flex min-w-0 items-baseline gap-2 font-mono text-meta">
            <span className="truncate-cell text-foreground">{turn.deliverable.filename}</span>
            <span className="tabular shrink-0 text-foreground-muted">
              {turn.deliverable.sizeKb} kB
            </span>
            {/*
              SEAL: settle() -- a released deliverable's hash commits as the
              run is released: a rule drawn under the whole value, then a
              mark. One still held keeps the dashed, unsealed rule, which is
              true: it has not been released. Opened from the record, a
              released one is shown sealed, without the ceremony.
            */}
            <Seal
              sealed={turn.deliverable.released}
              token={turn.deliverable.sha256}
              drawOnMount={turn.releasedLive}
              srLabel={turn.deliverable.released ? 'released' : 'not released'}
              className="shrink-0"
            >
              <span className="text-foreground-muted">sha256:{turn.deliverable.sha256.slice(0, 8)}…</span>
            </Seal>
          </span>

          {/* The record's own release flag decides, not the outcome: a
              rejected run's document was never released, and a Download
              button on it was a link to a 403. */}
          {!turn.deliverable.released ? (
            <span
              className={cn(
                'flex items-center gap-1.5 font-mono text-meta',
                turn.outcome === 'rejected' ? 'text-critical-text' : 'text-foreground-secondary',
              )}
            >
              {/* The lock is the held state's glyph, so it takes the fill hue. */}
              <Lock className={cn('h-3 w-3', turn.outcome !== 'rejected' && 'text-approval')} aria-hidden />
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

          <DeliverableReader
            content={turn.deliverableContent}
            answer={showsAnswer ? turn.answer : null}
            evidence={turn.evidence}
            onCite={cite}
            trace={turn.id}
          />
        </div>
      )}

      {/* ── Zone 5 — what to do with it, and what it cost ─────────────── */}
      {(!running || turn.modelChoices.some((c) => c.preferenceHonoured === false)) && (
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
          {/* Only what the reader did not expect -- a model request that was
              not honoured, an answer cut off at its limit. The figures are in
              the fold above. */}
          <UsageFooter usage={turn.usage} choices={turn.modelChoices} models={models} notesOnly />
        </footer>
      )}
    </article>
  )
})
