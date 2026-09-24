export type RoleId = 'operator' | 'engineer' | 'reviewer' | 'auditor' | 'admin'

export type TaskStatus =
  | 'received'
  | 'classified'
  | 'planned'
  | 'retrieving'
  | 'executing'
  | 'verifying'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'delivered'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'cancelled'
  | 'pending'
  | 'running'
  | 'AWAITING APPROVAL'
  | 'DELIVERED'
  | 'FAILED'
  | 'BLOCKED'
  | 'CANCELLED'

export type Sensitivity = 'normal' | 'confidential' | 'sensitive' | 'restricted'
export type ModelRole = 'reasoning' | 'coding' | 'vision' | 'embedding'
export type PolicyDecision = 'allow' | 'deny' | 'require_approval'

export interface Role {
  id: RoleId
  label: string
  description: string
  capabilities: string[]
}

export interface User {
  id: string
  username: string
  display_name: string
  role: string
  department: string
  active: boolean
  permissions: string[]
  max_data_classification: 'normal' | 'confidential' | 'sensitive' | 'restricted'
}

export interface Session {
  token: string
  user: User
  issued_at: string
  expires_at: string
}

/**
 * The nine states a pipeline stage can be in.
 *
 * This shipped with six. The three additions are the ones that carry the
 * demo, because four of these states describe a stage that produced no
 * result and they are not the same fact:
 *
 *   skipped      the system chose not to run it — no numeric claims were
 *                made, so there was nothing to recompute
 *   blocked      the system correctly stopped upstream, so this stage never
 *                got its turn
 *   denied       policy refused it. This is the product working, not failing
 *   unavailable  this host structurally cannot report on it
 *
 * Collapsing them is what let the old board paint stages green that had
 * never received an event. The distinction between "the system broke" and
 * "the system correctly stopped" is the single most important thing this
 * interface has to communicate.
 *
 * Re-exported from shared/ui/types so the primitives and the app agree on
 * one vocabulary.
 */
export type { StageState as StageStatus } from '@/shared/ui/types'
import type { StageState as StageStatus } from '@/shared/ui/types'

export interface PipelineStage {
  id: string
  index: string
  name: string
  model: string
  status: StageStatus
  detail?: string
  /**
   * ISO timestamp of when this stage started. Drives the measured dwell
   * counter. Null until it starts — never a placeholder.
   */
  at: string | null
  /**
   * Final elapsed time, frozen when the stage settles. Null while running or
   * if it never ran.
   *
   * Replaces `latencyMs: number`, which was initialised to 0 for every stage
   * in DEFAULT_PIPELINE and never filled in by anything — so the board was
   * reading a hardcoded zero and suppressing it with `latencyMs > 0`. Null
   * says "no reading"; 0 would say "instantaneous", and those are different
   * claims.
   */
  elapsedMs: number | null
  /** One short backend-authored clause. Never templated in the UI. */
  headline?: string | null
}

export interface StoredFile {
  id: string
  task_id?: string | null
  filename: string
  stored_path?: string
  media_type: string
  size_bytes: number
  sha256: string
  input_type: string
  classification: string
  owner_id?: string
  department?: string
  quarantine_passed: boolean
  quarantine_notes?: string[]
  uploaded_at: string
}

export interface TaskProfile {
  input_type: string
  task_type: string
  complexity: string
  sensitivity: string
  confidence: number
  step_budget: number
  requires_retrieval: boolean
  requires_vision: boolean
  requires_code_execution: boolean
  produces_deliverable: boolean
  deliverable_format?: string | null
  required_capabilities: string[]
  signals?: { dimension: string; value: string; score: number; matched?: string[] }[]
  reasons: string[]
}

export interface EvidenceItem {
  id: string
  source_document?: string
  document_id?: string | null
  location?: string | null
  page_number?: number | null
  excerpt: string
  extraction_method?: string | null
  extraction_model?: string | null
  extraction_data?: Record<string, unknown> | null
  confidence?: number | null
  source_sha256?: string | null
  score?: number | null
  department?: string | null
  classification?: string
  version?: string | null
  ingested_at?: string | null
  kind?: string
  // UI legacy aliases
  source?: string
  clause?: string
  similarity?: number
}

export interface VerificationCheck {
  name?: string
  kind?: string
  passed?: boolean
  detail?: string
  evidence_ids?: string[]
  warnings?: string[]
  // UI legacy aliases
  label?: string
  result?: string
  ok?: boolean
}

export interface VerificationReport {
  valid: boolean
  checks: VerificationCheck[]
  material_claims_total: number
  material_claims_supported: number
  limitations: string[]
  completed_at: string
}

export interface Deliverable {
  id?: string
  filename: string
  format: string
  size_bytes: number
  sha256: string
  download_url?: string
  released: boolean
  created_at?: string
  // UI helper
  sizeKb?: number
}

/**
 * The verified structured source rendered into a generated file. Values stay
 * deliberately JSON-shaped because the renderer supports document, sheet and
 * presentation formats; the thread only reads the human-facing fields.
 */
export interface DeliverableContent {
  title?: string
  reference?: string
  summary?: string
  sections?: Array<{ heading?: string; body?: string; bullets?: string[] }>
  findings?: Array<{ description?: string; severity?: string; reference?: string }>
  recommendation?: string
  approval_statement?: string
}

export interface ApprovalRecord {
  required: boolean
  reasons: string[]
  approver_roles: string[]
  decision?: 'pending' | 'approved' | 'rejected' | null
  reviewer_id?: string | null
  reviewer_name?: string | null
  comment?: string | null
  decided_at?: string | null
}

export interface PlanStep {
  id: number
  action: string
  objective: string
  inputs?: string | null
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  result_summary?: string | null
}

export interface AgentPlan {
  version: number
  steps: PlanStep[]
  expected_outputs: string[]
  risks: string[]
  created_at: string
}

export interface ToolCall {
  id: string
  tool: string
  arguments: Record<string, any>
  ok: boolean
  output_summary: string
  output: Record<string, any>
  error?: string | null
  started_at: string
  duration_ms: number
  policy_decision: string
}

export interface RoutingDecision {
  requested_role: string
  required_capabilities: string[]
  selected_model?: string | null
  selected_display_name?: string | null
  rule: string
  reason: string
  used_fallback: boolean
  candidates: Record<string, any>[]
  decided_at: string
  /** The pipeline stage this decision served; null on records written before
   *  the field existed, and for a decision routed without a stage. */
  stage: string | null
  /** What the person asked for in the composer. Null when they chose
   *  Automatic -- and then the two fields below are null as well. */
  preferred_model: string | null
  /** True when used, false when declined. Never true for a model that failed
   *  a gate: the router honours a request only inside the same policy. */
  preference_honoured: boolean | null
  /** The one gate that declined the request, as a clause:
   *  "qwen3:8b lacks the vision capability this stage requires". */
  preference_reason: string | null
}

/**
 * What one model call cost. Transcribed from ModelUsage in
 * backend/core/schemas.py, field for field.
 *
 * Every count is nullable because the runtime does not always report one --
 * Ollama omits a zero counter, and a stopped call never receives the final
 * message the counts travel in. Null is "not reported" and must render as
 * nothing. It is never a zero: a total that read a missing count as 0 would
 * understate the run, which is the class of figure this interface exists to
 * refuse.
 */
export interface ModelUsage {
  stage: string
  /** Registry id, e.g. "qwen2.5:3b". */
  model: string
  display_name: string | null
  prompt_tokens: number | null
  output_tokens: number | null
  /** Wall clock around the whole call, timed by the orchestrator. */
  latency_ms: number
  /** Output tokens over the runtime's own generation time, so model load and
   *  prompt processing are not averaged in. */
  tokens_per_second: number | null
  /** The num_ctx this call ran with -- the stage budget, which is far below
   *  the model's declared maximum. Fill is measured against this. */
  context_window: number | null
  /** The num_predict this call ran with. */
  output_limit: number | null
  /** "stop" for a finished answer; "length" when the output limit ran out. */
  done_reason: string | null
  /** Streamed calls only: the wait before the runtime's first token. */
  first_token_ms: number | null
  load_ms: number | null
  prompt_eval_ms: number | null
  eval_ms: number | null
  streamed: boolean
  /** Stopped at the operator's request; carries wall clock and no counts. */
  cancelled: boolean
  started_at: string
}

export interface Task {
  id: string
  prompt: string
  status: TaskStatus
  user_id: string
  user_display_name?: string | null
  department?: string | null
  created_at: string
  updated_at: string
  completed_at?: string | null
  files: StoredFile[]
  profile?: TaskProfile | null
  plan?: AgentPlan | null
  /** The model the person asked for, or null for Automatic. */
  preferred_model: string | null
  /** Set when the request came from a skill: `prompt` is its rendering. */
  skill?: SkillInvocation | null
  routing: RoutingDecision[]
  /** One record per model call, in the order they ran. Persisted. */
  usage: ModelUsage[]
  tool_calls: ToolCall[]
  evidence: EvidenceItem[]
  verification?: VerificationReport | null
  approval?: ApprovalRecord | null
  deliverables: Deliverable[]
  deliverable_content?: DeliverableContent | null
  policy_events?: any[]
  answer?: string | null
  error?: string | null
  duration_ms?: number | null
  queue_position?: number | null
  queue_ahead?: number
}

export interface TaskSummary {
  id: string
  prompt: string
  /** The skill the request went through; `prompt` is then its rendering. */
  skill?: SkillInvocation | null
  status: TaskStatus
  task_type?: string | null
  sensitivity?: string | null
  created_at: string
  updated_at: string
  deliverable_count: number
  approval_required: boolean
  user_display_name?: string | null
}

// UI view records
export interface TaskRecord {
  id: string
  title: string
  actor: string
  role: RoleId
  model: string
  started: string
  durationMs: number
  status: TaskStatus
  type: string
  classification: 'CONFIDENTIAL' | 'RESTRICTED' | 'INTERNAL'
}

export interface KnowledgeDocument {
  id: string
  title: string
  source_path: string
  department: string
  classification: string
  version: string
  chunk_count: number
  sha256: string
  ingested_at: string
  media_type: string
  size_bytes: number
}

export interface KnowledgeSearchResponse {
  query: string
  retrieval_mode: 'embedding' | 'lexical'
  results: EvidenceItem[]
  took_ms: number
}

export interface ApprovalDecisionRequest {
  decision: 'approve' | 'reject'
  comment?: string | null
}

export interface TaskCreateRequest {
  prompt: string
  file_ids?: string[]
  deliverable_format?: string | null
  /** A registry id to prefer. Advisory: honoured per stage only where policy
   *  would allow that model anyway. At most 128 characters. */
  preferred_model?: string | null
  /** A skill to run; `prompt` is then what was typed after it. */
  skill_id?: string | null
}

/**
 * A saved instruction called as /id. It changes only what a run is asked:
 * the rendered request meets every gate a typed one does.
 */
export interface Skill {
  id: string
  name: string
  summary: string
  template: string
  deliverable_format: 'docx' | 'xlsx' | 'pptx' | 'md' | null
  input_hint: string | null
  source: 'built_in' | 'custom'
  author: string | null
  author_display_name: string | null
  created_at: string | null
  sha256: string
}

export interface SkillDraft {
  id: string
  name: string
  summary: string
  template: string
  deliverable_format: Skill['deliverable_format']
  input_hint: string | null
}

/** Which skill produced a task's request, at which hash, from what input. */
export interface SkillInvocation {
  id: string
  name: string
  sha256: string
  source: string
  input: string
}

export interface DiagnosticStep {
  label?: string
  name?: string
  target?: string
  status?: string
  detail: string
}

export interface PolicyRow {
  tool?: string
  subject?: string
  action?: string
  target?: string
  point?: string
  decision?: string
  operator?: string
  reviewer?: string
  engineer?: string
  admin?: string
}

export interface AuditEvent {
  sequence?: number
  id?: string
  at?: string
  actor: string
  actor_role?: string | null
  task_id?: string | null
  category: 'TASK' | 'MODEL' | 'TOOL' | 'POLICY' | 'APPROVAL' | 'SECURITY' | 'SOVEREIGNTY' | string
  action: string
  detail?: Record<string, any>
  prev_hash?: string
  hash: string
  // Legacy aliases
  seq?: number
  timestamp?: string
  prevHash?: string
}

export interface NetworkConnection {
  laddr: string
  raddr: string | null
  status: string
  pid: number | null
  process: string | null
  allowed: boolean
  reason: string
}

export interface SovereigntyStatus {
  sovereign: boolean
  external_api_calls: number
  internet_requests: number
  dns_requests: number
  unapproved_connections: number
  local_connections: number
  monitored_since: string
  last_checked: string
  violations: NetworkConnection[]
  /** False while the monitor is stopped or its last sample took no reading. */
  monitor_active: boolean
  /** Why the last sample took no reading, when it did not. */
  monitor_error?: string | null
  interfaces: Record<string, any>
}

export interface ModelDescriptor {
  id: string
  display_name: string
  family: string
  role: string
  capabilities: string[]
  context_window: number
  quantization?: string | null
  parameters_b?: number | null
  approved_classifications: string[]
  provider: string
  provider_model: string
  available: boolean
  registered: boolean
  size_bytes?: number | null
  notes?: string | null
}

/**
 * GET /api/models/status, transcribed from the route rather than imagined.
 *
 * The previous declaration had four of its six fields wrong: `registered` was
 * typed as ModelDescriptor[] when the route returns `len(snapshot.models)`, a
 * number; `provider_reachable`, `installed_on_host` and `unregistered_on_host`
 * do not exist on the response at all. request<T>() asserts rather than
 * validates, so tsc had nothing to check against and the Registry page
 * compiled clean and crashed on load with `status?.registered.map is not a
 * function` the moment the fetch resolved.
 *
 * This is counts and roles. The model list is a different endpoint,
 * GET /api/models, which is what api.models() returns.
 */
export interface ModelsStatus {
  provider: string
  base_url: string
  reachable: boolean
  /** How many models the registry knows about. A count, not a list. */
  registered: number
  /** How many of those are actually present on the host. */
  available: number
  /** Provider models installed on the host that the registry does not list. */
  unregistered_installed: string[]
  residency: Record<string, unknown>
  /**
   * Ollama's own /api/ps entries, passed through unchanged by
   * manager.resident_models() -- objects, not names. This was typed string[]
   * when it was transcribed, which the registry screen had to work around
   * with a type of its own.
   */
  resident_in_runtime: {
    name?: string
    model?: string
    size?: number
    size_vram?: number
    expires_at?: string
  }[]
  /** role -> the ids of the available models serving it. */
  roles: Record<string, string[]>
}

export interface StreamEvent {
  event: string
  task_id?: string | null
  at: string
  data: Record<string, any>
}

export interface SystemHealth {
  api: boolean
  inference_provider: string
  inference_reachable: boolean
  models_registered: number
  models_available: number
  knowledge_documents: number
  knowledge_chunks: number
  retrieval_mode: 'embedding' | 'lexical' | 'unavailable'
  sandbox_runtime: string
  sandbox_ready: boolean
  audit_chain_valid: boolean
  sovereignty_ok: boolean
  uptime_seconds: number
  checked_at: string
}
