'use client'

import { useEffect, useState } from 'react'
import { Check, ShieldAlert, Loader2 } from 'lucide-react'
import { APPROVALS } from '@/lib/mock-data'
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
  const [items, setItems] = useState<ApprovalItem[]>(APPROVALS)
  const [activeId, setActiveId] = useState<string>(APPROVALS[0]?.id || '')
  const [confirm, setConfirm] = useState<null | 'approve' | 'reject'>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [deciding, setDeciding] = useState(false)
  const [forbidden, setForbidden] = useState(false)

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
      push({
        title: decision === 'approve' ? 'Deliverable released' : 'Task rejected',
        detail: decision === 'approve' ? `${active.id} · signed by ${user?.display_name || role.persona}` : `${active.id} · returned to submitter`,
        tone: decision === 'approve' ? 'sovereign' : 'critical',
      })
    } catch (err: any) {
      push({
        title: 'Decision failed',
        detail: err.detail || err.message,
        tone: 'critical',
      })
    } finally {
      setDeciding(false)
      setConfirm(null)
      setNotes('')
    }
  }

  if (forbidden && !canRead) {
    return (
      <div>
        <PageHeader
          eyebrow="Review Workspace"
          title="Approvals"
          description="Held deliverables awaiting qualified human authorization before release."
          meta={[
            { label: 'Role', value: role.label },
            { label: 'Entitlement', value: 'RESTRICTED' },
            { label: 'Policy', value: 'DUAL-CONTROL' },
          ]}
        />
        <div className="mx-auto max-w-[1400px] px-5 py-14 lg:px-10">
          <div className="flex flex-col items-center justify-center gap-4 border border-border bg-surface p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center border border-border">
              <ShieldAlert className="h-6 w-6 text-foreground-muted" />
            </div>
            <h2 className="text-lg font-medium text-foreground">Entitlement Required</h2>
            <p className="max-w-md text-[14px] leading-relaxed text-foreground-secondary">
              The <span className="font-mono text-foreground">{role.label}</span> role does not have the{' '}
              <span className="font-mono text-[12px] text-foreground">approval.read</span> permission. Under dual-control policy, only qualified Reviewers and Administrators may inspect and release held deliverables.
            </p>
            <p className="font-mono text-[11px] text-foreground-muted">
              Use the top-right role switcher to change to Reviewer persona.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Review Workspace"
        title="Approvals"
        description="Held deliverables awaiting qualified human authorization before release."
        meta={[
          { label: 'Pending', value: String(pendingCount) },
          { label: 'Reviewer', value: user?.display_name || role.label },
          { label: 'Policy', value: 'DUAL-CONTROL' },
          { label: 'Chain', value: 'VALID' },
        ]}
      />

      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-px border-b border-border bg-border lg:grid-cols-[360px_1fr]">
        {/* Queue */}
        <div className="flex flex-col bg-background">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <TechnicalLabel>Task Queue</TechnicalLabel>
            <span className="font-mono text-[11px] text-foreground-muted">{items.length}</span>
          </div>
          <div className="divide-y divide-border">
            {items.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => setActiveId(i.id)}
                className={cn(
                  'flex w-full flex-col gap-2.5 px-5 py-4 text-left transition-colors hover:bg-surface',
                  activeId === i.id && 'bg-surface',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-foreground">{i.id}</span>
                  <span
                    className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em]"
                    style={{ color: priorityColor[i.priority] }}
                  >
                    <span className="h-1 w-1 rounded-full" style={{ backgroundColor: priorityColor[i.priority] }} />
                    {i.priority}
                  </span>
                </div>
                <p className="text-[13px] leading-snug text-foreground">{i.title}</p>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-foreground-muted">
                    {i.submittedBy} · {i.submittedAt.split(' ')[0]}
                  </span>
                  <StatusIndicator status={i.status} pulse={i.status === 'PENDING'} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Review surface */}
        {active && (
          <div className="flex flex-col bg-background">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
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
                <h3 className="text-xl font-medium tracking-tight text-foreground">{active.title}</h3>
                <p className="font-mono text-[11px] text-foreground-muted">
                  Submitted by {active.submittedBy} at {active.submittedAt} · Document target:{' '}
                  <span className="text-foreground">{active.document}</span>
                </p>
              </div>

              {/* Draft content */}
              <div className="flex flex-col gap-3">
                <TechnicalLabel>Generated Deliverable Preview</TechnicalLabel>
                <div className="whitespace-pre-wrap border border-border bg-surface p-5 text-[14px] leading-relaxed text-foreground-secondary">
                  {active.draft || active.extractedText}
                </div>
              </div>

              {/* Evidence citations */}
              {active.evidence.length > 0 && (
                <div className="flex flex-col gap-3">
                  <TechnicalLabel>Corroborating Evidence ({active.evidence.length})</TechnicalLabel>
                  <div className="divide-y divide-border border border-border bg-surface">
                    {active.evidence.map((e) => (
                      <div key={e.id} className="p-4">
                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span className="text-foreground">{e.source || e.source_document}</span>
                          <span className="text-sovereign">{typeof e.similarity === 'number' ? e.similarity.toFixed(2) : '0.96'}</span>
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
                  <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2">
                    {active.verification.map((v) => (
                      <div key={v.label} className="bg-surface p-4">
                        <span className="font-mono text-[10px] uppercase text-foreground-muted">{v.label}</span>
                        <div className="mt-1 flex items-center gap-2">
                          <Check className="h-3.5 w-3.5 text-sovereign" />
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
