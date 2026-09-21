/**
 * InspectorSection — 20-DESIGN-SPEC §4.8, migration step B5.
 *
 * A labelled band inside an InspectorPanel. It owns the label and the band's
 * padding and nothing else; it does NOT impose a grid on its children, so a
 * section can hold InspectorFields, a Table, a raster viewer or prose without
 * any of them fighting the container.
 *
 * Column alignment across fields comes from InspectorField's own fixed
 * 140px label track (§4.8 `.insp-grid`), not from a wrapper here.
 */

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 */
export type { Density } from '@/shared/ui/types'
import type { Density } from '@/shared/ui/types'

export interface InspectorSectionProps {
  /** Mono, uppercase, ledger size. As short as possible. */
  label: string
  /** Density is the primary expressive tool once hue is fixed (§2.5). */
  density?: Density
  children: ReactNode
}

const DENSITY_PAD: Record<Density, string> = {
  comfortable: 'py-[var(--pad-comfortable)]',
  compact: 'py-[var(--pad-compact)]',
  dense: 'py-[var(--pad-dense)]',
}

// NEEDS-GLOBAL: §4.8's `.insp-section` / `.insp-section-label` rules, if the
// class form is ever preferred over these utilities.

export function InspectorSection({
  label,
  density = 'comfortable',
  children,
}: InspectorSectionProps) {
  return (
    <section
      className={cn(
        'border-b border-line-subtle px-[var(--space-6)] last:border-b-0',
        DENSITY_PAD[density],
      )}
    >
      <h3 className="mb-[var(--space-4)] font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
        {label}
      </h3>
      <div className="flex flex-col gap-[var(--space-3)]">{children}</div>
    </section>
  )
}
