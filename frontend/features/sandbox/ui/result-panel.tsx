'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { SandboxExecuteResponse } from '../model/types'

const TERMINATION_LABELS: Record<string, string> = {
  memory_limit_exceeded: 'terminated at the memory limit',
  cpu_time_limit_exceeded: 'terminated at the CPU-time limit',
  file_size_limit_exceeded: 'terminated at the file-size limit',
  wall_clock_timeout: 'terminated at the wall-clock timeout',
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

/** A result hanging under its line, the way a terminal agent shows one. */
function Hang({ children, tone }: { children: ReactNode; tone?: 'critical' | 'muted' }) {
  return (
    <div className={cn('flex gap-2 pl-[0.35rem]', tone === 'critical' ? 'text-critical-text' : 'text-foreground-secondary')}>
      <span aria-hidden className="select-none text-foreground-muted">
        ⎿
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function Output({ body, tone }: { body: string; tone?: 'critical' }) {
  return (
    <pre
      className={cn(
        'max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.65]',
        tone === 'critical' ? 'text-critical-text' : 'text-foreground',
      )}
    >
      {body}
    </pre>
  )
}

/** A measured figure, labelled. Only figures the host reported are passed in. */
function Reading({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-full bg-surface-sunken px-2.5 py-1 text-[12px]">
      <span className="text-foreground-muted">{label}</span>
      <span className="tabular font-mono text-foreground">{value}</span>
    </span>
  )
}

/**
 * What the host did with the code, as a transcript.
 *
 * Three outcomes and never two: refused before it ran (the validator's own
 * words), completed, or contained by a limit. A refusal is not a failure --
 * it is the product working -- so it is amber, and a contained run is red
 * only in its bullet: the containment is what held.
 */
export function ResultPanel({
  response,
  error,
  running,
  code,
}: {
  response: SandboxExecuteResponse | null
  error: string | null
  running: boolean
  code: string | null
}) {
  const lines = code ? code.split('\n').filter((l) => l.trim()).length : 0

  return (
    <section aria-label="Result" aria-live="polite" className="border-t border-line-subtle px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
      {(running || response || error) && (
        <p className="text-foreground-muted">
          <span aria-hidden>$ </span>python payload.py
          {lines > 0 && <span className="text-foreground-muted/70">  # {lines} line{lines === 1 ? '' : 's'}</span>}
        </p>
      )}

      {error ? (
        <div className="mt-1.5 flex flex-col gap-0.5">
          <p className="flex gap-2 text-approval-text">
            <span aria-hidden>●</span> Request refused
          </p>
          <Hang>
            <span className="font-sans text-[13px]">{error}</span>
            <span className="mt-0.5 block font-sans text-[12px] text-foreground-muted">Nothing was executed.</span>
          </Hang>
        </div>
      ) : running && !response ? (
        <p className="mt-1.5 flex items-center gap-2 text-foreground-secondary">
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-active motion-reduce:animate-none" />
          <span className="ae-shimmer font-sans text-[13px] font-medium">Running under this host&apos;s limits…</span>
        </p>
      ) : !response ? (
        <p className="font-sans text-[13.5px] text-foreground-muted">
          Nothing run yet. Pick a payload or write your own, then Run — the result lands here, measured.
        </p>
      ) : (
        <Transcript response={response} />
      )}
    </section>
  )
}

function Transcript({ response }: { response: SandboxExecuteResponse }) {
  const { result, limits, accounting } = response
  const rejected = !result.static_validation_passed
  const termination = accounting.termination_reason
    ? TERMINATION_LABELS[accounting.termination_reason] ?? accounting.termination_reason
    : result.timed_out
      ? TERMINATION_LABELS.wall_clock_timeout
      : null

  const headline = rejected
    ? { text: 'Refused before it ran', tone: 'text-approval-text' }
    : result.ok
      ? { text: `Completed · exit ${result.exit_code ?? '—'} · ${result.duration_ms} ms`, tone: 'text-sovereign-text' }
      : { text: `Contained · ${termination ?? 'exited non-zero'} · ${result.duration_ms} ms`, tone: 'text-critical-text' }

  return (
    <div className="mt-1.5 flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <p className={cn('flex gap-2 font-medium', headline.tone)}>
          <span aria-hidden>●</span>
          <span className="font-sans text-[13.5px]">{headline.text}</span>
          <span className="ml-auto font-normal text-foreground-muted">
            {new Date(response.ran_at).toLocaleTimeString()}
          </span>
        </p>
        {rejected ? (
          <Hang>
            {result.static_violations.map((v, i) => (
              <p key={i} className="text-critical-text">
                {v}
              </p>
            ))}
            <p className="font-sans text-[12px] text-foreground-muted">
              Read and refused by the static validator; no process was started.
            </p>
          </Hang>
        ) : (
          <>
            {result.stdout.trim() && (
              <Hang>
                <Output body={result.stdout.trimEnd()} />
              </Hang>
            )}
            {result.stderr.trim() && (
              <Hang tone="critical">
                <Output body={result.stderr.trimEnd()} tone="critical" />
              </Hang>
            )}
            {!result.stdout.trim() && !result.stderr.trim() && (
              <Hang>
                <span className="text-foreground-muted">(no output)</span>
              </Hang>
            )}
            {accounting.output_truncated && (
              <Hang>
                <span className="font-sans text-[12px] text-approval-text">
                  Output passed the capture limit and was cut, to protect the host.
                </span>
              </Hang>
            )}
          </>
        )}
      </div>

      {!rejected && (
        <div className="flex flex-wrap gap-1.5 font-sans">
          {accounting.peak_memory_bytes != null && <Reading label="peak memory" value={formatBytes(accounting.peak_memory_bytes)} />}
          {accounting.cpu_user_seconds != null && <Reading label="CPU user" value={`${accounting.cpu_user_seconds.toFixed(2)} s`} />}
          {accounting.cpu_kernel_seconds != null && <Reading label="CPU kernel" value={`${accounting.cpu_kernel_seconds.toFixed(2)} s`} />}
          <Reading label="network attempts blocked" value={result.network_attempts_blocked} />
          {result.generated_files.length > 0 && <Reading label="files written" value={result.generated_files.join(', ')} />}
        </div>
      )}

      <p className="font-sans text-[12px] leading-[1.6] text-foreground-muted">
        Limits applied: {limits.mechanism}
        {limits.memory_mb != null && ` · memory ≤ ${limits.memory_mb} MB`}
        {limits.cpu_seconds != null && ` · CPU ≤ ${limits.cpu_seconds} s`}
        {limits.wall_timeout_seconds != null && ` · wall ≤ ${limits.wall_timeout_seconds} s`}
        {limits.active_process_limit != null && ` · processes ≤ ${limits.active_process_limit}`}
        {limits.kill_on_close && ' · kill-on-close'}
        {` · ${response.classification} · policy ${response.policy_decision}: ${response.policy_reason}`}
      </p>
    </div>
  )
}
