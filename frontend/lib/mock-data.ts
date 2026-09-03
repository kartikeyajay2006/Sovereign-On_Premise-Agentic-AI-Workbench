import type {
  ApprovalItem,
  AuditEvent,
  DiagnosticStep,
  EvidenceItem,
  PipelineStage,
  PolicyRow,
  Role,
  SopRecord,
  TaskFile,
  TaskRecord,
  VerificationCheck,
} from './types'

export const ROLES: Role[] = [
  {
    id: 'operator',
    label: 'Plant Operator',
    persona: 'M. Okonkwo',
    description: 'Submits inspection and calculation tasks from the field.',
    capabilities: ['Submit tasks', 'Upload documents', 'View own deliverables'],
  },
  {
    id: 'engineer',
    label: 'Integrity Engineer',
    persona: 'S. Ramanathan',
    description: 'Runs advanced sandboxed tooling and corrosion analysis.',
    capabilities: ['Advanced tools', 'Sandbox execution', 'Semantic search', 'Submit tasks'],
  },
  {
    id: 'reviewer',
    label: 'Approving Reviewer',
    persona: 'L. Bergström',
    description: 'Reviews held deliverables and authorizes release.',
    capabilities: ['Approval queue', 'Release deliverables', 'Reject with notes'],
  },
  {
    id: 'auditor',
    label: 'Internal Auditor',
    persona: 'D. Haleem',
    description: 'Verifies the cryptographic audit chain and exports logs.',
    capabilities: ['Audit trail', 'Chain verification', 'Export log'],
  },
  {
    id: 'admin',
    label: 'Platform Admin',
    persona: 'root@host',
    description: 'Manages sovereignty policy, RBAC and sandbox posture.',
    capabilities: ['Security center', 'Policy matrix', 'Sandbox diagnostics', 'All tools'],
  },
]

export const HOST_INFO = {
  host: '127.0.0.1',
  externalConnections: 0,
  services: ['127.0.0.1:8000', '127.0.0.1:11434'],
  model: 'Qwen3 8B',
  sandbox: 'CONTAINED',
  audit: 'VALID',
}

export const DEFAULT_PIPELINE: PipelineStage[] = [
  { id: 'classify', index: '01', name: 'Classify', model: 'qwen3:8b', latencyMs: 214, status: 'pending' },
  { id: 'plan', index: '02', name: 'Plan', model: 'qwen3:8b', latencyMs: 486, status: 'pending' },
  { id: 'read', index: '03', name: 'Read', model: 'qwen2.5vl:3b', latencyMs: 842, status: 'pending' },
  { id: 'retrieve', index: '04', name: 'Retrieve', model: 'bge-m3:local', latencyMs: 168, status: 'pending' },
  { id: 'sandbox', index: '05', name: 'Sandbox', model: 'py-sandbox', latencyMs: 1290, status: 'pending' },
  { id: 'draft', index: '06', name: 'Draft', model: 'qwen3:8b', latencyMs: 2140, status: 'pending' },
  { id: 'verify', index: '07', name: 'Verify', model: 'qwen3:8b', latencyMs: 654, status: 'pending' },
  { id: 'approval', index: '08', name: 'Approval', model: 'human-gate', latencyMs: 0, status: 'pending' },
  { id: 'deliver', index: '09', name: 'Deliver', model: 'docx-writer', latencyMs: 312, status: 'pending' },
]

export const SOVEREIGN_NODES = [
  { id: 'model', label: 'LOCAL MODEL' },
  { id: 'vector', label: 'VECTOR STORE' },
  { id: 'sandbox', label: 'SANDBOX' },
  { id: 'docs', label: 'DOCUMENT STORE' },
  { id: 'agent', label: 'AGENT' },
  { id: 'audit', label: 'AUDIT LOG' },
]

export const RESULT_ANSWER = `Based on the ultrasonic thickness survey (UT-2291) and SOP-014 acceptance criteria, feed drum V-4102 has a measured minimum wall of 11.4 mm against a t-min of 9.8 mm [S1]. The observed corrosion rate of 0.19 mm/yr yields a remaining life of 8.4 years before the next mandated inspection interval [F1].

Recommendation: schedule V-4102 for re-inspection at T+48 months and flag nozzle N3 for localized UT mapping, consistent with clause 7.3 escalation rules [S2].`

export const RESULT_EVIDENCE: EvidenceItem[] = [
  {
    id: 'S1',
    source: 'SOP-014',
    clause: 'Clause 7.3',
    excerpt:
      'Retained wall thickness shall not fall below the calculated t-min plus a 1.2 mm margin for pressure vessels in sour service.',
    similarity: 0.94,
  },
  {
    id: 'S2',
    source: 'SOP-014',
    clause: 'Clause 7.9',
    excerpt:
      'Where localized metal loss exceeds 20% of nominal, nozzle-specific UT mapping shall be scheduled prior to the next turnaround.',
    similarity: 0.88,
  },
  {
    id: 'F1',
    source: 'UT-2291.pdf',
    clause: 'Grid E7',
    excerpt: 'Minimum recorded thickness 11.4 mm at grid E7, lower shell course, 2024-11 survey.',
    similarity: 0.91,
  },
]

export const RESULT_VERIFICATION: VerificationCheck[] = [
  { label: 'Source evidence', result: 'PASSED', ok: true },
  { label: 'Independent recomputation', result: 'PASSED', ok: true },
  { label: 'Sandbox execution', result: 'EXIT CODE 0', ok: true },
]

export const TASKS: TaskRecord[] = [
  {
    id: 'TSK-4471',
    title: 'Remaining-life calculation — feed drum V-4102',
    actor: 'S. Ramanathan',
    role: 'engineer',
    model: 'qwen3:8b',
    started: '2026-09-04 08:12',
    durationMs: 9420,
    status: 'AWAITING APPROVAL',
    type: 'Corrosion / RLA',
    classification: 'CONFIDENTIAL',
  },
  {
    id: 'TSK-4468',
    title: 'Approval note from scanned inspection report IR-8830',
    actor: 'M. Okonkwo',
    role: 'operator',
    model: 'qwen2.5vl:3b',
    started: '2026-09-04 07:41',
    durationMs: 6110,
    status: 'DELIVERED',
    type: 'OCR / Drafting',
    classification: 'CONFIDENTIAL',
  },
  {
    id: 'TSK-4463',
    title: 'P&ID line list extraction — Unit 400 revamp',
    actor: 'S. Ramanathan',
    role: 'engineer',
    model: 'qwen2.5vl:3b',
    started: '2026-09-04 06:55',
    durationMs: 15230,
    status: 'DELIVERED',
    type: 'Drawing OCR',
    classification: 'RESTRICTED',
  },
  {
    id: 'TSK-4460',
    title: 'PSV relief load recompute — flare header K-90',
    actor: 'S. Ramanathan',
    role: 'engineer',
    model: 'qwen3:8b',
    started: '2026-09-03 22:18',
    durationMs: 11890,
    status: 'FAILED',
    type: 'Sandboxed calc',
    classification: 'CONFIDENTIAL',
  },
  {
    id: 'TSK-4455',
    title: 'SOP deviation check — hot work permit HWP-2210',
    actor: 'M. Okonkwo',
    role: 'operator',
    model: 'qwen3:8b',
    started: '2026-09-03 18:02',
    durationMs: 4870,
    status: 'BLOCKED',
    type: 'Policy check',
    classification: 'INTERNAL',
  },
  {
    id: 'TSK-4451',
    title: 'Weld map reconciliation — pipe spool SP-1180',
    actor: 'S. Ramanathan',
    role: 'engineer',
    model: 'qwen2.5vl:3b',
    started: '2026-09-03 14:33',
    durationMs: 13420,
    status: 'DELIVERED',
    type: 'Drawing OCR',
    classification: 'RESTRICTED',
  },
]

export const APPROVALS: ApprovalItem[] = [
  {
    id: 'TSK-4471',
    title: 'Remaining-life calculation — feed drum V-4102',
    submittedBy: 'S. Ramanathan',
    submittedAt: '2026-09-04 08:12',
    priority: 'HIGH',
    status: 'PENDING',
    classification: 'CONFIDENTIAL',
    document: 'UT-2291.pdf',
    extractedText:
      'ULTRASONIC THICKNESS SURVEY — V-4102 FEED DRUM\nSurvey date: 2024-11-18\nGrid E7 (lower shell): 11.4 mm\nGrid E6: 12.1 mm\nNominal wall: 14.0 mm  |  t-min (calc): 9.8 mm\nInspector: J. Alvarez  |  Procedure: NDT-UT-05',
    evidence: RESULT_EVIDENCE,
    verification: RESULT_VERIFICATION,
    draft: RESULT_ANSWER,
  },
  {
    id: 'TSK-4472',
    title: 'Overpressure scenario sign-off — reactor R-201',
    submittedBy: 'S. Ramanathan',
    submittedAt: '2026-09-04 08:47',
    priority: 'CRITICAL',
    status: 'PENDING',
    classification: 'CONFIDENTIAL',
    document: 'HAZOP-R201.pdf',
    extractedText:
      'HAZOP NODE 12 — REACTOR R-201\nDeviation: More pressure\nCause: Cooling water failure to E-210\nConsequence: Relief to flare via PSV-201A/B\nRequired relief load: 42,180 kg/h  |  Installed capacity: 47,500 kg/h',
    evidence: RESULT_EVIDENCE,
    verification: RESULT_VERIFICATION,
    draft:
      'Independent recomputation confirms required relief load of 42,180 kg/h is within installed PSV capacity (47,500 kg/h), margin 11.2% [S1]. Recommend release with condition: verify PSV-201B set pressure at next turnaround.',
  },
  {
    id: 'TSK-4468',
    title: 'Approval note — inspection report IR-8830',
    submittedBy: 'M. Okonkwo',
    submittedAt: '2026-09-04 07:41',
    priority: 'NORMAL',
    status: 'PENDING',
    classification: 'CONFIDENTIAL',
    document: 'IR-8830-scan.pdf',
    extractedText:
      'INSPECTION REPORT IR-8830\nEquipment: Heat exchanger E-305 channel head\nFinding: Minor pitting, max depth 1.1 mm, within allowance\nAction: Monitor at next scheduled inspection',
    evidence: [RESULT_EVIDENCE[0]],
    verification: RESULT_VERIFICATION,
    draft:
      'Channel head pitting on E-305 (max 1.1 mm) is within the 2.0 mm corrosion allowance per SOP-014 clause 7.3 [S1]. No immediate action required; monitor at next interval.',
  },
]

export const SOPS: SopRecord[] = [
  { id: 'SOP-014', title: 'Pressure Vessel Integrity Assessment', department: 'Inspection', classification: 'CONFIDENTIAL', chunks: 148, ingested: '2026-08-21', status: 'INDEXED' },
  { id: 'SOP-022', title: 'Sour Service Materials Selection', department: 'Metallurgy', classification: 'RESTRICTED', chunks: 96, ingested: '2026-08-19', status: 'INDEXED' },
  { id: 'SOP-031', title: 'Pressure Relief Device Sizing', department: 'Process Safety', classification: 'CONFIDENTIAL', chunks: 210, ingested: '2026-08-14', status: 'INDEXED' },
  { id: 'SOP-009', title: 'Hot Work Permit & Isolation', department: 'Operations', classification: 'INTERNAL', chunks: 64, ingested: '2026-08-11', status: 'INDEXED' },
  { id: 'SOP-047', title: 'Piping Corrosion Monitoring', department: 'Inspection', classification: 'RESTRICTED', chunks: 132, ingested: '2026-09-03', status: 'INGESTING' },
]

export const TASK_FILES: TaskFile[] = [
  { id: 'F-9001', filename: 'UT-2291.pdf', type: 'PDF / UT survey', sizeKb: 1840, classification: 'CONFIDENTIAL', task: 'TSK-4471', uploaded: '2026-09-04 08:10', status: 'STORED' },
  { id: 'F-9000', filename: 'IR-8830-scan.pdf', type: 'PDF / scanned', sizeKb: 3120, classification: 'CONFIDENTIAL', task: 'TSK-4468', uploaded: '2026-09-04 07:39', status: 'STORED' },
  { id: 'F-8994', filename: 'PID-U400-rev3.tiff', type: 'TIFF / drawing', sizeKb: 9450, classification: 'RESTRICTED', task: 'TSK-4463', uploaded: '2026-09-04 06:52', status: 'STORED' },
  { id: 'F-8990', filename: 'HAZOP-R201.pdf', type: 'PDF / study', sizeKb: 2210, classification: 'CONFIDENTIAL', task: 'TSK-4472', uploaded: '2026-09-04 08:45', status: 'PROCESSING' },
]

export const SEARCH_CORPUS: EvidenceItem[] = [
  { id: 'R1', source: 'SOP-014', clause: 'Clause 7.3', excerpt: 'Retained wall thickness shall not fall below calculated t-min plus a 1.2 mm margin for vessels in sour service.', similarity: 0.94 },
  { id: 'R2', source: 'SOP-031', clause: 'Clause 4.1', excerpt: 'Relief device capacity shall exceed the governing overpressure scenario load with a minimum 10% margin.', similarity: 0.87 },
  { id: 'R3', source: 'SOP-047', clause: 'Clause 2.6', excerpt: 'Corrosion rate shall be computed as the maximum of long-term and short-term trend across all monitoring locations.', similarity: 0.83 },
  { id: 'R4', source: 'SOP-022', clause: 'Clause 5.2', excerpt: 'Hardness of welds in sour service shall not exceed 248 HV to mitigate sulfide stress cracking.', similarity: 0.79 },
]

export const AUDIT_EVENTS: AuditEvent[] = [
  { seq: 2291, timestamp: '2026-09-04 08:12:04.118', actor: 'S. Ramanathan', action: 'TASK_SUBMIT TSK-4471', category: 'TASK', prevHash: '7c20a9f1', hash: 'e4b0f22c' },
  { seq: 2292, timestamp: '2026-09-04 08:12:04.902', actor: 'agent://planner', action: 'MODEL_INVOKE qwen3:8b', category: 'MODEL', prevHash: 'e4b0f22c', hash: '9a3d71ce' },
  { seq: 2293, timestamp: '2026-09-04 08:12:06.441', actor: 'agent://sandbox', action: 'TOOL_EXEC py-sandbox rla.py', category: 'TOOL', prevHash: '9a3d71ce', hash: '1f88b402' },
  { seq: 2294, timestamp: '2026-09-04 08:12:08.010', actor: 'policy://engine', action: 'POLICY_EVAL release=REVIEW', category: 'POLICY', prevHash: '1f88b402', hash: 'c0ffee12' },
  { seq: 2295, timestamp: '2026-09-04 08:12:08.774', actor: 'agent://verifier', action: 'VERIFY recompute PASSED', category: 'TASK', prevHash: 'c0ffee12', hash: 'a91f7c20' },
  { seq: 2296, timestamp: '2026-09-04 08:12:09.203', actor: 'kernel://net', action: 'SOVEREIGNTY egress=0 blocked=0', category: 'SOVEREIGNTY', prevHash: 'a91f7c20', hash: '5d1e88fa' },
  { seq: 2297, timestamp: '2026-09-04 08:12:09.560', actor: 'agent://gate', action: 'APPROVAL_HOLD reviewer=pending', category: 'APPROVAL', prevHash: '5d1e88fa', hash: 'bb47f309' },
]

export const POLICY_MATRIX: PolicyRow[] = [
  { tool: 'Submit task', operator: 'ALLOW', reviewer: 'ALLOW', engineer: 'ALLOW', admin: 'ALLOW' },
  { tool: 'Sandbox execution', operator: 'DENY', reviewer: 'DENY', engineer: 'ALLOW', admin: 'ALLOW' },
  { tool: 'Semantic search', operator: 'REVIEW', reviewer: 'ALLOW', engineer: 'ALLOW', admin: 'ALLOW' },
  { tool: 'Release deliverable', operator: 'DENY', reviewer: 'ALLOW', engineer: 'DENY', admin: 'ALLOW' },
  { tool: 'Ingest SOP', operator: 'DENY', reviewer: 'DENY', engineer: 'REVIEW', admin: 'ALLOW' },
  { tool: 'Policy edit', operator: 'DENY', reviewer: 'DENY', engineer: 'DENY', admin: 'ALLOW' },
  { tool: 'Export audit log', operator: 'DENY', reviewer: 'DENY', engineer: 'DENY', admin: 'ALLOW' },
]

export const DIAGNOSTICS: DiagnosticStep[] = [
  { label: 'Socket escape attempt', detail: 'connect() 8.8.8.8:53 → EPERM seccomp' },
  { label: 'Import bypass', detail: 'import socket → ModuleNotFoundError (jailed)' },
  { label: 'Filesystem escape', detail: 'open(/etc/shadow) → EACCES ro-rootfs' },
  { label: 'Subprocess restriction', detail: 'fork()/execve() → EPERM no-new-privs' },
  { label: 'Network access attempt', detail: 'dns resolve example.com → NXDOMAIN offline' },
]

export const SANDBOX_LOG = [
  '$ python3 /sandbox/rla.py --input UT-2291.json',
  'sandbox: rootfs mounted read-only',
  'sandbox: network namespace = none',
  'sandbox: seccomp profile = strict-v2 loaded',
  'compute: t_min=9.8mm t_meas=11.4mm cr=0.19mm/yr',
  'compute: remaining_life=8.42yr margin=1.60mm',
  'verify: independent recompute delta=0.00mm OK',
  'exit code 0',
]

export const TELEMETRY_SOCKETS = [
  { addr: '127.0.0.1:8000', label: 'FastAPI orchestrator', state: 'ESTABLISHED' },
  { addr: '127.0.0.1:11434', label: 'Local model runtime', state: 'ESTABLISHED' },
  { addr: '127.0.0.1:6333', label: 'Vector store', state: 'LISTEN' },
]

export const CONSOLE_TEMPLATES = [
  {
    id: 't1',
    title: 'Approval note from scanned inspection report',
    prompt:
      'Extract equipment details from the attached ultrasonic survey IR-8830 and draft an approval note for Sour Service Feed Drum V-4102 according to SOP-014.',
    format: 'docx',
    files: ['UT-Survey-IR-8830.pdf', 'SOP-014-Sour-Service.md'],
  },
  {
    id: 't2',
    title: 'Sandboxed calculation of corrosion & remaining life',
    prompt:
      'Calculate remaining life and next inspection interval for Vessel V-4102 using nominal wall 14mm, measured 11.4mm, t-min 9.8mm and corrosion rate 0.19mm/yr.',
    format: 'xlsx',
    files: ['Wall-Thickness-Log.csv'],
  },
  {
    id: 't3',
    title: 'P&ID / Drawing OCR extraction',
    prompt:
      'Parse the attached Unit 400 revamp drawing, extract all line numbers, tags, and design pressures, and verify isolation valves against safety guidelines.',
    format: 'docx',
    files: ['PID-Unit400-Revamp.pdf'],
  },
]

export const DELIVERABLE_FORMATS = [
  { id: 'answer', label: 'Answer only', ext: '' },
  { id: 'docx', label: 'Word', ext: '.docx' },
  { id: 'xlsx', label: 'Excel', ext: '.xlsx' },
  { id: 'pptx', label: 'PowerPoint', ext: '.pptx' },
  { id: 'md', label: 'Markdown', ext: '.md' },
]
