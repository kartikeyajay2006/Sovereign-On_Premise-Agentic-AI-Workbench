import type { EvidenceItem, ModelUsage, Task, TaskSummary, VerificationCheck } from '@/lib/types'
import run from '../../public/landing/run.json'

/*
 * Task records as GET /api/tasks/{id} returns them (lib/types.ts Task,
 * transcribed from backend/core/schemas.py). The content is the real run
 * captured in public/landing/run.json -- its evidence, checks and model call
 * -- trimmed to what the screens read. Every date is fixed.
 */

/** Four of the captured run's six passages, as recorded. */
export const EVIDENCE: EvidenceItem[] = (run.evidence as EvidenceItem[]).slice(0, 4)

/** The captured run's model call, filled out to the full ModelUsage shape. */
const USAGE: ModelUsage[] = [
  {
    stage: 'drafting',
    model: 'qwen2.5:3b',
    display_name: 'Qwen2.5 3B',
    model_digest: null,
    prompt_tokens: 1170,
    output_tokens: 29,
    latency_ms: 38902,
    tokens_per_second: 6.16,
    context_window: 5120,
    output_limit: 512,
    done_reason: 'stop',
    first_token_ms: null,
    load_ms: 8,
    prompt_eval_ms: 33708,
    eval_ms: 4708,
    streamed: true,
    cancelled: false,
    started_at: '2026-09-24T01:04:30.000000Z',
  },
]

/**
 * The captured run's four checks plus a fifth that failed, so the stamp's
 * count is not the trivially clean n/n. The tests read these counts back from
 * here rather than hard-coding them.
 */
export const DELIVERED_CHECKS: VerificationCheck[] = [
  ...(run.verification.checks as VerificationCheck[]),
  {
    name: 'citation_coverage',
    passed: false,
    detail: '1 of 3 sentences cites a passage that does not state its figure.',
    warnings: [],
  },
]

function task(overrides: Partial<Task> & Pick<Task, 'id' | 'prompt' | 'status'>): Task {
  return {
    user_id: 'u-engineer',
    user_display_name: 'Integrity Engineer',
    department: 'inspection',
    created_at: '2026-09-24T01:04:29.157504Z',
    updated_at: '2026-09-24T01:05:08.827664Z',
    completed_at: '2026-09-24T01:05:08.827664Z',
    files: [],
    profile: {
      input_type: 'text',
      task_type: 'question_answering',
      complexity: 'simple',
      sensitivity: 'confidential',
      confidence: 0.92,
      step_budget: 6,
      requires_retrieval: true,
      requires_vision: false,
      requires_code_execution: false,
      produces_deliverable: false,
      deliverable_format: null,
      required_capabilities: ['reasoning'],
      reasons: ['asks which procedure clause governs a situation'],
    },
    plan: null,
    preferred_model: null,
    skill: null,
    parent_task_id: null,
    routing: [],
    usage: USAGE,
    tool_calls: [],
    stage_log: [],
    evidence: EVIDENCE,
    verification: null,
    approval: { required: false, reasons: [], approver_roles: [], decision: null },
    deliverables: [],
    deliverable_content: null,
    calculations: [],
    assessment: null,
    conflicts: [],
    review_digest: null,
    topology: null,
    policy_events: run.policy_events,
    answer: null,
    error: null,
    duration_ms: 39647,
    queue_position: null,
    queue_ahead: 0,
    ...overrides,
  }
}

/** A delivered run whose answer is three sentences: one lede, two claims. */
export const DELIVERED_TASK: Task = task({
  id: 'e2e-delivered-0001',
  prompt: run.prompt,
  status: 'delivered',
  answer:
    'A pressure vessel in corrosive service shall receive an internal inspection at intervals not exceeding 48 months [S1]. ' +
    'Its external inspection is due at intervals not exceeding 12 months [S1]. ' +
    'Risk-based planning may change the inspection priority, but the default interval comes from SOP-INS-014 [S3].',
  verification: {
    valid: true,
    checks: DELIVERED_CHECKS,
    material_claims_total: 3,
    material_claims_supported: 3,
    claims: [],
    limitations: [],
    completed_at: '2026-09-24T01:05:08.827664Z',
  },
})

/** The ids the delivered answer cites, in order: what the sources rail lists. */
export const DELIVERED_CITED = ['S1', 'S3']

const HELD_CHECKS: VerificationCheck[] = run.verification.checks as VerificationCheck[]

/** Held for a sensitive request: one approving role, no signature rule. */
export const HELD_TASK: Task = task({
  id: 'e2e-held-0002',
  prompt: 'Summarise the restricted inspection history of V-2104 for the shutdown review.',
  status: 'awaiting_approval',
  completed_at: null,
  answer:
    'V-2104 was last inspected internally within its 48-month interval [S1]. ' +
    'No finding from that inspection is open [S1].',
  verification: {
    valid: true,
    checks: HELD_CHECKS,
    material_claims_total: 2,
    material_claims_supported: 2,
    claims: [],
    limitations: [],
    completed_at: '2026-09-24T01:05:08.827664Z',
  },
  approval: {
    required: true,
    reasons: ['sensitive_data: Sensitive or restricted work always needs an approving authority.'],
    approver_roles: ['reviewer'],
    decision: 'pending',
    required_signatures: [],
    signatures: [],
  },
})

/**
 * A failed PSV bench test: a High finding, which policies/approval-rules.yaml
 * (high_severity_finding) holds for two signatures in order.
 */
export const HIGH_FINDING_TASK: Task = task({
  id: 'e2e-high-0003',
  prompt: 'Assess the attached PSV-2104A bench test record.',
  status: 'awaiting_approval',
  completed_at: null,
  answer:
    'PSV-2104A failed its as-received test: it opened at 11.9 bar against a limit of 11.55 bar [S1]. ' +
    'The finding is High on the protected vessel V-2104 [S1].',
  verification: {
    valid: true,
    checks: HELD_CHECKS,
    material_claims_total: 2,
    material_claims_supported: 2,
    claims: [],
    limitations: [],
    completed_at: '2026-09-24T01:05:08.827664Z',
  },
  approval: {
    required: true,
    reasons: [
      'high_severity_finding: A High finding needs two signatures, the Head of Inspection recommending and the Plant Manager approving (SOP-INS-014 Clause 5.1; SOP-OPS-008 Clauses 2.3 and 3.5).',
    ],
    approver_roles: ['head_of_inspection', 'plant_manager'],
    decision: 'pending',
    required_signatures: [
      {
        role: 'head_of_inspection',
        authority: 'Head of Inspection',
        capacity: 'recommends',
        clause: 'SOP-OPS-008 Clause 2.3',
        rule: 'high_severity_finding',
      },
      {
        role: 'plant_manager',
        authority: 'Plant Manager',
        capacity: 'approves',
        clause: 'SOP-OPS-008 Clause 2.3',
        rule: 'high_severity_finding',
      },
    ],
    signatures: [],
  },
})

/** The same run after the Head of Inspection has signed. */
export const HIGH_FINDING_ONE_SIGNED: Task = {
  ...HIGH_FINDING_TASK,
  id: 'e2e-high-0004',
  approval: {
    ...HIGH_FINDING_TASK.approval!,
    signatures: [
      {
        role: 'head_of_inspection',
        authority: 'Head of Inspection',
        capacity: 'recommends',
        user_id: 'u-head-of-inspection',
        username: 'head_of_inspection',
        name: 'Head of Inspection',
        comment: null,
        signed_at: '2026-09-24T01:10:00Z',
        review_digest: 'a1b2c3d4',
      },
    ],
  },
}

/** A run still in flight, for the live release: GET /api/tasks/{id} first returns this. */
export const EXECUTING_TASK: Task = {
  ...DELIVERED_TASK,
  status: 'executing',
  answer: null,
  verification: null,
  completed_at: null,
  duration_ms: null,
}

export function summaryOf(t: Task): TaskSummary {
  return {
    id: t.id,
    prompt: t.prompt,
    skill: t.skill ?? null,
    parent_task_id: t.parent_task_id ?? null,
    status: t.status,
    task_type: t.profile?.task_type ?? null,
    sensitivity: t.profile?.sensitivity ?? null,
    created_at: t.created_at,
    updated_at: t.updated_at,
    deliverable_count: t.deliverables.length,
    approval_required: Boolean(t.approval?.required),
    user_display_name: t.user_display_name ?? null,
  }
}

export const ALL_TASKS: Task[] = [DELIVERED_TASK, HELD_TASK, HIGH_FINDING_TASK, HIGH_FINDING_ONE_SIGNED]
