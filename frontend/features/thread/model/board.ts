import type { ModelUsage, PipelineStage, Task } from '@/lib/types'
import type { TurnOutcome } from './types'

/**
 * The stage board's rules, kept free of React.
 *
 * One rule runs through all of it: a row is painted as having run only when
 * something the backend reported says it ran. A stage the pipeline chose not
 * to run is skipped, a stage a failure or a stop kept it from reaching is
 * blocked, and a stage a stop interrupted is neither done nor failed.
 */

/**
 * The phase a `task.stage` event names -> the row it moves.
 *
 * Status alone cannot say this: reading a scan, running code, reasoning and
 * drafting a document all report EXECUTING. Mapping that status to the
 * sandbox row lit "Sandbox" for plain reasoning and then marked it done, on
 * runs that never touched the sandbox -- a board painting a never-run stage
 * green, which is the one thing it exists not to do.
 */
export const PHASE_TO_STAGE: Record<string, string> = {
  vision_extraction: 'read',
  planning: 'plan',
  retrieval: 'retrieve',
  code_execution: 'sandbox',
  engineering: 'sandbox',
  reasoning: 'draft',
  verification: 'verify',
  deliverable: 'draft',
}

/** Statuses that name one row without ambiguity, for events with no phase. */
export const STATUS_TO_STAGE: Record<string, string> = {
  planned: 'plan',
  retrieving: 'retrieve',
  verifying: 'verify',
}

/** A model call's stage -> the row that shows which model served it. */
export const MODEL_STAGE_TO_ROW: Record<string, string> = {
  planning: 'plan',
  vision_extraction: 'read',
  code_generation: 'sandbox',
  drafting: 'draft',
  verification: 'verify',
}

export const TERMINAL = new Set([
  'delivered',
  'awaiting_approval',
  'approved',
  'rejected',
  'failed',
  'blocked',
  'cancelled',
])

export function outcomeFor(status: string): TurnOutcome {
  switch (status) {
    case 'delivered':
    case 'approved':
      return 'delivered'
    case 'awaiting_approval':
      return 'held'
    case 'rejected':
      return 'rejected'
    // Its own outcome, not "denied": a run is blocked when no model could be
    // routed to a stage, which is as often a runtime that is not running as
    // it is a policy refusal. The turn says which, in the backend's words.
    case 'blocked':
      return 'blocked'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'running'
  }
}

/** The row a stage event moves, by phase first and unambiguous status second. */
export function rowForStageEvent(phase: unknown, status: string): string | undefined {
  return (typeof phase === 'string' && PHASE_TO_STAGE[phase]) || STATUS_TO_STAGE[status]
}

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/**
 * Time in a stage, from the backend's own event timestamps, added to any
 * earlier visit to the same row. Server time at both ends, so a tab that
 * was busy or a frame that arrived late does not stretch the reading.
 */
export function accumulated(stage: PipelineStage, endAt: string | null): number | null {
  const start = parseTime(stage.at)
  const end = parseTime(endAt)
  if (start === null || end === null) return stage.elapsedMs
  return (stage.elapsedMs ?? 0) + Math.max(0, end - start)
}

/** Move the board into `target`, closing whichever stage was open. */
export function enterStage(
  stages: PipelineStage[],
  target: string,
  at: string,
  message: string,
  skipped: boolean,
): PipelineStage[] {
  return stages.map((s): PipelineStage => {
    if (s.id === target) {
      // A stage the backend reports as skipped is marked skipped, not
      // walked through active and left as done.
      if (skipped) return { ...s, status: 'skipped', detail: message, at: null }
      // Re-entered -- the answer, then later the deliverable, both draft --
      // so what the earlier visit took is kept rather than overwritten.
      const prior = s.status === 'active' ? accumulated(s, at) : s.elapsedMs
      return { ...s, status: 'active', detail: message, at, elapsedMs: prior }
    }
    if (s.status === 'active') return { ...s, status: 'done', elapsedMs: accumulated(s, at) }
    return s
  })
}

/**
 * The board at the end of a run. Nothing is left looking live, and nothing
 * that did not run is painted as having run: a stage a stop interrupted did
 * not finish and did not fail, and a stage after a failure was never reached.
 */
export function closeStages(
  stages: PipelineStage[],
  outcome: TurnOutcome,
  endAt: string | null,
  stopNote?: string | null,
): PipelineStage[] {
  return stages.map((s): PipelineStage => {
    const elapsed = s.status === 'active' ? accumulated(s, endAt) : s.elapsedMs
    switch (outcome) {
      case 'delivered':
      case 'held':
      case 'rejected':
        if (s.status === 'active') return { ...s, status: 'done', elapsedMs: elapsed }
        if (s.status === 'pending') return { ...s, status: 'skipped' }
        return s
      case 'cancelled':
        if (s.status === 'active') {
          return { ...s, status: 'skipped', elapsedMs: elapsed, detail: stopNote || s.detail }
        }
        if (s.status === 'pending') return { ...s, status: 'blocked' }
        return s
      case 'failed':
      case 'blocked':
        if (s.status === 'active') return { ...s, status: 'failed', elapsedMs: elapsed }
        if (s.status === 'pending') return { ...s, status: 'blocked' }
        return s
      case 'denied':
        if (s.status === 'active') return { ...s, status: 'denied', elapsedMs: elapsed }
        if (s.status === 'pending') return { ...s, status: 'blocked' }
        return s
      default:
        return s
    }
  })
}

/**
 * The closed live board, corrected by the record.
 *
 * The live board is the better source for timings and the worse one for
 * completeness: events are dropped for a slow subscriber, and a stream lost
 * mid-run left rows that ran looking skipped. Where the record evidences a
 * stage -- an answer, a verification report, a tool call -- that stage ran,
 * whatever the stream managed to deliver. A live failure is kept: it is a
 * finding the record's coarser evidence cannot overrule.
 */
export function reconcileStages(live: PipelineStage[], recorded: PipelineStage[]): PipelineStage[] {
  return live.map((s): PipelineStage => {
    const r = recorded.find((x) => x.id === s.id)
    const model = s.model || r?.model || ''
    if (r?.status === 'done' && s.status !== 'done' && s.status !== 'failed') {
      return { ...s, status: 'done', model }
    }
    return model === s.model ? s : { ...s, model }
  })
}

export function modelForRow(usage: readonly ModelUsage[], row: string): string {
  for (let i = usage.length - 1; i >= 0; i -= 1) {
    if (MODEL_STAGE_TO_ROW[usage[i].stage] === row) return usage[i].display_name || usage[i].model
  }
  return ''
}

/**
 * How long a stage took, from what the record measured: its model calls'
 * latencies and its tool calls' durations. A stage the record has no timing
 * for gets null, which prints nothing -- never a zero.
 */
export function recordedMs(task: Task, row: string): number | null {
  const usage = task.usage || []
  const tools = task.tool_calls || []
  const total = (values: (number | null | undefined)[]): number | null => {
    const known = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    return known.length ? known.reduce((sum, v) => sum + v, 0) : null
  }
  const calls = (stage: string) => usage.filter((u) => u.stage === stage).map((u) => u.latency_ms)
  const runs = (tool: string) => tools.filter((c) => c.tool === tool).map((c) => c.duration_ms)
  switch (row) {
    case 'plan':
      return total(calls('planning'))
    case 'read':
      return total(calls('vision_extraction'))
    case 'retrieve':
      return total(runs('knowledge_search'))
    case 'sandbox':
      return total([...calls('code_generation'), ...runs('python_exec')])
    case 'draft':
      return total(calls('drafting'))
    case 'verify':
      return total(calls('verification'))
    default:
      return null
  }
}

/**
 * Reconstruct the stage board from a task record.
 *
 * A reopened run has no event stream to replay -- token frames are never
 * kept, and the stage events are long gone -- so the board is derived from
 * what the record actually evidences. Anything it cannot evidence is marked
 * skipped rather than done, which is the same rule the live board follows.
 * A run still in flight keeps those rows pending instead: they may yet run.
 */
export function stagesFromTask(
  task: Task,
  inFlight: boolean,
  pipeline: readonly PipelineStage[],
): PipelineStage[] {
  const tools: string[] = (task.tool_calls || []).map((c) => c.tool)
  const usage = task.usage || []
  const ran: Record<string, boolean> = {
    classify: Boolean(task.profile),
    plan: Boolean(task.plan),
    read: (task.files || []).length > 0 || usage.some((u) => u.stage === 'vision_extraction'),
    retrieve: tools.includes('knowledge_search'),
    sandbox: tools.includes('python_exec') || (task.calculations || []).length > 0,
    draft: Boolean(task.answer),
    verify: Boolean(task.verification),
  }
  const current = inFlight ? STATUS_TO_STAGE[String(task.status).toLowerCase()] : undefined
  return pipeline.map((stage): PipelineStage => {
    const model = modelForRow(usage, stage.id)
    if (stage.id === current) return { ...stage, model, status: 'active', at: task.updated_at }
    if (ran[stage.id]) return { ...stage, model, status: 'done', elapsedMs: recordedMs(task, stage.id) }
    return { ...stage, model, status: inFlight ? 'pending' : 'skipped' }
  })
}
