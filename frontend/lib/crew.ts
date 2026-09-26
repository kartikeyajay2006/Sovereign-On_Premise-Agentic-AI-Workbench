/**
 * The crew: the pipeline's stages, named.
 *
 * Every entry is a real stage of backend/agents/orchestrator.py, in the order
 * a run passes through them, and says what it actually runs on: a model from
 * config/models.yaml, or "no model" where the stage is rules, a registry or
 * a hash. The names are a way to talk about the stages, not a claim of ten
 * independent agents: one orchestrator drives them, one after another.
 *
 * `stage` is the thread's pipeline id (lib/presentation.ts DEFAULT_PIPELINE)
 * where the stage has one; WARDEN and NOTARY act across the run and are read
 * from its policy events and audit records instead.
 */
export type CrewId =
  | 'triage'
  | 'planner'
  | 'reader'
  | 'scout'
  | 'reckoner'
  | 'bench'
  | 'scribe'
  | 'checker'
  | 'warden'
  | 'notary'

export interface CrewMember {
  id: CrewId
  index: string
  callsign: string
  /** One sentence: what it does. */
  role: string
  /** What it runs on, as configured. `model` is set only when a model does the work. */
  runsOn: { model: string | null; note: string }
  /** The thread's pipeline stage id, when it has one. */
  stage: 'classify' | 'plan' | 'read' | 'retrieve' | 'compute' | 'sandbox' | 'draft' | 'verify' | null
}

export const CREW: CrewMember[] = [
  {
    id: 'triage',
    index: '01',
    callsign: 'TRIAGE',
    role: 'Reads the request: what kind of task, what came in, how sensitive it is.',
    runsOn: { model: null, note: 'No model · rules' },
    stage: 'classify',
  },
  {
    id: 'planner',
    index: '02',
    callsign: 'PLANNER',
    role: 'Splits multi-step work into steps before anything is drafted.',
    runsOn: { model: 'qwen2.5:3b', note: 'only when a plan is needed' },
    stage: 'plan',
  },
  {
    id: 'reader',
    index: '03',
    callsign: 'READER',
    role: 'Reads scanned reports and drawings, page by page.',
    runsOn: { model: 'qwen2.5vl:3b', note: 'cached per file' },
    stage: 'read',
  },
  {
    id: 'scout',
    index: '04',
    callsign: 'SCOUT',
    role: 'Finds the passages that could answer it, across every indexed procedure.',
    runsOn: { model: 'nomic-embed-text', note: 'plus keyword search' },
    stage: 'retrieve',
  },
  {
    id: 'reckoner',
    index: '05',
    callsign: 'RECKONER',
    role: 'Computes with registered formulas, never free-hand arithmetic.',
    runsOn: { model: null, note: 'No model · formula registry' },
    stage: 'compute',
  },
  {
    id: 'bench',
    index: '06',
    callsign: 'BENCH',
    role: 'Runs generated code in the sandbox, under hard memory and time caps.',
    runsOn: { model: null, note: 'No model · sandbox limits' },
    stage: 'sandbox',
  },
  {
    id: 'scribe',
    index: '07',
    callsign: 'SCRIBE',
    role: 'Drafts the answer, one citation per requirement.',
    runsOn: { model: 'qwen2.5:3b', note: 'drafting model' },
    stage: 'draft',
  },
  {
    id: 'checker',
    index: '08',
    callsign: 'CHECKER',
    role: 'Tests every claim against the passage it cites, and fails what it cannot find.',
    runsOn: { model: null, note: 'No model · rules' },
    stage: 'verify',
  },
  {
    id: 'warden',
    index: '09',
    callsign: 'WARDEN',
    role: 'Applies policy and the data class, and holds anything that needs a person.',
    runsOn: { model: null, note: 'No model · policy engine' },
    stage: null,
  },
  {
    id: 'notary',
    index: '10',
    callsign: 'NOTARY',
    role: 'Hashes the record onto the audit chain. Edit a byte and the chain breaks.',
    runsOn: { model: null, note: 'No model · SHA-256 chain' },
    stage: null,
  },
]

export const CREW_BY_STAGE = Object.fromEntries(CREW.filter((m) => m.stage).map((m) => [m.stage, m])) as Record<
  NonNullable<CrewMember['stage']>,
  CrewMember
>
