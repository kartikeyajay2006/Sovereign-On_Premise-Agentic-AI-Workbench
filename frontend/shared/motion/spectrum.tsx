/**
 * The states a harness item or audit record can be in, and a cell of a
 * strip that shows them. Harness Control and the audit chain ribbon draw
 * the strip themselves; this file owns only the vocabulary.
 *
 *   pending  not reached yet            refused  policy said no
 *   active   running now                failed   it broke
 *   proved   every material claim held  neutral  delivered, nothing to check
 *   review   delivered, needs a look    skipped  never submitted, or cancelled
 *   held     waiting for a person's decision
 */

export type SpectrumState =
  | 'pending'
  | 'active'
  | 'proved'
  | 'review'
  | 'held'
  | 'refused'
  | 'failed'
  | 'neutral'
  | 'skipped'

export interface SpectrumCell {
  key: string
  state: SpectrumState
  /** Shown on hover: "Q7 · SOP-INS-014 §4.2". */
  label?: string
}
