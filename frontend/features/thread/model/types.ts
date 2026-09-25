import type {
  CalculationRecord,
  ClaimVerdict,
  ConflictRecord,
  Deliverable,
  DeliverableContent,
  EvidenceItem,
  IntegrityAssessment,
  ModelUsage,
  PipelineStage,
  VerificationCheck,
} from '@/lib/types'

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
  /** The skill the request went through; `text` is then what was typed after it. */
  skill?: { id: string; name: string } | null
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
  /** A reviewer declined to release what a held run produced. */
  | 'rejected'
  | 'denied'
  | 'failed'
  | 'blocked'
  | 'cancelled'

/**
 * Exactly what was dispatched, so "Run again" re-sends the same request
 * rather than whatever the composer happens to hold now.
 */
export interface RunRequest {
  prompt: string
  fileIds: string[]
  attachments: UserTurn['attachments']
  /** A deliverable format, or null for an answer only. */
  format: string | null
  /** A registry id, or null for Automatic. */
  preferredModel: string | null
  /** The skill `prompt` goes through, or null for the prompt as typed. */
  skill: { id: string; name: string } | null
}

/**
 * Which model a stage was routed to, and what became of a requested one.
 *
 * Built from `task.model_selected` while a run is live and from the record's
 * routing decisions once it is not, so both read the same way.
 */
export interface ModelChoice {
  stage: string | null
  model: string | null
  displayName: string | null
  preferredModel: string | null
  preferenceHonoured: boolean | null
  preferenceReason: string | null
}

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
  /**
   * The answer was released while the reader watched: settle() wrote it for
   * the run this thread was following. It is what lets the answer rise into
   * place and its verdict bloom, once. A run opened from the record is a
   * read, not a release, so it stays false there and nothing on it moves.
   */
  releasedLive: boolean
  /**
   * The draft as the model is producing it, or null when nothing is in flight.
   *
   * This is deliberately NOT `answer`, and the distinction is the whole point.
   * The rule above stands: the answer arrives once, complete, already checked.
   * What streams here is the draft, rendered in its own provisional register
   * and discarded the moment the checked answer lands.
   *
   * The failure the rule guards against is unlabelled prose that gets badged
   * as verified after the reader has already read it. A region that says it
   * is a draft, and is visibly not the answer, is not that failure -- it is
   * the same separation Claude draws between thinking and answering. What
   * would reintroduce the failure is letting this text survive into the
   * answer slot, so nothing ever promotes it: `task.answer` overwrites.
   */
  streamingDraft: string | null
  /**
   * Live progress for a stage whose output is not prose the reader can see.
   *
   * Planning runs for the better part of a minute on a CPU host and emits
   * JSON. Rendering that JSON would be noise, and rendering nothing made the
   * longest stage of the run indistinguishable from a hang. The character
   * count is the honest middle: it is measured, it moves, and it claims
   * nothing about what the model is concluding.
   */
  streamProgress: { stage: string; chars: number } | null
  evidence: EvidenceItem[]
  verification: VerificationCheck[]
  deliverable: (Deliverable & { sizeKb: number }) | null
  /** The structured source rendered into `deliverable`, retained for reading in place. */
  deliverableContent: DeliverableContent | null
  /** Computed by the formula registry, never by the model. */
  assessment: IntegrityAssessment | null
  calculations: CalculationRecord[]
  /** Where the sources disagree, and how each disagreement was settled. */
  conflicts: ConflictRecord[]
  /** Every material claim in the answer with its verdict. */
  claims: ClaimVerdict[]
  /** A P&ID question answered from the drawing's graph. */
  topology: import('@/components/pid/api').TopologyResult | null
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
  /**
   * One record per model call, as measured. Appended from
   * `task.model_completed` while live and replaced by the task record's own
   * list at settle, so a live turn and the same run reopened read alike.
   */
  usage: ModelUsage[]
  modelChoices: ModelChoice[]
  /** What was dispatched. Null only for a turn that never reached the API. */
  request: RunRequest | null
  /**
   * The API accepted a stop and the run has not yet reported that it ended.
   * A request, not an outcome: the run may finish its final write first.
   */
  stopRequested: boolean
  /** From `task.queued`: the runs ahead of this one, or null once it runs. */
  queue: { position: number | null; ahead: number } | null
  /** What the classifier made of the request, once the API has said. */
  profile: { taskType: string; sensitivity: string } | null
  /** Why a held run is held, who may release it, and what they decided. */
  approval: {
    reasons: string[]
    approverRoles: string[]
    decision: 'pending' | 'approved' | 'rejected' | 'revision_requested' | null
    reviewerName: string | null
    comment: string | null
  } | null
}

export type Turn = UserTurn | AssistantTurn
