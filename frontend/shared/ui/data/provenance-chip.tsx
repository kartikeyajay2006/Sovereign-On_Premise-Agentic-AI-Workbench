/**
 * ProvenanceChip — the `[ source ]` affordance that states where a number
 * came from.
 *
 * Spec: 20-DESIGN-SPEC §4.7 (the chip sits bottom-right of a MetricTile and
 * becomes a link when `provenance.href` is present), §5.5, §1 P1.
 * Research: 12-RESEARCH-EVIDENCE-UI §2.1 (C2PA UX Recommendations).
 *
 * Two rules from C2PA are load-bearing here and are the reason this component
 * carries NO hue at all:
 *
 *   1. "Do not attempt to determine the veracity of an asset for a user."
 *      The chip reports the record; it does not adjudicate it.
 *   2. "Do not add a valid status, as the icon alone should already indicate
 *      the presence of a valid manifest." (§5.5: never a green tick beside a
 *      provenance mark.) Stacking a validity badge teaches users that the
 *      absence of a tick means invalid, when it usually means UNKNOWN.
 *
 * So: mono ink, a ring, and words. No status colour, no check, no shield.
 */

import Link from 'next/link'

import { cn } from '@/lib/utils'

export type { Provenance, ProvenanceSource } from '@/shared/ui/types'
import type { Provenance } from '@/shared/ui/types'

/**
 * The caption under a metric: `psutil · 2s poll · 14:32:07`.
 *
 * `measuredAt: null` renders the literal string `age unknown` (§4.7). Written
 * as an explicit null test rather than `?? 'age unknown'` so it reads as a
 * stated case rather than as a fallback — the `??` shape is the exact bug
 * class this component exists to prevent.
 */
export function formatProvenanceCaption(provenance: Provenance): string {
  const age =
    provenance.measuredAt === null ? 'age unknown' : provenance.measuredAt
  return `${provenance.method} · ${age}`
}

/** Everything we know about where the figure came from, for the tooltip. */
function describeProvenance(provenance: Provenance): string {
  const parts = [
    `source: ${provenance.source}`,
    `method: ${provenance.method}`,
    provenance.measuredAt === null
      ? 'measured at: age unknown'
      : `measured at: ${provenance.measuredAt}`,
  ]
  if (provenance.datasetVersion !== undefined) {
    parts.push(`dataset: ${provenance.datasetVersion}`)
  }
  if (provenance.runId !== undefined) {
    parts.push(`run: ${provenance.runId}`)
  }
  return parts.join('\n')
}

export interface ProvenanceChipProps {
  provenance: Provenance
  className?: string
}

const CHIP_CLASS =
  'inline-flex items-center rounded-[var(--radius-xs)] text-foreground-muted font-mono uppercase whitespace-nowrap'

const CHIP_STYLE = {
  gap: 'var(--space-2)',
  padding: 'var(--space-1) var(--space-3)',
  fontSize: 'var(--size-ledger)',
  lineHeight: 'var(--lh-ledger)',
  letterSpacing: 'var(--ls-ledger)',
} as const

export function ProvenanceChip({ provenance, className }: ProvenanceChipProps) {
  const description = describeProvenance(provenance)

  const body = (
    <>
      <span aria-hidden="true">[</span>
      <span>{provenance.source}</span>
      <span aria-hidden="true">]</span>
    </>
  )

  if (provenance.href !== undefined) {
    return (
      <Link
        href={provenance.href}
        title={description}
        aria-label={`Open the source for this figure: ${provenance.method}`}
        data-source={provenance.source}
        className={cn(
          CHIP_CLASS,
          'hover-decay shadow-[0_0_0_1px_var(--control-default)]',
          'hover:text-foreground hover:shadow-[0_0_0_1px_var(--foreground)]',
          'focus-visible:shadow-focus focus-visible:outline-none',
          className,
        )}
        style={CHIP_STYLE}
      >
        {body}
      </Link>
    )
  }

  // No href is not a failure state and is not drawn as one: the record is still
  // stated, it just has nowhere to go. Cause-agnostic, per C2PA.
  return (
    <span
      title={description}
      data-source={provenance.source}
      className={cn(CHIP_CLASS, 'shadow-[0_0_0_1px_var(--line-default)]', className)}
      style={CHIP_STYLE}
    >
      {body}
    </span>
  )
}
