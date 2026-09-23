/**
 * Harness API shapes, transcribed field for field from
 * backend/harness/models.py and backend/harness/definitions.py.
 *
 * request<T>() asserts a type rather than checking one, so a field renamed on
 * the server and not here compiles cleanly and fails on screen. Change both
 * together. Pydantic always serialises a defaulted field, so an optional
 * Python field arrives as `null`, never as a missing key: `T | null` here,
 * not `T?`.
 */

export type Sensitivity = 'normal' | 'confidential' | 'sensitive' | 'restricted'

/** backend/core/schemas.py TaskStatus -- the child task's own status. */
export type ChildTaskStatus =
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
  | 'failed'
  | 'blocked'
  | 'cancelled'

export type RunStatus = 'running' | 'cancelling' | 'finished' | 'cancelled' | 'failed' | 'interrupted'

/** Where the HARNESS is with an item. Not the child's status. */
export type ItemState =
  | 'pending'
  | 'submitted'
  | 'settled'
  | 'not_submitted'
  | 'submit_failed'
  | 'submit_refused'

export type HarnessOutcome =
  | 'pending'
  | 'queued'
  | 'running'
  | 'supported'
  | 'partially_supported'
  | 'no_material_claims'
  | 'released_unverified'
  | 'held'
  | 'rejected'
  | 'refused'
  | 'failed'
  | 'cancelled'
  | 'not_submitted'

export type InputKind = 'text' | 'lines' | 'choice'
export type ExpansionSource = 'input_lines' | 'knowledge_sections'
export type AggregationKind = 'answer_matrix' | 'requirements_register'
export type InputValue = string | string[]
export type ReportFormat = 'md' | 'json'
export type ApprovalDecision = 'pending' | 'approved' | 'rejected'

export interface ChoiceOption {
  value: string
  label: string
}

export interface DefinitionSnapshot {
  id: string
  version: number
  name: string
  source: string
  sha256: string
  aggregation: AggregationKind
  report_title: string
  report_requires_approval: boolean
  limitations: string[]
  template: string
  child_timeout_seconds: number
}

export interface ScopeRecord {
  /** null: every department, because the role holds cross-department read. */
  departments: string[] | null
  max_classification: Sensitivity
  documents: number
  sections: number
}

export interface ExcludedItem {
  key: string
  label: string
}

export interface HarnessTally {
  total: number
  settled: number
  delivered: number
  /** Every outcome is present, zeros included. */
  counts: Record<HarnessOutcome, number>
}

export interface ReportApproval {
  required: boolean
  reasons: string[]
  decision: ApprovalDecision | null
  reviewer_id: string | null
  reviewer_name: string | null
  comment: string | null
  decided_at: string | null
}

export interface ReportFile {
  format: ReportFormat
  filename: string
  sha256: string
  size_bytes: number
}

export interface HarnessReportRecord {
  version: number
  generated_at: string
  generated_by: string
  reason: 'finished' | 'cancelled' | 'interrupted' | 'regenerated'
  files: ReportFile[]
  classification: Sensitivity
  approval: ReportApproval
  released: boolean
  child_statuses: Record<string, string>
  tally: HarnessTally
}

export interface Citation {
  id: string
  source_document: string
  location: string | null
  excerpt: string
  score: number | null
  classification: Sensitivity
  kind: string
}

export interface CheckSummary {
  name: string
  passed: boolean
  detail: string
}

export interface HarnessChildView {
  index: number
  key: string
  label: string
  prompt: string
  group: string | null
  state: ItemState
  task_id: string | null
  task_status: ChildTaskStatus | null
  outcome: HarnessOutcome
  /** One plain sentence built only from the child's record. */
  outcome_detail: string
  /** True only for a delivered child: its answer has been released. */
  released: boolean
  claims_total: number | null
  claims_supported: number | null
  verification_valid: boolean | null
  checks: CheckSummary[]
  /** Answer content is carried for released children only. */
  citations: Citation[]
  unretrieved_citations: string[]
  unsupported_claims: string[]
  approval_reasons: string[]
  reviewer_name: string | null
  error: string | null
  note: string | null
  duration_ms: number | null
  queue_position: number | null
  queue_ahead: number | null
  submitted_at: string | null
  started_at: string | null
  settled_at: string | null
}

export interface RunPermissions {
  can_cancel: boolean
  can_regenerate_report: boolean
  can_decide_report: boolean
  can_download_report: boolean
}

export interface ReportDownload {
  format: ReportFormat
  url: string
  filename: string
  sha256: string
  size_bytes: number
}

export interface ReportView {
  record: HarnessReportRecord
  stale: boolean
  changed_items: number[]
  downloads: ReportDownload[]
}

export interface HarnessRunView {
  id: string
  harness: DefinitionSnapshot
  user_id: string
  username: string
  user_display_name: string
  role: string
  department: string
  inputs: Record<string, InputValue>
  excluded: ExcludedItem[]
  scope: ScopeRecord
  status: RunStatus
  created_at: string
  updated_at: string
  finished_at: string | null
  cancel_requested_at: string | null
  cancel_requested_by: string | null
  error: string | null
  children: HarnessChildView[]
  tally: HarnessTally
  current_index: number | null
  report: ReportView | null
  permissions: RunPermissions
  limitations: string[]
  /** The server's clock when the view was built. */
  server_time: string
}

export interface HarnessRunSummary {
  id: string
  harness_id: string
  harness_name: string
  status: RunStatus
  user_display_name: string
  created_at: string
  finished_at: string | null
  tally: HarnessTally
  current_index: number | null
  report_version: number | null
  report_released: boolean | null
  report_requires_approval: boolean | null
  report_decision: ApprovalDecision | null
}

export interface HarnessInputView {
  id: string
  kind: InputKind
  label: string
  help: string | null
  placeholder: string | null
  required: boolean
  max_chars: number
  min_items: number
  max_items: number
  options: ChoiceOption[]
  default: string | null
}

export interface HarnessDefinitionView {
  id: string
  version: number
  name: string
  summary: string
  description: string
  inputs: HarnessInputView[]
  expansion_source: ExpansionSource
  aggregation: AggregationKind
  template: string
  label_template: string
  report_title: string
  report_requires_approval: boolean
  limitations: string[]
  max_items: number
  child_timeout_seconds: number
  source: string
  sha256: string
}

export interface DefinitionErrorView {
  source: string
  message: string
}

export interface HarnessCatalogView {
  harnesses: HarnessDefinitionView[]
  errors: DefinitionErrorView[]
}

export interface PreviewItem {
  key: string
  index: number
  label: string
  prompt: string
  group: string | null
}

export interface HarnessPreview {
  harness_id: string
  items: PreviewItem[]
  limit: number
  scope: ScopeRecord
  warnings: string[]
  inputs: Record<string, InputValue>
}

export interface HarnessPreviewRequest {
  inputs: Record<string, InputValue>
}

export interface HarnessStartRequest {
  harness_id: string
  inputs: Record<string, InputValue>
  selected: string[] | null
  /** The definition hash the person previewed; a changed YAML refuses the start. */
  definition_sha256: string | null
}

export interface ReportDecisionRequest {
  decision: 'approve' | 'reject'
  comment: string | null
}
