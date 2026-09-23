import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { SandboxSelfTest } from './run-fixture'
import { CARD, MONO_LABEL, MONO_META } from './tokens'

export interface SelfTestProps {
  test: SandboxSelfTest
  label: string
  caption?: ReactNode
  className?: string
}

/**
 * The most recent sandbox self-test the backend recorded, from the audit log.
 *
 * Three outcomes, and the page prints whichever the record holds. "Not
 * assessable" is neutral ink, as the product itself renders it: a host that
 * cannot execute has neither passed nor failed containment, and painting that
 * red would accuse the software of a breach it did not have, while painting
 * it green would claim a control that was never exercised. Only a check that
 * actually ran gets a verdict colour.
 */
export function SelfTest({ test, label, caption, className }: SelfTestProps) {
  const { detail } = test
  const assessable = detail.assessable !== false && detail.checks.length > 0
  const ranAt = detail.ran_at.replace('T', ' ').slice(0, 19)

  return (
    <figure className={cn('m-0 flex flex-col', className)}>
      <div className={cn(CARD, 'overflow-hidden')}>
        <div className="flex h-9 items-center justify-between gap-3 border-b border-border px-3">
          <span className={MONO_LABEL}>{label}</span>
          <span className={cn(MONO_META, 'truncate')}>audit seq {test.sequence}</span>
        </div>

        <div className="flex flex-col gap-3 px-3 py-3">
          <p
            className={cn(
              'm-0 text-body leading-[20px]',
              !assessable
                ? 'text-foreground'
                : detail.all_passed
                  ? 'text-sovereign-text'
                  : 'text-critical-text',
            )}
          >
            {detail.overall}
          </p>

          {assessable ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {detail.checks.map((check) => (
                <li key={check.name} className="border-t border-line-subtle py-2 first:border-t-0 first:pt-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-ui text-foreground">{check.name}</span>
                    <span
                      className={cn(
                        'shrink-0 font-mono text-meta font-medium uppercase tracking-[var(--ls-ledger)]',
                        check.passed ? 'text-sovereign-text' : 'text-critical-text',
                      )}
                    >
                      {check.passed ? 'Held' : 'Did not hold'}
                    </span>
                  </div>
                  <p className={cn(MONO_META, 'm-0 mt-0.5 break-words')}>
                    {check.target} → {check.detail}
                  </p>
                </li>
              ))}
            </ul>
          ) : detail.reason ? (
            <p className="m-0 text-ui leading-[18px] text-foreground-secondary">{detail.reason}</p>
          ) : null}

          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-meta leading-[18px]">
            <dt className="text-foreground-muted">checks run</dt>
            <dd className="m-0 text-foreground-secondary">
              {detail.total === 0 ? 'none' : `${detail.passed} of ${detail.total} held`}
            </dd>
            <dt className="text-foreground-muted">ran_at</dt>
            <dd className="m-0 truncate text-foreground-secondary">{ranAt} UTC</dd>
            <dt className="text-foreground-muted">hash</dt>
            <dd className="m-0 truncate text-foreground-secondary" title={test.hash}>
              {test.hash.slice(0, 8)}…
            </dd>
          </dl>
        </div>
      </div>
      {caption ? <figcaption className="mt-3 text-body text-foreground-secondary">{caption}</figcaption> : null}
    </figure>
  )
}
