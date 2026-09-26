// The recorded run, derived once, on the server, for every moment on the page.
//
// Everything the landing prints about the run is computed here from
// public/landing/run.json (see run-fixture.ts for how that file is written and
// why it is imported statically). Nothing is defaulted to a number: a value the
// record does not carry comes out as null, and the part of the page that would
// have printed it prints less.
//
// Server components import this module; client components receive the slice
// they need as props, so the fixture is never bundled into client JavaScript
// whole.

import { CREW, type CrewId } from '@/lib/crew'
import { checkLabel } from '@/lib/presentation'
import { documentCode, documentTitle, run, runId, sectionLabel, sectionNumber, seconds, type EvidenceUnit } from './run-fixture'

// --------------------------------------------------------------------------- //
// The run's headline facts
// --------------------------------------------------------------------------- //

export { run, runId }

export const checks = (run.verification?.checks ?? []).map((check) => ({
  name: check.name,
  label: checkLabel(check.name),
  passed: check.passed,
  detail: check.detail,
}))
export const passedChecks = checks.filter((check) => check.passed).length

/** "39.6 s", from the run's own duration. */
export const total = seconds(run.duration_ms ?? run.timeline.total_ms)

/** The seal: the hash the run's last audit record carries. */
export const hashFull = run.recorded?.hash_full ?? null
export const hash8 = hashFull ? hashFull.slice(0, 8) : null

/**
 * Released: delivered, and either no approval was required or it was approved.
 * The seal motion runs only for a released run; a held one shows its hash plain.
 */
export const released =
  run.status === 'delivered' && (!run.approval.required || run.approval.decision === 'approved')

export const audit = run.audit
export const auditRange =
  audit.count > 0 && audit.first_sequence !== null && audit.last_sequence !== null
    ? { first: audit.first_sequence, last: audit.last_sequence, count: audit.count }
    : null
export const headSeq = audit.tail.length > 0 ? audit.tail[audit.tail.length - 1].sequence : null

export const claims = run.verification
  ? { supported: run.verification.material_claims_supported, total: run.verification.material_claims_total }
  : null

/** "Qwen2.5 3B": the drafting call's own display name, as the runtime reported it. */
const draftCall = (run.usage ?? []).filter((call) => call.stage === 'drafting').at(-1) ?? null
export const modelName = draftCall ? draftCall.display_name || draftCall.model : (run.models[0] ?? null)

export const capturedOn = run.captured_on

// --------------------------------------------------------------------------- //
// The answer, and the passage it cites
// --------------------------------------------------------------------------- //

export const passages = run.evidence.filter((unit) => /^S\d+$/.test(unit.id))
const markers = Array.from(new Set((run.answer.match(/\[[SFVCEHT]\d+\]/g) ?? []).map((m) => m.slice(1, -1))))
const cited = markers.map((id) => run.evidence.find((unit) => unit.id === id)).filter((unit): unit is EvidenceUnit => unit !== undefined)
const first = cited[0] ?? null

/** The answer without its markers; the page draws the marker as a chip. */
export const answerText = run.answer.replace(/\s*\[[SFVCEHT]\d+\]\s*/g, ' ').trim()

export const cite = first
  ? {
      id: first.id,
      doc: documentCode(first),
      docTitle: documentTitle(first),
      section: sectionNumber(first),
      label: `${documentCode(first)} ${sectionNumber(first)}`.trim(),
    }
  : null

/**
 * The clause the answer rests on: the first cited passage, split around the
 * phrase -- from the comma before it up to the figure the answer states.
 * Where the record will not split cleanly, there is no clause, and the
 * moments that would have drawn it draw less.
 */
export const clause = (() => {
  if (!first) return null
  const lines = first.excerpt.split('\n')
  const heading = lines.find((line) => /^#+\s/.test(line))?.replace(/^#+\s*/, '').trim() ?? sectionLabel(first)
  const body = lines
    .filter((line) => !/^#+\s/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const figure = answerText.match(/\d+(?:\.\d+)?\s*(?:months?|years?|days?|hours?|mm|bar\(g\)|%)/i)?.[0] ?? null
  if (!figure) return null
  const at = body.indexOf(figure)
  if (at < 0) return null
  const from = body.lastIndexOf(',', at) + 1
  const mark = body.slice(from, at).trim()
  return {
    heading,
    before: body.slice(0, from),
    mark,
    figure,
    after: body.slice(at + figure.length),
    /** "not exceeding" in the clause is what licenses the ≤ in a label. */
    bound: /not exceeding|no more than|at most|maximum/i.test(mark) ? '≤' : '',
  }
})()

/** The hero reticle's label: the cited clause, its figure, and the claims traced. */
export const reticleLabel = [
  cite?.label ?? null,
  clause ? `${clause.bound}${clause.figure}` : null,
  claims ? `${claims.supported}/${claims.total} claims traced` : null,
]
  .filter((part): part is string => Boolean(part))
  .join(' · ')
  .toUpperCase()

// --------------------------------------------------------------------------- //
// Retrieval
// --------------------------------------------------------------------------- //

/** What SCOUT's drawing prints: how many passages, from how many documents. */
export const retrieve = {
  count: passages.length,
  documents: new Set(passages.map((unit) => documentCode(unit))).size,
}

// --------------------------------------------------------------------------- //
// Egress, as the run's own closing record wrote it down
// --------------------------------------------------------------------------- //

/**
 * The count the egress monitor attached to the run's finishing record, read out
 * of the stored line. Null when the record carries none.
 */
export const recordedEgress = (() => {
  const last = audit.tail.at(-1)
  if (!last) return null
  try {
    const parsed = JSON.parse(last.line) as { detail?: { egress?: { unapproved_connections_observed?: unknown } } }
    const value = parsed.detail?.egress?.unapproved_connections_observed
    return typeof value === 'number' ? { value, seq: last.sequence } : null
  } catch {
    return null
  }
})()

// --------------------------------------------------------------------------- //
// The chain
// --------------------------------------------------------------------------- //

export const chain = audit.tail.map((record) => ({
  seq: record.sequence,
  category: record.category,
  action: record.action,
  line: record.line,
}))

// --------------------------------------------------------------------------- //
// The crew: what each stage did in this run, as the record gives it
// --------------------------------------------------------------------------- //

/** A stage's entry in the run's timeline, whether it ran or not. Null when the record has none. */
const stageRecord = (id: string) => run.timeline.stages.find((item) => item.id === id) ?? null

export type RelayState = 'ran' | 'skipped' | 'unrecorded'

export interface RelayCell {
  id: CrewId
  callsign: string
  state: RelayState
  /** Its measured time or outcome when it ran; the record's reason when it was skipped. */
  value: string | null
  /** The model it ran on, or what it counted, when the record says. */
  sub: string | null
}

/**
 * One cell per crew member, in pipeline order. A stage the record lists as
 * run shows its measured time (or, where it timed nothing, its outcome); one
 * listed as not run shows the reason the record gives; one the record does
 * not mention at all is `unrecorded`, and the page says so rather than
 * supplying a reason. WARDEN reads the run's policy events, NOTARY its audit
 * records.
 */
export const relay: RelayCell[] = CREW.map((member): RelayCell => {
  const base = { id: member.id, callsign: member.callsign }
  const unrecorded: RelayCell = { ...base, state: 'unrecorded', value: null, sub: null }
  if (member.id === 'warden') {
    const events = run.policy_events
    if (events.length === 0) return unrecorded
    const decisions = Array.from(new Set(events.map((event) => event.decision)))
    return { ...base, state: 'ran', value: decisions.join(' · '), sub: `${events.length} policy ${events.length === 1 ? 'event' : 'events'}` }
  }
  if (member.id === 'notary') {
    if (!auditRange) return unrecorded
    return { ...base, state: 'ran', value: `#${auditRange.first}–${auditRange.last}`, sub: `${auditRange.count} records` }
  }
  const record = member.stage ? stageRecord(member.stage) : null
  if (!record) return unrecorded
  if (!record.ran) return { ...base, state: 'skipped', value: record.note || null, sub: null }
  const time = seconds(record.ms)
  return { ...base, state: 'ran', value: time ?? (record.note || null), sub: time ? record.model : null }
})

/** The values the crew's drawings print. Each is the record's; a missing one is drawn without its label. */
export interface CrewScenes {
  triage: string[]
  scout: { count: number; documents: number; cited: string | null }
  scribe: { cite: string | null }
  checker: Array<{ label: string; passed: boolean }>
  warden: { action: string; decision: string; more: number } | null
  notary: { seqs: number[]; hash8: string | null; first: number | null; last: number | null }
}

const classified = stageRecord('classify')
const classifiedParts = classified?.ran && classified.note ? classified.note.split(' · ').map((part) => part.replace(/_/g, ' ')) : []

export const crewScenes: CrewScenes = {
  // "question_answering · confidential": the task kind and the data class.
  triage: classifiedParts.map((part) => part.toUpperCase()),
  scout: { count: retrieve.count, documents: retrieve.documents, cited: cite?.id ?? null },
  scribe: { cite: cite?.id ?? null },
  checker: checks.map((check) => ({ label: check.label.toUpperCase(), passed: check.passed })),
  warden: run.policy_events[0]
    ? {
        action: run.policy_events[0].action.toUpperCase(),
        decision: run.policy_events[0].decision.toUpperCase(),
        more: run.policy_events.length - 1,
      }
    : null,
  notary: { seqs: audit.tail.map((record) => record.sequence), hash8, first: auditRange?.first ?? null, last: auditRange?.last ?? null },
}

/** The relay's caption: the run, what was asked, how long it took, how it ended. */
export const relayCaption = [runId, run.skill ? `/${run.skill.id}` : null, classifiedParts[0] ?? null, total, run.status].filter(
  (part): part is string => Boolean(part),
)
