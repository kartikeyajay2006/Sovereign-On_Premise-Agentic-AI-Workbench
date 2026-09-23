/**
 * How each harness outcome and run status is drawn.
 *
 * Every outcome is drawn as exactly one spectrum state, by the table in
 * docs/design/PLAYBOOK.md §7 and by no other mapping: the strip, the
 * markers, the tally and the words all read it from here, so a child cannot
 * be green in one place and amber in another. Shape carries the meaning and
 * hue only reinforces it: every outcome has its own glyph and label, so the
 * board reads in greyscale and on a projector.
 *
 * The distinctions the backend keeps are kept here. A refusal is not a
 * pass, held is not delivered, and skipped is not done. Of the four
 * deliveries only "every material claim traced" is proved; a delivery with
 * claims untraced, or released without verification, is for a person to
 * look at; and one with nothing to check is delivered without any green.
 */

import type { SpectrumState } from '@/shared/motion'
import type { HarnessOutcome, RunStatus } from '../model/types'

export interface OutcomeSpec {
  /** Short label, set in mono. */
  label: string
  /** What it means, in one sentence, for the legend and tooltips. */
  meaning: string
  /** The one spectrum state this outcome is drawn as. */
  state: SpectrumState
  /** The glyph in its marker. Empty where the cell alone says it. */
  glyph: string
}

export const OUTCOME: Record<HarnessOutcome, OutcomeSpec> = {
  supported: {
    label: 'All claims traced',
    meaning: 'Delivered. Every material claim was traced to a passage retrieved for that run.',
    state: 'proved',
    glyph: '■',
  },
  partially_supported: {
    label: 'Some claims untraced',
    meaning:
      'Delivered, because verification passed its threshold, but some material claims were not traced.',
    state: 'review',
    glyph: '◇',
  },
  released_unverified: {
    label: 'Released unverified',
    meaning:
      'Released by a reviewer although automated verification did not pass, or with no verification record.',
    state: 'review',
    glyph: '◇',
  },
  no_material_claims: {
    label: 'Nothing to check',
    meaning: 'Delivered. The verifier found no material claim, so nothing in it was checked.',
    state: 'neutral',
    glyph: '·',
  },
  held: {
    label: 'Held for review',
    meaning: 'Waiting for a reviewer. Its answer is not released and is not in the report.',
    state: 'held',
    glyph: '⏸',
  },
  rejected: {
    label: 'Rejected',
    meaning: 'A reviewer rejected it. Its answer was not released.',
    state: 'refused',
    glyph: '✕',
  },
  refused: {
    label: 'Refused',
    meaning: 'Policy refused it before an answer was released. The system working, not failing.',
    state: 'refused',
    // ⛔ followed by U+FE0E. The character defaults to emoji presentation,
    // which Windows draws as a colour emoji that ignores the glyph's ink;
    // the selector asks for the text form, so it inverts on the fill.
    glyph: '⛔︎',
  },
  failed: {
    label: 'Failed',
    meaning: 'It did not complete. The recorded reason is shown with it.',
    state: 'failed',
    glyph: '✕',
  },
  running: {
    label: 'Running',
    meaning: 'The worker is executing it now.',
    state: 'active',
    glyph: '◐',
  },
  queued: {
    label: 'Queued',
    meaning: 'Submitted, and waiting for the worker.',
    state: 'pending',
    glyph: '',
  },
  pending: {
    label: 'Not yet submitted',
    meaning: 'Waits for the items before it to settle.',
    state: 'pending',
    glyph: '',
  },
  // The skipped cell is itself a dash, so the marker needs no glyph over it.
  cancelled: {
    label: 'Cancelled',
    meaning: 'Stopped before it finished.',
    state: 'skipped',
    glyph: '—',
  },
  not_submitted: {
    label: 'Never submitted',
    meaning: 'The run ended before this item’s turn, so it never ran.',
    state: 'skipped',
    glyph: '—',
  },
}

/**
 * Words for a state: its -text token where the state is one of the lights,
 * ink where it is not. Never a raw fill, which fails as text.
 */
export const STATE_TEXT: Record<SpectrumState, string> = {
  proved: 'text-sovereign-text',
  review: 'text-approval-text',
  held: 'text-approval-text',
  refused: 'text-critical-text',
  failed: 'text-critical-text',
  active: 'text-active-text',
  neutral: 'text-foreground-secondary',
  pending: 'text-foreground-muted',
  skipped: 'text-foreground-muted',
}

/**
 * The glyph's ink inside a marker drawn as that state's cell. On a solid
 * fill it inverts (a refusal is a solid fill with an inverted glyph); on a
 * tint it takes the state's -text token, which clears the 3:1 a mark needs.
 */
export const STATE_GLYPH: Record<SpectrumState, string> = {
  proved: 'text-on-sovereign',
  review: 'text-approval-text',
  held: 'text-on-approval',
  refused: 'text-on-critical',
  failed: 'text-critical-text',
  active: 'text-on-active',
  neutral: 'text-background',
  pending: 'text-foreground-muted',
  skipped: 'text-foreground-muted',
}

/** The APPEND tone a row takes when its child settles into that state. */
export const STATE_TONE: Record<SpectrumState, 'neutral' | 'sovereign' | 'active' | 'approval' | 'critical'> = {
  proved: 'sovereign',
  review: 'approval',
  held: 'approval',
  refused: 'critical',
  failed: 'critical',
  active: 'active',
  neutral: 'neutral',
  pending: 'neutral',
  skipped: 'neutral',
}

/**
 * States a child settles into: the ones the spectrum ticks for. Skipped is
 * not among them. A child that never ran did not arrive at anything.
 */
export const SETTLED_STATES: ReadonlySet<SpectrumState> = new Set([
  'proved',
  'review',
  'held',
  'refused',
  'failed',
  'neutral',
])

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
}

/**
 * "Finished" is ink, not green: it says the harness drove every item, and
 * nothing about how those items fared. The tally says that.
 *
 * Stopping keeps the running dot, because the child in flight is still
 * executing until its next stage boundary, but its words are ink: a stop
 * that has been asked for is not a state anything has reached yet.
 *
 * No dot pulses. The child actually running is lit on the board, and one
 * light for one running thing is enough.
 */
export const RUN_STATUS: Record<RunStatus, RunStatusSpec> = {
  running: { label: 'Running', text: 'text-active-text', dot: 'bg-active' },
  cancelling: { label: 'Stopping at the next stage boundary', text: 'text-foreground', dot: 'bg-active' },
  finished: { label: 'Finished', text: 'text-foreground', dot: 'bg-foreground' },
  cancelled: { label: 'Cancelled', text: 'text-foreground-muted', dot: 'bg-control-strong' },
  failed: { label: 'Harness failed', text: 'text-critical-text', dot: 'bg-critical' },
  interrupted: { label: 'Interrupted', text: 'text-critical-text', dot: 'bg-critical' },
}

export const ACTIVE_RUN: ReadonlySet<RunStatus> = new Set(['running', 'cancelling'])
