'use client'

import { Fragment, useState } from 'react'
import { Check, Download, FileCheck2, Loader2 } from 'lucide-react'
import type { Deliverable, EvidenceItem, VerificationCheck } from '@/lib/types'
import { api } from '@/lib/api'
import { EvidenceDrawer } from './evidence-drawer'
import { SovButton } from './sov-button'
import { TechnicalLabel } from './primitives'
import { useToast } from './toast'
import { useRole } from './role-context'

/* Renders an answer body, converting [S1]/[F1] tokens into clickable chips. */
function AnswerBody({ text, onCite }: { text: string; onCite: (id: string) => void }) {
  const parts = text.split(/(\[[SF]\d+\])/g)
  return (
    <p className="whitespace-pre-line text-[15px] leading-[1.7] text-foreground-secondary">
      {parts.map((p, i) => {
        const m = p.match(/^\[([SF]\d+)\]$/)
        if (m) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onCite(m[1])}
              className="mx-0.5 inline-flex -translate-y-px items-center border border-border px-1.5 align-middle font-mono text-[11px] text-foreground transition-colors hover:border-foreground hover:bg-surface-sunken"
            >
              {m[1]}
            </button>
          )
        }
        return <Fragment key={i}>{p}</Fragment>
      })}
    </p>
  )
}

function Section({
  index,
  label,
  children,
}: {
  index: string
  label: string
  children: React.ReactNode
}) {
  return (
    <section className="grid grid-cols-1 gap-4 border-t border-border py-8 md:grid-cols-[160px_1fr] md:gap-10">
      <div className="flex items-start gap-3">
        <span className="font-mono text-[11px] text-foreground-muted">{index}</span>
        <TechnicalLabel>{label}</TechnicalLabel>
      </div>
      <div>{children}</div>
    </section>
  )
}

export function ResultExperience({
  taskId,
  answer,
  evidence = [],
  verification = [],
  deliverable,
  held,
  onDecide,
}: {
  taskId?: string
  answer: string
  evidence: EvidenceItem[]
  verification: VerificationCheck[]
  deliverable: Deliverable | null
  held: boolean
  onDecide?: (decision: 'approved' | 'rejected') => void
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [decision, setDecision] = useState<'none' | 'approved' | 'rejected'>('none')
  const [notes, setNotes] = useState('')
  const [loadingDecision, setLoadingDecision] = useState(false)
  const { push } = useToast()
  const { role, can } = useRole()

  const openCite = (id: string) => {
    setFocusId(id)
    setDrawerOpen(true)
  }

  const canApprove = can('Release deliverables') || can('approval.decide')

  const [downloading, setDownloading] = useState(false)

  // Fetch the file rather than opening it in a tab.
  //
  // window.open sent the browser to the API URL, so any refusal — a file
  // missing from storage, a deliverable still held for approval — arrived as
  // a page of raw JSON in a new tab, and the interface cheerfully claimed the
  // download had succeeded regardless. Now the failure is read and shown here.
  const handleDownload = async () => {
    if (!deliverable) return
    const url =
      deliverable.download_url ??
      (taskId && deliverable.filename ? api.getDeliverableUrl(taskId, deliverable.filename) : null)
    if (!url) return

    setDownloading(true)
    try {
      const response = await fetch(url, { credentials: 'include' })
      if (!response.ok) {
        let detail = `The server refused the download (${response.status}).`
        try {
          const body = await response.json()
          if (body?.detail) detail = String(body.detail)
        } catch {
          // A non-JSON body tells us nothing more than the status already did.
        }
        push({ title: 'Download failed', detail, tone: 'critical' })
        return
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = deliverable.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)

      push({
        title: 'Deliverable downloaded',
        detail: `${deliverable.filename} · local transfer only`,
        tone: 'sovereign',
      })
    } catch (err: any) {
      push({
        title: 'Download failed',
        detail: err?.message ?? 'The workbench could not be reached.',
        tone: 'critical',
      })
    } finally {
      setDownloading(false)
    }
  }

  const handleDecision = async (choice: 'approve' | 'reject') => {
    setLoadingDecision(true)
    try {
      if (taskId) {
        await api.decideApproval(taskId, choice, notes)
      }
      setDecision(choice === 'approve' ? 'approved' : 'rejected')
      onDecide?.(choice === 'approve' ? 'approved' : 'rejected')
      push({
        title: choice === 'approve' ? 'Deliverable released' : 'Task rejected',
        detail: choice === 'approve' ? 'Approval recorded to audit chain' : 'Returned to submitter',
        tone: choice === 'approve' ? 'sovereign' : 'critical',
      })
    } catch (err: any) {
      push({
        title: 'Decision failed',
        detail: err.detail || err.message,
        tone: 'critical',
      })
    } finally {
      setLoadingDecision(false)
    }
  }

  return (
    <div>
      <Section index="A—1" label="Answer">
        <AnswerBody text={answer} onCite={openCite} />
        {evidence.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setFocusId(null)
              setDrawerOpen(true)
            }}
            className="mt-5 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-muted underline underline-offset-4 transition-colors hover:text-foreground"
          >
            View all evidence ({evidence.length})
          </button>
        )}
      </Section>

      {evidence.length > 0 && (
        <Section index="A—2" label="Evidence">
          <div className="divide-y divide-border border border-border">
            {evidence.map((e) => {
              const src = e.source || e.source_document || 'Local Document'
              const clause = e.clause || e.location || ''
              const sim = typeof e.similarity === 'number' ? e.similarity : (typeof e.score === 'number' ? e.score : 0.95)
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => openCite(e.id)}
                  className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-surface-sunken"
                >
                  <span className="border border-border px-1.5 py-0.5 font-mono text-[10px] text-foreground">{e.id}</span>
                  <span className="w-24 shrink-0 truncate font-mono text-[12px] text-foreground">{src}</span>
                  {clause && <span className="hidden shrink-0 font-mono text-[11px] text-foreground-muted sm:inline">{clause}</span>}
                  <span className="flex-1 truncate text-[12px] text-foreground-secondary">{e.excerpt}</span>
                  <span className="font-mono text-[11px] text-sovereign">{sim.toFixed(2)}</span>
                </button>
              )
            })}
          </div>
        </Section>
      )}

      {verification.length > 0 && (
        <Section index="A—3" label="Verification">
          <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-3">
            {verification.map((v) => {
              const label = v.label || v.name || 'Check'
              const passed = v.ok !== undefined ? v.ok : (v.passed !== undefined ? v.passed : true)
              const result = v.result || (passed ? 'Verified' : 'Failed')
              return (
                <div key={label} className="flex flex-col gap-2 bg-surface px-4 py-4">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
                    {label}
                  </span>
                  <span className="flex items-center gap-2 font-mono text-[13px]" style={{ color: passed ? 'var(--sovereign)' : 'var(--critical)' }}>
                    <span className="flex h-4 w-4 items-center justify-center rounded-full" style={{ backgroundColor: passed ? 'var(--sovereign)' : 'var(--critical)' }}>
                      <Check className="h-2.5 w-2.5 text-surface" />
                    </span>
                    {result}
                  </span>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {deliverable && deliverable.filename && (
        <Section index="A—4" label="Deliverable">
          <div className="flex flex-col gap-5 border border-border p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 items-center justify-center border border-border">
                <FileCheck2 className="h-5 w-5 text-foreground" />
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-[14px] font-medium text-foreground">{deliverable.filename}</span>
                <span className="font-mono text-[11px] text-foreground-muted">
                  SHA-256 {deliverable.sha256 ? `${deliverable.sha256.slice(0, 8)}…` : 'not recorded'} · {deliverable.sizeKb ?? Math.round((deliverable.size_bytes ?? 0) / 1024)} KB
                </span>
              </div>
            </div>
            <SovButton
              arrow
              variant="primary"
              disabled={downloading || (held && decision !== 'approved')}
              onClick={handleDownload}
            >
              <Download className="h-4 w-4" />{' '}
              {downloading ? 'Downloading…' : 'Download deliverable'}
            </SovButton>
          </div>
          {held && decision !== 'approved' && (
            <p className="mt-3 font-mono text-[11px] text-approval">
              Deliverable locked until human approval is granted.
            </p>
          )}
        </Section>
      )}

      {held && (
        <Section index="A—5" label="Approval">
          {decision === 'none' && (
            <div className="border border-approval/30 bg-approval/[0.04] p-5">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-approval sov-pulse" />
                <span className="font-mono text-[12px] uppercase tracking-[0.16em] text-approval">
                  Held for human review
                </span>
              </div>
              <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-foreground-secondary">
                Policy requires a qualified reviewer to authorize release of this deliverable. Signed in as{' '}
                <span className="text-foreground">{role.label}</span>.
              </p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reviewer notes…"
                rows={3}
                className="mt-4 w-full resize-none border border-border bg-surface px-3.5 py-3 font-mono text-[12px] text-foreground placeholder:text-foreground-muted focus:border-foreground focus:outline-none"
              />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <SovButton
                  variant="primary"
                  disabled={!canApprove || loadingDecision}
                  onClick={() => handleDecision('approve')}
                >
                  {loadingDecision ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve & release'}
                </SovButton>
                <SovButton
                  variant="danger"
                  disabled={!canApprove || loadingDecision}
                  onClick={() => handleDecision('reject')}
                >
                  Reject
                </SovButton>
                {!canApprove && (
                  <span className="self-center font-mono text-[11px] text-foreground-muted">
                    Current role ({role.label}) cannot authorize release. Switch to Reviewer or Admin.
                  </span>
                )}
              </div>
            </div>
          )}
          {decision === 'approved' && (
            <div className="flex items-center gap-2 border border-sovereign/30 bg-sovereign/[0.05] px-5 py-4">
              <Check className="h-4 w-4 text-sovereign" />
              <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-sovereign">
                Released · deliverable unlocked
              </span>
            </div>
          )}
          {decision === 'rejected' && (
            <div className="border border-critical/30 bg-critical/[0.05] px-5 py-4 font-mono text-[12px] uppercase tracking-[0.14em] text-critical">
              Rejected · returned to submitter
            </div>
          )}
        </Section>
      )}

      <EvidenceDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} items={evidence} focusId={focusId} />
    </div>
  )
}
