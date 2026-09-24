/**
 * The vocabulary shared across the UI primitives.
 *
 * These types were each declared locally by the component that needed them
 * first, because the primitives were built in parallel and this module did
 * not exist yet. Two independent definitions of `Provenance` appeared that
 * way — structurally identical, so they interoperated, which is exactly the
 * condition under which they would have drifted apart unnoticed. They live
 * here now and the components re-export from this file.
 */

/** The three control heights: 32, 36, 40. Nothing invents a fourth. */
export type Size = 'sm' | 'md' | 'lg'

/** How much air a region gives its rows. Density is how altitude is encoded
 *  in this interface, so it is a named scale rather than ad-hoc padding. */
export type Density = 'comfortable' | 'compact' | 'dense'

/** The four status hues. These name FILLS, rings and markers. Applied to a
 *  text node each one fails AA on paper, so a label always uses the matching
 *  `--<status>-text` token instead. */
export type Status = 'sovereign' | 'active' | 'approval' | 'critical'

/**
 * What verification concluded about one claim.
 *
 * The distinctions carry weight and are not interchangeable:
 * VERIFIED was recomputed or checked independently; SUPPORTED means a source
 * says so but nobody checked the arithmetic; UNSUPPORTED means nothing backs
 * it, which is an absence rather than a refutation; CONFLICTED means two
 * sources disagree and the system has deliberately not chosen between them.
 */
export type Verdict = 'VERIFIED' | 'SUPPORTED' | 'NEEDS_REVIEW' | 'UNSUPPORTED' | 'CONFLICTED'

/** Where a displayed number came from. */
export type ProvenanceSource = 'measurement' | 'benchmark' | 'config' | 'derived'

/**
 * Required on every rendered number. There is deliberately no way to pass a
 * fallback: a figure on screen must be able to say where it came from, and
 * the bug class this product has suffered from is a component quietly
 * substituting a plausible value for a missing one.
 */
export interface Provenance {
  source: ProvenanceSource
  /** Human sentence: "psutil connection sample, 2s poll". */
  method: string
  /** null renders "age unknown" rather than letting a stale reading look fresh. */
  measuredAt: string | null
  href?: string
  datasetVersion?: string
  runId?: string
}

/**
 * The nine states a pipeline stage can be in.
 *
 * Four of these describe a stage that produced no result, and collapsing
 * them loses the most important distinction the product makes: `skipped`
 * (not needed for this run), `blocked` (an upstream stage failed, so this
 * one never got its turn), `denied` (policy refused it — the system working
 * correctly) and `unavailable` (this host structurally cannot report on it).
 * A board that paints all four the same colour as `done` is the board this
 * interface used to draw.
 */
export type StageState =
  | 'pending'
  | 'active'
  | 'done'
  | 'skipped'
  | 'failed'
  | 'held'
  | 'blocked'
  | 'denied'
  | 'unavailable'
