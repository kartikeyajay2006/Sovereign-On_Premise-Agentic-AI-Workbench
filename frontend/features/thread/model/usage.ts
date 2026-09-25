import type { EvidenceItem, ModelUsage, RoutingDecision } from '@/lib/types'
import type { ModelChoice } from './types'

/**
 * Arithmetic over measured figures, and nothing that invents one.
 *
 * Kept free of React so the rules are in one place and can be read in one
 * sitting. The rule they all follow: a figure the runtime did not report is
 * absent, and absence propagates. It is never read as zero, because a total
 * that treated a missing count as 0 would state a smaller number than the
 * run actually cost -- a flattering figure the backend never measured.
 */

/** A sum over the values that were reported, and how many were. */
export interface KnownSum {
  sum: number
  known: number
  total: number
}

export function sumKnown(values: readonly (number | null | undefined)[]): KnownSum {
  let sum = 0
  let known = 0
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      sum += value
      known += 1
    }
  }
  return { sum, known, total: values.length }
}

/**
 * A total, qualified by how complete it is.
 *
 * Every call reported: the plain sum. Some did: the sum marked as a floor,
 * because it is one. None did: null, which renders as nothing.
 */
export function formatKnownSum(total: KnownSum): string | null {
  if (total.known === 0) return null
  const figure = total.sum.toLocaleString()
  return total.known === total.total ? figure : `≥${figure}`
}

export function formatCount(value: number): string {
  return value.toLocaleString()
}

/** Seconds to one decimal, the format the run header already uses. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

export function formatRate(tokensPerSecond: number): string {
  return `${tokensPerSecond.toFixed(1)} tok/s`
}

/** Calls that ran to completion; a stopped call reported nothing to count. */
export function completedCalls(usage: readonly ModelUsage[]): ModelUsage[] {
  return usage.filter((u) => !u.cancelled)
}

/**
 * How much of the window this call ran with its prompt took, or null.
 *
 * Measured against the window the call was given -- the stage budget sent as
 * num_ctx -- not the model's declared maximum. Every generation model here
 * declares 32,768 while drafting runs in 5,120, so a fill against the
 * declaration would read about a sixth of the real one.
 */
export function contextFill(u: ModelUsage): number | null {
  if (u.prompt_tokens === null || !u.context_window) return null
  return u.prompt_tokens / u.context_window
}

export interface Fill {
  fill: number
  call: ModelUsage
  promptTokens: number
  window: number
}

/** The call that came closest to filling its window, with both measured sides. */
export function peakFill(usage: readonly ModelUsage[]): Fill | null {
  let best: Fill | null = null
  for (const call of usage) {
    const fill = contextFill(call)
    if (fill === null || call.prompt_tokens === null || !call.context_window) continue
    if (best === null || fill > best.fill) {
      best = { fill, call, promptTokens: call.prompt_tokens, window: call.context_window }
    }
  }
  return best
}

export function formatPercent(fraction: number): string {
  const percent = fraction * 100
  // Below one percent, "0%" would read as an empty window. It is not empty.
  if (percent > 0 && percent < 1) return '<1%'
  return `${Math.round(percent)}%`
}

/**
 * The call whose text the reader was shown: the streamed drafting call.
 *
 * Deliverable drafting also runs as the drafting stage, but it is not
 * streamed and its output is a document, not this answer.
 */
export function answerCall(usage: readonly ModelUsage[]): ModelUsage | null {
  for (let i = usage.length - 1; i >= 0; i -= 1) {
    const call = usage[i]
    if (call.stage === 'drafting' && call.streamed && !call.cancelled) return call
  }
  return null
}

/** Display names of the models that actually ran, in the order they first did. */
export function modelsThatRan(usage: readonly ModelUsage[]): string[] {
  const seen: string[] = []
  for (const call of usage) {
    const name = call.display_name || call.model
    if (!seen.includes(name)) seen.push(name)
  }
  return seen
}

/** Merge a live record in without duplicating one a replay delivers again. */
export function appendUsage(usage: readonly ModelUsage[], record: ModelUsage): ModelUsage[] {
  const duplicate = usage.some(
    (u) => u.started_at === record.started_at && u.stage === record.stage && u.model === record.model,
  )
  // The same array when nothing changed, so a replayed event costs no render.
  return duplicate ? (usage as ModelUsage[]) : [...usage, record]
}

const STAGE_NAMES: Record<string, string> = {
  planning: 'Planning',
  vision_extraction: 'Reading',
  code_generation: 'Code',
  drafting: 'Drafting',
  verification: 'Verification',
}

/** The pipeline's stage key as a reader would name it. */
export function stageName(stage: string | null | undefined): string {
  if (!stage) return 'A stage'
  return STAGE_NAMES[stage] ?? stage.replace(/_/g, ' ')
}

export function choiceFromEvent(data: Record<string, any>): ModelChoice {
  return {
    stage: typeof data.stage === 'string' ? data.stage : null,
    model: typeof data.model === 'string' ? data.model : null,
    displayName: typeof data.display_name === 'string' ? data.display_name : null,
    preferredModel: typeof data.preferred_model === 'string' ? data.preferred_model : null,
    preferenceHonoured:
      typeof data.preference_honoured === 'boolean' ? data.preference_honoured : null,
    preferenceReason: typeof data.preference_reason === 'string' ? data.preference_reason : null,
  }
}

export function choicesFromRouting(routing: readonly RoutingDecision[] | undefined): ModelChoice[] {
  return (routing || []).map((decision) => ({
    stage: decision.stage ?? null,
    model: decision.selected_model ?? null,
    displayName: decision.selected_display_name ?? null,
    preferredModel: decision.preferred_model ?? null,
    preferenceHonoured: decision.preference_honoured ?? null,
    preferenceReason: decision.preference_reason ?? null,
  }))
}

export interface DeclinedPreference {
  key: string
  preferred: string
  stage: string | null
  /** What ran instead, or null when nothing could. */
  used: string | null
  reason: string | null
}

/**
 * Every stage where a requested model was not used, once each.
 *
 * Retries route the same stage again with the same outcome, so identical
 * notes are folded -- the reader needs the fact once, not per attempt.
 */
export function declinedPreferences(choices: readonly ModelChoice[]): DeclinedPreference[] {
  const notes: DeclinedPreference[] = []
  const seen = new Set<string>()
  for (const choice of choices) {
    if (choice.preferenceHonoured !== false || !choice.preferredModel) continue
    const used = choice.displayName || choice.model
    const key = `${choice.stage}|${used}|${choice.preferenceReason}`
    if (seen.has(key)) continue
    seen.add(key)
    notes.push({
      key,
      preferred: choice.preferredModel,
      stage: choice.stage,
      used,
      reason: choice.preferenceReason,
    })
  }
  return notes
}

const CITATION = /\[([SFVCEH]\d+)\]/g

/**
 * The answer with every citation spelled out: "[S1]" becomes
 * "[S1: SOP-MNT-022 Corrosion Under Insulation, section: 4. Assessment]".
 *
 * Pasted into an email or a report, a bare [S1] points at nothing. The
 * expansion uses the same "source, location" form the generated documents
 * use. A citation with no evidence behind it is not dropped or guessed at:
 * it is expanded into the fact that nothing supports it.
 */
export function expandCitations(text: string, evidence: readonly EvidenceItem[]): string {
  const byId = new Map(evidence.map((item) => [item.id, item]))
  return text.replace(CITATION, (_whole, id: string) => {
    const item = byId.get(id)
    if (!item) return `[${id}: no evidence was recorded for this citation]`
    const where = [item.source_document || 'local document', item.location]
      .filter((part) => part && String(part).trim())
      .join(', ')
    return `[${id}: ${where}]`
  })
}
