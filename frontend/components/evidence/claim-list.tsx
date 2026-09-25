'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClaimVerdict, ClaimVerdictValue } from '@/lib/types'

/**
 * Every material claim in the answer, with its verdict and why.
 *
 * The verifier reads the answer one statement at a time. Each statement is
 * CALCULATED (a figure the formula registry computed), SUPPORTED (a passage
 * carries it), CONFLICTED (it rests on an input the sources disagree about),
 * REQUIRES_HUMAN_DECISION (a disposition only the approving authority takes)
 * or UNSUPPORTED. Each verdict names the evidence it rests on.
 */

const VERDICT: Record<ClaimVerdictValue, { label: string; tone: string }> = {
  CALCULATED: { label: 'Calculated', tone: 'text-sovereign-text' },
  SUPPORTED: { label: 'Supported', tone: 'text-sovereign-text' },
  CONFLICTED: { label: 'Conflicted', tone: 'text-critical-text' },
  REQUIRES_HUMAN_DECISION: { label: 'Human decision', tone: 'text-approval-text' },
  UNSUPPORTED: { label: 'Unsupported', tone: 'text-critical-text' },
}

const ORDER: ClaimVerdictValue[] = ['CONFLICTED', 'UNSUPPORTED', 'REQUIRES_HUMAN_DECISION', 'CALCULATED', 'SUPPORTED']

export function ClaimList({
  claims,
  onCite,
  defaultOpen = false,
}: {
  claims: ClaimVerdict[]
  onCite?: (id: string) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (claims.length === 0) return null
  const counts = ORDER.map((verdict) => [verdict, claims.filter((c) => c.verdict === verdict).length] as const)
    .filter(([, count]) => count > 0)

  return (
    <section aria-label="Claim verdicts" className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="hover-decay flex flex-wrap items-center gap-x-3 gap-y-1 self-start text-meta text-foreground-secondary hover:text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        <span>{claims.length} material claim{claims.length === 1 ? '' : 's'}</span>
        {counts.map(([verdict, count]) => (
          <span key={verdict} className={cn('font-mono text-ledger uppercase tracking-[var(--ls-ledger)]', VERDICT[verdict].tone)}>
            {count} {VERDICT[verdict].label}
          </span>
        ))}
      </button>
      {open && (
        <ol className="flex flex-col">
          {[...claims]
            .sort((a, b) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict))
            .map((claim) => {
              const mark = VERDICT[claim.verdict]
              return (
                <li key={claim.id} className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 border-b border-line-subtle py-2 last:border-b-0">
                  <span className={cn('pt-0.5 font-mono text-ledger uppercase tracking-[var(--ls-ledger)]', mark.tone)}>
                    {mark.label}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-ui text-foreground">{claim.text}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-foreground-muted">
                      {claim.reason}
                      {claim.evidence_ids.map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => onCite?.(id)}
                          className="hover-decay inline-flex h-5 items-center rounded-full bg-surface-sunken px-1.5 font-mono text-[11px] font-semibold text-foreground hover:bg-[color-mix(in_oklab,var(--foreground)_9%,var(--background))] focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
                          title={`Open ${id}`}
                        >
                          {id}
                        </button>
                      ))}
                    </span>
                  </span>
                </li>
              )
            })}
        </ol>
      )}
    </section>
  )
}
