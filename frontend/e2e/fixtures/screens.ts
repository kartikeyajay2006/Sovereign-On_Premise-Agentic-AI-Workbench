import type { ModelDescriptor, Skill, SovereigntyStatus, SystemHealth } from '@/lib/types'
import type { AuditRecord, ChainStatus } from '@/components/audit/api'
import type {
  AccessRequestRecord,
  AccountRecord,
  DirectoryStatus,
  InviteRecord,
  PolicyChoices,
} from '@/components/accounts/api'
import type { HarnessCatalogView, HarnessRunSummary } from '@/features/harness/model/types'

/*
 * The other screens' reads, each typed by the interface the screen itself
 * declares for that endpoint, so a renamed field fails `tsc` here as it
 * would on the screen. Names and wording follow config/ and policies/.
 */

/** GET /api/status (backend/api/routes/system.py public_status). */
export const PUBLIC_STATUS = {
  name: 'Sovereign On-Premise Agentic AI Workbench',
  sovereign: true,
  external_calls: 0,
  monitor_active: true,
  monitored_since: '2026-09-24T00:00:00+00:00',
  checked_at: '2026-09-24T01:05:00+00:00',
}

/** GET /api/sovereignty: the egress monitor, running, nothing unapproved. */
export const SOVEREIGNTY: SovereigntyStatus = {
  sovereign: true,
  external_api_calls: 0,
  internet_requests: 0,
  dns_requests: 0,
  unapproved_connections: 0,
  local_connections: 4,
  monitored_since: '2026-09-24T00:00:00+00:00',
  last_checked: '2026-09-24T01:05:00+00:00',
  violations: [],
  monitor_active: true,
  monitor_error: null,
  interfaces: {},
  firewall: null,
}

/** GET /api/health. */
export const HEALTH: SystemHealth = {
  api: true,
  inference_provider: 'ollama',
  inference_reachable: true,
  models_registered: 2,
  models_available: 2,
  knowledge_documents: 14,
  knowledge_chunks: 212,
  retrieval_mode: 'hybrid',
  sandbox_runtime: 'subprocess',
  sandbox_ready: true,
  audit_chain_valid: true,
  sovereignty_ok: true,
  uptime_seconds: 3900,
  checked_at: '2026-09-24T01:05:00+00:00',
}

/** GET /api/models: a reasoning model and a vision model, both installed. */
export const MODELS: ModelDescriptor[] = [
  {
    id: 'qwen2.5:3b',
    display_name: 'Qwen2.5 3B',
    family: 'qwen2.5',
    role: 'reasoning',
    capabilities: ['reasoning'],
    context_window: 32768,
    quantization: 'Q4_K_M',
    parameters_b: 3,
    approved_classifications: ['normal', 'confidential', 'sensitive', 'restricted'],
    provider: 'ollama',
    provider_model: 'qwen2.5:3b',
    expected_digest: null,
    actual_digest: null,
    integrity: 'unpinned',
    available: true,
    registered: true,
    size_bytes: 1_929_912_432,
    notes: null,
  },
  {
    id: 'qwen2.5vl:3b',
    display_name: 'Qwen2.5-VL 3B',
    family: 'qwen2.5vl',
    role: 'vision',
    capabilities: ['vision'],
    context_window: 32768,
    quantization: 'Q4_K_M',
    parameters_b: 3,
    approved_classifications: ['normal', 'confidential', 'sensitive', 'restricted'],
    provider: 'ollama',
    provider_model: 'qwen2.5vl:3b',
    expected_digest: null,
    actual_digest: null,
    integrity: 'unpinned',
    available: true,
    registered: true,
    size_bytes: 3_200_000_000,
    notes: null,
  },
]

/** GET /api/skills: one built-in skill (config/skills/clause.yaml). */
export const SKILLS: Skill[] = [
  {
    id: 'clause',
    name: 'Find the governing clause',
    summary: 'Which SOP clause governs a situation, and exactly what it requires.',
    template: 'Which clause of our SOPs governs the following, and what exactly does it require? {input}',
    deliverable_format: null,
    input_hint: 'The situation, e.g. internal inspection of a pressure vessel in corrosive service',
    source: 'built_in',
    author: null,
    author_display_name: null,
    created_at: null,
    sha256: 'd41ed1e9e13381afa04e1da69b6b7cead2f4bbd72f23b1e861aec8694717d13f',
  },
]

/** GET /api/harnesses: config/harnesses/sop-question-sweep.yaml. */
export const HARNESS_CATALOG: HarnessCatalogView = {
  harnesses: [
    {
      id: 'sop-question-sweep',
      version: 1,
      name: 'SOP question sweep',
      summary: 'Ask up to 25 questions of the procedure corpus and get back a verified answer matrix.',
      description:
        'Each question runs as its own governed task, one after another, and is answered only from the procedures your role may retrieve.',
      inputs: [
        {
          id: 'questions',
          kind: 'lines',
          label: 'Questions',
          help: 'One question per line. Each line becomes its own run.',
          placeholder: 'What is the external inspection interval for a vessel in corrosive service?',
          required: true,
          max_chars: 400,
          min_items: 1,
          max_items: 25,
          options: [],
          default: null,
        },
      ],
      expansion_source: 'input_lines',
      aggregation: 'answer_matrix',
      template: 'Answer from our standard operating procedures (SOPs): {item}',
      label_template: '{item}',
      report_title: 'SOP question sweep',
      report_requires_approval: false,
      limitations: [],
      max_items: 25,
      child_timeout_seconds: 900,
      source: 'config/harnesses/sop-question-sweep.yaml',
      sha256: '5f0c8b6a2d1e4f3a9b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a',
    },
  ],
  errors: [],
}

/** GET /api/harness-runs: one finished sweep. */
export const HARNESS_RUNS: HarnessRunSummary[] = [
  {
    id: 'e2e-harness-run-1',
    harness_id: 'sop-question-sweep',
    harness_name: 'SOP question sweep',
    status: 'finished',
    user_display_name: 'Integrity Engineer',
    created_at: '2026-09-24T02:00:00Z',
    finished_at: '2026-09-24T02:03:00Z',
    tally: {
      total: 3,
      settled: 3,
      delivered: 3,
      counts: {
        pending: 0,
        queued: 0,
        running: 0,
        supported: 3,
        partially_supported: 0,
        no_material_claims: 0,
        released_unverified: 0,
        held: 0,
        rejected: 0,
        refused: 0,
        failed: 0,
        cancelled: 0,
        not_submitted: 0,
      },
    },
    current_index: null,
    report_version: 1,
    report_released: true,
    report_requires_approval: false,
    report_decision: null,
  },
]

/** GET /api/audit/chain. */
export const AUDIT_CHAIN: ChainStatus = {
  valid: true,
  events: 2,
  broken_at: null,
  head_hash: 'b6f1d3c1e2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
  checked_at: '2026-09-24T01:06:00Z',
}

/** GET /api/audit: the two newest records, newest first. */
export const AUDIT_RECORDS: AuditRecord[] = [
  {
    sequence: 2,
    id: 'e2e-audit-2',
    at: '2026-09-24T01:05:08Z',
    actor: 'engineer',
    actor_role: 'engineer',
    task_id: 'e2e-delivered-0001',
    category: 'TASK',
    action: 'task.delivered',
    detail: { status: 'delivered' },
    prev_hash: 'a3e0c2b0d1f3e4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9',
    hash: AUDIT_CHAIN.head_hash!,
  },
  {
    sequence: 1,
    id: 'e2e-audit-1',
    at: '2026-09-24T01:04:29Z',
    actor: 'engineer',
    actor_role: 'engineer',
    task_id: 'e2e-delivered-0001',
    category: 'TASK',
    action: 'task.created',
    detail: {},
    prev_hash: '0000000000000000000000000000000000000000000000000000000000000000',
    hash: 'a3e0c2b0d1f3e4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9',
  },
]

/** GET /api/admin/access-requests. */
export const ACCESS_REQUESTS: AccessRequestRecord[] = [
  {
    id: 'e2e-request-1',
    username: 'contractor',
    display_name: 'Visiting Contractor',
    requested_role: 'operator',
    reason: 'Shutdown support for unit 21.',
    status: 'pending',
    created_at: '2026-09-24T00:30:00Z',
    decided_at: null,
    decided_by: null,
    granted_role: null,
    granted_department: null,
    decision_reason: null,
  },
]

/** GET /api/admin/invites. */
export const INVITES: InviteRecord[] = []

/** GET /api/admin/users. */
export const ACCOUNTS: AccountRecord[] = [
  {
    id: 'u-admin',
    username: 'admin',
    display_name: 'Platform Administrator',
    role: 'administrator',
    department: 'general',
    active: true,
    created_at: '2026-09-20T00:00:00Z',
    origin: 'seed',
    provisioned_by: null,
    pending_request: false,
  },
  {
    id: 'u-engineer',
    username: 'engineer',
    display_name: 'Integrity Engineer',
    role: 'engineer',
    department: 'inspection',
    active: true,
    created_at: '2026-09-20T00:00:00Z',
    origin: 'seed',
    provisioned_by: null,
    pending_request: false,
  },
]

/** GET /api/admin/directory: no directory configured. */
export const DIRECTORY_STATUS: DirectoryStatus = {
  enabled: false,
  configured: false,
  url: null,
  base_dn: null,
  detail: 'No directory is configured. Accounts are provisioned on this host.',
}

/** The slice of GET /api/policies the People screen reads (policies/access-control.yaml). */
export const POLICY_CHOICES: PolicyChoices = {
  roles: {
    operator: { description: 'Industrial user who submits work and receives deliverables.' },
    engineer: { description: 'Senior technical user; may work with restricted engineering data.' },
    reviewer: { description: 'Approving authority for sensitive deliverables.' },
    auditor: { description: 'Read-only oversight; can read every trace but cannot execute work.' },
    administrator: { description: 'Platform operations. Manages models, policy and knowledge base.' },
  },
  departments: [
    { id: 'operations', label: 'Operations' },
    { id: 'engineering', label: 'Engineering' },
    { id: 'inspection', label: 'Inspection & Integrity' },
    { id: 'quality', label: 'Quality Assurance' },
  ],
}
