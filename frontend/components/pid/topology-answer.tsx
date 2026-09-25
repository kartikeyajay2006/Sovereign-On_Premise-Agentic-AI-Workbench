'use client'

import { cn } from '@/lib/utils'
import type { TopologyResult } from './api'

/** The graph's answer, branch by branch, with the clause each rests on. */
export function TopologyAnswer({ result }: { result: TopologyResult }) {
  if (result.kind === 'isolation' && result.branches) {
    return (
      <div className="flex flex-col gap-2">
        <p className={cn('text-ui font-medium', result.compliant ? 'text-sovereign-text' : 'text-critical-text')}>
          {result.compliant
            ? `Every branch of ${result.tag} can be isolated for ${result.purpose_words} as drawn.`
            : `${result.non_compliant?.length} of ${result.branches.length} branches of ${result.tag} cannot be isolated for ${result.purpose_words} as drawn.`}
        </p>
        <ol className="flex flex-col">
          {result.branches.map((branch) => (
            <li key={branch.line} className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 border-b border-line-subtle py-2 last:border-b-0">
              <span className={cn('pt-0.5 font-mono text-ledger uppercase tracking-[var(--ls-ledger)]', branch.compliant ? 'text-sovereign-text' : 'text-critical-text')}>
                {branch.compliant ? 'Isolable' : 'Not as drawn'}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-ui text-foreground">{branch.action}</span>
                <span className="text-[12px] text-foreground-muted">
                  {branch.method} · {branch.clause}
                  {branch.notes.length > 0 && ` · ${branch.notes.join(' · ')}`}
                </span>
              </span>
            </li>
          ))}
        </ol>
        {result.lines.slice(result.branches.length + 1).map((line) => (
          <p key={line} className="text-meta text-foreground-secondary">{line}</p>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      {result.lines.map((line) => (
        <p key={line} className="text-ui text-foreground">{line}</p>
      ))}
    </div>
  )
}
