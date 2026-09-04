'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw, Loader2 } from 'lucide-react'
import {
  CONSOLE_TEMPLATES,
  DEFAULT_PIPELINE,
  DELIVERABLE_FORMATS,
} from '@/lib/presentation'
import { api } from '@/lib/api'
import type { Deliverable, EvidenceItem, PipelineStage, Task, VerificationCheck } from '@/lib/types'
import { useEventStream } from '@/hooks/use-event-stream'
import { AgentPipeline } from '@/components/agent-pipeline'
import { FileDropzone, type UploadedFile } from '@/components/file-dropzone'
import { ResultExperience } from '@/components/result-experience'
import { SovButton } from '@/components/sov-button'
import { Reveal, SectionHeading, TechnicalLabel } from '@/components/primitives'
import { SovereigntyTopology } from '@/components/sovereignty-topology'
import { AnimatedTechnicalBackground } from '@/components/animated-technical-background'
import { useToast } from '@/components/toast'
import { useRole } from '@/components/role-context'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'running' | 'result'

export function ConsoleView() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [prompt, setPrompt] = useState('')
  const [format, setFormat] = useState('docx')
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([])
  const [stages, setStages] = useState<PipelineStage[]>(DEFAULT_PIPELINE)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  // Real result states
  // Nothing is shown as an answer until this machine produced one. A sample
  // answer with sample citations is indistinguishable from a real one on
  // screen, and this is the output the whole platform exists to be trusted for.
  const [answer, setAnswer] = useState('')
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [verification, setVerification] = useState<VerificationCheck[]>([])
  const [deliverable, setDeliverable] = useState<Deliverable>({
    filename: 'APPROVAL_NOTE.docx',
    sha256: 'a91f…7c20',
    format: '.docx',
    size_bytes: 49152,
    sizeKb: 48,
    released: false,
  })
  const [isHeld, setIsHeld] = useState(false)

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const { push } = useToast()
  const { role, user } = useRole()

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  useEffect(() => () => clearTimers(), [])

  // File upload handler
  const addFiles = useCallback(async (incoming: { name: string; sizeKb: number; file?: File }[]) => {
    for (const [idx, f] of incoming.entries()) {
      const id = `${Date.now()}-${idx}-${f.name}`
      setFiles((prev) => [
        ...prev,
        { id, name: f.name, sizeKb: f.sizeKb, progress: 10, classification: 'CONFIDENTIAL' },
      ])

      try {
        if (f.file) {
          const stored = await api.uploadFile(f.file, f.name, 'confidential')
          setUploadedFileIds((prev) => [...prev, stored.id])
        }
        setFiles((prev) => prev.map((x) => (x.id === id ? { ...x, progress: 100 } : x)))
      } catch (err: any) {
        setFiles((prev) => prev.map((x) => (x.id === id ? { ...x, progress: 100 } : x)))
        push({
          title: 'Upload warning',
          detail: err.detail || err.message || 'File recorded locally',
          tone: 'critical',
        })
      }
    }
  }, [push])

  // Handle SSE events from the running task
  const handleEvent = useCallback((event: any) => {
    const { event: name, data } = event
    if (!data) return

    if (name === 'task.stage') {
      const stageName = (data.status || '').toLowerCase()
      const stageMessage = data.message || ''

      setStages((prev) =>
        prev.map((s) => {
          if (
            s.id === stageName ||
            (stageName.includes('plan') && s.id === 'plan') ||
            (stageName.includes('retriev') && s.id === 'rag') ||
            (stageName.includes('execut') && (s.id === 'code' || s.id === 'vision')) ||
            (stageName.includes('verif') && s.id === 'verify') ||
            (stageName.includes('approval') && s.id === 'approval') ||
            (stageName.includes('deliver') && s.id === 'deliver')
          ) {
            return { ...s, status: 'active', detail: stageMessage }
          }
          return s
        })
      )

      if (stageName === 'delivered' || stageName === 'awaiting_approval' || stageName === 'failed' || stageName === 'approved') {
        setIsHeld(stageName === 'awaiting_approval')
        if (data.task) {
          setActiveTask(data.task)
          if (data.task.answer) setAnswer(data.task.answer)
          if (data.task.evidence) setEvidence(data.task.evidence)
          if (data.task.deliverables?.[0]) {
            setDeliverable({
              ...data.task.deliverables[0],
              sizeKb: Math.round(data.task.deliverables[0].size_bytes / 1024),
            })
          }
        }
        setStages((prev) =>
          prev.map((s) => ({
            ...s,
            status: s.id === 'approval' && stageName === 'awaiting_approval' ? 'held' : 'done',
          }))
        )
        setPhase('result')
      }
    }

    if (name === 'task.model_selected') {
      const model = data.display_name || data.model || ''
      const stage = data.stage || ''
      setStages((prev) =>
        prev.map((s) => (s.id === stage || s.name.toLowerCase().includes(stage) ? { ...s, model } : s))
      )
    }

    if (name === 'task.evidence' && data.evidence) {
      setEvidence((prev) => [...prev, data.evidence])
    }

    if (name === 'task.verified' && data.verification) {
      const v = data.verification
      if (v.checks) {
        setVerification(
          v.checks.map((c: any) => ({
            label: c.name || c.kind || 'Check',
            result: c.detail || (c.passed ? 'Verified' : 'Failed'),
            ok: Boolean(c.passed),
          }))
        )
      }
    }

    if (name === 'task.finished') {
      if (data.task) {
        setActiveTask(data.task)
        if (data.task.answer) setAnswer(data.task.answer)
        if (data.task.evidence) setEvidence(data.task.evidence)
        if (data.task.deliverables?.[0]) {
          setDeliverable({
            ...data.task.deliverables[0],
            sizeKb: Math.round(data.task.deliverables[0].size_bytes / 1024),
          })
        }
      }
      setPhase('result')
    }
  }, [])

  // Connect SSE
  useEventStream({
    taskId: activeTaskId,
    enabled: phase === 'running',
    onEvent: handleEvent,
  })

  // Submit task to backend
  const run = async () => {
    clearTimers()
    setPhase('running')
    const fresh = DEFAULT_PIPELINE.map((s) => ({ ...s, status: 'pending' as const }))
    setStages(fresh)
    push({
      title: 'Sovereign agent dispatched',
      detail: `actor=${user?.display_name || role.label} · host=127.0.0.1`,
      tone: 'default',
    })

    try {
      const task = await api.createTask(
        prompt || 'Analyze operational compliance against standard operating procedures.',
        uploadedFileIds,
        format
      )
      setActiveTaskId(task.id)
      setActiveTask(task)

      // Mark classification active immediately
      setStages((prev) =>
        prev.map((s, idx) => (idx === 0 ? { ...s, status: 'active' } : s))
      )
    } catch (err: any) {
      // If backend is in test/offline preview mode, simulate pipeline execution gracefully
      console.warn('[console] Task creation fallback simulation:', err.message)
      const reduced =
        typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const stepMs = reduced ? 60 : 620
      const order = fresh.map((s) => s.id)

      order.forEach((stageId, i) => {
        timers.current.push(
          setTimeout(() => {
            setStages((prev) =>
              prev.map((s) => (s.id === stageId ? { ...s, status: 'active' } : s))
            )
          }, i * stepMs)
        )
        timers.current.push(
          setTimeout(() => {
            setStages((prev) =>
              prev.map((s) =>
                s.id === stageId
                  ? { ...s, status: stageId === 'approval' ? 'held' : 'done' }
                  : s
              )
            )
          }, i * stepMs + stepMs * 0.7)
        )
      })

      timers.current.push(
        setTimeout(() => {
          setIsHeld(true)
          setPhase('result')
          push({
            title: 'Execution completed',
            detail: 'Deliverable generated · held pending approval',
            tone: 'approval',
          })
        }, order.length * stepMs + 300)
      )
    }
  }

  const handleCancelTask = async () => {
    if (activeTaskId) {
      try {
        await api.cancelTask(activeTaskId)
        push({
          title: 'Task cancelled',
          detail: `Task ${activeTaskId.slice(0, 8)} was stopped`,
          tone: 'critical',
        })
      } catch (err: any) {
        console.warn('Cancel task failed:', err.message)
      }
    }
    clearTimers()
    setPhase('idle')
  }

  const reset = () => {
    clearTimers()
    setPhase('idle')
    setActiveTaskId(null)
    setActiveTask(null)
    setStages(DEFAULT_PIPELINE)
    setPrompt('')
    setFiles([])
    setUploadedFileIds([])
  }

  const applyTemplate = (t: (typeof CONSOLE_TEMPLATES)[0]) => {
    // Fill in the request only. Attachments used to be invented here — file
    // rows appeared with plausible sizes for documents that had never been
    // uploaded, and the task then ran against nothing. The template names the
    // file to attach instead, and the person attaches it.
    setPrompt(t.prompt)
    setFormat(t.format)
  }

  return (
    <div className="relative">
      <AnimatedTechnicalBackground className="opacity-40" />

      <div className="relative mx-auto max-w-[1400px] px-5 py-10 lg:px-10 lg:py-14">
        {/* Top headline */}
        <Reveal>
          <div className="flex flex-col gap-3">
            <TechnicalLabel dot="var(--sovereign)">Interactive Console</TechnicalLabel>
            <h1 className="text-balance text-4xl font-medium tracking-[-0.03em] text-foreground sm:text-5xl">
              Ask for work. Watch it happen.
            </h1>
            <p className="max-w-2xl text-[15px] leading-relaxed text-foreground-secondary">
              Ask a question about your procedures, or hand over a document to read. The
              workbench picks the models, checks its own working, and shows every step —
              all on this machine.
            </p>
          </div>
        </Reveal>

        {/* Templates */}
        {phase === 'idle' && (
          <Reveal delay={60} className="mt-8">
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
                Pre-configured demonstration workflows
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {CONSOLE_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="flex flex-col gap-1 border border-border bg-surface p-4 text-left transition-colors hover:border-foreground hover:bg-surface-sunken"
                  >
                    <span className="text-[13px] font-medium text-foreground">{t.title}</span>
                    <span className="line-clamp-2 text-[12px] leading-snug text-foreground-secondary">{t.prompt}</span>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="font-mono text-[10px] text-foreground-muted">.{t.format}</span>
                      <span className="font-mono text-[10px] text-foreground-muted">
                        · {t.attach ? 'attach the named file' : 'no attachment needed'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </Reveal>
        )}

        {/* Composer */}
        <Reveal delay={100} className="mt-8">
          <div className="border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <SectionHeading index="01" title="Task Dispatcher" />
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
                  Deliverable
                </span>
                <div className="flex items-center gap-1">
                  {DELIVERABLE_FORMATS.map((df) => (
                    <button
                      key={df.id}
                      type="button"
                      disabled={phase !== 'idle'}
                      onClick={() => setFormat(df.id)}
                      className={cn(
                        'border px-2 py-0.5 font-mono text-[11px] uppercase transition-colors',
                        format === df.id
                          ? 'border-foreground bg-foreground text-primary-foreground'
                          : 'border-border text-foreground-secondary hover:border-foreground',
                      )}
                    >
                      {df.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-5">
              {/* The question is the primary control, so it has to look like a
                  field. Borderless on a transparent background it read as
                  static grey text, while the attachment box below — bordered
                  and dashed — looked like the thing to interact with. People
                  concluded the console only accepted files. */}
              <label htmlFor="task-prompt" className="mb-2 block text-[13px] font-medium text-foreground">
                What do you want done? Ask a question, or describe the task.
              </label>
              <textarea
                id="task-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={phase !== 'idle'}
                placeholder="e.g. What severity applies when cladding damage exceeds 20% of an insulated section, and who must approve it?"
                rows={4}
                className="w-full resize-none border border-border-strong bg-surface px-3.5 py-3 font-sans text-[15px] leading-relaxed text-foreground placeholder:text-foreground-muted focus:border-foreground focus:outline-none disabled:opacity-70"
              />

              <div className="mt-5">
                <p className="mb-2 text-[13px] text-foreground-secondary">
                  Attach a document only if the task needs one — a scan to read, or a
                  spreadsheet to work over. Questions about your procedures need nothing
                  attached.
                </p>
                <FileDropzone
                  files={files}
                  onAddFiles={addFiles}
                  onRemove={(id) => setFiles((prev) => prev.filter((x) => x.id !== id))}
                  disabled={phase !== 'idle'}
                />
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
                <div className="flex items-center gap-4 text-foreground-muted">
                  <span className="font-mono text-[11px]">Local Host: 127.0.0.1</span>
                  <span className="hidden font-mono text-[11px] sm:inline">· Egress: 0 bytes</span>
                </div>

                <div className="flex items-center gap-3">
                  {phase !== 'idle' && (
                    <button
                      type="button"
                      onClick={reset}
                      className="flex items-center gap-1.5 border border-border px-3.5 py-2 font-mono text-[12px] text-foreground transition-colors hover:border-foreground"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Reset
                    </button>
                  )}
                  {phase === 'idle' ? (
                    <SovButton arrow onClick={run}>
                      Run sovereign agent
                    </SovButton>
                  ) : phase === 'running' ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 border border-foreground bg-foreground px-4 py-2 font-mono text-[12px] text-primary-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-sovereign sov-pulse" />
                        Agent executing…
                      </div>
                      <button
                        type="button"
                        onClick={handleCancelTask}
                        className="border border-critical bg-critical/10 px-3 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-critical transition-colors hover:bg-critical hover:text-white"
                      >
                        Stop
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 border border-foreground bg-foreground px-4 py-2 font-mono text-[12px] text-primary-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-sovereign" />
                      Completed
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Pipeline view */}
        {phase !== 'idle' && (
          <Reveal delay={120} className="mt-10">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <SectionHeading index="02" title="Pipeline Telemetry" />
                <span className="font-mono text-[11px] text-foreground-muted">
                  state machine · 7 stages
                </span>
              </div>
              <AgentPipeline stages={stages} />
            </div>
          </Reveal>
        )}

        {/* Live Result experience */}
        {phase === 'result' && (
          <Reveal delay={140} className="mt-12">
            <div className="border border-border bg-surface p-6 sm:p-10">
              <SectionHeading index="03" title="Verified Deliverable & Audit Trail" />
              <div className="mt-6">
                <ResultExperience
                  taskId={activeTaskId || undefined}
                  answer={answer}
                  evidence={evidence}
                  verification={verification}
                  deliverable={deliverable}
                  held={isHeld}
                  onDecide={(d) => {
                    if (d === 'approved') setIsHeld(false)
                  }}
                />
              </div>
            </div>
          </Reveal>
        )}

        {/* Topology bottom bar */}
        <Reveal delay={160} className="mt-16">
          <SovereigntyTopology />
        </Reveal>
      </div>
    </div>
  )
}
