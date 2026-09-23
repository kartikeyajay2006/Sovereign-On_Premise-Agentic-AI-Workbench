'use client'

import { useEffect, useState } from 'react'
import { Check, ShieldAlert, Loader2, Stamp, Sparkles, CheckCircle2, Lock, Inbox } from 'lucide-react'
import { api } from '@/lib/api'
import type { ApprovalItem, Task } from '@/lib/types'
import { PageHeader } from '@/components/page-header'
import { ClassificationTag, StatusIndicator, TechnicalLabel } from '@/components/primitives'
import { SovButton } from '@/components/sov-button'
import { Modal } from '@/components/modal'
import { useToast } from '@/components/toast'
import { useRole } from '@/components/role-context'
import { cn } from '@/lib/utils'

/**
 * Keyed on the data classification the task actually carries.
 *
 * This was keyed on a `priority` nothing in the system computes: it was
 * derived as "restricted -> CRITICAL, everything else -> HIGH", so all
 * twenty-one queued items wore an identical HIGH badge. A field that is
 * constant carries no information, and this one implied an urgency that had
 * never been assessed. Sensitivity is real, varies, and is what decides who
 * may release the deliverable.
 */
const CLASSIFICATION_TONE: Record<string, string> = {
  restricted: 'var(--critical)',
  confidential: 'var(--approval)',
  normal: 'var(--foreground-muted)',
}

/**
 * The deliverable preview, with its citations turned into links.
 *
 * A reviewer reading "the approving authority is X [S4]" had no way to learn
 * which of six unlabelled passages S4 was, so checking a claim against its
 * source -- the entire job this screen exists for -- meant guessing. Each
 * citation now jumps to the passage it names.
 *
 * A citation with no matching passage is marked rather than linked: it cites
 * nothing, and that is a finding about the answer the reviewer is about to
 * release, not a broken link.
 */
function CitedText({ text, known }: { text: string; known: Set<string> }) {
  return (
    <>
      {text.split(/(\[[SFVCE]\d+\])/g).map((part, i) => {
        const match = part.match(/^\[([SFVCE]\d+)\]$/)
        if (!match) return <span key={i}>{part}</span>
        const id = match[1]
        if (!known.has(id)) {
          return (
            <span
              key={i}
              title={`No passage with id ${id} was retrieved for this run.`}
              className="font-mono text-[12px] text-critical-text"
            >
              [{id}]
            </span>
          )
        }
        return (
          <a
            key={i}
            href={`#evidence-${id}`}
            className="rounded-[3px] bg-surface-sunken px-1 font-mono text-[12px] text-foreground underline-offset-2 hover:underline"
          >
            [{id}]
          </a>
        )
      })}
    </>
  )
}

export function ApprovalsView() {
  const [items, setItems] = useState<ApprovalItem[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [confirm, setConfirm] = useState<null | 'approve' | 'reject'>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [deciding, setDeciding] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  // How many are genuinely held, read from the task list. A role that cannot
  // open the queue can still be told the queue is not empty.
  const [heldElsewhere, setHeldElsewhere] = useState<number | null>(null)
  const [isStamped, setIsStamped] = useState(false)

  const { push } = useToast()
  const { role, can, user } = useRole()

  const canRead = can('approval.read') || can('Release deliverables') || role.id === 'reviewer' || role.id === 'admin'
  const canApprove = can('approval.decide') || can('Release deliverables') || role.id === 'reviewer' || role.id === 'admin'

  // Load real pending approvals from backend
  useEffect(() => {
    let mounted = true

    // Always find out how many are actually held, whoever is looking. This is
    // what makes a refusal legible: "13 waiting, not yours to release" rather
    // than a zero that reads as "nothing to do".
    api
      .listTasks(200)
      .then((rows) => {
        if (!mounted) return
        setHeldElsewhere(
          (rows || []).filter((t) => String(t.status).toLowerCase() === 'awaiting_approval').length,
        )
      })
      .catch(() => mounted && setHeldElsewhere(null))

    if (!canRead) {
      setForbidden(true)
      setLoading(false)
      return
    }

    api
      .pendingApprovals()
      .then((tasks) => {
        if (!mounted) return
        setForbidden(false)
        setLoadError(null)
        const mapped: ApprovalItem[] = (tasks || []).map((t) => ({
          id: t.id,
          title: t.prompt,
          submittedBy: t.user_display_name || 'Operator',
          submittedAt: new Date(t.created_at).toLocaleString(),
          sensitivity: t.profile?.sensitivity || 'normal',
          status:
            t.status === 'awaiting_approval'
              ? 'PENDING'
              : t.status === 'approved'
                ? 'APPROVED'
                : 'REJECTED',
          classification: (t.profile?.sensitivity?.toUpperCase() as any) || 'CONFIDENTIAL',
          // No placeholder filename. A task held before its deliverable was
          // rendered has none, and inventing one sends the reviewer to a
          // download that 404s.
          document: t.deliverables?.[0]?.filename || '',
          extractedText: t.answer || 'Deliverable held pending human review.',
          evidence: t.evidence || [],
          verification: (t.verification?.checks || []).map((c) => ({
            label: c.name,
            result: c.detail || (c.passed ? 'Verified' : 'Failed'),
            ok: c.passed,
          })),
          draft: t.answer || '',
          rawTask: t,
        }))
        setItems(mapped)
        setActiveId(mapped[0]?.id || '')
      })
      .catch((err) => {
        if (!mounted) return
        if (err?.status === 403) {
          setForbidden(true)
        } else {
          // Anything else was being swallowed, leaving an empty list that
          // looked exactly like an empty queue.
          setLoadError(err?.detail || err?.message || 'The approval queue could not be read.')
        }
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [canRead])

  const active = items.find((i) => i.id === activeId) ?? items[0]
  const pendingCount = items.filter((i) => i.status === 'PENDING').length

  const decide = async (decision: 'approve' | 'reject') => {
    setDeciding(true)
    try {
      if (active?.id) {
        await api.decideApproval(active.id, decision, notes)
      }
      setItems((prev) =>
        prev.map((i) => (i.id === activeId ? { ...i, status: decision === 'approve' ? 'APPROVED' : 'REJECTED' } : i)),
      )
      if (decision === 'approve') setIsStamped(true)
      push({
        title: decision === 'approve' ? 'Deliverable released' : 'Task rejected',
        // Not "signed" — nothing signs anything yet.
        detail: `Task ${active?.id.slice(0, 8)} ${decision === 'approve' ? 'approved and recorded' : 'rejected'}`,
        tone: decision === 'approve' ? 'sovereign' : 'critical',
      })
      setConfirm(null)
    } catch (err: any) {
      push({
        title: 'Decision failed',
        detail: err.detail || err.message || 'Could not record approval',
        tone: 'critical',
      })
    } finally {
      setDeciding(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-10 px-5 py-10 lg:px-10 lg:py-14">
      <PageHeader
        eyebrow="Human-in-the-Loop Gate"
        title="Approval Queue"
        description="Deliverables are withheld until a reviewer with the required role approves them. The decision is appended to the local audit chain."
        meta={[
          {
            label: 'Pending Review',
            value: forbidden ? (heldElsewhere != null ? `${heldElsewhere} held` : '—') : String(pendingCount),
          },
          { label: 'Reviewer', value: user?.display_name || role.label },
          { label: 'RBAC Clearance', value: canApprove ? 'AUTHORIZED' : 'READ-ONLY' },
        ]}
      />

      {/* A role without approval rights is told what is actually happening,
          rather than shown an empty queue it will read as "nothing to do". */}
      {forbidden && (
        <div className="flex flex-col gap-4 rounded-xl border border-[var(--approval)]/35 bg-[var(--approval)]/[0.05] p-6 shadow-sm sm:flex-row sm:items-start">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--approval)]/40 bg-surface">
            <Lock className="h-5 w-5 text-[var(--approval)]" />
          </span>
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-foreground">
              {heldElsewhere && heldElsewhere > 0
                ? `${heldElsewhere} deliverable${heldElsewhere === 1 ? ' is' : 's are'} held — but not for you to release`
                : 'This role cannot open the approval queue'}
            </span>
            <p className="max-w-2xl text-[13px] leading-relaxed text-foreground-secondary">
              Approval is separated from execution on purpose: whoever ran the task does not
              sign it off. Your role,{' '}
              <span className="font-mono text-[12px] text-foreground">{role.label}</span>, holds{' '}
              <span className="font-mono text-[12px] text-foreground">task.create</span> but not{' '}
              <span className="font-mono text-[12px] text-foreground">approval.decide</span>, so
              the queue is closed to it.
            </p>
            <p className="text-[13px] leading-relaxed text-foreground-secondary">
              To release these, sign in as{' '}
              <span className="font-medium text-foreground">Approving Reviewer</span> or{' '}
              <span className="font-medium text-foreground">Platform Admin</span> using the
              account menu at the top right.
            </p>
          </div>
        </div>
      )}

      {loadError && !forbidden && (
        <p className="flex items-start gap-2.5 rounded-xl border border-critical/30 bg-critical/[0.04] p-4 text-[13px] leading-relaxed text-critical">
          <ShieldAlert className="mt-px h-4 w-4 shrink-0" />
          {loadError}
        </p>
      )}

      {!forbidden && !loading && items.length === 0 && !loadError && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface px-6 py-14 text-center shadow-sm">
          <Inbox className="h-6 w-6 text-foreground-muted" />
          <span className="text-[15px] font-medium text-foreground">Nothing is waiting</span>
          <p className="max-w-md text-[13px] leading-relaxed text-foreground-secondary">
            Every deliverable produced on this host has been released or returned. Runs that
            need a signature will appear here the moment they finish.
          </p>
        </div>
      )}

      {!forbidden && items.length > 0 && (
      <div className="grid grid-cols-1 gap-6 border border-border lg:grid-cols-[360px_1fr]">
        {/* Item List */}
        <div className="flex flex-col border-b border-border bg-surface lg:border-b-0 lg:border-r">
          <div className="border-b border-border p-4 font-mono text-[11px] uppercase tracking-wider text-foreground-muted">
            Pending Directives ({items.length})
          </div>

          <div className="divide-y divide-border overflow-y-auto max-h-[600px]">
            {items.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => {
                  setActiveId(i.id)
                  setIsStamped(i.status === 'APPROVED')
                }}
                className={cn(
                  'flex w-full flex-col gap-2 p-4 text-left transition-colors',
                  i.id === activeId ? 'bg-surface-sunken' : 'hover:bg-surface-sunken/60'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-foreground-muted truncate">{i.id.slice(0, 8)}…</span>
                  <span
                    className="rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase"
                    style={{
                      borderColor: CLASSIFICATION_TONE[i.sensitivity] ?? 'var(--foreground-muted)',
                      color: CLASSIFICATION_TONE[i.sensitivity] ?? 'var(--foreground-muted)',
                    }}
                  >
                    {i.sensitivity}
                  </span>
                </div>
                <div className="line-clamp-2 text-[13px] font-medium text-foreground">{i.title}</div>
                <div className="flex items-center justify-between text-[11px] text-foreground-muted pt-1">
                  <span>{i.submittedBy}</span>
                  {/* No `pulse`. PENDING is waiting on a person, not working,
                      and a pulsing chip said the opposite. */}
                  <StatusIndicator status={i.status} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Review surface */}
        {active && (
          <div className="flex flex-col bg-background">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4 bg-surface">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[12px] text-foreground">{active.id}</span>
                <ClassificationTag level={active.classification} />
                <StatusIndicator status={active.status} />
              </div>
              <div className="flex items-center gap-2">
                <SovButton
                  variant="primary"
                  disabled={!canApprove || active.status !== 'PENDING'}
                  onClick={() => setConfirm('approve')}
                >
                  {/* A task held before any deliverable was rendered has
                      nothing to release; the decision still records. Saying
                      "release" over an answer-only task contradicts the line
                      below it, which says there is no document. */}
                  {active.document ? 'Approve & release' : 'Approve'}
                </SovButton>
                <SovButton
                  variant="danger"
                  disabled={!canApprove || active.status !== 'PENDING'}
                  onClick={() => setConfirm('reject')}
                >
                  Reject
                </SovButton>
              </div>
            </div>

            <div className="flex flex-col gap-8 p-6 lg:p-8">
              {/* Submission info */}
              <div className="flex flex-col gap-2">
                <TechnicalLabel>Task Directive</TechnicalLabel>
                <h3 className="text-xl font-semibold tracking-tight text-foreground">{active.title}</h3>
                <p className="font-mono text-[11px] text-foreground-muted">
                  Submitted by {active.submittedBy} at {active.submittedAt}
                  {/* Answer-only runs write no file, so the label is dropped
                      rather than left dangling over an empty value. */}
                  {active.document ? (
                    <>
                      {' · Document target: '}
                      <span className="text-foreground">{active.document}</span>
                    </>
                  ) : (
                    ' · Answer only — no document to release'
                  )}
                </p>
              </div>

              {/*
                This was an "Interactive Cryptographic Sign-Off Seal", labelled
                ECDSA SHA-256, which invited the reviewer to "certify this
                report with your cryptographic reviewer key" and afterwards
                printed "Fingerprint: 0x8f2c...41ad" beside their real name.

                No signing exists in this product. There is no key, no
                signature and no fingerprint anywhere in backend/ — the string
                was a literal, and the named algorithm is not even the Ed25519
                the roadmap specifies. Displaying an invented fingerprint next
                to a named human, on the screen whose entire purpose is
                accountability, is the most damaging thing the interface could
                assert.

                The decision itself is real: it is recorded against the
                reviewer, with a timestamp, in the audit chain. That is what
                this now says. When audit signing is built, a genuine
                fingerprint can be shown here.
              */}
              <div className="relative overflow-hidden rounded-xl border border-border bg-surface p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Stamp className="h-4 w-4 text-foreground-muted" />
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-foreground">
                      Reviewer decision
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-foreground-muted">
                    Recorded in the audit chain
                  </span>
                </div>

                {active.status === 'PENDING' && !isStamped ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface-sunken/40 p-6 text-center">
                    {/* Explanation only. This carried a second Approve
                        button identical in effect to the one in the header,
                        so the screen offered the same irreversible decision
                        twice, in two different visual weights, a scroll
                        apart. The pair of controls stays together at the top
                        where Approve and Reject can be weighed against each
                        other. */}
                    <Stamp className="h-4 w-4 text-foreground-muted" aria-hidden />
                    <p className="max-w-md text-[13px] text-foreground-secondary">
                      {active.document
                        ? 'Approving releases this deliverable and records the decision against your account.'
                        : 'This task produced an answer and no document. Approving records the decision against your account.'}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-lg border border-[var(--sovereign)] bg-[var(--sovereign)]/15 p-4 text-[var(--sovereign)]">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-6 w-6 text-[var(--sovereign)]" />
                      <div>
                        <div className="font-mono text-[13px] font-bold uppercase tracking-wider">
                          Approved and released
                        </div>
                        <div className="font-mono text-[10px] text-foreground-muted">
                          Recorded against {user?.display_name || role.label}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Draft content */}
              <div className="flex flex-col gap-3">
                <TechnicalLabel>Generated Deliverable Preview</TechnicalLabel>
                <div className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-5 text-[14px] leading-relaxed text-foreground-secondary">
                  <CitedText
                    text={active.draft || active.extractedText || ''}
                    known={new Set(active.evidence.map((e) => e.id))}
                  />
                </div>
              </div>

              {/* Evidence citations */}
              {active.evidence.length > 0 && (
                <div className="flex flex-col gap-3">
                  <TechnicalLabel>Corroborating Evidence ({active.evidence.length})</TechnicalLabel>
                  <div className="divide-y divide-border rounded-lg border border-border bg-surface">
                    {active.evidence.map((e) => {
                      // `similarity` is a UI alias the backend never sends, so
                      // every passage printed the 0.96 fallback: six identical
                      // invented scores on the screen where a human decides
                      // whether to release a deliverable. The measured values
                      // for this very run are 0.80, 0.73, 0.73, 0.70, 0.70 and
                      // 0.69 -- a materially weaker set than 0.96 six times
                      // implies. `score` is the real field.
                      const score = typeof e.similarity === 'number' ? e.similarity : e.score
                      return (
                        <div
                          key={e.id}
                          id={`evidence-${e.id}`}
                          className="scroll-mt-24 p-4 target:bg-surface-sunken"
                        >
                          <div className="flex items-center justify-between gap-3 font-mono text-[11px]">
                            <span className="flex min-w-0 items-center gap-2">
                              {/* The citation id, so the reviewer can tell which
                                  passage the answer's [S4] actually refers to.
                                  Six unlabelled cards made that unanswerable. */}
                              <span className="shrink-0 rounded-[3px] bg-surface-sunken px-1.5 py-0.5 text-foreground">
                                {e.id}
                              </span>
                              <span className="truncate text-foreground">
                                {e.source || e.source_document}
                              </span>
                            </span>
                            {typeof score === 'number' && (
                              <span className="shrink-0 font-bold text-[var(--sovereign)]">
                                {score.toFixed(2)}
                              </span>
                            )}
                          </div>
                          {e.location && (
                            <p className="mt-1 font-mono text-[11px] text-foreground-muted">
                              {e.location}
                            </p>
                          )}
                          <p className="mt-1 text-[13px] text-foreground-secondary">{e.excerpt}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Verification checks */}
              {active.verification.length > 0 && (
                <div className="flex flex-col gap-3">
                  <TechnicalLabel>Verification Report</TechnicalLabel>
                  <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 rounded-lg overflow-hidden">
                    {active.verification.map((v) => (
                      <div key={v.label} className="bg-surface p-4">
                        <span className="font-mono text-[10px] uppercase text-foreground-muted">{v.label}</span>
                        <div className="mt-1 flex items-center gap-2">
                          <Check className="h-3.5 w-3.5 text-[var(--sovereign)]" />
                          <span className="font-mono text-[12px] text-foreground">{v.result}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {/* Confirmation Modal */}
      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'approve' ? 'Authorize Deliverable Release' : 'Reject Task Execution'}
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-foreground-secondary">
            {confirm === 'approve'
              ? 'Approving releases the deliverable. The decision, your account and the time are appended to the local audit chain.'
              : 'Rejecting this task returns it to the submitter with your explanatory notes.'}
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Authorization justification or rejection notes…"
            rows={3}
            className="w-full resize-none border border-border bg-surface px-3 py-2 text-[13px] text-foreground placeholder:text-foreground-muted focus:outline-none"
          />
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setConfirm(null)}
              className="border border-border px-4 py-2 font-mono text-[12px] text-foreground hover:border-foreground"
            >
              Cancel
            </button>
            <SovButton
              variant={confirm === 'approve' ? 'primary' : 'danger'}
              disabled={deciding}
              onClick={() => decide(confirm!)}
            >
              {deciding ? <Loader2 className="h-4 w-4 animate-spin" /> : confirm === 'approve' ? 'Confirm Release' : 'Confirm Rejection'}
            </SovButton>
          </div>
        </div>
      </Modal>
    </div>
  )
}
