import type { Deliverable, EvidenceItem, PipelineStage, VerificationCheck } from '@/lib/types'

/**
 * A thread is an ordered list of turns. One assistant turn is one Task —
 * there is no cheap unverified reply path, because a reply that skipped
 * classification, policy, evidence and verification is precisely the thing
 * this product exists to prevent.
 */

export interface UserTurn {
  role: 'user'
  id: string
  text: string
  attachments: {
    fileId: string
    filename: string
    sizeBytes: number
    /**
     * From the upload response, never a literal. The composer used to render
     * "RESTRICTED" on every attachment while uploading them as
     * 'confidential' — a classification asserted by the UI about a file the
     * backend had classified differently.
     */
    classification: string
  }[]
  author: { displayName: string }
  /** Absolute UTC. Relative time is a hover affordance, not the label. */
  at: string
}

/**
 * How a run ended.
 *
 * `denied` is deliberately separate from `failed`. A denial is the product
 * working correctly and gets the heavy treatment; a failure is a bug and gets
 * a quiet outline. Collapsing them means either our crashes look like
 * security or our security looks like a crash.
 */
export type TurnOutcome =
  | 'running'
  | 'delivered'
  | 'held'
  | 'denied'
  | 'failed'
  | 'blocked'
  | 'cancelled'

export interface AssistantTurn {
  role: 'assistant'
  id: string
  taskId: string | null
  outcome: TurnOutcome
  /** Every stage, in canonical order, from the moment the turn mounts.
   *  Events mutate rows; nothing appends, so nothing reflows. */
  stages: PipelineStage[]
  /**
   * Null until verification completes. Never a partial string.
   *
   * This is the single most important field in the file. Streaming prose
   * that has not been claim-verified shows a reader unverified text and then
   * retroactively badges it, which is the worst possible order of operations
   * for a product whose entire claim is verification. The answer arrives once,
   * complete, already checked.
   */
  answer: string | null
  evidence: EvidenceItem[]
  verification: VerificationCheck[]
  deliverable: (Deliverable & { sizeKb: number }) | null
  /** Why the run was refused, when it was. */
  denialReason: string | null
  /** Surfaced rather than swallowed. */
  error: string | null
  startedAt: string
  elapsedMs: number | null
  /**
   * Whether this turn is still attached to the event stream. A frozen
   * timeline that still looks live is the same category of untruth as a
   * fabricated number.
   */
  stream: 'live' | 'closed'
}

export type Turn = UserTurn | AssistantTurn

export function isAssistantTurn(turn: Turn): turn is AssistantTurn {
  return turn.role === 'assistant'
}
