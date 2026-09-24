import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The answer is nothing.
 *
 * Distinct from ErrorState (we tried and failed) and from a reading in
 * progress (we have not been told yet). Those three used to share one grey
 * paragraph, which is how an unreachable service came to look like an empty
 * queue. An empty state is only drawn once a read has actually returned.
 *
 * Left-aligned, like everything else on an instrument panel: a centred icon
 * and a sentence is the shape of a consumer onboarding screen.
 */
export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string
  body?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-start gap-1 px-4 py-8', className)}>
      <p className="text-body font-medium text-foreground">{title}</p>
      {body && <div className="max-w-[66ch] text-body text-foreground-secondary">{body}</div>}
      {action && <div className="mt-3 flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  )
}
