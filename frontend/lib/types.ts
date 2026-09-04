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
  persona: string
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

export interface DirectoryUser {
  username: string
  display_name: string
  role: string
  department: string
  description?: string
  password_hint?: string
}

export interface Session {
  token: string
  user: User
  issued_at: string
  expires_at: string
}

export type StageStatus = 'pending' | 'active' | 'done' | 'failed' | 'held' | 'skipped'

export interface PipelineStage {
  id: string
  index: string
  name: string
  model: string
  latencyMs: number
  status: StageStatus
  detail?: string
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
  excerpt: string
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
  routing: RoutingDecision[]
  tool_calls: ToolCall[]
  evidence: EvidenceItem[]
  verification?: VerificationReport | null
  approval?: ApprovalRecord | null
  deliverables: Deliverable[]
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

export interface ApprovalItem {
  id: string
  title: string
  submittedBy: string
  submittedAt: string
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  classification: 'CONFIDENTIAL' | 'RESTRICTED' | 'INTERNAL'
  document: string
  extractedText: string
  evidence: EvidenceItem[]
  verification: VerificationCheck[]
  draft: string
  rawTask?: Task
}

export interface SopRecord {
  id: string
  title: string
  department: string
  classification: 'CONFIDENTIAL' | 'RESTRICTED' | 'INTERNAL'
  chunks: number
  ingested: string
  status: 'INDEXED' | 'INGESTING' | 'ERROR'
  source_path?: string
  version?: string
}

export interface TaskFile {
  id: string
  filename: string
  type: string
  sizeKb: number
  classification: 'CONFIDENTIAL' | 'RESTRICTED' | 'INTERNAL'
  task: string
  uploaded: string
  status: 'STORED' | 'PROCESSING'
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

export interface AuditChainStatus {
  valid: boolean
  events: number
  broken_at?: number | null
  head_hash?: string | null
  checked_at: string
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
  cloud_llm_calls: number
  internet_requests: number
  dns_requests: number
  data_leaving_host_bytes: number
  unapproved_connections: number
  local_connections: number
  monitored_since: string
  last_checked: string
  violations: NetworkConnection[]
  monitor_active: boolean
  interfaces: Record<string, any>
}

export interface SandboxTestResult {
  passed: boolean
  checks: { name: string; target: string; passed: boolean; detail: string }[]
  overall: string
  duration_ms: number
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

export interface ModelsStatus {
  provider: string
  provider_reachable: boolean
  registered: ModelDescriptor[]
  installed_on_host: string[]
  unregistered_on_host: string[]
  roles: Record<string, string>
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
