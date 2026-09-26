import type { PlanStep, Task } from '@/lib/types'
import { MODEL_STAGE_TO_ROW } from './board'
import type { AssistantTurn, TranscriptNote } from './types'
import { formatSeconds } from './usage'

/**
 * The transcript's sub-lines, from the events that carry them.
 *
 * Every line is built from fields the backend put in the event, and an event
 * that lacks the field writes nothing rather than a guess. The words are
 * tense-true: an extraction event arrives once the page has been read, so it
 * says "Read page 3", not "Reading".
 */

/** How many plan steps are listed before the rest are counted. */
const PLAN_STEPS_SHOWN = 5

/** One line, cut at a word, with the whole text kept for the tooltip. */
function oneLine(text: string, max = 140): { text: string; title?: string } {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return { text: flat }
  const cut = flat.slice(0, max)
  const at = cut.lastIndexOf(' ')
  return { text: `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`, title: flat }
}

function planNotes(steps: readonly PlanStep[], key: string): TranscriptNote[] {
  const named = steps.filter((step) => typeof step?.objective === 'string' && step.objective.trim())
  const notes: TranscriptNote[] = named.slice(0, PLAN_STEPS_SHOWN).map((step, i) => ({
    key: `${key}:${i}`,
    stage: 'plan',
    ...oneLine(`${i + 1}. ${step.objective}`),
  }))
  if (named.length > PLAN_STEPS_SHOWN) {
    const more = named.length - PLAN_STEPS_SHOWN
    notes.push({ key: `${key}:more`, stage: 'plan', text: `+${more} more step${more === 1 ? '' : 's'}` })
  }
  return notes
}

const POLICY_WORDS: Record<string, string> = {
  allow: 'Recorded',
  require_approval: 'Held for a person',
  deny: 'Blocked',
}

/** The row a policy finding belongs to: whichever stage was working when it was made. */
function workingRow(turn: AssistantTurn): string {
  return turn.stages.find((s) => s.status === 'active')?.id ?? 'retrieve'
}

/**
 * The notes one event adds, or none. `key` is the event's identity, so a
 * replayed event (already filtered upstream) would at worst collide rather
 * than duplicate.
 */
export function notesFromEvent(name: string, data: any, key: string, turn: AssistantTurn): TranscriptNote[] {
  switch (name) {
    case 'task.planned':
      return Array.isArray(data.steps) ? planNotes(data.steps, key) : []

    case 'task.tool_started': {
      // The two tool starts that say something the stage line does not.
      if (data.tool === 'file_read') {
        const fileId = data.arguments?.file_id
        const file = turn.request?.attachments.find((a) => a.fileId === fileId)
        return file ? [{ key, stage: 'read', text: `Reading ${file.filename}` }] : []
      }
      if (data.tool === 'python_exec') return [{ key, stage: 'sandbox', text: 'Script sent to the sandbox' }]
      return []
    }

    case 'task.model_swapped': {
      const row = typeof data.stage === 'string' ? MODEL_STAGE_TO_ROW[data.stage] : undefined
      if (!row || typeof data.loading !== 'string') return []
      const freed = typeof data.evicted === 'string' && data.evicted ? ` (freed ${data.evicted})` : ''
      return [{ key, stage: row, text: `Loading ${data.loading}${freed}` }]
    }

    case 'task.extraction': {
      const file = typeof data.filename === 'string' ? data.filename : null
      if (Array.isArray(data.pages) && data.pages.length > 0) {
        return data.pages
          .filter((page: unknown): page is number => typeof page === 'number')
          .map((page: number) => ({
            key: `${key}:${page}`,
            stage: 'read',
            text: `Read page ${page}${file ? ` · ${file}` : ''}`,
          }))
      }
      return file ? [{ key, stage: 'read', text: `Read ${file}` }] : []
    }

    case 'task.code_retry': {
      if (typeof data.attempt !== 'number') return []
      const problem = typeof data.problem === 'string' ? data.problem.split('\n').find((l: string) => l.trim()) ?? '' : ''
      return [{ key, stage: 'sandbox', tone: 'critical', ...oneLine(`Code retry ${data.attempt}: ${problem}`) }]
    }

    case 'task.sandbox_result': {
      const parts: string[] = []
      if (typeof data.exit_code === 'number') parts.push(`exit ${data.exit_code}`)
      if (typeof data.duration_ms === 'number') parts.push(formatSeconds(data.duration_ms))
      if (data.static_validation_passed === false) {
        const count = Array.isArray(data.static_violations) ? data.static_violations.length : 0
        parts.push(count ? `refused by static check (${count})` : 'refused by static check')
      }
      if (typeof data.network_attempts_blocked === 'number' && data.network_attempts_blocked > 0) {
        parts.push(`${data.network_attempts_blocked} network attempt${data.network_attempts_blocked === 1 ? '' : 's'} blocked`)
      }
      if (parts.length === 0) return []
      return [{ key, stage: 'sandbox', tone: data.ok === false ? 'critical' : undefined, text: `Sandbox · ${parts.join(' · ')}` }]
    }

    case 'task.policy': {
      if (typeof data.reason !== 'string' || !data.reason) return []
      const decision = String(data.decision ?? '').toLowerCase()
      const words = POLICY_WORDS[decision] ?? decision
      return [{
        key,
        kind: 'policy',
        stage: workingRow(turn),
        tone: decision === 'deny' ? 'critical' : decision === 'require_approval' ? 'approval' : undefined,
        ...oneLine(`${words}: ${data.reason}`),
      }]
    }

    default:
      return []
  }
}

/**
 * What a reopened run can still show. The stream is gone, so only what the
 * record kept: the plan's steps. Model swaps, retries and page reads were
 * events, not fields, and are not invented back.
 */
export function notesFromTask(task: Task): TranscriptNote[] {
  return task.plan?.steps?.length ? planNotes(task.plan.steps, `record:plan:${task.id}`) : []
}
