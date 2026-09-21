import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface Limit {
  /** The limitation as a bare statement. Sentence case, no softening. */
  title: string
  /** One or two sentences. No "but". */
  body: ReactNode
}

/**
 * Term/definition pairs rather than headings: eight h3s here would flood a
 * screen reader's heading list, and these are definitions, not sections.
 */
export function LimitList({ items, className }: { items: Limit[]; className?: string }) {
  return (
    <dl className={cn('m-0 grid grid-cols-1 gap-x-10 gap-y-7 md:grid-cols-2', className)}>
      {items.map((item) => (
        <div key={item.title} className="border-t border-border pt-4">
          <dt className="text-answer font-medium text-foreground">{item.title}</dt>
          <dd className="m-0 mt-2 max-w-[58ch] text-body leading-[22px] text-foreground-secondary">
            {item.body}
          </dd>
        </div>
      ))}
    </dl>
  )
}
