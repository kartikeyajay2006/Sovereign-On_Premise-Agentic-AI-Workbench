'use client'

import { cn } from '@/lib/utils'
import type { HarnessChildView } from '../model/types'
import { OUTCOME, UNSETTLED } from './outcome'

/**
 * One cell per item, in submission order.
 *
 * This is the run's shape at a glance -- where the held ones fell, how far it
 * has got -- and not a progress bar: there is no fraction of work it claims
 * is done, only items that have or have not settled. It is a picture of the
 * board below, which carries every fact here in words, so the strip is one
 * labelled image rather than twenty-five tab stops.
 */
export function RunStrip({
  items,
  current,
  className,
}: {
  items: HarnessChildView[]
  current: number | null
  className?: string
}) {
  const settled = items.filter((item) => !UNSETTLED.has(item.outcome)).length
  return (
    <div
      role="img"
      aria-label={`${settled} of ${items.length} items settled`}
      className={cn('flex flex-wrap gap-[3px]', className)}
    >
      {items.map((item) => {
        const spec = OUTCOME[item.outcome]
        return (
          <span
            key={item.key}
            title={`#${item.index} · ${spec.label} — ${item.label}`}
            className={cn(
              'block size-3 rounded-[2px]',
              spec.cell,
              spec.live && 'sov-pulse',
              item.index === current && 'outline outline-1 outline-offset-1 outline-foreground',
            )}
          />
        )
      })}
    </div>
  )
}
