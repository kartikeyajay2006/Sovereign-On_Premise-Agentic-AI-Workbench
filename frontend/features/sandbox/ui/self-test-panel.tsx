'use client'

import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/shared/ui/controls/button'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { runSandboxSelfTest } from '../model/api'
import type { SelfTestReport } from '../model/types'

/**
 * The containment self-test: fixed attacks, submitted for real, each line
 * saying what the host did with it.
 *
 * Three outcomes, never two. A host that refuses to execute submitted no
 * payload, so it has neither held nor failed -- painting that red would
 * accuse the product of a breach it did not have.
 */
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

  const assessable = report?.assessable !== false
  const tone = !report ? null : !assessable ? 'muted' : report.all_passed ? 'sovereign' : 'critical'

  return (
    <section aria-labelledby="self-test" className="rounded-[22px] border border-line-subtle bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pb-4 pt-5">
        <div className="flex max-w-[640px] gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface-sunken text-foreground-secondary">
            <ShieldCheck className="size-4" aria-hidden />
          </span>
          <div>
            <h2 id="self-test" className="text-[16px] font-medium text-foreground">
              Containment self-test
            </h2>
            <p className="mt-1 text-[13.5px] leading-[1.55] text-foreground-secondary">
              Submits fixed attacks to the sandbox on this host — network, filesystem, process escape, resource
              exhaustion — and reports what each one actually did. Exercised, not asserted.
            </p>
          </div>
        </div>
        <Button variant="primary" busy={running} busyLabel="Probing…" onClick={run}>
          Run self-test
        </Button>
      </div>

      <div className="border-t border-line-subtle px-5 py-4 font-mono text-[12.5px] leading-[1.7]">
        {error ? (
          <p className="font-sans text-[13.5px] text-critical-text">
            The self-test could not run: {error}. No result, so no claim either way.
          </p>
        ) : !report ? (
          <p className="font-sans text-[13.5px] text-foreground-muted">
            Not run in this session. It takes a few seconds and changes nothing on the host.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p
              className={cn(
                'flex gap-2 font-medium',
                tone === 'sovereign' && 'text-sovereign-text',
                tone === 'critical' && 'text-critical-text',
                tone === 'muted' && 'text-foreground-secondary',
              )}
            >
              <span aria-hidden>●</span>
              <span className="font-sans text-[13.5px]">{assessable ? report.overall : report.reason || report.overall}</span>
              {assessable && (
                <span className="ml-auto font-normal text-foreground-muted">
                  {report.passed}/{report.total} held · {report.backend} · {report.duration_ms} ms
                </span>
              )}
            </p>
            {assessable && report.checks.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {report.checks.map((check) => (
                  <li key={check.name} className="grid grid-cols-[4.5ch_minmax(0,1fr)] gap-x-3 sm:grid-cols-[4.5ch_minmax(0,16rem)_minmax(0,1fr)]">
                    <span className={cn('font-semibold', check.passed ? 'text-sovereign-text' : 'text-critical-text')}>
                      {check.passed ? '✓ held' : '✕ fail'}
                    </span>
                    <span className="font-sans text-[13px] text-foreground">
                      {check.name}
                      <span className="block text-[11.5px] text-foreground-muted">{check.target}</span>
                    </span>
                    <span className="col-start-2 text-foreground-secondary sm:col-start-3">{check.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
