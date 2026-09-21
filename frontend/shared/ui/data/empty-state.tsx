'use client'

/* -------------------------------------------------------------------------- */
/* EmptyState — 20-DESIGN-SPEC §4.10.                                          */
/*                                                                            */
/* The query SUCCEEDED and the answer is genuinely nothing. That is a fact we  */
/* measured, not a failure and not a gap, so this component carries no hue,    */
/* no ring and no alarm: it is the calmest of the three non-content states.    */
/*                                                                            */
/* It is deliberately card-less (conflict C2). An empty state always renders   */
/* INSIDE something that already has an edge — a table body, a rail, a panel — */
/* and drawing a second frame inside the first is the "eight cards on one      */
/* screen" failure the token set exists to end.                                */
/*                                                                            */
/* Every empty state names what will appear here, names what produces it, and  */
/* offers the action that starts it. It fades in at --dur-state, OPACITY ONLY: */
/* an empty state that slides in draws attention to the absence.               */
/* -------------------------------------------------------------------------- */

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type EmptyStateKind = 'never-populated' | 'filtered-out' | 'not-permitted'

export interface EmptyStateProps {
  /**
   * Three different facts, three different messages: "No runs match this
   * filter" is not "No runs exist" is not "You lack read permission on this
   * namespace". The kind is rendered as a caption so the three are never
   * confused by a reader who only sees one of them.
   */
  kind: EmptyStateKind
  /** One plain sentence. No illustration, no mascot. "No documents are indexed on this host." */
  headline: string
  /** What produces the thing that will appear here, and what marks its absence. */
  explanation: string
  /** The action that starts it. `href` wins over `onClick` when both are given. */
  action?: { label: string; onClick?: () => void; href?: string }
  className?: string
}

/* The caption is the shape channel (P2): no hue is spent here, so the three
   kinds stay distinguishable in greyscale and in print. */
const KIND_CAPTION: Record<EmptyStateKind, string> = {
  'never-populated': 'NOTHING HERE YET',
  'filtered-out': 'NO MATCHES',
  'not-permitted': 'NOT PERMITTED',
}

/* Local until migration step B1 lands `shared/ui/controls/button.tsx`; this is
   §4.1's `secondary` variant at `sm`, and should be replaced by
   `<Button variant="secondary" size="sm">` the moment that file exists. */
const ACTION_CLASS = cn(
  'hover-decay inline-flex h-[var(--control-sm)] items-center justify-center gap-[var(--space-3)]',
  'whitespace-nowrap rounded-[var(--radius)] px-[10px] text-ui font-medium',
  'bg-surface text-foreground shadow-[0_0_0_1px_var(--control-default)]',
  'hover:bg-surface-sunken hover:shadow-[0_0_0_1px_var(--control-strong)]',
  'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
)

export function EmptyState({ kind, headline, explanation, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'animate-in fade-in animation-duration-[var(--dur-state)] ease-[var(--ease-move)]',
        'flex flex-col px-[var(--space-6)] py-[var(--space-7)]',
        className,
      )}
    >
      <p className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
        {KIND_CAPTION[kind]}
      </p>

      <p className="mt-[var(--space-4)] max-w-[66ch] text-body font-medium text-foreground">{headline}</p>

      <p className="mt-[var(--space-3)] max-w-[66ch] text-body text-foreground-secondary">{explanation}</p>

      {action && (
        <div className="mt-[var(--space-6)]">
          <EmptyStateAction action={action} />
        </div>
      )}
    </div>
  )
}

function EmptyStateAction({ action }: { action: NonNullable<EmptyStateProps['action']> }): ReactNode {
  if (action.href) {
    return (
      <a href={action.href} className={ACTION_CLASS}>
        {action.label}
      </a>
    )
  }
  return (
    <button type="button" onClick={action.onClick} className={ACTION_CLASS}>
      {action.label}
    </button>
  )
}
