'use client'

import { cn } from '@/lib/utils'

/**
 * Classification chip.
 *
 * Classification is not a status, so it deliberately takes no status hue —
 * a RESTRICTED document is not an error. It is distinguished by weight of
 * rule instead, which keeps the four status colours meaning exactly one
 * thing across the product.
 */
const CLASSIFICATION_EDGE: Record<string, string> = {
  restricted: 'border-control-strong text-foreground',
  sensitive: 'border-control-default text-foreground-secondary',
  confidential: 'border-control-default text-foreground-secondary',
  normal: 'border-line-default text-foreground-muted',
  // Nothing classified this record. Dashed, so an absent classification is
  // never mistaken for the lowest one.
  unclassified: 'border-dashed border-line-strong text-foreground-muted',
}

export function ClassificationTag({ level, dark }: { level: string; dark?: boolean }) {
  const key = String(level || 'unclassified').toLowerCase()
  const edge = CLASSIFICATION_EDGE[key] ?? CLASSIFICATION_EDGE.normal
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-[var(--radius-xs)] border px-2 font-mono text-ledger uppercase tracking-[var(--ls-ledger)]',
        dark ? 'border-ink-border text-ink-muted' : edge,
      )}
    >
      {level || 'unclassified'}
    </span>
  )
}
