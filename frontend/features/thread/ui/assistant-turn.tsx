'use client'

import { spokenDuration } from '@/lib/duration'
import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { BookOpen, ChevronDown, ChevronRight, Download, Lock } from 'lucide-react'
import { ErrorState } from '@/shared/ui/data/error-state'
import {
  AppendScope,
  DimScope,
  Disclose,
  Light,
  Refused,
  Release,
  Seal,
  useReducedMotion,
  useSecondClock,
} from '@/shared/motion'
import { cn } from '@/lib/utils'
import type { DeliverableContent, EvidenceItem, ModelDescriptor } from '@/lib/types'
import type { AssistantTurn as AssistantTurnModel } from '../model/types'
import { AegisLogo } from '@/components/aegis-logo'
import { AnswerActions } from './answer-actions'
import { IntegrityCard } from './integrity-card'
import { TopologyCard } from './topology-card'
import { ClaimList } from '@/components/evidence/claim-list'
import { ConflictPanel } from '@/components/evidence/conflict-panel'
import { RunTranscript, citeLabel } from './run-transcript'
import { CITE_CHIP } from './cite-chip'
import { Inline, type Cite } from './inline'
import { BriefAnswer } from './brief'
import { answerShape } from '../model/brief'
import { CiteButton, EvidenceCardScope } from './evidence-card'
import { HeldBlock } from './held-block'
import { followUps, type FollowUp } from '../model/follow-ups'
import { STAGE_ACTIVE } from '../model/board'
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

/** The draft's exit, matched to --micro in globals.css (.thread-draft-leave). */
const DRAFT_LEAVE_MS = 120

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
  lede = null,
  evidence,
  onCite,
  trace,
}: {
  text: string
  /** A first paragraph that is one sentence, set as the lede above the rest. */
  lede?: string | null
  evidence: EvidenceItem[]
  onCite: (id: string) => void
  trace: string
}) {
  const known = new Set(evidence.map((e) => e.id))
  // Full ink. This is the one thing on the screen the whole pipeline exists
  // to produce; it was set in secondary while the status rows above it were
  // not, which told the eye the machinery mattered more.
  return (
    <div className="flex flex-col gap-3">
      {lede && (
        <p className="brief-lede">
          <Inline text={lede} known={known} onCite={onCite} trace={trace} />
        </p>
      )}
      <Prose
        text={text}
        known={known}
        onCite={onCite}
        trace={trace}
        className="text-answer leading-[var(--lh-answer)] text-foreground"
      />
    </div>
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
  const ids = Array.from(new Set((text.match(/\[[A-Z]{1,3}\d+(?:\.\d+)*\]/g) ?? []).map((m) => m.slice(1, -1))))
  const cited = ids
    .map((id) => evidence.find((e) => e.id === id))
    .filter((e): e is EvidenceItem => e !== undefined)
  if (evidence.length === 0) return null
  const shown = cited.slice(0, 3)
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Sources this answer cites">
      {/* Both counts from the record: what the run recorded, and how many
          of the ids the answer cites resolve to it. */}
      <span className="mr-1 font-mono text-[10.5px] uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
        {evidence.length} source{evidence.length === 1 ? '' : 's'} · {cited.length} cited
      </span>
      {shown.map((item) => (
        <CiteButton
          key={item.id}
          id={item.id}
          onCite={onCite}
          trace={trace}
          className="hover-decay inline-flex h-7 max-w-full items-center gap-1.5 rounded-[var(--radius-xs)] border border-line-subtle px-2 text-[12.5px] text-foreground-secondary hover:border-line-default hover:text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
        >
          <span className={cn(CITE_CHIP, 'h-[18px] px-1')}>{item.id}</span>
          <span className="truncate">{citeLabel(item)}</span>
        </CiteButton>
      ))}
      {cited.length > shown.length && (
        <button
          type="button"
          onClick={() => onCite(cited[shown.length].id)}
          className="hover-decay inline-flex h-7 items-center rounded-[var(--radius-xs)] px-2 text-[12.5px] text-foreground-muted hover:text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
        >
          +{cited.length - shown.length} more
        </button>
      )}
    </div>
  )
}

/** "2m 14s", "48s": the run's measured duration, as a person says it. */
function workedFor(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

/**
 * The folded log's one line: how long it worked, what was checked, against
 * how much. Each part only when the record measured it -- a run with no
 * duration on record does not get one made up.
 */
function workSummary(turn: AssistantTurnModel): string {
  const parts: string[] = []
  if (turn.elapsedMs !== null) parts.push(`Worked ${workedFor(turn.elapsedMs)}`)
  const checks = turn.verification
  if (checks.length > 0) {
    const passed = checks.filter((c) => c.passed).length
    parts.push(
      passed === checks.length
        ? `${passed} of ${checks.length} checks`
        : `${checks.length - passed} of ${checks.length} checks failed`,
    )
  }
  const sources = turn.evidence.filter((e) => /^S\d+$/.test(e.id)).length
  if (sources > 0) parts.push(`${sources} source${sources === 1 ? '' : 's'}`)
  if (parts.length === 0) parts.push('Work log')
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
  evidence,
  onCite,
  trace,
}: {
  content: DeliverableContent | null
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

  // Older records predate structured preview storage. Their fallback was the
  // verified answer again, directly under the same answer in the turn: the
  // reader saw every sentence twice and learned nothing new. With no document
  // source to show, the file card stands alone.
  if (!hasDocumentContent) return null
  const heading = 'Read the note'
  const description = 'The source the attached file was rendered from'

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
            {/* Written from the severity formula (SOP-OPS-008), never by the model. */}
            {content?.authority && (
              <p className="text-meta leading-[var(--lh-answer)] text-foreground-secondary">
                <span className="font-medium text-foreground">Who decides.</span>{' '}
                <Inline text={content.authority} known={known} onCite={onCite} trace={trace} />
              </p>
            )}
            {/* Written from the CMMS lookup (W evidence), never by the model. */}
            {content?.maintenance && (
              <p className="text-meta leading-[var(--lh-answer)] text-foreground-secondary">
                <span className="font-medium text-foreground">Repair raised?</span>{' '}
                <Inline text={content.maintenance} known={known} onCite={onCite} trace={trace} />
              </p>
            )}
          </div>
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
  onReleased,
  onFollowUp,
}: {
  turn: AssistantTurnModel
  /** A follow-up chip was picked: fill the composer with it. Never sends. */
  onFollowUp?: (turnId: string, followUp: FollowUp) => void
  onCite?: (turnId: string, evidenceId: string) => void
  onRerun?: (turnId: string) => void
  /** The checked answer of a live release is in place, at `element`. */
  onReleased?: (turnId: string, element: HTMLElement) => void
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
  const nextSteps = followUps(turn)
  // How the answer is set: a Brief, markdown as written, or plain.
  const shape = showsAnswer ? answerShape(turn) : null
  const failedStage = failed ? turn.stages.find((s) => s.status === 'failed') ?? null : null

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
  const foldRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (wasRunning.current && !running) {
      // Not out from under the reader: a log being pointed at or read with
      // the keyboard when the answer lands stays open. Its toggle folds it.
      const log = foldRef.current
      const inUse = Boolean(log && (log.matches(':hover') || log.contains(document.activeElement)))
      if (!inUse) setLogOpen(!foldable)
    }
    wasRunning.current = running
  }, [running, foldable])

  /*
    The hand-over from draft to answer. The draft does not vanish in the
    frame the checked answer arrives: it fades (120ms, ease-exit) inside a
    box held at its measured height, so the column does not collapse under
    the reader, and then the answer mounts and rises into the same place.
    Only on a live release; a run read from the record has no draft.
  */
  const reduced = useReducedMotion()
  const draftBoxRef = useRef<HTMLDivElement | null>(null)
  const draftHeightRef = useRef(0)
  const lastDraftRef = useRef<string | null>(null)
  if (turn.streamingDraft) lastDraftRef.current = turn.streamingDraft
  useLayoutEffect(() => {
    if (draftBoxRef.current) draftHeightRef.current = draftBoxRef.current.offsetHeight
  })
  const [leavingDraft, setLeavingDraft] = useState<{ text: string; height: number } | null>(null)
  const [answerShown, setAnswerShown] = useState(showsAnswer)
  if (answerShown !== showsAnswer) {
    setAnswerShown(showsAnswer)
    if (showsAnswer && turn.releasedLive && lastDraftRef.current && !reduced) {
      setLeavingDraft({ text: lastDraftRef.current, height: draftHeightRef.current })
    }
  }
  useEffect(() => {
    if (!leavingDraft) return
    const timer = window.setTimeout(() => setLeavingDraft(null), DRAFT_LEAVE_MS)
    return () => window.clearTimeout(timer)
  }, [leavingDraft])

  // Once the released answer is in place, the thread brings its top into
  // view. Once per mount: a re-read of the record does not move the page.
  const answerRef = useRef<HTMLDivElement | null>(null)
  const announcedRef = useRef(false)
  useEffect(() => {
    if (announcedRef.current || leavingDraft || !showsAnswer || !turn.releasedLive || !answerRef.current) return
    announcedRef.current = true
    onReleased?.(turn.id, answerRef.current)
  }, [leavingDraft, showsAnswer, turn.releasedLive, turn.id, onReleased])

  return (
    <EvidenceCardScope turn={turn} onOpen={cite}>
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
            'inline-flex h-[22px] items-center gap-1.5 rounded-[var(--radius-xs)] px-2 font-mono text-[10.5px] font-semibold uppercase tracking-[var(--ls-ledger)]',
            OUTCOME_PILL[turn.outcome],
          )}
        >
          <span aria-hidden className={cn('size-1.5 bg-current', running && 'animate-pulse motion-reduce:animate-none')} />
          {running && turn.stopRequested ? 'Stopping' : OUTCOME_LABEL[turn.outcome]}
        </Light>

        <span className="flex items-center gap-3 font-mono text-[10.5px] tracking-[var(--ls-ledger)] text-foreground-muted">
          {running && turn.stream === 'live' ? (
            <RunElapsed startedAt={turn.startedAt} />
          ) : !running && turn.elapsedMs !== null ? (
            <span className="tabular">{spokenDuration(turn.elapsedMs)}</span>
          ) : null}
          {/* The case this label exists for: a run that still reads as
              running but is no longer attached to anything that would tell
              us otherwise. On a finished turn it said nothing a reader
              needed, and on every one of them. */}
          {running && turn.stream === 'closed' && (
            <span className="uppercase" title="Not attached to the event stream, so not updating">
              detached
            </span>
          )}
        </span>

        {foldable && (
          <button
            type="button"
            aria-expanded={logOpen}
            onClick={() => setLogOpen((open) => !open)}
            className="hover-decay -mx-1.5 inline-flex items-center gap-1 rounded-[var(--radius-xs)] px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[var(--ls-ledger)] text-foreground-muted hover:bg-surface-sunken hover:text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
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
        <div ref={foldRef} data-dim-item className={cn('ae-fold', logOpen && 'open')} inert={!logOpen}>
          <div className="min-h-0 overflow-hidden">
            <div className="flex flex-col gap-2 pb-4">
              {/* Mounted with the turn, so a line an event adds later is an
                  arrival and one read from the record is not. */}
              <AppendScope>
                <RunTranscript turn={turn} onCite={onCite ? cite : undefined} />
              </AppendScope>
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
          /* Names the stage the board marked failed, in the transcript's own
             words, and carries its own Run again: the reader should not have
             to find the actions row under a failure to try once more. */
          <ErrorState
            headline={
              failedStage
                ? `The run failed while ${(STAGE_ACTIVE[failedStage.id] ?? failedStage.name).toLowerCase()}.`
                : turn.taskId
                  ? 'The run did not complete.'
                  : 'The run did not start.'
            }
            nextAction={
              failedStage
                ? `${failedStage.name} is marked failed in the log above. Fix the cause below, then run it again.`
                : 'No stage ran. Fix the cause below, then run it again.'
            }
            // A run opened from the record carries its error as the record's
            // `error` field, which the turn keeps as denialReason.
            detail={turn.error ?? turn.denialReason ?? undefined}
            identifier={turn.taskId ? { label: 'Run', value: turn.taskId } : undefined}
            retry={turn.request && onRerun ? () => onRerun(turn.id) : undefined}
            retryLabel="Run again"
            retryDisabled={busy}
            retryTitle={busy ? 'One run at a time. Available when this one ends.' : 'Send the same request as a new run'}
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
              A stopped run releases no answer: its checks never finished.
            </p>
          </div>
        ) : showsAnswer && leavingDraft ? (
          /* The draft leaving, at the height it had, for 120ms. */
          <div style={{ minHeight: leavingDraft.height }} aria-hidden>
            <div className="thread-draft-leave border-l-2 border-line-default pl-4">
              <p className="font-mono text-[10.5px] uppercase tracking-[var(--ls-ledger)] text-foreground-muted">Draft</p>
              <div className="mt-2">
                <Prose text={leavingDraft.text} known={NO_EVIDENCE} onCite={null} className="text-body text-foreground-secondary" />
              </div>
            </div>
          </div>
        ) : showsAnswer ? (
          /*
            RELEASE: settle() -- the checked answer arrives once. It rises 8px
            into place over 300ms (ease-spatial) and its verdict blooms around
            it once and lets go. A run opened from the record was read, not
            released, so its answer is simply there. The padding gives the
            light room; the negative margin keeps the text on the column's edge.
          */
          <div ref={answerRef}>
          {shape?.kind === 'brief' ? (
            /* The Brief rises row by row itself, so its light blooms
               without the block-level rise Release adds. */
            <Light
              tone={turn.releasedLive ? verdict : null}
              rest="none"
              bloomOnMount={turn.releasedLive}
              className="-mx-3 -my-2 rounded-[var(--radius)] px-3 py-2"
            >
              <BriefAnswer turn={turn} brief={shape} onCite={cite} live={turn.releasedLive && !reduced} />
            </Light>
          ) : (
            <Release verdict={verdict} released={turn.releasedLive} className="-mx-3 -my-2 flex flex-col gap-3 px-3 py-2">
              <AnswerProse
                text={shape ? shape.body : (turn.answer as string)}
                lede={shape?.kind === 'structured' ? shape.lede : null}
                evidence={turn.evidence}
                onCite={cite}
                trace={turn.id}
              />
              <SourcesRow text={turn.answer as string} evidence={turn.evidence} onCite={cite} trace={turn.id} />
            </Release>
          )}
          {/* Directly under the answer: why it is held, who releases it,
              what is withheld -- and, once decided, the decision. */}
          <div className="mt-4 empty:hidden">
            <HeldBlock turn={turn} canReview={canReview} />
          </div>
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
          <div ref={draftBoxRef} className="border-l-2 border-line-default pl-4">
            <p className="font-mono text-[10.5px] uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
              {verifying ? 'Draft · checking every claim' : 'Draft · not checked yet'}
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
                ? `Queued: ${turn.queue.ahead} run${turn.queue.ahead === 1 ? '' : 's'} ahead on the local worker.`
                : 'The answer lands here once every claim is checked.'}
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
      {turn.topology && !running && <TopologyCard topology={turn.topology} onCite={cite} />}
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
              taskId={turn.taskId}
            />
          )}
          {!running && onFollowUp && nextSteps.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Ask next">
              {nextSteps.map((step) => (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => onFollowUp(turn.id, step)}
                  title="Fills the composer. Nothing is sent until you press Run."
                  className="hover-decay inline-flex h-7 max-w-full items-center rounded-[var(--radius-xs)] border border-line-default px-2.5 text-[12.5px] text-foreground-secondary hover:border-line-strong hover:text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
                >
                  <span className="truncate">{step.label}</span>
                </button>
              ))}
            </div>
          )}
          {/* Only what the reader did not expect -- a model request that was
              not honoured, an answer cut off at its limit. The figures are in
              the fold above. */}
          <UsageFooter usage={turn.usage} choices={turn.modelChoices} models={models} notesOnly />
        </footer>
      )}
    </article>
    </EvidenceCardScope>
  )
})
