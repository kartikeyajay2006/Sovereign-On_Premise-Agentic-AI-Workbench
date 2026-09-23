'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { SandboxExecuteResponse } from '../model/types'

const TERMINATION_LABELS: Record<string, string> = {
  memory_limit_exceeded: 'terminated: memory limit',
  cpu_time_limit_exceeded: 'terminated: CPU-time limit',
  file_size_limit_exceeded: 'terminated: file-size limit',
  wall_clock_timeout: 'terminated: wall-clock timeout',
  nonzero_exit: 'exited non-zero',
  terminated_by_signal: 'terminated by signal',
  terminated: 'terminated',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const mb = bytes / (1024 * 1024)
  if (mb < 1) return `${(bytes / 1024).toFixed(1)} kB`
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
      {children}
    </span>
  )
}

function Metric({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <span className={cn('text-body text-foreground', mono && 'font-mono tabular')}>{value}</span>
    </div>
  )
}

function OutputBlock({ title, body, tone }: { title: string; body: string; tone?: 'critical' }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{title}</Label>
      <pre
        className={cn(
          'max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm-token)] border border-border bg-surface-sunken p-3 font-mono text-meta leading-[var(--lh-meta)]',
          tone === 'critical' ? 'text-critical-text' : 'text-foreground-secondary',
        )}
      >
        {body || '(none)'}
      </pre>
    </div>
  )
}

export function ResultPanel({
  response,
  error,
  running,
}: {
  response: SandboxExecuteResponse | null
  error: string | null
  running: boolean
}) {
  if (error) {
    return (
      <section className="flex flex-col gap-2 border border-critical-border bg-critical-surface p-5">
        <Label>Request refused</Label>
        <p className="text-body text-critical-text">{error}</p>
        <p className="text-meta text-foreground-muted">
          Nothing was executed. This is the request being refused, not a run that failed.
        </p>
      </section>
    )
  }

  if (running && !response) {
    return (
      <section className="flex items-center gap-2 border border-border bg-surface p-5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-active" />
        <span className="text-body text-foreground-secondary">Submitting payload to the sandbox on this host…</span>
      </section>
    )
  }

  if (!response) {
    return (
      <section className="border border-dashed border-border bg-surface p-6">
        <p className="text-body text-foreground-secondary">
          No run yet. Pick a payload or write code, then run it to see exactly what the
          sandbox on this host does with it — which rule rejected it, or what it measured.
        </p>
      </section>
    )
  }

  const { result, limits, accounting } = response
  const rejected = !result.static_validation_passed
  const contained = !rejected && !result.ok

  const status = rejected
    ? { label: 'Rejected before execution', glyph: '⛔', tone: 'approval' as const }
    : result.ok
      ? { label: 'Completed', glyph: '✓', tone: 'sovereign' as const }
      : { label: 'Contained', glyph: '✕', tone: 'critical' as const }

  const toneText =
    status.tone === 'sovereign'
      ? 'text-sovereign-text'
      : status.tone === 'critical'
        ? 'text-critical-text'
        : 'text-approval-text'
  const toneBorder =
    status.tone === 'sovereign'
      ? 'border-sovereign-border'
      : status.tone === 'critical'
        ? 'border-critical-border'
        : 'border-approval-border'

  return (
    <section className={cn('flex flex-col gap-5 border bg-surface p-5', toneBorder)}>
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-4">
        <span className={cn('flex items-center gap-2 text-heading font-medium', toneText)}>
          <span aria-hidden>{status.glyph}</span>
          {status.label}
        </span>
        <span className="font-mono text-meta text-foreground-muted">
          {new Date(response.ran_at).toLocaleTimeString()} · {limits.mechanism}
        </span>
      </div>

      {rejected ? (
        <div className="flex flex-col gap-2">
          <Label>Static validator — rule that rejected it</Label>
          <ul className="flex flex-col gap-1">
            {result.static_violations.map((v, i) => (
              <li key={i} className="font-mono text-body text-critical-text">
                {v}
              </li>
            ))}
          </ul>
          <p className="text-meta text-foreground-muted">
            The code was parsed and refused before any process was started. No execution took place.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Metric label="Exit code" value={result.exit_code ?? '—'} />
            <Metric label="Duration" value={`${result.duration_ms} ms`} />
            {(contained || accounting.termination_reason) && (
              <Metric
                label="Outcome"
                value={
                  accounting.termination_reason
                    ? TERMINATION_LABELS[accounting.termination_reason] ?? accounting.termination_reason
                    : result.timed_out
                      ? 'terminated: wall-clock timeout'
                      : 'exited non-zero'
                }
                mono={false}
              />
            )}
            {accounting.peak_memory_bytes != null && (
              <Metric label="Peak memory" value={formatBytes(accounting.peak_memory_bytes)} />
            )}
            {accounting.cpu_user_seconds != null && (
              <Metric label="CPU (user)" value={`${accounting.cpu_user_seconds.toFixed(2)} s`} />
            )}
            {accounting.cpu_kernel_seconds != null && (
              <Metric label="CPU (kernel)" value={`${accounting.cpu_kernel_seconds.toFixed(2)} s`} />
            )}
            <Metric label="Network attempts blocked" value={result.network_attempts_blocked} />
            {result.generated_files.length > 0 && (
              <Metric label="Files written" value={result.generated_files.join(', ')} mono={false} />
            )}
          </div>

          <OutputBlock title="stdout" body={result.stdout} />
          {result.stderr.trim() && <OutputBlock title="stderr" body={result.stderr} tone="critical" />}
          {accounting.output_truncated && (
            <p className="text-meta text-approval-text">
              Output exceeded the capture limit and was truncated to protect the host.
            </p>
          )}
        </>
      )}

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <Label>Limits actually applied</Label>
        <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-meta text-foreground-secondary">
          <span>mechanism: {limits.mechanism}</span>
          {limits.memory_mb != null && <span>memory ≤ {limits.memory_mb} MB</span>}
          {limits.cpu_seconds != null && <span>CPU ≤ {limits.cpu_seconds} s</span>}
          {limits.wall_timeout_seconds != null && <span>wall ≤ {limits.wall_timeout_seconds} s</span>}
          {limits.active_process_limit != null && <span>processes ≤ {limits.active_process_limit}</span>}
          {limits.kill_on_close && <span>kill-on-close</span>}
        </div>
        <p className="text-meta text-foreground-muted">
          classification {response.classification} · policy {response.policy_decision} · {response.policy_reason}
        </p>
      </div>
    </section>
  )
}
