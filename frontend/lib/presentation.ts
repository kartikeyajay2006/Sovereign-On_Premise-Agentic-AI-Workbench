/**
 * Static presentation constants.
 *
 * The `persona` on each role is a label for the demonstration roles, not a
 * real person: never render it where a reader could take it for the signed-in
 * user, because this system records who approved what.
 *
 * Everything here describes the *shape* of the interface — the stages a run
 * moves through, the roles that exist, the nodes in the architecture diagram,
 * the example prompts. None of it is data about what this host has done.
 *
 * Sample tasks, audit entries, approvals, sockets, search results and test
 * outcomes used to live here and were rendered when the backend was
 * unreachable. On a platform whose entire claim is that the figures on screen
 * are measured, invented ones are worse than an error message: they are
 * indistinguishable from real readings. They have been removed, and every
 * screen now shows either a live reading or a failure.
 */

import type { PipelineStage, Role } from './types'

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
