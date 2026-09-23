import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Verification } from './run-fixture'
import { CARD, MONO_LABEL, MONO_META } from './tokens'

export interface VerificationReportProps {
  verification: Verification
  label: string
  source: string
  caption?: ReactNode
  className?: string
}

/**
 * The verifier's report, check by check, exactly as the run recorded it.
 *
 * Real rows rather than a <pre>: the details are full sentences, and a
 * monospace block either scrolls sideways on a phone or has its lines broken
 * by hand -- which is how the previous version came to carry a report typed
 * out in this repository rather than one read from a run.
 *
 * PASS carries no hue. Green would say "proved", and a check that passed here
 * can have passed for a thin reason: on this run the claim check examined one
 * sentence of three. The product's own SUPPORTED verdict is uncoloured for the
 * same reason. FAIL takes --critical-text, because a check that did not hold
 * is a state the system found, and red is where that state lives.
 */
export function VerificationReport({ verification, label, source, caption, className }: VerificationReportProps) {
  const passed = verification.checks.filter((check) => check.passed).length

  return (
    <figure className={cn('m-0 flex flex-col', className)}>
      <div className={cn(CARD, 'overflow-hidden')}>
        <div className="flex h-9 items-center justify-between gap-3 border-b border-border px-3">
          <span className={MONO_LABEL}>{label}</span>
          <span className={cn(MONO_META, 'truncate')}>{source}</span>
        </div>

        <ul className="m-0 list-none p-0">
          {verification.checks.map((check) => (
            <li key={check.name} className="border-b border-line-subtle px-3 py-2.5 last:border-b-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-mono text-ui text-foreground">{check.name}</span>
                <span
                  className={cn(
                    'shrink-0 font-mono text-meta font-medium uppercase tracking-[var(--ls-ledger)]',
                    check.passed ? 'text-foreground-secondary' : 'text-critical-text',
                  )}
                >
                  {check.passed ? 'Pass' : 'Fail'}
                </span>
              </div>
              <p className="m-0 mt-1 text-ui leading-[18px] text-foreground-secondary">{check.detail}</p>
              {check.warnings.length > 0 ? (
                <ul className="m-0 mt-1.5 flex list-none flex-col gap-0.5 p-0">
                  {check.warnings.map((warning) => (
                    <li key={warning} className={MONO_META}>
                      {warning}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="flex items-baseline justify-between gap-3 border-t border-border px-3 py-2.5">
          <span className="font-mono text-ui text-foreground">valid</span>
          <span
            className={cn(
              'font-mono text-meta font-medium uppercase tracking-[var(--ls-ledger)]',
              verification.valid ? 'text-foreground-secondary' : 'text-critical-text',
            )}
          >
            {String(verification.valid)} · {passed} of {verification.checks.length}
          </span>
        </div>
      </div>
      {caption ? <figcaption className="mt-3 text-body text-foreground-secondary">{caption}</figcaption> : null}
    </figure>
  )
}
