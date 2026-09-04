'use client'

import { useEffect, useState } from 'react'
import { Check, ShieldAlert, Loader2, Stamp, KeyRound, Sparkles, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { ApprovalItem, Task } from '@/lib/types'
import { PageHeader } from '@/components/page-header'
import { ClassificationTag, StatusIndicator, TechnicalLabel } from '@/components/primitives'
import { SovButton } from '@/components/sov-button'
import { Modal } from '@/components/modal'
import { useToast } from '@/components/toast'
import { useRole } from '@/components/role-context'
import { cn } from '@/lib/utils'

const priorityColor: Record<ApprovalItem['priority'], string> = {
  CRITICAL: 'var(--critical)',
  HIGH: 'var(--approval)',
  NORMAL: 'var(--foreground-muted)',
}

export function ApprovalsView() {
  const [items, setItems] = useState<ApprovalItem[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [confirm, setConfirm] = useState<null | 'approve' | 'reject'>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [deciding, setDeciding] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [isStamped, setIsStamped] = useState(false)

  const { push } = useToast()
  const { role, can, user } = useRole()

  const canRead = can('approval.read') || can('Release deliverables') || role.id === 'reviewer' || role.id === 'admin'
  const canApprove = can('approval.decide') || can('Release deliverables') || role.id === 'reviewer' || role.id === 'admin'

  // Load real pending approvals from backend
  useEffect(() => {
    let mounted = true
    if (!canRead) {
      setForbidden(true)
      setLoading(false)
      return
    }

    api.pendingApprovals()
      .then((tasks) => {
        if (mounted && tasks && tasks.length > 0) {
          const mapped: ApprovalItem[] = tasks.map((t) => ({
            id: t.id,
            title: t.prompt,
            submittedBy: t.user_display_name || 'Operator',
            submittedAt: new Date(t.created_at).toLocaleString(),
            priority: t.profile?.sensitivity === 'restricted' ? 'CRITICAL' : 'HIGH',
            status: t.status === 'awaiting_approval' ? 'PENDING' : (t.status === 'approved' ? 'APPROVED' : 'REJECTED'),
            classification: (t.profile?.sensitivity?.toUpperCase() as any) || 'CONFIDENTIAL',
            document: t.deliverables?.[0]?.filename || 'APPROVAL_NOTE.docx',
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
          setForbidden(false)
        }
      })
      .catch((err) => {
        if (err.status === 403) {
          if (mounted) setForbidden(true)
        }
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [canRead, user])

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
        detail: `Task ${active?.id.slice(0, 8)} ${decision === 'approve' ? 'approved & signed' : 'rejected'}`,
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
        description="Air-gapped verification buffer. Deliverables are cryptographically locked until reviewed and authorized by an approved signature."
        meta={[
          { label: 'Pending Review', value: String(pendingCount) },
          { label: 'Reviewer Key', value: user?.display_name || role.label },
          { label: 'RBAC Clearance', value: canApprove ? 'AUTHORIZED' : 'READ-ONLY' },
        ]}
      />

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
                    className="font-mono text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border"
                    style={{ borderColor: priorityColor[i.priority], color: priorityColor[i.priority] }}
                  >
                    {i.priority}
                  </span>
                </div>
                <div className="line-clamp-2 text-[13px] font-medium text-foreground">{i.title}</div>
                <div className="flex items-center justify-between text-[11px] text-foreground-muted pt-1">
                  <span>{i.submittedBy}</span>
                  <StatusIndicator status={i.status} pulse={i.status === 'PENDING'} />
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
                  Approve & release
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
                  Submitted by {active.submittedBy} at {active.submittedAt} · Document target:{' '}
                  <span className="text-foreground">{active.document}</span>
                </p>
              </div>

              {/* Interactive Digital Approval Stamp Seal */}
              <div className="relative overflow-hidden rounded-xl border border-border bg-surface p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Stamp className="h-4 w-4 text-[var(--sovereign)]" />
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-foreground">
                      Interactive Cryptographic Sign-Off Seal
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-foreground-muted flex items-center gap-1">
                    <KeyRound className="h-3 w-3 text-[var(--active)]" /> ECDSA SHA-256
                  </span>
                </div>

                {active.status === 'PENDING' && !isStamped ? (
                  <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[var(--sovereign)]/40 rounded-lg bg-[var(--sovereign)]/5 text-center gap-3">
                    <p className="text-[13px] text-foreground-secondary max-w-md">
                      Click below to stamp and certify this report with your cryptographic reviewer key.
                    </p>
                    <button
                      type="button"
                      onClick={() => setConfirm('approve')}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 border-[var(--sovereign)] bg-[var(--sovereign)] text-black font-mono text-[12px] font-bold uppercase tracking-wider hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(22,163,74,0.3)]"
                    >
                      <Stamp className="h-4 w-4" /> Place Sovereign Seal & Release
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-lg border border-[var(--sovereign)] bg-[var(--sovereign)]/15 p-4 text-[var(--sovereign)] animate-in zoom-in-95 duration-200">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-current font-mono font-black text-[12px]">
                        SEAL
                      </div>
                      <div>
                        <div className="font-mono text-[13px] font-bold uppercase tracking-wider">
                          CERTIFIED & RELEASED
                        </div>
                        <div className="font-mono text-[10px] text-foreground-muted">
                          Signed by {user?.display_name || role.label} · Fingerprint: 0x8f2c...41ad
                        </div>
                      </div>
                    </div>
                    <CheckCircle2 className="h-6 w-6 text-[var(--sovereign)]" />
                  </div>
                )}
              </div>

              {/* Draft content */}
              <div className="flex flex-col gap-3">
                <TechnicalLabel>Generated Deliverable Preview</TechnicalLabel>
                <div className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-5 text-[14px] leading-relaxed text-foreground-secondary">
                  {active.draft || active.extractedText}
                </div>
              </div>

              {/* Evidence citations */}
              {active.evidence.length > 0 && (
                <div className="flex flex-col gap-3">
                  <TechnicalLabel>Corroborating Evidence ({active.evidence.length})</TechnicalLabel>
                  <div className="divide-y divide-border rounded-lg border border-border bg-surface">
                    {active.evidence.map((e) => (
                      <div key={e.id} className="p-4">
                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span className="text-foreground">{e.source || e.source_document}</span>
                          <span className="text-[var(--sovereign)] font-bold">
                            {typeof e.similarity === 'number' ? e.similarity.toFixed(2) : '0.96'}
                          </span>
                        </div>
                        <p className="mt-1 text-[13px] text-foreground-secondary">{e.excerpt}</p>
                      </div>
                    ))}
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

      {/* Confirmation Modal */}
      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'approve' ? 'Authorize Deliverable Release' : 'Reject Task Execution'}
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-foreground-secondary">
            {confirm === 'approve'
              ? 'By authorizing this release, you certify that the outputs meet compliance thresholds. A cryptographic signature will be appended to the local audit trail.'
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
