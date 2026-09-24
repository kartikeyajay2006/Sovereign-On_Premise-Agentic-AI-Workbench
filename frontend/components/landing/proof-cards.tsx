import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface ProofCard {
  icon: LucideIcon
  title: string
  line: string
  /** A reading shown in the card itself. */
  live?: ReactNode
  /** The artifact behind the claim, one click away. */
  evidence?: ReactNode
}

/**
 * The security section as four claims, each with its proof one click away.
 *
 * The proofs are the same artifacts the page carried before -- the audit
 * chain your browser re-hashes, the sandbox self-test, the policy file, the
 * page's own header -- but they were printed in full, one under another,
 * with a paragraph each: the densest part of the page, read by the fewest.
 * Now the claim is the card and the artifact opens under it.
 */
export function ProofCards({ cards }: { cards: ProofCard[] }) {
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <li key={card.title} className="ae-reveal ae-proof flex min-w-0 flex-col rounded-[22px] p-5 sm:p-6">
            <span className="ae-proof-icon" aria-hidden>
              <Icon className="size-[18px]" />
            </span>
            <h3 className="m-0 mt-4 text-[1.1rem] font-semibold tracking-[-0.02em] text-foreground">{card.title}</h3>
            <p className="m-0 mt-2 text-[0.92rem] leading-[1.55] text-foreground-secondary">{card.line}</p>
            {card.live ? <div className="mt-4">{card.live}</div> : null}
            {card.evidence ? (
              <details className="ae-proof-more mt-4">
                <summary>Show the evidence</summary>
                <div className="mt-4 flex min-w-0 flex-col gap-4">{card.evidence}</div>
              </details>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
