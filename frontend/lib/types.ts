/**
 * Contracts mirroring backend/core/schemas.py.
 *
 * These are the frozen shapes the API returns. Nothing in the UI invents a
 * field the backend does not send.
 */

export type TaskStatus =
  | "received"
  | "classified"
  | "planned"
  | "retrieving"
  | "executing"
  | "verifying"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "delivered"
  | "failed"
  | "blocked"
  | "cancelled";

export type Sensitivity = "normal" | "confidential" | "sensitive" | "restricted";
export type ModelRole = "reasoning" | "coding" | "vision" | "embedding";
export type PolicyDecision = "allow" | "deny" | "require_approval";

export interface User {
  id: string;
  username: string;
  display_name: string;
  role: string;
  department: string;
  active: boolean;
  permissions: string[];
  max_data_classification: Sensitivity;
}

export interface Session {
  token: string;
  user: User;
  issued_at: string;
  expires_at: string;
}

export interface StoredFile {
  id: string;
  task_id: string | null;
  filename: string;
  stored_path: string;
  media_type: string;
  size_bytes: number;
  sha256: string;
  input_type: string;
  classification: Sensitivity;
  owner_id: string;
  department: string;
  quarantine_passed: boolean;
  quarantine_notes: string[];
  uploaded_at: string;
}

export interface ClassificationSignal {
  dimension: string;
  value: string;
  score: number;
  matched: string[];
}

export interface TaskProfile {
  input_type: string;
  task_type: string;
  complexity: string;
  sensitivity: Sensitivity;
  confidence: number;
  step_budget: number;
  requires_retrieval: boolean;
  requires_vision: boolean;
  requires_code_execution: boolean;
  produces_deliverable: boolean;
  deliverable_format: string | null;
  required_capabilities: string[];
  signals: ClassificationSignal[];
  reasons: string[];
}

export interface ModelDescriptor {
  id: string;
  display_name: string;
  family: string;
  role: ModelRole;
  capabilities: string[];
  context_window: number;
  quantization: string | null;
  parameters_b: number | null;
  approved_classifications: Sensitivity[];
  provider: string;
  provider_model: string;
  available: boolean;
  registered: boolean;
  size_bytes: number | null;
  notes: string | null;
}

export interface RoutingCandidate {
  model: string;
  display_name: string;
  role: string;
  available: boolean;
  eligible: boolean;
  score: number;
  notes: string[];
}

export interface RoutingDecision {
  requested_role: ModelRole;
  required_capabilities: string[];
  selected_model: string | null;
  selected_display_name: string | null;
  rule: string;
  reason: string;
  used_fallback: boolean;
  candidates: RoutingCandidate[];
  decided_at: string;
}

export interface EvidenceItem {
  id: string;
  source_document: string;
  document_id: string | null;
  location: string | null;
  excerpt: string;
  score: number | null;
  department: string | null;
  classification: Sensitivity;
  version: string | null;
  ingested_at: string | null;
  kind: "knowledge_base" | "uploaded_file" | "vision_extraction" | "computation";
}

export interface ToolCall {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  output_summary: string;
  output: Record<string, unknown>;
  error: string | null;
  started_at: string;
  duration_ms: number;
  policy_decision: PolicyDecision;
}

export interface PlanStep {
  id: number;
  action: string;
  objective: string;
  inputs: string | null;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  result_summary: string | null;
}

export interface AgentPlan {
  version: number;
  steps: PlanStep[];
  expected_outputs: string[];
  risks: string[];
  created_at: string;
}

export interface VerificationCheck {
  name: string;
  kind: "source" | "calculation" | "code" | "document" | "hallucination";
  passed: boolean;
  detail: string;
  evidence_ids: string[];
  warnings: string[];
}

export interface VerificationReport {
  valid: boolean;
  checks: VerificationCheck[];
  material_claims_total: number;
  material_claims_supported: number;
  limitations: string[];
  completed_at: string;
}

export interface ApprovalRecord {
  required: boolean;
  reasons: string[];
  approver_roles: string[];
  decision: "pending" | "approved" | "rejected" | null;
  reviewer_id: string | null;
  reviewer_name: string | null;
  comment: string | null;
  decided_at: string | null;
}

export interface Deliverable {
  id: string;
  filename: string;
  format: string;
  size_bytes: number;
  sha256: string;
  download_url: string;
  released: boolean;
  created_at: string;
}

export interface PolicyEvent {
  subject: string;
  action: string;
  decision: PolicyDecision;
  reason: string;
  rule: string | null;
  at: string;
}

export interface Task {
  id: string;
  prompt: string;
  status: TaskStatus;
  user_id: string;
  user_display_name: string | null;
  department: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  files: StoredFile[];
  profile: TaskProfile | null;
  plan: AgentPlan | null;
  routing: RoutingDecision[];
  tool_calls: ToolCall[];
  evidence: EvidenceItem[];
  verification: VerificationReport | null;
  approval: ApprovalRecord | null;
  deliverables: Deliverable[];
  policy_events: PolicyEvent[];
  answer: string | null;
  error: string | null;
  duration_ms: number | null;
  queue_position: number | null;
  queue_ahead: number;
}

export interface TaskSummary {
  id: string;
  prompt: string;
  status: TaskStatus;
  task_type: string | null;
  sensitivity: Sensitivity | null;
  created_at: string;
  updated_at: string;
  deliverable_count: number;
  approval_required: boolean;
  user_display_name: string | null;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  source_path: string;
  department: string;
  classification: Sensitivity;
  version: string;
  chunk_count: number;
  sha256: string;
  ingested_at: string;
  media_type: string;
  size_bytes: number;
}

export interface KnowledgeSearchResponse {
  query: string;
  retrieval_mode: "embedding" | "lexical";
  results: EvidenceItem[];
  took_ms: number;
}

export interface AuditEvent {
  sequence: number;
  id: string;
  at: string;
  actor: string;
  actor_role: string | null;
  task_id: string | null;
  category: string;
  action: string;
  detail: Record<string, unknown>;
  prev_hash: string;
  hash: string;
}

export interface AuditChainStatus {
  valid: boolean;
  events: number;
  broken_at: number | null;
  head_hash: string | null;
  checked_at: string;
}

export interface NetworkConnection {
  laddr: string;
  raddr: string | null;
  status: string;
  pid: number | null;
  process: string | null;
  allowed: boolean;
  reason: string;
}

export interface SovereigntyStatus {
  sovereign: boolean;
  external_api_calls: number;
  cloud_llm_calls: number;
  internet_requests: number;
  dns_requests: number;
  data_leaving_host_bytes: number;
  unapproved_connections: number;
  local_connections: number;
  monitored_since: string;
  last_checked: string;
  violations: NetworkConnection[];
  monitor_active: boolean;
  interfaces: Record<string, { up: boolean; loopback: boolean; addresses: string[] }>;
}

export interface SystemHealth {
  api: boolean;
  inference_provider: string;
  inference_reachable: boolean;
  models_registered: number;
  models_available: number;
  knowledge_documents: number;
  knowledge_chunks: number;
  retrieval_mode: "embedding" | "lexical" | "unavailable";
  sandbox_runtime: string;
  sandbox_ready: boolean;
  audit_chain_valid: boolean;
  sovereignty_ok: boolean;
  uptime_seconds: number;
  checked_at: string;
}

export interface ModelsStatus {
  provider: string;
  base_url: string;
  reachable: boolean;
  registered: number;
  available: number;
  unregistered_installed: string[];
  residency: {
    resident_model: string | null;
    loaded_at: string | null;
    footprint_mb: number;
    loads: number;
    evictions: number;
    single_residency: boolean;
    available_mb: number;
    total_mb: number;
    recent_decisions: Record<string, unknown>[];
  };
  resident_in_runtime: Record<string, unknown>[];
  roles: Record<string, string[]>;
}

export interface SandboxSelfTest {
  static_layer_blocks_network_import: boolean;
  static_violations: string[];
  runtime_layer_blocks_socket: boolean;
  runtime_output: string;
  runtime_attempts_recorded: number;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  parameters: Record<string, string>;
  allowed_roles: string[];
  side_effects: string;
  max_data_classification: string | null;
  registered_in_policy: boolean;
}

export interface StreamEvent {
  event: string;
  task_id: string | null;
  at: string;
  data: Record<string, any>;
}
