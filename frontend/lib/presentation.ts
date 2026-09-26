/**
 * Static presentation constants.
 *
 * Roles carried a `persona` — invented names such as "M. Okonkwo" and
 * "L. Bergström" — with a warning here never to render one where a reader
 * could take it for the signed-in user. role-switcher.tsx did exactly that,
 * falling back to the persona and then to a hardcoded "S. Ramanathan" for the
 * name shown as the current operator. On a system that records who approved
 * what, a fabricated human name is not a placeholder. The field is gone.
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
    description: 'Submits inspection and calculation tasks from the field.',
    capabilities: ['Submit tasks', 'Upload documents', 'View own deliverables'],
  },
  {
    id: 'engineer',
    label: 'Integrity Engineer',
    description: 'Runs advanced sandboxed tooling and corrosion analysis.',
    capabilities: ['Advanced tools', 'Sandbox execution', 'Semantic search', 'Submit tasks'],
  },
  {
    id: 'reviewer',
    label: 'Approving Reviewer',
    description: 'Reviews held deliverables and authorizes release.',
    capabilities: ['Approval queue', 'Release deliverables', 'Reject with notes'],
  },
  {
    id: 'head_of_inspection',
    label: 'Head of Inspection',
    description: 'Recommends a High finding; the first of its two signatures (SOP-OPS-008).',
    capabilities: ['Approval queue', 'Release deliverables', 'Reject with notes'],
  },
  {
    id: 'plant_manager',
    label: 'Plant Manager',
    description: 'Approves a High finding after the Head of Inspection recommends it.',
    capabilities: ['Approval queue', 'Release deliverables', 'Reject with notes'],
  },
  {
    id: 'auditor',
    label: 'Internal Auditor',
    description: 'Verifies the cryptographic audit chain and exports logs.',
    capabilities: ['Audit trail', 'Chain verification', 'Export log'],
  },
  {
    id: 'admin',
    label: 'Platform Admin',
    description: 'Manages sovereignty policy, RBAC and sandbox posture.',
    capabilities: ['Security center', 'Policy matrix', 'Sandbox diagnostics', 'All tools'],
  },
]

/**
 * A role id as the policy files and audit records write it, in words. The
 * backend's `administrator` is the `admin` role here; an id no role declares
 * is shown as itself rather than guessed at.
 */
export function roleName(id: string): string {
  const key = id === 'administrator' ? 'admin' : id
  return ROLES.find((role) => role.id === key)?.label ?? id.replace(/_/g, ' ')
}

// The stages a run moves through. Structure only: the model that handled each
// stage and how long it took are filled in from the run itself, because
// showing a model name and a latency before anything has executed states two
// things the host has not done.
// Every row exists as `pending` from the moment a run starts, and events
// mutate rows rather than appending them. That is what makes the board
// stable: no layout shift by construction, and a stage that never reports is
// visibly a stage that never reported rather than a row that never appeared.
//
// `at` and `elapsedMs` start null, not 0. Null is "no reading"; 0 would claim
// the stage took no time. The previous shape initialised latencyMs to 0 for
// all seven and nothing ever wrote to it.
const stage = (
  id: string,
  index: string,
  name: string,
): PipelineStage => ({
  id,
  index,
  name,
  model: '',
  status: 'pending',
  at: null,
  elapsedMs: null,
  headline: null,
})

export const DEFAULT_PIPELINE: PipelineStage[] = [
  stage('classify', '01', 'Classify'),
  stage('plan', '02', 'Plan'),
  stage('read', '03', 'Read'),
  stage('retrieve', '04', 'Retrieve'),
  stage('sandbox', '05', 'Compute'),
  stage('draft', '06', 'Draft'),
  stage('verify', '07', 'Verify'),
]

/**
 * The three golden demos, one card each, and the fallback for a host with no
 * vision model. Prompts match scripts/golden_demo.py, so what a judge starts
 * here is what the rehearsal check runs. `samples` are ids from config/app.yaml
 * `demo.samples`: picking a card attaches them through the ordinary upload.
 */
export const CONSOLE_TEMPLATES = [
  {
    id: 'golden-asset',
    title: 'Can V-2104 keep running?',
    prompt:
      'Read the attached scanned inspection report for vessel V-2104 and prepare an approval note based on our approved SOPs. State the governing location, the corrosion rate and remaining life with the inputs used, the severity and the clause it rests on, and who must approve it.',
    format: 'docx',
    samples: ['v2104-scan'],
    skill: null,
    // Reading a scan takes a vision model; without one installed this run
    // would end blocked, so the thread offers the survey instead.
    needs: 'vision',
  },
  {
    id: 'golden-asset-survey',
    title: 'Can V-2104 keep running?',
    prompt:
      'Using the attached thickness survey for V-2104, calculate the corrosion rate and remaining life for every location against a minimum allowable thickness of 6.0 mm, identify which location governs, and state the severity and who must approve continued operation.',
    format: 'answer',
    samples: ['v2104-survey'],
    skill: null,
    needs: 'no-vision',
  },
  {
    id: 'golden-conflict',
    title: 'Two records disagree',
    prompt: 'Calculate the corrosion rate and remaining life of V-2104 and state the severity.',
    format: 'answer',
    samples: ['v2104-survey', 'v2104-field-sheet'],
    skill: null,
    needs: null,
  },
  {
    id: 'golden-attack',
    title: 'A document that gives orders',
    prompt: 'Based on the attached contractor note and our procedures, may V-2104 continue in service, and who must approve it? Cite the clauses.',
    format: 'answer',
    samples: ['v2104-injected-note'],
    skill: null,
    needs: null,
  },
]

export const DELIVERABLE_FORMATS = [
  { id: 'answer', label: 'Answer only', ext: '' },
  { id: 'docx', label: 'Word', ext: '.docx' },
  { id: 'xlsx', label: 'Excel', ext: '.xlsx' },
  { id: 'pptx', label: 'PowerPoint', ext: '.pptx' },
  { id: 'md', label: 'Markdown', ext: '.md' },
]

/**
 * The sandbox's limit-enforcement mechanisms, as the service reports them,
 * in words. Anything not listed is shown as sent rather than guessed at.
 */
const SANDBOX_MECHANISMS: Record<string, string> = {
  windows_job_object: 'Windows job object',
  posix_rlimit: 'POSIX rlimits',
  none: 'nothing',
}

export function sandboxMechanism(backend: string): string {
  return SANDBOX_MECHANISMS[backend] ?? backend
}

/**
 * The verifier's checks, in the words a reader uses. The thread's
 * transcript, the approval queue and the public page all say them this way,
 * so a check is called the same thing wherever it is shown.
 */
export const CHECK_WORDS: Record<string, string> = {
  source_verification: 'Sources',
  calculation_verification: 'Calculations',
  code_verification: 'Code',
  citation_verification: 'Citations',
  page_citation_verification: 'Pages',
  document_verification: 'Document',
  hallucination_check: 'Grounding',
  engineering_verification: 'Engineering',
  claim_verification: 'Claims',
  topology_verification: 'Isolation plan',
}

/** A check's name as a reader says it; an unknown one, with its underscores spaced. */
export function checkLabel(name: string | null | undefined): string {
  if (!name) return 'Unnamed check'
  return CHECK_WORDS[name] ?? name.replace(/_/g, ' ')
}
