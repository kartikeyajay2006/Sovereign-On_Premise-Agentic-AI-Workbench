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

export const CONSOLE_TEMPLATES = [
  {
    id: 'approval-note',
    title: 'Approval note from a scanned report',
    prompt:
      'Read the attached scanned inspection report for vessel V-2104 and prepare an approval note based on our approved SOPs. State the governing location, the corrosion rate and remaining life with the inputs used, the severity and the clause it rests on, and who must approve it.',
    format: 'docx',
    attach: 'sample_data/inspection/scanned-inspection-report-V-2104.pdf',
    skill: null,
    // Reading a scan takes a vision model; without one installed this run
    // would end blocked, so the thread offers it only where one is.
    needs: 'vision',
  },
  {
    id: 'corrosion-calc',
    title: 'Corrosion rate and remaining life',
    prompt:
      'Using the attached thickness survey for V-2104, calculate the corrosion rate and remaining life for every location against a minimum allowable thickness of 6.0 mm, and identify which location governs.',
    format: 'xlsx',
    attach: 'sample_data/datasets/V-2104-thickness-survey.csv',
    skill: null,
    needs: null,
  },
  {
    id: 'procedure-question',
    title: 'What do our procedures require?',
    prompt:
      'What severity applies when cladding damage exceeds 20% of an insulated section, and who must approve continued operation? Cite the clauses.',
    format: 'answer',
    attach: null,
    skill: null,
    needs: null,
  },
  {
    // One click to a whole run: a built-in skill and its input, no file.
    // Offered in place of the scanned report on a host with no vision model.
    id: 'clause-skill',
    title: 'Find the governing clause',
    prompt: 'internal inspection of a pressure vessel in corrosive service',
    format: 'answer',
    attach: null,
    skill: 'clause',
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
}

/** A check's name as a reader says it; an unknown one, with its underscores spaced. */
export function checkLabel(name: string | null | undefined): string {
  if (!name) return 'Unnamed check'
  return CHECK_WORDS[name] ?? name.replace(/_/g, ' ')
}
