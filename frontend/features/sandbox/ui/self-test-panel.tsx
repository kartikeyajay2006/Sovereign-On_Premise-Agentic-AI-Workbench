'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'
import { Button } from '@/shared/ui/controls/button'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { runSandboxSelfTest } from '../model/api'
import type { SelfTestReport } from '../model/types'

export function SelfTestPanel() {
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<SelfTestReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      setReport(await runSandboxSelfTest())
    } catch (err) {
      setReport(null)
      setError(err instanceof ApiError ? err.detail || err.message : 'The service did not respond.')
    } finally {
      setRunning(false)
    }
  }

  // Three outcomes, never two. A host that refuses to execute submitted no
  // payload, so it has neither held nor failed — painting that red would accuse
  // the product of a breach it did not have.
  const assessable = report?.assessable !== false
  const banner = !report
    ? null
    : !assessable
      ? { text: report.reason || report.overall, tone: 'muted' as const }
      : report.all_passed
        ? { text: report.overall, tone: 'sovereign' as const }
        : { text: report.overall, tone: 'critical' as const }

  return (
    <section className="flex flex-col gap-4 border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-title font-medium text-foreground">Containment self-test</h2>
          <p className="text-body text-foreground-secondary">
            Submits fixed adversarial payloads to the sandbox on this host and reports what
            each one actually did — the network, filesystem, process-escape and resource
            controls, exercised, not asserted.
          </p>
        </div>
        <Button variant="primary" busy={running} busyLabel="Probing…" icon={Play} onClick={run}>
          Run self-test
        </Button>
      </div>

      {banner && (
        <div
          className={cn(
            'flex flex-col gap-1 border p-4',
            banner.tone === 'sovereign' && 'border-sovereign-border bg-sovereign-surface',
            banner.tone === 'critical' && 'border-critical-border bg-critical-surface',
            banner.tone === 'muted' && 'border-border bg-surface-sunken',
          )}
        >
          <span
            className={cn(
              'text-heading font-medium',
              banner.tone === 'sovereign' && 'text-sovereign-text',
              banner.tone === 'critical' && 'text-critical-text',
              banner.tone === 'muted' && 'text-foreground-secondary',
            )}
          >
            {banner.text}
          </span>
          {report && assessable && (
            <span className="font-mono text-meta text-foreground-muted">
              backend {report.backend} · {report.passed}/{report.total} checks · {report.duration_ms} ms
            </span>
          )}
        </div>
      )}

      {error && (
        <p className="border border-critical-border bg-critical-surface p-4 text-body text-critical-text">
          The self-test could not run: {error}. No result — no claim is made either way.
        </p>
      )}

      {!report && !error && (
        <p className="text-body text-foreground-secondary">
          No result yet. Run it to see the sandbox contain real payloads on this machine.
        </p>
      )}

      {report && assessable && report.checks.length > 0 && (
        <ul className="divide-y divide-border border border-border">
          {report.checks.map((check) => (
            <li
              key={check.name}
              className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <span className="text-body font-medium text-foreground">{check.name}</span>
                <span className="font-mono text-meta text-foreground-muted">payload: {check.target}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono text-meta text-foreground-secondary">{check.detail}</span>
                <span
                  className={cn(
                    'flex items-center gap-1.5 font-mono text-meta font-semibold',
                    check.passed ? 'text-sovereign-text' : 'text-critical-text',
                  )}
                >
                  <span aria-hidden>{check.passed ? '✓' : '✕'}</span>
                  {check.passed ? 'HELD' : 'FAILED'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
