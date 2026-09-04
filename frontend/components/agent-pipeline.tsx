'use client'

import { useState } from 'react'
import { Check, X, Clock, Cpu, ChevronRight, Activity, ShieldAlert, PauseCircle } from 'lucide-react'
import type { PipelineStage, StageStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const dot: Record<StageStatus, string> = {
  pending: 'var(--ink-muted)',
  active: 'var(--active)',
  done: 'var(--sovereign)',
  failed: 'var(--critical)',
  held: 'var(--approval)',
  skipped: 'var(--ink-muted)',
}

function StageMarker({ status }: { status: StageStatus }) {
  if (status === 'done')
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--sovereign)] shadow-[0_0_8px_var(--sovereign)]">
        <Check className="h-3 w-3 text-black font-bold" />
      </span>
    )
  if (status === 'failed')
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--critical)] shadow-[0_0_8px_var(--critical)]">
        <X className="h-3 w-3 text-white font-bold" />
      </span>
    )
  if (status === 'held')
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--approval)] bg-[var(--approval)]/20">
        <PauseCircle className="h-3 w-3 text-[var(--approval)] animate-pulse" />
      </span>
    )
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border" style={{ borderColor: dot[status] }}>
      <span
        className={cn('h-2 w-2 rounded-full', status === 'active' && 'sov-pulse')}
        style={{ backgroundColor: dot[status] }}
      />
    </span>
  )
}

export function AgentPipeline({ stages }: { stages: PipelineStage[] }) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null)
  const doneCount = stages.filter((s) => s.status === 'done').length
  const progressPercent = Math.round((doneCount / stages.length) * 100)

  return (
    <div className="relative overflow-hidden rounded-xl border border-ink-border bg-ink tech-grid-ink shadow-2xl">
      {/* Top Header with Progress Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-ink-border px-5 py-3.5 bg-ink-surface/70">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--active)]/15 text-[var(--active)]">
            <Activity className="h-3.5 w-3.5" />
          </span>
          <div className="flex flex-col">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-ink-foreground">
              Autonomous Agent Execution Matrix
            </span>
            <span className="font-mono text-[9px] text-ink-muted">
              Live deterministic stage transitions
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Progress gauge */}
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-ink-border">
              <div
                className="h-full bg-[var(--sovereign)] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="font-mono text-[11px] font-semibold text-[var(--sovereign)]">
              {progressPercent}%
            </span>
          </div>

          <span className="font-mono text-[11px] text-ink-muted">
            {doneCount}/{stages.length} stages
          </span>
        </div>
      </div>

      {/* Stage Grid with Interactive Expansion */}
      <div className="grid grid-cols-1 gap-px bg-ink-border sm:grid-cols-2 lg:grid-cols-3">
        {stages.map((s) => {
          const isExpanded = expandedStage === s.id
          const isActive = s.status === 'active'
          const isHeld = s.status === 'held'

          return (
            <div
              key={s.id}
              onClick={() => setExpandedStage(isExpanded ? null : s.id)}
              className={cn(
                'group relative flex flex-col justify-between cursor-pointer bg-ink px-5 py-4 transition-all duration-200 hover:bg-ink-surface',
                isActive && 'bg-ink-surface/95 ring-1 ring-[var(--active)] shadow-[inset_0_0_16px_rgba(2,132,199,0.15)]',
                isHeld && 'bg-ink-surface/95 ring-1 ring-[var(--approval)]'
              )}
            >
              {/* Header Info */}
              <div className="flex items-start gap-3">
                <div className="pt-0.5">
                  <StageMarker status={s.status} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[10px] text-ink-muted">{s.index}</span>
                      <span className="text-[13px] font-semibold text-ink-foreground group-hover:text-white transition-colors">
                        {s.name}
                      </span>
                    </div>
                    {s.status !== 'pending' && s.latencyMs > 0 && (
                      <span className="font-mono text-[10px] text-ink-muted flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" /> {s.latencyMs}ms
                      </span>
                    )}
                  </div>

                  {/* Model & Active Indicator */}
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-ink-muted truncate flex items-center gap-1">
                      <Cpu className="h-2.5 w-2.5 text-[var(--active)]" /> {s.model || 'Local Runtime'}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-wider text-ink-muted/80">
                      {s.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Real-time laser pulse trace during active stage */}
              {isActive && (
                <div className="mt-3 overflow-hidden rounded-full bg-ink-border h-0.5">
                  <div
                    className="h-full w-full origin-left bg-[var(--active)]"
                    style={{ animation: 'sov-line-grow 1.6s ease-in-out infinite' }}
                  />
                </div>
              )}

              {/* Expandable Detailed Step Telemetry */}
              {isExpanded && s.detail && (
                <div className="mt-3 pt-2 border-t border-ink-border text-[11px] font-mono text-ink-muted animate-in fade-in duration-150">
                  <span className="text-[var(--sovereign)] font-medium">Telemetry Log:</span>
                  <p className="mt-0.5 leading-relaxed bg-ink-surface-sunken/40 p-2 rounded border border-ink-border text-ink-foreground">
                    {s.detail}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
