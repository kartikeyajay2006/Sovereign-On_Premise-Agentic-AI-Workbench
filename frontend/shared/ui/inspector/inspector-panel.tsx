/**
 * InspectorPanel — 20-DESIGN-SPEC §4.8, migration step B5.
 *
 * One container for every stage panel, every rail body, every P&ID side
 * panel, so a user learns the interaction once.
 *
 * No 'use client': this renders structure only. `actions` is a ReactNode, so
 * any interactivity is the caller's client component, not this file's.
 */

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type { StageState } from '@/shared/ui/types'
import type { StageState } from '@/shared/ui/types'

export interface InspectorPanelProps {
  /** "04" — fixed, so the panel is legible before anything has run. */
  index: string
  /** "ROUTING" */
  title: string
  state: StageState
  /** "router v3 · 4 candidates · 1 eligible" */
  subtitle?: string
  /**
   * Both members are nullable and neither is defaulted. A stage that has not
   * started has no duration and no timestamp, and an em dash says so. (P1)
   */
  timing?: { durationMs: number | null; at: string | null }
  actions?: ReactNode
  /**
   * Audit rows this panel is accountable for. The footer is ALWAYS rendered:
   * every stage links to its own audit rows, and a stage that reports none
   * renders an em dash rather than hiding the fact.
   */
  auditSequences?: number[]
  children?: ReactNode
}

/**
 * §5.3. Glyph first, then ring/fill weight, then hue — the position → shape →
 * weight → hue order of P2. The glyph alone survives greyscale.
 */
const STATE_GLYPH: Record<StageState, string> = {
  pending: '○',
  active: '◐',
  done: '✓',
  skipped: '—',
  failed: '✕',
  held: '⏸',
  blocked: '⊘',
  denied: '⛔',
  unavailable: '?',
}

/**
 * The LABEL colour column of §5.3. Every entry is a `-text` variant or an ink
 * token: the four base status colours never land on a text node.
 */
const STATE_TEXT: Record<StageState, string> = {
  pending: 'text-foreground-muted',
  active: 'text-active-text',
  done: 'text-sovereign-text',
  skipped: 'text-foreground-muted',
  failed: 'text-critical-text',
  held: 'text-approval-text',
  blocked: 'text-foreground-muted',
  denied: 'text-critical-text',
  unavailable: 'text-foreground-muted',
}

/** §5.3 — `blocked` carries the suffix "not reached" as part of its label. */
const STATE_LABEL: Record<StageState, string> = {
  pending: 'PENDING',
  active: 'ACTIVE',
  done: 'DONE',
  skipped: 'SKIPPED',
  failed: 'FAILED',
  held: 'HELD',
  blocked: 'BLOCKED · NOT REACHED',
  denied: 'DENIED',
  unavailable: 'UNAVAILABLE',
}

/** The em dash is the only thing an absent value may render as. (P1) */
const EM_DASH = '—'

// NEEDS-GLOBAL: the §4.8 `.insp*` rules are expressed here as Tailwind
// utilities against the same tokens. If they are ever wanted as real classes,
// add §4.8's `.insp`, `.insp-head`, `.insp-index`, `.insp-title`, `.insp-sub`,
// `.insp-section`, `.insp-section-label`, `.insp-grid`, `.insp-value` and
// `.insp-foot` blocks to globals.css verbatim and swap the classNames.

export function InspectorPanel({
  index,
  title,
  state,
  subtitle,
  timing,
  actions,
  auditSequences,
  children,
}: InspectorPanelProps) {
  const audit =
    auditSequences && auditSequences.length > 0
      ? auditSequences.map((n) => `#${n}`).join(' · ')
      : EM_DASH

  return (
    <section
      data-state={state}
      className="grouped overflow-hidden"
      aria-label={`${index} ${title}`}
    >
      <header className="flex flex-wrap items-baseline gap-x-[var(--space-4)] gap-y-[var(--space-2)] border-b border-line-default px-[var(--space-6)] py-[var(--pad-comfortable)]">
        <span className="font-mono text-meta text-foreground-muted tabular">{index}</span>

        <h2 className="text-heading font-medium tracking-[var(--ls-heading)]">{title}</h2>

        <span
          className={cn(
            'inline-flex items-center gap-[var(--space-2)] font-mono text-ledger uppercase tracking-[var(--ls-ledger)]',
            STATE_TEXT[state],
          )}
        >
          <span aria-hidden>{STATE_GLYPH[state]}</span>
          {STATE_LABEL[state]}
        </span>

        {subtitle ? (
          <p className="text-ui text-foreground-secondary">{subtitle}</p>
        ) : null}

        <div className="ml-auto flex items-baseline gap-[var(--space-5)]">
          {timing ? (
            <span className="font-mono text-meta text-foreground-muted tabular">
              {timing.durationMs === null ? EM_DASH : `${timing.durationMs} ms`}
              {' · '}
              {timing.at ?? EM_DASH}
            </span>
          ) : null}
          {actions}
        </div>
      </header>

      {/*
        §4.8: five states, never a sixth. `pending` with nothing to show reads
        "Not reached." rather than an empty box or a skeleton — a skeleton
        would imply content of this shape is already on its way.
      */}
      {children ?? (
        <p className="px-[var(--space-6)] py-[var(--pad-comfortable)] text-body text-foreground-muted">
          {state === 'pending' ? 'Not reached.' : EM_DASH}
        </p>
      )}

      <footer className="px-[var(--space-6)] py-[var(--space-4)] font-mono text-meta text-foreground-muted tabular">
        AUDIT {audit}
      </footer>
    </section>
  )
}
