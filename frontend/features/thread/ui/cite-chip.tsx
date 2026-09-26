'use client'

import { cn } from '@/lib/utils'

/**
 * A citation id as a chip.
 *
 * Resolved -- the id names evidence this run recorded -- it is a button that
 * opens the source. Unresolved, it is only the id, in mono: nothing is linked
 * that leads nowhere.
 */
export function CiteChip({
  id,
  resolved,
  onCite,
  trace = null,
  className,
}: {
  id: string
  resolved: boolean
  onCite?: ((id: string) => void) | null
  /** The run the id belongs to, for tracing it to its row in the rail. */
  trace?: string | null
  className?: string
}) {
  if (!resolved || !onCite) {
    return <span className={cn('font-mono text-[0.92em] text-foreground-muted', className)}>{id}</span>
  }
  return (
    <button
      type="button"
      onClick={() => onCite(id)}
      data-trace={trace ? `${trace}:${id}` : undefined}
      title={`Open ${id}`}
      className={cn(
        'hover-decay inline-flex h-[18px] items-center rounded-[var(--radius-xs)] bg-surface-sunken px-1.5 align-[1px] font-mono text-[10.5px] font-semibold leading-none text-foreground',
        'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
        className,
      )}
    >
      {id}
    </button>
  )
}
