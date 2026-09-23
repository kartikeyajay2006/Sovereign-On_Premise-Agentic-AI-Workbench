import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { MONO_LABEL, MONO_META } from './tokens'

export interface ChainCardProps {
  /** "01" | "02" | "03". */
  index: string
  /** One past-participle verb: Cited | Checked | Recorded. */
  verb: string
  /** The mechanism, as a bare noun phrase. No adjectives. */
  mechanism: string
  /** Two sentences, maximum. */
  body: ReactNode
  /** The machine artifact for this verb -- usually a MachineBlock. */
  artifact: ReactNode
  className?: string
}

export function ChainCard({ index, verb, mechanism, body, artifact, className }: ChainCardProps) {
  return (
    <article className={cn('flex flex-col gap-5', className)}>
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <h3 className="text-title font-medium text-foreground">{verb}</h3>
        <span className={MONO_META}>{index}</span>
      </div>
      <p className={MONO_LABEL}>{mechanism}</p>
      <p className="text-body leading-[22px] text-foreground-secondary">{body}</p>
      {/*
        No `mt-auto`. It belonged to the flex layout, where it pushed the
        artifact to the bottom of a stretched column. Inside the shared
        subgrid row it does the opposite of what is wanted: it bottom-aligns
        each block within the row, so three blocks of unequal height start at
        three different heights -- the exact stagger the subgrid was added to
        remove.
      */}
      <div className="pt-1">{artifact}</div>
    </article>
  )
}
