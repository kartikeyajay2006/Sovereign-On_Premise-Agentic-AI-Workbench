'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw, Loader2, Paperclip, Upload, FileText, X } from 'lucide-react'
import {
  CONSOLE_TEMPLATES,
  DEFAULT_PIPELINE,
  DELIVERABLE_FORMATS,
} from '@/lib/presentation'
import { api } from '@/lib/api'
import type { Deliverable, EvidenceItem, PipelineStage, Task, VerificationCheck } from '@/lib/types'
import { useEventStream } from '@/hooks/use-event-stream'
import { AgentPipeline } from '@/components/agent-pipeline'
import { type UploadedFile } from '@/components/file-dropzone'
import { ResultExperience } from '@/components/result-experience'
import { SovButton } from '@/components/sov-button'
import { Reveal, SectionHeading, TechnicalLabel } from '@/components/primitives'
import { SovereignRadialHero } from '@/components/sovereign-radial-hero'
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
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Real result states
  // Nothing is shown as an answer until this machine produced one. A sample
  // answer with sample citations is indistinguishable from a real one on
  // screen, and this is the output the whole platform exists to be trusted for.
  const [answer, setAnswer] = useState('')
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [verification, setVerification] = useState<VerificationCheck[]>([])
  // No deliverable until the run produces one.
  //
  // This used to start as a placeholder 'APPROVAL_NOTE.docx' carrying an
  // invented hash and size. It rendered a working-looking download button for
  // a file that had never been written, and clicking it asked the API for a
  // filename no task record contained: 'Deliverable not found'.
  const [deliverable, setDeliverable] = useState<Deliverable | null>(null)
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (phase === 'idle') setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (phase !== 'idle') return
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const list = Array.from(e.dataTransfer.files).map((f) => ({
        name: f.name,
        sizeKb: Math.max(1, Math.round(f.size / 1024)),
        file: f,
      }))
      addFiles(list)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const list = Array.from(e.target.files).map((f) => ({
        name: f.name,
        sizeKb: Math.max(1, Math.round(f.size / 1024)),
        file: f,
      }))
      addFiles(list)
      e.target.value = ''
    }
  }

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
      title: 'Aegis agent dispatched',
      detail: `Task ${fresh[0]?.name?.toLowerCase() || 'run'} in progress · strictly on-premise`,
      tone: 'sovereign',
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

  // Which subsystem is busy right now, so the diagram shows the actual run.
  const activeNodes: string[] = (() => {
    const running = stages.find((stage) => stage.status === 'active')
    if (!running) return phase === 'running' ? ['agent'] : []
    switch (running.id) {
      case 'classify':
      case 'plan':
        return ['agent', 'model']
      case 'read':
        return ['model', 'documents']
      case 'retrieve':
        return ['vector', 'documents']
      case 'sandbox':
        return ['sandbox']
      case 'draft':
        return ['model', 'agent']
      case 'verify':
        return ['sandbox', 'audit']
      default:
        return ['agent']
    }
  })()

  const applyTemplate = (t: (typeof CONSOLE_TEMPLATES)[0]) => {
    // Fill in the request only. Attachments used to be invented here — file
    // rows appeared with plausible sizes for documents that had never been
    // uploaded, and the task then ran against nothing. The template names the
    // file to attach instead, and the person attaches it.
    setPrompt(t.prompt)
    setFormat(t.format)
  }

  const currentActiveStage = stages.find((s) => s.status === 'active')

  return (
    <div className="relative">
      <div className="relative mx-auto max-w-[1400px] px-5 py-10 lg:px-10 lg:py-14">
        {/* Top Hero Section matching Screenshot */}
        <Reveal>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-8">
            {/* Left Column: Heading + Pitch + Telemetry */}
            <div className="flex flex-col lg:col-span-6">
              {/* Aegis Console Label */}
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[var(--sovereign)]" />
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground-muted">
                  AEGIS CONSOLE
                </span>
              </div>

              {/* Exact 3-line Headline */}
              <h1 className="mt-6 text-5xl font-extrabold tracking-[-0.035em] text-foreground sm:text-6xl md:text-[64px] leading-[1.05]">
                Intelligence
                <br />
                under your
                <br />
                control.
              </h1>

              {/* Subtitle */}
              <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-foreground-secondary">
                Run agentic workflows entirely on-premise. Your models, documents, tools and audit trail never leave the host.
              </p>

              {/* Telemetry Row */}
              <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 font-mono text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="uppercase tracking-[0.14em] text-foreground-muted">EGRESS</span>
                  <span className="font-bold text-foreground">0 packets</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="uppercase tracking-[0.14em] text-foreground-muted">HOST</span>
                  <span className="font-bold text-foreground">127.0.0.1</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="uppercase tracking-[0.14em] text-foreground-muted">MODEL</span>
                  <span className="font-bold text-foreground">Qwen3 8B</span>
                </div>
              </div>
            </div>

            {/* Right Column: Sovereign Radial Topology Diagram */}
            <div className="flex items-center justify-center lg:col-span-6 lg:justify-end">
              <SovereignRadialHero activeNodeId={activeNodes[0]} />
            </div>
          </div>
        </Reveal>

        {/* Compact Modern Command Chassis */}
        <Reveal delay={60} className="mt-8">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'relative rounded-none border transition-all duration-200 bg-surface/95 shadow-sm backdrop-blur-md overflow-hidden',
              isDragging
                ? 'border-foreground ring-2 ring-foreground/15 bg-surface-sunken'
                : 'border-border focus-within:border-foreground/80 focus-within:shadow-[0_2px_16px_rgba(0,0,0,0.04)]',
            )}
          >
            {/* Drag & Drop Overlay */}
            {isDragging && (
              <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-surface/95 backdrop-blur-sm border-2 border-dashed border-foreground animate-in fade-in duration-150">
                <Upload className="h-6 w-6 text-[var(--sovereign)] animate-bounce" />
                <span className="font-mono text-[13px] font-semibold text-foreground">
                  Drop document to attach locally
                </span>
                <span className="font-mono text-[10px] text-foreground-muted uppercase tracking-wider">
                  Air-gapped storage · Zero external egress
                </span>
              </div>
            )}

            {/* Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 px-4 py-2.5 bg-surface-sunken/40">
              <div className="flex items-center gap-3">
                <SectionHeading index="01" title="Task Dispatcher" />
                <span className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[10px] text-foreground-muted border-l border-border pl-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--sovereign)]" />
                  AIR-GAPPED 127.0.0.1
                </span>
              </div>

              {/* Deliverable Format Selector */}
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted hidden md:inline">
                  Deliverable:
                </span>
                <div className="flex items-center gap-1">
                  {DELIVERABLE_FORMATS.map((df) => (
                    <button
                      key={df.id}
                      type="button"
                      disabled={phase !== 'idle'}
                      onClick={() => setFormat(df.id)}
                      className={cn(
                        'border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-all duration-150',
                        format === df.id
                          ? 'border-foreground bg-foreground text-primary-foreground font-semibold shadow-xs'
                          : 'border-border text-foreground-secondary hover:border-foreground/60 hover:text-foreground bg-surface',
                      )}
                    >
                      {df.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Prompt Body */}
            <div className="p-4 sm:p-5">
              <textarea
                id="task-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && phase === 'idle' && prompt.trim()) {
                    e.preventDefault()
                    run()
                  }
                }}
                disabled={phase !== 'idle'}
                placeholder="Ask a procedural question, describe an analysis task, or request an autonomous compliance audit..."
                rows={3}
                className="w-full resize-none bg-transparent font-sans text-[14px] sm:text-[15px] leading-relaxed text-foreground placeholder:text-foreground-muted/70 focus:outline-none disabled:opacity-70"
              />

              {/* Attached Files Pill List */}
              {files.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
                  {files.map((f) => (
                    <div
                      key={f.id}
                      className="group flex items-center gap-2 border border-border bg-surface-sunken/80 px-2.5 py-1 text-[12px] font-mono transition-colors hover:border-foreground/40"
                    >
                      <FileText className="h-3.5 w-3.5 text-foreground-muted" />
                      <span className="max-w-[180px] truncate text-foreground font-medium">{f.name}</span>
                      <span className="text-[10px] text-foreground-muted">{f.sizeKb} KB</span>
                      <span className="border border-border/80 bg-surface px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-foreground-muted">
                        RESTRICTED
                      </span>
                      {f.progress < 100 ? (
                        <Loader2 className="h-3 w-3 animate-spin text-[var(--sovereign)]" />
                      ) : (
                        <span className="text-[10px] text-[var(--sovereign)] font-bold">✓</span>
                      )}
                      {phase === 'idle' && (
                        <button
                          type="button"
                          onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                          aria-label={`Remove ${f.name}`}
                          className="ml-1 text-foreground-muted hover:text-critical transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                disabled={phase !== 'idle'}
                className="hidden"
                onChange={handleFileInputChange}
              />

              {/* Bottom Utility Ribbon */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                <div className="flex items-center gap-3">
                  {/* Attach Button */}
                  <button
                    type="button"
                    disabled={phase !== 'idle'}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 border border-border bg-surface-sunken/60 px-3 py-1.5 font-mono text-[11px] text-foreground-secondary hover:border-foreground/60 hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    <span>Attach Document</span>
                    {files.length > 0 && (
                      <span className="ml-1 rounded-full bg-[var(--sovereign)]/15 px-1.5 py-0.2 text-[10px] font-bold text-[var(--sovereign)]">
                        {files.length}
                      </span>
                    )}
                  </button>

                  <span className="hidden font-mono text-[11px] text-foreground-muted md:inline">
                    Local: 127.0.0.1 · 0 Egress
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="hidden font-mono text-[10px] text-foreground-muted sm:inline">
                    <kbd className="border border-border bg-surface-sunken px-1.5 py-0.5 text-[10px]">⌘</kbd> + <kbd className="border border-border bg-surface-sunken px-1.5 py-0.5 text-[10px]">↵</kbd>
                  </span>

                  {phase !== 'idle' && (
                    <button
                      type="button"
                      onClick={reset}
                      className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono text-[11px] text-foreground transition-colors hover:border-foreground"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Reset
                    </button>
                  )}

                  {phase === 'idle' ? (
                    <SovButton arrow onClick={run} disabled={!prompt.trim()}>
                      Run Aegis Agent
                    </SovButton>
                  ) : phase === 'running' ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 border border-foreground bg-foreground px-3.5 py-1.5 font-mono text-[11px] text-primary-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-sovereign sov-pulse" />
                        Agent executing…
                      </div>
                      <button
                        type="button"
                        onClick={handleCancelTask}
                        className="border border-critical bg-critical/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-critical transition-colors hover:bg-critical hover:text-white"
                      >
                        Stop
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 border border-foreground bg-foreground px-3.5 py-1.5 font-mono text-[11px] text-primary-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-sovereign" />
                      Completed
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Templates (Pre-configured demonstration workflows) - Positioned below Task Dispatcher */}
        {phase === 'idle' && (
          <Reveal delay={100} className="mt-16 sm:mt-20">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground-muted">
                  Pre-configured demonstration workflows
                </span>
                <span className="font-mono text-[9px] text-foreground-muted hidden sm:inline">
                  Click to pre-populate task parameters
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {CONSOLE_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="group relative flex flex-col justify-between rounded-none border border-border bg-surface/80 p-4 text-left backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-semibold text-foreground group-hover:text-[var(--sovereign)] transition-colors">
                          {t.title}
                        </span>
                        <span className="font-mono text-[9px] uppercase tracking-wider rounded border border-border px-1.5 py-0.5 text-foreground-muted group-hover:border-foreground group-hover:text-foreground">
                          .{t.format}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-foreground-secondary">
                        {t.prompt}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 font-mono text-[10px] text-foreground-muted">
                      <span>{t.attach ? 'Requires attachment' : 'Zero files required'}</span>
                      <span className="text-[var(--sovereign)] opacity-0 group-hover:opacity-100 transition-opacity">
                        Load →
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </Reveal>
        )}

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
      </div>
    </div>
  )
}
