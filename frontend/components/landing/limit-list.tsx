import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface Limit {
  /** Set on an item whose body the page fills from the run record. */
  id?: string
  /** The limitation as a bare statement. Sentence case, no softening. */
  title: string
  /** One or two sentences. No "but". */
  body: ReactNode
}

/**
 * The limits, two columns of plain statements.
 *
 * Term/definition pairs rather than headings: ten h3s here would flood a
 * screen reader's heading list, and these are definitions, not sections.
 */
export function LimitList({ items, className }: { items: Limit[]; className?: string }) {
  return (
    <dl className={cn('m-0 grid grid-cols-1 gap-x-12 md:grid-cols-2', className)}>
      {items.map((item) => (
        <div key={item.title} className="border-t border-line-subtle py-6">
          <dt className="text-[1rem] font-semibold tracking-[-0.012em] text-foreground">{item.title}</dt>
          <dd className="ae-body m-0 mt-2 text-[0.93rem]">{item.body}</dd>
        </div>
      ))}
    </dl>
  )
}
