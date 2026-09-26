'use client'

import { cn } from '@/lib/utils'

/**
 * A resolved citation's look: the lime tint and lime ink (a deep olive by
 * day), square, mono. Only for an id that names recorded evidence -- lime is
 * spent on what the reader can act on, and on what is cited.
 */
export const CITE_CHIP = cn(
  'hover-decay inline-flex items-center rounded-[var(--radius-xs)] px-1.5 font-mono text-[10.5px] font-semibold leading-none',
  'bg-[var(--cite-wash)] text-[var(--cite-ink)] hover:bg-[var(--cite-wash-hover)] data-[popup-open]:bg-[var(--cite-wash-hover)]',
  'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
)

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
      className={cn(CITE_CHIP, 'h-[18px] align-[1px]', className)}
    >
      {id}
    </button>
  )
}
