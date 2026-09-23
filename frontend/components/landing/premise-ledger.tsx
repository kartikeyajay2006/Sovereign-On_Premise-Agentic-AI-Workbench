import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CARD, MONO_LABEL, MONO_META } from './tokens'

export interface LedgerEntry {
  question: string
  /** What the run record says, in a sentence built from its fields. */
  answer: ReactNode
  /** The field it was read from. */
  source: string
  /**
   * A run state the answer reports, printed as a mono label before it. `held`
   * -- waiting on a person -- is the only one, and it is the only thing in the
   * ledger that takes a hue: the approval hue, on the label alone. The
   * sentence after it is a reading and stays in ink.
   */
  state?: { label: string; tone: 'held' }
}

export interface PremiseLedgerProps {
  label: string
  runLabel: string
  entries: LedgerEntry[]
  className?: string
}

/** A machine value inside a sentence: an id, a clause, a hash. */
export function Value({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[0.92em] text-foreground">{children}</span>
}

/**
 * The questions self-hosting leaves open, each answered from one run's record.
 *
 * The previous version listed the five questions and left them hanging, which
 * made the premise an assertion: "these are open". Answering each from a real
 * run makes it an argument instead, and it is honest in both directions -- two
 * of the five answers are "not established" and "no one yet", because that is
 * what this run's record says, and a ledger that only showed the flattering
 * rows would be the thing this page is written against.
 */
export function PremiseLedger({ label, runLabel, entries, className }: PremiseLedgerProps) {
  return (
    <div className={cn(CARD, 'overflow-hidden', className)}>
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-0.5 border-b border-border px-4 py-2">
        <span className={MONO_LABEL}>{label}</span>
        <span className={cn(MONO_META, 'truncate')}>{runLabel}</span>
      </div>
      <dl className="m-0">
        {entries.map((entry, i) => (
          <div
            key={entry.question}
            className={cn(
              'grid grid-cols-1 gap-x-6 gap-y-1.5 px-4 py-3.5 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]',
              i > 0 && 'border-t border-line-subtle',
            )}
          >
            <dt className="text-body font-medium leading-[20px] text-foreground">{entry.question}</dt>
            <dd className="m-0 flex flex-col gap-1">
              <span className="text-ui leading-[19px] text-foreground-secondary">
                {entry.state ? (
                  <span className="mr-1.5 font-mono text-meta font-medium uppercase tracking-[var(--ls-ledger)] text-approval-text">
                    {entry.state.label}
                  </span>
                ) : null}
                {entry.answer}
              </span>
              <span className={cn(MONO_META, 'text-foreground-muted')}>{entry.source}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
