'use client'

import { memo, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Play } from 'lucide-react'
import { useToast } from '@/components/toast'
import { Button } from '@/shared/ui/controls/button'
import { LEDGER_MUTED, Readout, ReadoutRow } from '@/shared/ui/data/ledger'
import { FailureState, ReadingLine, describeFailure, type ReadFailure } from '@/shared/ui/data/reading'
import { cn } from '@/lib/utils'
import { runSandboxTest, type SandboxReport } from './api'

/** The limit checks deliberately run a CPU spin and a memory bomb. */
const TEST_TIMEOUT_MS = 120_000

type Run =
  | { phase: 'idle' }
  | { phase: 'running'; startedAt: number }
  | { phase: 'done'; report: SandboxReport }
  | { phase: 'failed'; failure: ReadFailure }

function clock(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * The sandbox's own account of what it can contain, on this host, now.
 *
 * Three outcomes, never two. A host that refuses to execute submitted no
 * payload, so it has neither held nor failed; it is shown as not assessable,
 * with the service's reason, and nothing on this panel reads as a pass. A
 * refusal scored as a pass is how this panel once claimed containment it had
 * never tested.
 */
export const SandboxPanel = memo(function SandboxPanel() {
  const [run, setRun] = useState<Run>({ phase: 'idle' })
  const { push } = useToast()
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const start = async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    let timedOut = false
    const timer = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, TEST_TIMEOUT_MS)
    setRun({ phase: 'running', startedAt: Date.now() })
    try {
      const report = await runSandboxTest(controller.signal)
      setRun({ phase: 'done', report })
      push({
        title: !report.assessable
          ? 'Not assessable on this host'
          : report.all_passed
            ? `Containment held: ${report.passed} of ${report.total}`
            : `Containment failure: ${report.total - report.passed} of ${report.total} did not hold`,
        detail: report.assessable
          ? `${report.duration_ms} ms. Recorded in the audit chain.`
          : 'No payload was submitted, so no claim is made either way.',
        tone: !report.assessable ? 'default' : report.all_passed ? 'sovereign' : 'critical',
      })
    } catch (error) {
      if (controller.signal.aborted && !timedOut) return
      setRun({
        phase: 'failed',
        failure: timedOut
          ? { kind: 'timeout', status: null, detail: null, waitedS: TEST_TIMEOUT_MS / 1000 }
          : describeFailure(error),
      })
    } finally {
      window.clearTimeout(timer)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-[72ch] text-body text-foreground-secondary">
          Submits real payloads to the sandbox on this machine, among them a socket opened past the
          static check, a process escape, a write outside the workspace and runaway CPU and memory, and
          reports what the sandbox did with each. Every run is recorded in the audit chain. The console
          lets you write a payload of your own.
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href="/sandbox"
            className="btn"
            data-variant="ghost"
            data-size="sm"
            data-ground="paper"
          >
            Sandbox console
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <Button
            variant="primary"
            size="sm"
            ground="paper"
            icon={Play}
            busy={run.phase === 'running'}
            busyLabel="Probing…"
            onClick={() => void start()}
          >
            {run.phase === 'done' ? 'Run again' : 'Run diagnostics'}
          </Button>
        </div>
      </div>

      {run.phase === 'idle' && (
        <p className="text-body text-foreground-muted">
          Not run in this session. No containment claim is shown until a run makes one.
        </p>
      )}

      {run.phase === 'running' && (
        <ReadingLine what="the sandbox's results" source="GET /api/sovereignty/sandbox-test" startedAt={run.startedAt} />
      )}

      {run.phase === 'failed' && <FailureState failure={run.failure} what="the sandbox's results" retry={() => void start()} />}

      {run.phase === 'done' && !run.report.assessable && (
        <div className="border-l-2 border-dashed border-line-strong bg-surface py-3 pl-4 pr-4">
          <p className="flex items-center gap-2 text-body font-medium text-foreground">
            <span aria-hidden className="font-mono text-foreground-muted">—</span>
            Not assessable on this host
          </p>
          <p className="mt-1 max-w-[72ch] text-body text-foreground-secondary">{run.report.overall}</p>
          {run.report.reason && (
            <p className="mt-2 max-w-[72ch] text-ui text-foreground-muted">{run.report.reason}</p>
          )}
          <p className={cn(LEDGER_MUTED, 'mt-3')}>ran {clock(run.report.ran_at)}</p>
        </div>
      )}

      {run.phase === 'done' && run.report.assessable && (
        <div className="flex flex-col gap-3">
          <ReadoutRow>
            <Readout
              label="Held"
              value={`${run.report.passed} of ${run.report.total}`}
              tone={run.report.all_passed ? 'sovereign' : 'critical'}
            />
            <Readout label="Limits enforced by" value={run.report.backend ?? 'not reported'} />
            <Readout label="Took" value={`${run.report.duration_ms} ms`} />
            <Readout label="Ran" value={clock(run.report.ran_at)} />
          </ReadoutRow>
          <ul className="overflow-hidden rounded-[var(--radius)] bg-surface shadow-[var(--elev-0)]">
            {run.report.checks.map((check, i) => (
              <li
                key={`${check.name}-${i}`}
                className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-3 border-b border-line-subtle px-4 py-3 last:border-b-0 md:grid-cols-[16px_minmax(0,1fr)_minmax(0,1fr)]"
              >
                <span
                  aria-label={check.passed ? 'held' : 'did not hold'}
                  className={cn('pt-0.5 font-mono text-ui', check.passed ? 'text-sovereign-text' : 'text-critical-text')}
                >
                  {check.passed ? '✓' : '✕'}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body text-foreground">{check.name}</span>
                  <span className="break-words font-mono text-ledger text-foreground-muted">{check.target}</span>
                </span>
                <span className="col-start-2 min-w-0 break-words font-mono text-ui text-foreground-secondary md:col-start-3">
                  {check.detail}
                </span>
              </li>
            ))}
          </ul>
          <p className={cn('text-ui', run.report.all_passed ? 'text-foreground-secondary' : 'text-critical-text')}>
            {run.report.overall}
          </p>
        </div>
      )}
    </div>
  )
})
