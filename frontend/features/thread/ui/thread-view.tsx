'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { DEFAULT_PIPELINE } from '@/lib/presentation'
import type { PipelineStage, SystemHealth, SovereigntyStatus } from '@/lib/types'
import { useEventStream } from '@/hooks/use-event-stream'
import { useRole } from '@/components/role-context'
import { useToast } from '@/components/toast'
import { EvidenceDrawer } from '@/components/evidence-drawer'
import { Composer, type ComposerAttachment } from './composer'
import { UserTurn } from './user-turn'
import { AssistantTurn } from './assistant-turn'
import type { AssistantTurn as AssistantTurnModel, Turn } from '../model/types'

/**
 * The thread.
 *
 * One column. A person asks the machine to do something, watches it do it,
 * and checks its work — in that order, without navigating. A completed run
 * stays on screen when the next one starts, which is the whole reason for
 * threading: the previous answer and its evidence remain available while you
 * ask the follow-up.
 *
 * The composer is the first thing on the page. There is no headline, because
 * the emptiness above a composer is composure and does not need a slogan in
 * it.
 */

/** Backend TaskStatus -> the stage rows that exist in DEFAULT_PIPELINE. */
const STATUS_TO_STAGE: Record<string, string> = {
  classified: 'classify',
  planned: 'plan',
  retrieving: 'retrieve',
  executing: 'sandbox',
  verifying: 'verify',
}

const TERMINAL = new Set(['delivered', 'awaiting_approval', 'approved', 'failed', 'blocked', 'cancelled'])

function outcomeFor(status: string): AssistantTurnModel['outcome'] {
  switch (status) {
    case 'delivered':
    case 'approved':
      return 'delivered'
    case 'awaiting_approval':
      return 'held'
    case 'blocked':
      return 'denied'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'running'
  }
}

export function ThreadView() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [prompt, setPrompt] = useState('')
  const [format, setFormat] = useState('answer')
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const [uploadedIds, setUploadedIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [sovereignty, setSovereignty] = useState<SovereigntyStatus | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [focusEvidenceId, setFocusEvidenceId] = useState<string | null>(null)

  const { user, role } = useRole()
  const { push } = useToast()
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const activeTaskIdRef = useRef<string | null>(null)
  activeTaskIdRef.current = activeTaskId
  /**
   * Held in a ref because handleEvent is memoised and must not be rebuilt
   * every render, but it has to reach the current settle.
   *
   * More importantly: EVERY path to a terminal state calls this. The first
   * version only called it from task.finished, and a run that ended at
   * awaiting_approval — which is the interesting outcome, the one where a
   * deliverable is held for a human — announced itself through task.stage
   * instead. The turn sat on RUNNING for ever while the backend had long
   * since finished, because the code that loads the answer was on a branch
   * the event never took.
   */
  const settleRef = useRef<(taskId: string) => Promise<void>>(async () => {})

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([api.health(), api.sovereigntyStatus()]).then(([h, s]) => {
      if (cancelled) return
      if (h.status === 'fulfilled') setHealth(h.value)
      if (s.status === 'fulfilled') setSovereignty(s.value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  /** Mutate the newest assistant turn in place. Turns never re-order. */
  const patchLatest = useCallback(
    (fn: (t: AssistantTurnModel) => AssistantTurnModel) => {
      setTurns((prev) => {
        const idx = [...prev].reverse().findIndex((t) => t.role === 'assistant')
        if (idx === -1) return prev
        const realIdx = prev.length - 1 - idx
        const next = [...prev]
        next[realIdx] = fn(next[realIdx] as AssistantTurnModel)
        return next
      })
    },
    [],
  )

  const handleEvent = useCallback(
    (event: any) => {
      const { event: name, data } = event
      if (!data) return

      if (name === 'task.stage') {
        const status = String(data.status || '').toLowerCase()
        const message = data.message || ''
        const target = STATUS_TO_STAGE[status]

        patchLatest((t) => {
          let stages = t.stages
          if (target) {
            stages = t.stages.map((s) =>
              s.id === target
                ? { ...s, status: 'active' as const, detail: message, at: new Date().toISOString() }
                : s.status === 'active'
                  ? { ...s, status: 'done' as const }
                  : s,
            )
          }
          if (TERMINAL.has(status)) {
            const outcome = outcomeFor(status)
            // Stages that never reported are marked skipped, not done. A
            // board that admits what it cannot account for is the credible
            // one.
            stages = stages.map((s) => {
              if (outcome === 'failed') return s.status === 'active' ? { ...s, status: 'failed' as const } : s
              if (outcome === 'denied' && s.status === 'pending') return { ...s, status: 'blocked' as const }
              if (s.status === 'active' || s.status === 'done') return { ...s, status: 'done' as const }
              return { ...s, status: 'skipped' as const }
            })
            return { ...t, stages, outcome, stream: 'closed' }
          }
          return { ...t, stages }
        })

        // Terminal via task.stage — including awaiting_approval, which is
        // how a held deliverable reports. Load the record.
        if (TERMINAL.has(status)) {
          const id = activeTaskIdRef.current
          if (id) void settleRef.current(id)
        }
      }

      if (name === 'task.extraction') {
        patchLatest((t) => ({
          ...t,
          stages: t.stages.map((s) => (s.id === 'read' ? { ...s, status: 'done' as const } : s)),
        }))
      }
      if (name === 'task.draft') {
        patchLatest((t) => ({
          ...t,
          stages: t.stages.map((s) => (s.id === 'draft' ? { ...s, status: 'done' as const } : s)),
        }))
      }

      // The payload key is `items`, and it carries the whole retrieved set.
      if (name === 'task.evidence' && Array.isArray(data.items)) {
        patchLatest((t) => {
          const seen = new Set(t.evidence.map((e) => e.id))
          return { ...t, evidence: [...t.evidence, ...data.items.filter((i: any) => !seen.has(i.id))] }
        })
      }

      // The verification report arrives unwrapped.
      if (name === 'task.verified' && Array.isArray(data.checks)) {
        patchLatest((t) => ({ ...t, verification: data.checks }))
      }

      if (name === 'task.finished' || name === 'task.failed' || name === 'task.blocked') {
        const id = activeTaskIdRef.current
        if (id) void settleRef.current(id)
      }
    },
    [patchLatest],
  )

  useEventStream({ taskId: activeTaskId, enabled: busy, onEvent: handleEvent })

  /**
   * The authoritative read.
   *
   * Everything a finished turn shows comes from the task record, never
   * reassembled from event payloads. The stream is an optimisation; the
   * snapshot is the truth. Events are dropped for a subscriber that falls
   * behind, so a lost event must not be able to leave a completed run
   * displaying as empty.
   */
  const settle = useCallback(async (taskId: string) => {
    try {
      const task = await api.getTask(taskId)
      const first = task.deliverables?.[0]
      patchLatest((t) => ({
        ...t,
        outcome: outcomeFor(String(task.status).toLowerCase()),
        answer: task.answer || null,
        evidence: task.evidence || [],
        verification: task.verification?.checks || [],
        deliverable: first ? { ...first, sizeKb: Math.round(first.size_bytes / 1024) } : null,
        denialReason: task.error || null,
        elapsedMs: task.duration_ms ?? null,
        stream: 'closed',
      }))
    } catch (err: any) {
      patchLatest((t) => ({
        ...t,
        outcome: 'failed',
        error: err?.message || 'The run finished but its record could not be read back.',
        stream: 'closed',
      }))
    } finally {
      setBusy(false)
      setActiveTaskId(null)
    }
  }, [patchLatest])

  settleRef.current = settle

  const attach = async (files: File[]) => {
    for (const f of files) {
      const localId = `${Date.now()}-${f.name}`
      setAttachments((prev) => [
        ...prev,
        { id: localId, name: f.name, sizeBytes: f.size, classification: '', uploading: true },
      ])
      try {
        const stored = await api.uploadFile(f, f.name, 'confidential')
        setUploadedIds((prev) => [...prev, stored.id])
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === localId
              ? { ...a, uploading: false, classification: stored.classification }
              : a,
          ),
        )
      } catch (err: any) {
        setAttachments((prev) => prev.filter((a) => a.id !== localId))
        push({
          title: 'Upload failed',
          detail: err?.detail || err?.message || 'The file was not stored.',
          tone: 'critical',
        })
      }
    }
  }

  const run = async () => {
    const text = prompt.trim()
    if (!text) return

    const freshStages: PipelineStage[] = DEFAULT_PIPELINE.map((s) => ({ ...s, status: 'pending' }))
    const now = new Date().toISOString()

    setTurns((prev) => [
      ...prev,
      {
        role: 'user',
        id: `u-${Date.now()}`,
        text,
        attachments: attachments.map((a) => ({
          fileId: a.id,
          filename: a.name,
          sizeBytes: a.sizeBytes,
          classification: a.classification,
        })),
        author: { displayName: user?.display_name || role.label },
        at: now,
      },
      {
        role: 'assistant',
        id: `a-${Date.now()}`,
        taskId: null,
        outcome: 'running',
        stages: freshStages,
        answer: null,
        evidence: [],
        verification: [],
        deliverable: null,
        denialReason: null,
        error: null,
        startedAt: now,
        elapsedMs: null,
        stream: 'live',
      },
    ])

    setPrompt('')
    setBusy(true)

    try {
      const task = await api.createTask(text, uploadedIds, format === 'answer' ? null : format)
      setActiveTaskId(task.id)
      patchLatest((t) => ({ ...t, taskId: task.id }))
      setAttachments([])
      setUploadedIds([])
    } catch (err: any) {
      // A failed dispatch is shown as a failed dispatch. Nothing ran, so
      // nothing is marked as having run.
      patchLatest((t) => ({
        ...t,
        outcome: 'failed',
        error:
          err?.status === 0
            ? 'The local workbench service is unreachable. Nothing was executed.'
            : err?.message || 'The backend refused the request. Nothing was executed.',
        stream: 'closed',
      }))
      setBusy(false)
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns.length])

  const latestAssistant = [...turns].reverse().find((t) => t.role === 'assistant') as
    | AssistantTurnModel
    | undefined

  return (
    <div className="mx-auto flex w-full max-w-[768px] flex-col gap-6 px-6 py-8">
      {/* Measured readings only. Each shows an em dash when unread. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-line-default pb-3 font-mono text-ledger uppercase tracking-[var(--ls-ledger)]">
        <span className="text-foreground-muted">
          host <span className="text-foreground">127.0.0.1</span>
        </span>
        <span className="text-foreground-muted">
          egress{' '}
          <span className="tabular text-foreground">
            {sovereignty ? sovereignty.unapproved_connections : '—'}
          </span>
        </span>
        <span className="text-foreground-muted">
          models{' '}
          <span className="tabular text-foreground">
            {health ? `${health.models_available}/${health.models_registered}` : '—'}
          </span>
        </span>
        <span className="text-foreground-muted">
          sandbox{' '}
          <span className="text-foreground">
            {health ? (health.sandbox_ready ? 'ready' : 'not ready') : '—'}
          </span>
        </span>
        <span className="text-foreground-muted">
          audit{' '}
          <span className={health?.audit_chain_valid === false ? 'text-critical-text' : 'text-foreground'}>
            {health ? (health.audit_chain_valid ? 'valid' : 'BROKEN') : '—'}
          </span>
        </span>
      </div>

      {turns.length === 0 && (
        <p className="text-body text-foreground-secondary">
          Describe a task below. Every run is classified, checked against policy, and its claims
          verified against retrieved evidence before an answer is shown.
        </p>
      )}

      {turns.map((t) =>
        t.role === 'user' ? (
          <UserTurn key={t.id} turn={t} />
        ) : (
          <AssistantTurn
            key={t.id}
            turn={t}
            onCite={(id) => {
              setFocusEvidenceId(id)
              setDrawerOpen(true)
            }}
          />
        ),
      )}

      <div ref={bottomRef} />

      <div className="sticky bottom-6 z-[var(--z-rail)]">
        <Composer
          value={prompt}
          onChange={setPrompt}
          format={format}
          onFormatChange={setFormat}
          attachments={attachments}
          onAttach={attach}
          onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
          onSubmit={run}
          busy={busy}
        />
      </div>

      <EvidenceDrawer
        open={drawerOpen}
        items={latestAssistant?.evidence ?? []}
        focusId={focusEvidenceId}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  )
}
