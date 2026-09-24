'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useToast } from '@/components/toast'
import { FailureState, describeFailure, type ReadFailure } from '@/shared/ui/data/reading'
import { cn } from '@/lib/utils'
import { runSandboxTest, type SandboxReport } from './api'

/** The limit checks deliberately run a CPU spin and a memory bomb. */
const TEST_TIMEOUT_MS = 120_000

export type SandboxRun =
  | { phase: 'idle' }
  | { phase: 'running'; startedAt: number }
  | { phase: 'done'; report: SandboxReport }
  | { phase: 'failed'; failure: ReadFailure }

export function clock(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * The sandbox self-test, run on request. Held by the screen, so the verdict
 * at the top and the results below it are one run, not two readings.
 *
 * Three outcomes, never two. A host that refuses to execute submitted no
 * payload, so it has neither held nor failed; it is shown as not assessable,
 * with the service's reason, and nothing reads as a pass. A refusal scored as
 * a pass is how this screen once claimed containment it had never tested.
 */
export function useSandboxTest() {
  const [run, setRun] = useState<SandboxRun>({ phase: 'idle' })
  const { push } = useToast()
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const start = useCallback(async () => {
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
  }, [push])

  return { run, start }
}

/**
 * What the sandbox did with each payload, once a run has said. Before that
 * this is one line and a way to the console; the verdict above carries the
 * button.
 */
export const SandboxPanel = memo(function SandboxPanel({
  run,
  onRun,
}: {
  run: SandboxRun
  onRun: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {run.phase === 'failed' && <FailureState failure={run.failure} what="the sandbox's results" retry={onRun} />}

      {run.phase === 'done' && !run.report.assessable && (
        <div className="border-l-2 border-dashed border-line-strong bg-surface py-3 pl-4 pr-4">
          <p className="text-body font-medium text-foreground">Not assessable on this host</p>
          <p className="mt-1 max-w-[72ch] text-body text-foreground-secondary">{run.report.overall}</p>
          {run.report.reason && <p className="mt-2 max-w-[72ch] text-ui text-foreground-muted">{run.report.reason}</p>}
        </div>
      )}

      {run.phase === 'done' && run.report.assessable && (
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
              <span className="col-start-2 min-w-0 break-words text-ui text-foreground-secondary md:col-start-3">
                {check.detail}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-ui text-foreground-muted">
        {run.phase === 'done' || run.phase === 'failed'
          ? 'Each run is recorded in the audit chain. '
          : 'The self-test submits real payloads — a socket, a process escape, a write outside the workspace, runaway CPU and memory — and reports what the sandbox did with each. '}
        <Link
          href="/sandbox"
          className="inline-flex items-center gap-1 font-medium text-foreground-secondary underline-offset-2 hover:text-foreground hover:underline"
        >
          Write a payload of your own
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </p>
    </div>
  )
})
