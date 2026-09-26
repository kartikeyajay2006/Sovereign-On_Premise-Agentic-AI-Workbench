'use client'

import { useState, type ReactNode, type RefObject } from 'react'
import { ArrowLeft, Download } from 'lucide-react'
import type { EvidenceItem, Task, VerificationReport } from '@/lib/types'
import { ClassificationTag } from '@/components/primitives'
import { ClaimList } from '@/components/evidence/claim-list'
import { ConflictPanel } from '@/components/evidence/conflict-panel'
import { ProofPanel } from '@/components/evidence/proof-panel'
import { Seal } from '@/shared/motion'
import { Button } from '@/shared/ui/controls/button'
import { LEDGER_MUTED } from '@/shared/ui/data/ledger'
import { FailureState, ReadingLine, type ReadFailure } from '@/shared/ui/data/reading'
import { checkLabel, roleName } from '@/lib/presentation'
import { cn } from '@/lib/utils'
import { awaitingSignature, formatSize, splitReason, stamp, type QueueItem } from './model'
import { DECISION_MARK } from './queue-list'

export interface DetailRead {
  id: string
  status: 'reading' | 'failed'
  failure?: ReadFailure
  startedAt: number
}

function Section({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 border-b border-line-subtle pb-2">
        <h3 className={LEDGER_MUTED}>{title}</h3>
        {meta && <span className="tabular text-[12px] text-foreground-muted">{meta}</span>}
      </div>
      {children}
    </section>
  )
}

/**
 * The inline markdown a local model actually emits: bold, emphasis, code.
 * Nothing is parsed as HTML, so every branch yields a text node inside an
 * element chosen here.
 */
function Inline({ text }: { text: string }) {
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
            <code key={i} className="rounded-[var(--radius-xs)] bg-surface-sunken px-1 font-mono text-meta">
              {t.slice(1, -1)}
            </code>
          )
        }
        if (/^\*[^*\n]+\*$/.test(t)) return <em key={i}>{t.slice(1, -1)}</em>
        return <span key={i}>{t}</span>
      })}
    </>
  )
}

/**
 * The deliverable text with its citations made checkable.
 *
 * Each [S4] jumps to the passage it names. A citation with no matching
 * passage is marked rather than linked: it cites nothing, and that is a
 * finding about the text the reviewer is about to release, not a broken link.
 */
function CitedText({
  text,
  known,
  onCite,
}: {
  text: string
  known: Set<string>
  onCite: (id: string) => void
}) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0)
  return (
    <div className="flex flex-col gap-3">
      {paragraphs.map((paragraph, pi) => (
        <p key={pi} className="whitespace-pre-wrap text-answer leading-[var(--lh-answer)] text-foreground">
          {paragraph.split(/(\[[SFVCEHT]\d+\])/g).map((part, i) => {
            const match = part.match(/^\[([SFVCEHT]\d+)\]$/)
            if (!match) return <Inline key={i} text={part} />
            const id = match[1]
            if (!known.has(id)) {
              return (
                <sup
                  key={i}
                  title={`No passage with id ${id} was retrieved for this run. This citation supports nothing.`}
                  className="mx-px cursor-help font-mono text-[0.68em] text-critical-text underline decoration-dotted underline-offset-2"
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
                className="hover-decay mx-px rounded-[var(--radius-xs)] bg-surface px-1 align-super font-mono text-[0.68em] text-foreground-secondary shadow-[0_0_0_1px_var(--control-subtle)] hover:bg-surface-sunken hover:text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
              >
                {id}
              </button>
            )
          })}
        </p>
      ))}
    </div>
  )
}

function DecisionRecord({ item, task }: { item: QueueItem; task: Task | null }) {
  const mark = DECISION_MARK[item.decision]
  const approval = task?.approval ?? null
  return (
    <div className="relative mb-6 overflow-hidden rounded-[var(--radius)] bg-surface py-3 pl-5 pr-4 shadow-[var(--elev-0)]">
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-0.5', mark.rail)} />
      <p className={cn('flex flex-wrap items-center gap-x-2 text-body font-medium', mark.text)}>
        <span aria-hidden>{mark.glyph}</span>
        {item.decision === 'approved' ? 'Approved' : item.decision === 'returned' ? 'Returned for revision' : 'Rejected'}
        {approval && (
          <span className="font-normal text-foreground-secondary">
            by {approval.reviewer_name || 'an unrecorded reviewer'} · {stamp(approval.decided_at)}
          </span>
        )}
      </p>
      {approval ? (
        approval.comment ? (
          <p className="mt-2 whitespace-pre-wrap text-body text-foreground">{approval.comment}</p>
        ) : (
          <p className="mt-2 text-body text-foreground-muted">No note was recorded with this decision.</p>
        )
      ) : (
        <p className="mt-2 text-body text-foreground-muted">
          This run carries no approval record, so who decided it and when is not known here.
        </p>
      )}
    </div>
  )
}

function HeldBecause({ task }: { task: Task }) {
  const approval = task.approval
  if (!approval || approval.reasons.length === 0) return null
  return (
    <Section
      title="Held because"
      meta={approval.approver_roles.length > 0 ? `decided by ${approval.approver_roles.map(roleName).join(' or ')}` : undefined}
    >
      {/* The reason in words. The rule's name -- what the policy file and
          the audit record call it -- is in its title, for whoever needs to
          find it there, rather than a second line under every reason. */}
      <ul className="flex flex-col gap-2.5">
        {approval.reasons.map((reason) => {
          const { rule, text } = splitReason(reason)
          return (
            <li key={reason} className="flex gap-2.5 text-body text-foreground">
              <span aria-hidden className="mt-[9px] size-1 shrink-0 rounded-full bg-approval" />
              <span title={rule ? `Policy rule: ${rule}` : undefined}>{text}</span>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

/**
 * The signatures a High finding needs, each with who gave it or that it is
 * still to come. Only what the record holds: a signature not in it is shown
 * as awaited, never as given.
 */
function Signatures({ task }: { task: Task }) {
  const plan = task.approval?.required_signatures ?? []
  if (plan.length === 0) return null
  const signed = task.approval?.signatures ?? []
  return (
    <Section title="Signatures" meta={`${signed.length} of ${plan.length} given`}>
      <ol className="flex flex-col gap-2.5">
        {plan.map((needed, index) => {
          const given = signed[index]
          return (
            <li key={`${needed.role}-${index}`} className="flex gap-2.5 text-body text-foreground">
              <span
                aria-hidden
                className={cn('mt-[9px] size-1 shrink-0 rounded-full', given ? 'bg-sovereign' : 'bg-approval')}
              />
              <span>
                {needed.authority} {needed.capacity}
                {needed.clause ? <span className="text-foreground-muted"> · {needed.clause}</span> : null}
                <span className="block text-ui text-foreground-muted">
                  {given ? `Signed by ${given.name} · ${stamp(given.signed_at)}` : 'Not yet signed'}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </Section>
  )
}

function Deliverable({
  task,
  held,
  canInspect,
  onCite,
}: {
  task: Task
  held: boolean
  canInspect: boolean
  onCite: (id: string) => void
}) {
  const known = new Set(task.evidence.map((e) => e.id))
  const cited = (task.answer?.match(/\[[SFVCEHT]\d+\]/g) ?? []).length
  return (
    <Section title="Deliverable" meta={cited > 0 ? `${cited} citation${cited === 1 ? '' : 's'}` : undefined}>
      {task.deliverables.length > 0 && (
        <ul className="flex flex-col">
          {task.deliverables.map((d) => (
            <li
              key={d.filename}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line-subtle py-2 last:border-b-0"
            >
              <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-ui">
                <span className="min-w-0 max-w-full truncate text-foreground">{d.filename}</span>
                <span className="tabular text-foreground-muted">{formatSize(d.size_bytes)}</span>
                {/* SEAL: the decision releasing this file. The hash is the
                    record's own, and it is sealed exactly when the service
                    says the file was released, so an approval recorded while
                    this run is open draws the rule once; a run opened already
                    decided is read, sealed or not, without the ceremony. A
                    held or returned file keeps the dashed, unsealed rule. */}
                <Seal sealed={d.released} token={d.sha256} className="text-foreground-muted">
                  <span title={d.sha256}>sha256 {d.sha256.slice(0, 12)}…</span>
                </Seal>
                {/* Held is a person's decision still to come, so amber only
                    while the run is held. A returned file was never released
                    and nobody is deciding it any more: that is ink. */}
                <span
                  className={
                    d.released ? 'text-sovereign-text' : held ? 'text-approval-text' : 'text-foreground-muted'
                  }
                >
                  {d.released ? 'released' : held ? 'withheld' : 'not released'}
                </span>
              </span>
              {/* The service lets an approving role read a withheld file, so
                  the reviewer can check the document itself and not only the
                  text it was made from. The download is recorded in the
                  audit chain like any other. */}
              {(canInspect || d.released) && d.download_url && (
                <a
                  href={d.download_url}
                  download
                  title="Downloads this file. The download is recorded in the audit chain."
                  className="btn"
                  data-variant="ghost"
                  data-size="sm"
                  data-ground="paper"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  {held ? 'Inspect file' : 'Download'}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      {task.answer ? (
        <CitedText text={task.answer} known={known} onCite={onCite} />
      ) : (
        <p className="text-body text-foreground-muted">This run recorded no answer text.</p>
      )}
    </Section>
  )
}

function Verification({
  report,
  onCite,
}: {
  report: VerificationReport | null | undefined
  onCite: (id: string) => void
}) {
  if (!report) {
    return (
      <Section title="Verification">
        <p className="text-body text-foreground-muted">This run has no verification report.</p>
      </Section>
    )
  }
  const passed = report.checks.filter((c) => c.passed).length
  return (
    <Section
      title="Verification"
      meta={`${passed} of ${report.checks.length} checks passed`}
    >
      <p className="text-body text-foreground-secondary">
        {report.material_claims_total > 0
          ? `${report.material_claims_supported} of ${report.material_claims_total} material claims supported by evidence.`
          : 'No material claims were identified in this run.'}{' '}
        {!report.valid && <span className="text-critical-text">The report marks this run as not valid.</span>}
      </p>
      <ul className="flex flex-col">
        {report.checks.map((check, index) => {
          const ok = check.passed === true
          return (
            <li
              key={`${check.name ?? 'check'}-${index}`}
              className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-3 border-b border-line-subtle py-2 last:border-b-0"
            >
              <span
                aria-label={ok ? 'passed' : 'failed'}
                className={cn('pt-0.5 font-mono text-ui', ok ? 'text-sovereign-text' : 'text-critical-text')}
              >
                {ok ? '✓' : '✕'}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-body text-foreground">
                  {checkLabel(check.name)}
                </span>
                {check.detail && <span className="text-ui text-foreground-secondary">{check.detail}</span>}
                {(check.warnings ?? []).map((warning) => (
                  <span key={warning} className="text-ui text-approval-text">
                    {warning}
                  </span>
                ))}
              </span>
            </li>
          )
        })}
      </ul>
      <ClaimList claims={report.claims ?? []} onCite={onCite} defaultOpen />
      {report.limitations.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className={LEDGER_MUTED}>Limitations it states</p>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-ui text-foreground-secondary">
            {report.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}

function Evidence({
  taskId,
  items,
  focused,
}: {
  taskId: string
  items: EvidenceItem[]
  focused: string | null
}) {
  return (
    <Section title="Evidence" meta={`${items.length} passage${items.length === 1 ? '' : 's'}`}>
      {items.length === 0 ? (
        <p className="text-body text-foreground-muted">
          This run retrieved no evidence, so any citation in it resolves to nothing.
        </p>
      ) : (
        <ol className="flex flex-col">
          {items.map((e) => {
            // `score` is the measured field. `similarity` is a UI alias the
            // backend never sends; it once defaulted to 0.96 on every row.
            const score = typeof e.similarity === 'number' ? e.similarity : e.score
            return (
              <li
                key={e.id}
                id={`evidence-${taskId}-${e.id}`}
                className={cn(
                  'scroll-mt-4 border-b border-line-subtle py-3 pl-3 pr-1 last:border-b-0',
                  'transition-[background-color,box-shadow] duration-[var(--standard)] ease-[var(--ease-standard)]',
                  focused === e.id && 'bg-[var(--selected-surface)] shadow-[inset_2px_0_0_0_var(--selected-rail)]',
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 rounded-[var(--radius-xs)] px-1 font-mono text-ledger text-foreground shadow-[0_0_0_1px_var(--control-default)]">
                      {e.id}
                    </span>
                    <span className="truncate text-ui text-foreground">
                      {e.source_document || e.source || 'unnamed source'}
                    </span>
                  </span>
                  {typeof score === 'number' && (
                    <span className="tabular shrink-0 font-mono text-ui text-foreground" title="Retrieval score recorded for this run">
                      {score.toFixed(2)}
                    </span>
                  )}
                </div>
                {(e.location || (e.kind && e.kind !== 'knowledge_base')) && (
                  <p className="mt-1 font-mono text-ledger text-foreground-muted">
                    {[e.location, e.kind && e.kind !== 'knowledge_base' ? e.kind.replace(/_/g, ' ') : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                <p className="mt-1 text-ui leading-[var(--lh-body)] text-foreground-secondary">{e.excerpt}</p>
              </li>
            )
          })}
        </ol>
      )}
    </Section>
  )
}

export function ReviewPane({
  item,
  task,
  detailRead,
  canDecide,
  ownRun,
  reviewer,
  onApprove,
  onReject,
  onRevise,
  onBack,
  onRetryDetail,
  onTaskUpdated,
  headingId,
  bodyRef,
}: {
  item: QueueItem
  task: Task | null
  detailRead: DetailRead | null
  canDecide: boolean
  /**
   * The signed-in reviewer submitted this run. The service refuses a decision
   * from the person who ran the task, so offering Approve here would only
   * lead to that refusal.
   */
  ownRun: boolean
  reviewer: string
  onApprove: () => void
  onReject: () => void
  /** Send the run back to its submitter with a note: nothing released, nothing rejected. */
  onRevise?: () => void
  onBack: () => void
  onRetryDetail: () => void
  /** A conflict was resolved: the recomputed record replaces the one shown. */
  onTaskUpdated?: (task: Task) => void
  headingId: string
  bodyRef: RefObject<HTMLDivElement | null>
}) {
  const [focusedEvidence, setFocusedEvidence] = useState<string | null>(null)
  const mark = DECISION_MARK[item.decision]
  const held = item.decision === 'held'
  const hasDocument = (task?.deliverables.length ?? item.deliverableCount) > 0
  // The service refuses a release while sources still disagree.
  const openConflicts = (task?.conflicts ?? []).filter((c) => c.status === 'unresolved' && c.impact === 'high')
  // A High finding signed once is still held: the second authority has not.
  const awaiting = held ? awaitingSignature(task) : null
  const signedSoFar = task?.approval?.signatures?.length ?? 0
  const signaturesNeeded = task?.approval?.required_signatures?.length ?? 0
  const lastSignature = awaiting != null && signedSoFar === signaturesNeeded - 1

  const cite = (id: string) => {
    setFocusedEvidence(id)
    // An explicit smooth scroll overrides the stylesheet's reduced-motion
    // rule, so the preference is read here as well.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document
      .getElementById(`evidence-${item.id}-${id}`)
      ?.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' })
  }

  return (
    <>
      <header className="border-b border-line-default px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="hover-decay -ml-2 flex h-8 items-center gap-1 rounded-[var(--radius)] px-2 text-ui text-foreground-secondary hover:bg-surface-sunken hover:text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none lg:hidden"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Queue
            </button>
            <span
              className={cn(
                'flex items-center gap-2 font-mono text-ledger uppercase tracking-[var(--ls-ledger)]',
                mark.text,
              )}
            >
              <span aria-hidden>{mark.glyph}</span>
              {mark.label}
            </span>
            {awaiting && signedSoFar > 0 && (
              <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-approval-text">
                Waiting for second authority
              </span>
            )}
            <ClassificationTag level={item.sensitivity ?? 'unclassified'} />
            <span className="min-w-0 max-w-full truncate font-mono text-ledger text-foreground-muted" title={item.id}>
              #{item.id.slice(0, 8)}
            </span>
          </div>

          {/* One pair of controls, together, where Approve and Reject can be
              weighed against each other. Approve is the screen's single
              filled action. Its label says "release" only when there is a
              document to release: an answer-only run releases nothing, and
              saying otherwise contradicts the file list below it. */}
          {held && !ownRun && (
            <div className="flex items-center gap-2">
              <Button
                variant="danger"
                size="sm"
                ground="paper"
                shortcut="R"
                disabled={!canDecide}
                onClick={onReject}
              >
                Reject
              </Button>
              {onRevise && (
                <Button variant="secondary" size="sm" ground="paper" disabled={!canDecide} onClick={onRevise}>
                  Request revision
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                ground="paper"
                shortcut="A"
                disabled={!canDecide || openConflicts.length > 0}
                onClick={onApprove}
              >
                {awaiting && !lastSignature
                  ? `Sign as ${awaiting.authority}`
                  : hasDocument
                    ? 'Approve & release'
                    : 'Approve'}
              </Button>
            </div>
          )}
        </div>

        <h2 id={headingId} className="mt-2 line-clamp-3 text-heading font-medium tracking-[var(--ls-heading)] text-foreground">
          {item.prompt}
        </h2>
        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-foreground-muted">
          <span>{item.submittedBy ? `Submitted by ${item.submittedBy}` : 'Submitter not recorded'}</span>
          <span>{stamp(item.createdAt)}</span>
          {task?.duration_ms != null && <span>ran {(task.duration_ms / 1000).toFixed(1)} s</span>}
          {task?.profile?.task_type && <span>{task.profile.task_type.replace(/_/g, ' ')}</span>}
        </p>
        {held && !canDecide && (
          <p className="mt-2 text-ui text-foreground-muted">
            Your role can read this queue but does not hold approval.decide, so it cannot release or
            return this run.
          </p>
        )}
        {held && canDecide && ownRun && (
          <p className="mt-2 text-ui text-approval-text">
            You ran this, so another reviewer or an administrator decides it. The service refuses a
            decision from whoever submitted the task.
          </p>
        )}
        {held && canDecide && !ownRun && openConflicts.length > 0 && (
          <p className="mt-2 text-ui text-critical-text">
            Resolve {openConflicts.map((c) => c.id).join(', ')} below before approving: the sources disagree,
            and the decision they withhold has not been made.
          </p>
        )}
        {held && canDecide && !ownRun && openConflicts.length === 0 && (
          <p className="mt-2 text-ui text-foreground-muted">
            Your decision is recorded against {reviewer} in the audit chain.
          </p>
        )}
        {awaiting && (
          <p className="mt-2 text-ui text-approval-text">
            {signedSoFar > 0 ? `Signed ${signedSoFar} of ${signaturesNeeded}. ` : ''}
            Next: the {awaiting.authority}, who {awaiting.capacity} this finding
            {awaiting.clause ? ` (${awaiting.clause})` : ''}. Nothing is released until every signature
            is given, and a change to the run voids the signatures already given.
          </p>
        )}
      </header>

      <div
        ref={bodyRef}
        tabIndex={-1}
        aria-labelledby={headingId}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--foreground)] sm:px-6"
      >
        {!held && task && <DecisionRecord item={item} task={task} />}

        {!task ? (
          detailRead?.status === 'failed' && detailRead.failure ? (
            <FailureState failure={detailRead.failure} what="this run's record" retry={onRetryDetail} />
          ) : (
            <ReadingLine
              what="this run's record"
              source={`GET /api/tasks/${item.id.slice(0, 8)}…`}
              startedAt={detailRead?.startedAt ?? Date.now()}
            />
          )
        ) : (
          <div className="flex max-w-[860px] flex-col gap-8 pb-8">
            <HeldBecause task={task} />
            <Signatures task={task} />
            <ConflictPanel
              conflicts={task.conflicts ?? []}
              taskId={item.id}
              canResolve={held && canDecide && !ownRun}
              onResolved={onTaskUpdated}
              onCite={cite}
            />
            <Deliverable task={task} held={held} canInspect={canDecide} onCite={cite} />
            <Verification report={task.verification} onCite={cite} />
            <ProofPanel key={item.id} taskId={item.id} />
            <Evidence taskId={item.id} items={task.evidence} focused={focusedEvidence} />
          </div>
        )}
      </div>
    </>
  )
}
