/**
 * How each harness outcome and run status is drawn.
 *
 * Shape carries the meaning and hue only reinforces it, as on the stage
 * board: every outcome has its own glyph and label, so the board reads in
 * greyscale and on a projector. Hue follows the product's one rule -- a
 * status colour reports a state: sovereign for delivered, active for
 * running, approval for held, critical for refused and failed. Everything
 * that is merely "not yet" or "never" is ink.
 *
 * Four delivered outcomes are kept apart on purpose. "Every material claim
 * traced" is the only one that earns the solid sovereign fill; a delivery
 * with untraced claims gets a half glyph, and one with nothing to check gets
 * none of the green at all.
 */

import type { HarnessOutcome, RunStatus } from '../model/types'

export interface OutcomeSpec {
  /** Short label, set in mono. */
  label: string
  /** What it means, in one sentence, for the legend and tooltips. */
  meaning: string
  glyph: string
  /** Classes for the 16px marker. */
  marker: string
  /** Label colour: always a -text variant or ink, never a raw status fill. */
  text: string
  /** Classes for one cell of the sequence strip. */
  cell: string
  /** The one state that is genuinely in motion. */
  live?: boolean
}

export const OUTCOME: Record<HarnessOutcome, OutcomeSpec> = {
  supported: {
    label: 'All claims traced',
    meaning: 'Delivered. Every material claim was traced to a passage retrieved for that run.',
    glyph: '✓',
    marker: 'border border-sovereign bg-sovereign text-[var(--on-sovereign)]',
    text: 'text-sovereign-text',
    cell: 'bg-sovereign',
  },
  partially_supported: {
    label: 'Some claims untraced',
    meaning:
      'Delivered, because verification passed its threshold, but some material claims were not traced.',
    glyph: '◐',
    marker: 'border border-sovereign bg-sovereign-surface text-sovereign-text',
    text: 'text-foreground',
    cell: 'bg-sovereign-surface shadow-[inset_0_0_0_1px_var(--sovereign)]',
  },
  no_material_claims: {
    label: 'Nothing to check',
    meaning: 'Delivered. The verifier found no material claim, so nothing in it was checked.',
    glyph: '○',
    marker: 'border border-line-strong text-foreground-secondary',
    text: 'text-foreground-secondary',
    cell: 'bg-surface-sunken shadow-[inset_0_0_0_1px_var(--line-strong)]',
  },
  released_unverified: {
    label: 'Released unverified',
    meaning:
      'Released by a reviewer although automated verification did not pass, or with no verification record.',
    glyph: '!',
    marker: 'border border-dashed border-sovereign text-foreground',
    text: 'text-foreground',
    cell: 'shadow-[inset_0_0_0_1px_var(--sovereign)]',
  },
  held: {
    label: 'Held for review',
    meaning: 'Waiting for a reviewer. Its answer is not released and is not in the report.',
    glyph: '⏸',
    marker: 'border border-approval bg-approval-surface text-approval-text',
    text: 'text-approval-text',
    cell: 'bg-approval',
  },
  rejected: {
    label: 'Rejected',
    meaning: 'A reviewer rejected it. Its answer was not released.',
    glyph: '✕',
    marker: 'border border-critical bg-critical-surface text-critical-text',
    text: 'text-critical-text',
    cell: 'bg-critical-surface shadow-[inset_0_0_0_1px_var(--critical)]',
  },
  refused: {
    label: 'Refused',
    meaning: 'Policy refused it before an answer was released. The system working, not failing.',
    glyph: '⛔',
    marker: 'border-2 border-critical bg-critical text-[var(--on-critical)]',
    text: 'text-critical-text',
    cell: 'bg-critical',
  },
  failed: {
    label: 'Failed',
    meaning: 'It did not complete. The recorded reason is shown with it.',
    glyph: '✕',
    marker: 'border border-critical bg-critical-surface text-critical-text',
    text: 'text-critical-text',
    cell: 'bg-critical-surface shadow-[inset_0_0_0_1px_var(--critical)]',
  },
  cancelled: {
    label: 'Cancelled',
    meaning: 'Stopped before it finished.',
    glyph: '—',
    marker: 'border border-dashed border-line-strong text-foreground-muted',
    text: 'text-foreground-muted',
    cell: 'shadow-[inset_0_0_0_1px_var(--line-strong)]',
  },
  not_submitted: {
    label: 'Never submitted',
    meaning: 'The run ended before this item’s turn, so it never ran.',
    glyph: '⊘',
    marker: 'border border-dashed border-line-strong text-foreground-muted',
    text: 'text-foreground-muted',
    cell: 'shadow-[inset_0_0_0_1px_var(--line-subtle)]',
  },
  pending: {
    label: 'Not yet submitted',
    meaning: 'Waits for the items before it to settle.',
    glyph: '',
    marker: 'border border-control-strong',
    text: 'text-foreground-muted',
    cell: 'shadow-[inset_0_0_0_1px_var(--control-default)]',
  },
  queued: {
    label: 'Queued',
    meaning: 'Submitted, and waiting for the worker.',
    glyph: '',
    marker: 'border border-dashed border-active',
    text: 'text-active-text',
    cell: 'shadow-[inset_0_0_0_1px_var(--active)]',
  },
  running: {
    label: 'Running',
    meaning: 'The worker is executing it now.',
    glyph: '',
    marker: 'border border-active',
    text: 'text-active-text',
    cell: 'bg-active',
    live: true,
  },
}

/** Legend and report order: deliveries first, then what stopped short. */
export const OUTCOME_ORDER: HarnessOutcome[] = [
  'supported',
  'partially_supported',
  'no_material_claims',
  'released_unverified',
  'held',
  'rejected',
  'refused',
  'failed',
  'cancelled',
  'not_submitted',
  'running',
  'queued',
  'pending',
]

export const UNSETTLED: ReadonlySet<HarnessOutcome> = new Set(['pending', 'queued', 'running'])

export interface RunStatusSpec {
  label: string
  text: string
  dot: string
  live?: boolean
}

/**
 * "Finished" is ink, not green: it says the harness drove every item, and
 * nothing about how those items fared. The tally says that.
 */
export const RUN_STATUS: Record<RunStatus, RunStatusSpec> = {
  running: { label: 'Running', text: 'text-active-text', dot: 'bg-active', live: true },
  cancelling: { label: 'Stopping', text: 'text-active-text', dot: 'bg-active', live: true },
  finished: { label: 'Finished', text: 'text-foreground', dot: 'bg-foreground' },
  cancelled: { label: 'Cancelled', text: 'text-foreground-muted', dot: 'bg-control-strong' },
  failed: { label: 'Harness failed', text: 'text-critical-text', dot: 'bg-critical' },
  interrupted: { label: 'Interrupted', text: 'text-critical-text', dot: 'bg-critical' },
}

export const ACTIVE_RUN: ReadonlySet<RunStatus> = new Set(['running', 'cancelling'])
