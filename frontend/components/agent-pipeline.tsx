'use client'

import { Check, X } from 'lucide-react'
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
      <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--sovereign)' }}>
        <Check className="h-3 w-3 text-ink" />
      </span>
    )
  if (status === 'failed')
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--critical)' }}>
        <X className="h-3 w-3 text-ink-foreground" />
      </span>
    )
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border" style={{ borderColor: dot[status] }}>
      <span
        className={cn('h-2 w-2 rounded-full', status === 'active' && 'sov-pulse', status === 'held' && 'sov-blink')}
        style={{ backgroundColor: dot[status] }}
      />
    </span>
  )
}

export function AgentPipeline({ stages }: { stages: PipelineStage[] }) {
  return (
    <div className="relative overflow-hidden rounded-[6px] border border-ink-border bg-ink tech-grid-ink">
      <div className="flex items-center justify-between border-b border-ink-border px-5 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-muted">Agent Execution</span>
        <span className="font-mono text-[11px] text-ink-muted">
          {stages.filter((s) => s.status === 'done').length}/{stages.length} stages
        </span>
      </div>

      <div className="grid grid-cols-1 gap-px bg-ink-border sm:grid-cols-2 lg:grid-cols-3">
        {stages.map((s) => (
          <div
            key={s.id}
            className={cn(
              'flex items-start gap-3 bg-ink px-5 py-4 transition-colors',
              s.status === 'active' && 'bg-ink-surface',
            )}
          >
            <div className="pt-0.5">
              <StageMarker status={s.status} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] text-ink-muted">{s.index}</span>
                  <span className="text-[13px] font-medium text-ink-foreground">{s.name}</span>
                </div>
                {s.status !== 'pending' && s.latencyMs > 0 && (
                  <span className="font-mono text-[10px] text-ink-muted">{s.latencyMs}ms</span>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="font-mono text-[10px] text-ink-muted">{s.model}</span>
                {s.status === 'active' && (
                  <span className="flex-1 overflow-hidden">
                    <span className="block h-px w-full origin-left bg-active/40" style={{ animation: 'sov-line-grow 1.6s ease-in-out infinite' }} />
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
