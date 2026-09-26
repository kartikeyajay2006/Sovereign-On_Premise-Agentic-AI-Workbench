import type { StreamEvent, Task } from '@/lib/types'

/**
 * One child run as stage lanes on a shared time axis, kept free of React.
 *
 * Two sources feed the same shape. A settled child is read from its task
 * record -- stage_log[], usage[], tool_calls[], routing[], policy_events[],
 * verification -- and the child in flight is extended from its `task.*`
 * events as they arrive. Either way every position on the axis is a
 * timestamp the backend wrote: an event's `at`, a record's `started_at`,
 * or a start plus the duration the backend measured for that same call.
 * Nothing is interpolated. A span that has not ended is drawn open to the
 * last moment anything was heard, and says it is open; it is never
 * extended by the browser's clock.
 *
 * A record written before stage_log existed replays without stage spans:
 * its model calls and tool calls still have their own start times, and
 * that is all the lanes show.
 */

export type LaneId = 'classify' | 'plan' | 'retrieve' | 'reason' | 'verify' | 'policy'

export const LANES: { id: LaneId; label: string }[] = [
  { id: 'classify', label: 'Classify' },
  { id: 'plan', label: 'Plan' },
  { id: 'retrieve', label: 'Retrieve' },
  { id: 'reason', label: 'Reason' },
  { id: 'verify', label: 'Verify' },
  { id: 'policy', label: 'Policy' },
]

export type Tone = 'neutral' | 'ok' | 'held' | 'critical'

interface StageEntry {
  status: string
  phase: string | null
  message: string
  skipped: boolean
  at: number
}

interface ModelCall {
  stage: string
  model: string
  startedAt: number
  latencyMs: number
  tokensPerSecond: number | null
  outputTokens: number | null
}

interface ModelChoice {
  stage: string | null
  model: string
  at: number
}

interface ToolRun {
  tool: string
  startedAt: number
  durationMs: number | null
  ok: boolean | null
  policy: string | null
}

interface Mark {
  lane: LaneId
  at: number
  label: string
  tone: Tone
  key: string
}

export interface EvidenceHit {
  id: string
  document: string
  location: string | null
  score: number | null
}

interface Verified {
  at: number
  total: number
  supported: number
  valid: boolean
  checks: { name: string; passed: boolean }[]
}

export interface Timeline {
  stages: StageEntry[]
  models: ModelCall[]
  choices: ModelChoice[]
  tools: ToolRun[]
  marks: Mark[]
  evidence: EvidenceHit[]
  evidenceAt: number | null
  verified: Verified | null
  finished: { at: number; status: string; durationMs: number | null } | null
  /** The latest streamed text, replaced per frame (each carries the whole draft). */
  token: { stage: string; text: string; at: number } | null
  firstAt: number | null
  lastAt: number | null
}

export const EMPTY_TIMELINE: Timeline = {
  stages: [],
  models: [],
  choices: [],
  tools: [],
  marks: [],
  evidence: [],
  evidenceAt: null,
  verified: null,
  finished: null,
  token: null,
  firstAt: null,
  lastAt: null,
}

/** Statuses that end a run, rather than open a stage. */
const TERMINAL = new Set([
  'delivered',
  'awaiting_approval',
  'approved',
  'rejected',
  'revision_requested',
  'failed',
  'blocked',
  'cancelled',
])

/**
 * The phase a stage names -> its lane. Phase first, because status alone
 * cannot tell reasoning from reading a scan: all of them report EXECUTING.
 */
const PHASE_LANE: Record<string, LaneId> = {
  planning: 'plan',
  retrieval: 'retrieve',
  reasoning: 'reason',
  deliverable: 'reason',
  code_execution: 'reason',
  engineering: 'reason',
  vision_extraction: 'reason',
  verification: 'verify',
}
const STATUS_LANE: Record<string, LaneId> = {
  classified: 'classify',
  planned: 'plan',
  retrieving: 'retrieve',
  executing: 'reason',
  verifying: 'verify',
}
/** A model call's stage -> the lane it served. */
const MODEL_STAGE_LANE: Record<string, LaneId> = {
  planning: 'plan',
  drafting: 'reason',
  reasoning: 'reason',
  code_generation: 'reason',
  vision_extraction: 'reason',
  verification: 'verify',
}

export function stageLane(status: string, phase: string | null): LaneId | null {
  return (phase && PHASE_LANE[phase]) || STATUS_LANE[status] || null
}

export function modelLane(stage: string | null): LaneId {
  return (stage && MODEL_STAGE_LANE[stage]) || 'reason'
}

function time(iso: unknown): number | null {
  if (typeof iso !== 'string') return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function heard(tl: Timeline, at: number): Timeline {
  return {
    ...tl,
    firstAt: tl.firstAt === null ? at : Math.min(tl.firstAt, at),
    lastAt: tl.lastAt === null ? at : Math.max(tl.lastAt, at),
  }
}

function policyTone(decision: string): Tone {
  if (decision === 'deny') return 'critical'
  if (decision === 'require_approval') return 'held'
  return 'neutral'
}

/**
 * The same stage arrives twice when a record read and the stream's replay
 * overlap: once from stage_log (stamped as it was set) and once as the
 * event (stamped microseconds later, when it was published). Two marks of
 * one status and phase within two seconds are one stage; the orchestrator
 * never re-enters the same stage that fast.
 */
const SAME_STAGE_MS = 2000

function withStage(tl: Timeline, entry: StageEntry): Timeline {
  const dup = tl.stages.some(
    (s) => s.status === entry.status && s.phase === entry.phase && Math.abs(s.at - entry.at) < SAME_STAGE_MS,
  )
  if (dup) return tl
  const stages = [...tl.stages, entry].sort((a, b) => a.at - b.at)
  return { ...tl, stages }
}

function withMark(tl: Timeline, mark: Mark): Timeline {
  if (tl.marks.some((m) => m.key === mark.key)) return tl
  return { ...tl, marks: [...tl.marks, mark].sort((a, b) => a.at - b.at) }
}

function withEvidence(tl: Timeline, items: EvidenceHit[], at: number | null): Timeline {
  const known = new Set(tl.evidence.map((e) => e.id))
  const fresh = items.filter((item) => !known.has(item.id))
  if (fresh.length === 0 && (tl.evidenceAt !== null || at === null)) return tl
  return { ...tl, evidence: [...tl.evidence, ...fresh], evidenceAt: tl.evidenceAt ?? at }
}

function hit(item: Record<string, any>): EvidenceHit {
  return {
    id: String(item.id),
    document: String(item.source_document ?? ''),
    location: typeof item.location === 'string' ? item.location : null,
    score: num(item.score),
  }
}

/** The whole record as a timeline: what a settled child replays from. */
export function timelineFromTask(task: Task): Timeline {
  let tl: Timeline = EMPTY_TIMELINE
  const created = time(task.created_at)
  if (created !== null) {
    tl = heard(tl, created)
    const profile = task.profile
    tl = withMark(tl, {
      lane: 'classify',
      at: created,
      key: 'created',
      tone: 'neutral',
      label: profile ? `${profile.task_type} · ${profile.sensitivity}` : 'received',
    })
  }
  for (const mark of task.stage_log ?? []) {
    const at = time(mark.at)
    if (at === null) continue
    tl = heard(withStage(tl, { ...mark, at }), at)
  }
  for (const decision of task.routing ?? []) {
    const at = time(decision.decided_at)
    if (at === null || !decision.selected_model) continue
    tl = heard({ ...tl, choices: [...tl.choices, { stage: decision.stage, model: decision.selected_model, at }] }, at)
  }
  for (const usage of task.usage ?? []) {
    const at = time(usage.started_at)
    if (at === null) continue
    tl = heard(
      {
        ...tl,
        models: [
          ...tl.models,
          {
            stage: usage.stage,
            model: usage.model,
            startedAt: at,
            latencyMs: usage.latency_ms,
            tokensPerSecond: usage.tokens_per_second ?? null,
            outputTokens: usage.output_tokens ?? null,
          },
        ],
      },
      at + usage.latency_ms,
    )
  }
  let searchEnd: number | null = null
  for (const call of task.tool_calls ?? []) {
    const at = time(call.started_at)
    if (at === null) continue
    if (call.tool === 'knowledge_search' && call.ok) searchEnd = at + call.duration_ms
    tl = heard(
      {
        ...tl,
        tools: [
          ...tl.tools,
          { tool: call.tool, startedAt: at, durationMs: call.duration_ms, ok: call.ok, policy: call.policy_decision },
        ],
      },
      at + call.duration_ms,
    )
  }
  for (const event of task.policy_events ?? []) {
    const at = time(event?.at)
    if (at === null) continue
    tl = withMark(tl, {
      lane: 'policy',
      at,
      key: `policy|${event.subject}|${event.action}|${event.decision}|${event.at}`,
      tone: policyTone(String(event.decision)),
      label: `${event.action ?? 'check'} · ${event.decision}`,
    })
  }
  // Retrieved passages carry no time of their own; they are placed where the
  // search that returned them ended, or, with no such search, not at all.
  tl = withEvidence(
    tl,
    (task.evidence ?? []).filter((e) => e.kind === 'knowledge_base').map((e) => hit(e as Record<string, any>)),
    searchEnd,
  )
  if (task.verification) {
    const at = time(task.verification.completed_at)
    if (at !== null) {
      tl = heard(
        {
          ...tl,
          verified: {
            at,
            total: task.verification.material_claims_total,
            supported: task.verification.material_claims_supported,
            valid: task.verification.valid,
            checks: task.verification.checks.map((c) => ({ name: String(c.name ?? ''), passed: Boolean(c.passed) })),
          },
        },
        at,
      )
    }
  }
  const completed = time(task.completed_at ?? null)
  if (completed !== null && TERMINAL.has(task.status)) {
    tl = heard({ ...tl, finished: { at: completed, status: task.status, durationMs: task.duration_ms ?? null } }, completed)
  }
  return tl
}

/** One `task.*` event applied to a timeline. Idempotent for a replayed event. */
export function applyEvent(tl: Timeline, event: StreamEvent): Timeline {
  const at = time(event.at)
  if (at === null) return tl
  const data = event.data ?? {}
  switch (event.event) {
    case 'task.token': {
      if (typeof data.text !== 'string') return tl
      return heard({ ...tl, token: { stage: String(data.stage ?? ''), text: data.text, at } }, at)
    }
    case 'task.created': {
      const profile = data.profile ?? null
      return heard(
        withMark(tl, {
          lane: 'classify',
          at,
          key: 'created',
          tone: 'neutral',
          label: profile ? `${profile.task_type} · ${profile.sensitivity}` : 'received',
        }),
        at,
      )
    }
    case 'task.classified': {
      if (!data.sensitivity) return tl
      return heard(
        withMark(tl, {
          lane: 'classify',
          at,
          key: `classified|${data.raised_from}|${data.sensitivity}`,
          tone: 'held',
          label: `raised ${data.raised_from ?? '?'} → ${data.sensitivity}`,
        }),
        at,
      )
    }
    case 'task.stage': {
      const status = String(data.status ?? '').toLowerCase()
      const phase = typeof data.phase === 'string' ? data.phase : null
      let next = withStage(tl, {
        status,
        phase,
        message: typeof data.message === 'string' ? data.message : '',
        skipped: Boolean(data.skipped),
        at,
      })
      if (TERMINAL.has(status) && !next.finished) {
        next = { ...next, finished: { at, status, durationMs: null } }
      }
      return heard(next, at)
    }
    case 'task.model_selected': {
      if (!data.model) return tl
      const stage = typeof data.stage === 'string' ? data.stage : null
      if (tl.choices.some((c) => c.stage === stage && c.model === data.model && Math.abs(c.at - at) < SAME_STAGE_MS)) {
        return heard(tl, at)
      }
      return heard({ ...tl, choices: [...tl.choices, { stage, model: String(data.model), at }] }, at)
    }
    case 'task.model_completed': {
      const usage = data.usage ?? {}
      const started = time(usage.started_at)
      const latency = num(usage.latency_ms ?? data.latency_ms)
      if (started === null || latency === null) return heard(tl, at)
      const stage = String(usage.stage ?? data.stage ?? '')
      if (tl.models.some((m) => m.startedAt === started && m.stage === stage)) return heard(tl, at)
      return heard(
        {
          ...tl,
          models: [
            ...tl.models,
            {
              stage,
              model: String(usage.model ?? data.model ?? ''),
              startedAt: started,
              latencyMs: latency,
              tokensPerSecond: num(usage.tokens_per_second ?? data.tokens_per_second),
              outputTokens: num(usage.output_tokens ?? data.output_tokens),
            },
          ],
        },
        at,
      )
    }
    case 'task.tool_started': {
      const tool = String(data.tool ?? '')
      if (tl.tools.some((t) => t.tool === tool && t.durationMs === null)) return heard(tl, at)
      return heard({ ...tl, tools: [...tl.tools, { tool, startedAt: at, durationMs: null, ok: null, policy: null }] }, at)
    }
    case 'task.tool_completed': {
      const tool = String(data.tool ?? '')
      const duration = num(data.duration_ms)
      const started = time(data.started_at)
      const closed = { durationMs: duration, ok: Boolean(data.ok), policy: typeof data.policy_decision === 'string' ? data.policy_decision : null }
      const already = started !== null && tl.tools.some((t) => t.tool === tool && t.startedAt === started && t.durationMs !== null)
      const openIndex = tl.tools.findIndex((t) => t.tool === tool && t.durationMs === null)
      let tools = tl.tools
      if (already) {
        // The record already holds this call; the open block the start
        // event drew is the same call and goes.
        tools = openIndex >= 0 ? tools.filter((_, i) => i !== openIndex) : tools
      } else if (openIndex >= 0) {
        tools = tools.map((t, i) => (i === openIndex ? { ...t, ...closed, startedAt: started ?? t.startedAt } : t))
      } else if (started !== null) {
        tools = [...tools, { tool, startedAt: started, ...closed }]
      }
      return heard({ ...tl, tools }, at)
    }
    case 'task.evidence': {
      const items = Array.isArray(data.items) ? data.items.map(hit) : []
      return heard(withEvidence(tl, items, at), at)
    }
    case 'task.policy': {
      const decision = String(data.decision ?? '')
      return heard(
        withMark(tl, {
          lane: 'policy',
          at,
          key: `live-policy|${data.subject}|${decision}|${data.reason}`,
          tone: policyTone(decision),
          label: `${data.subject ?? 'check'} · ${decision}`,
        }),
        at,
      )
    }
    case 'task.verified': {
      if (tl.verified) return heard(tl, at)
      return heard(
        {
          ...tl,
          verified: {
            at,
            total: num(data.material_claims_total) ?? 0,
            supported: num(data.material_claims_supported) ?? 0,
            valid: Boolean(data.valid),
            checks: Array.isArray(data.checks)
              ? data.checks.map((c: any) => ({ name: String(c.name), passed: Boolean(c.passed) }))
              : [],
          },
        },
        at,
      )
    }
    case 'task.finished':
    case 'task.failed':
    case 'task.blocked':
    case 'task.cancelled': {
      const status =
        event.event === 'task.finished' ? String(data.status ?? 'finished') : event.event.slice('task.'.length)
      const durationMs = num(data.duration_ms)
      const finished = tl.finished
        ? { ...tl.finished, durationMs: tl.finished.durationMs ?? durationMs }
        : { at, status, durationMs }
      return heard({ ...tl, finished }, at)
    }
    default:
      return tl
  }
}

// ------------------------------------------------------------ lane items
export type ItemKind = 'stage' | 'model' | 'tool' | 'mark'

export interface LaneItem {
  key: string
  lane: LaneId
  kind: ItemKind
  start: number
  /** Null: still open, drawn to the axis end and marked as open. */
  end: number | null
  label: string
  tone: Tone
  /** Measured facts for the inspector line, never derived ones. */
  detail: string
}

export interface LaneView {
  items: LaneItem[]
  /** Latest model chosen for the lane, and the rate of its last completed call. */
  chips: Partial<Record<LaneId, { model: string; tokensPerSecond: number | null }>>
  t0: number | null
  tEnd: number | null
  /** The stage open at the axis end, if the run has not finished there. */
  openStage: LaneId | null
  /** Every distinct moment the timeline holds, for stepping through a replay. */
  moments: number[]
}

function laneForTool(tool: string, startedAt: number, stages: StageEntry[]): LaneId {
  if (tool === 'knowledge_search') return 'retrieve'
  let lane: LaneId = 'reason'
  for (const s of stages) {
    if (s.at > startedAt) break
    lane = stageLane(s.status, s.phase) ?? lane
  }
  return lane
}

/**
 * The lanes as they stood at `until` (a moment the timeline holds), or as
 * they stand now. Anything that starts later is left out; anything that
 * ends later is drawn open at `until`, which is exactly what was known then.
 */
export function laneView(tl: Timeline, until: number | null = null): LaneView {
  const cut = (t: number) => until === null || t <= until
  const endAt = (end: number | null) => (end === null || (until !== null && end > until) ? null : end)
  const items: LaneItem[] = []
  const finishedAt = tl.finished && cut(tl.finished.at) ? tl.finished.at : null

  const stages = tl.stages.filter((s) => cut(s.at))
  stages.forEach((stage, index) => {
    if (TERMINAL.has(stage.status)) {
      if (stage.status === 'awaiting_approval' || stage.status === 'blocked') {
        items.push({
          key: `stage-${stage.at}`,
          lane: 'policy',
          kind: 'mark',
          start: stage.at,
          end: stage.at,
          label: stage.status === 'blocked' ? 'blocked' : 'held for approval',
          tone: stage.status === 'blocked' ? 'critical' : 'held',
          detail: stage.message,
        })
      }
      return
    }
    const lane = stageLane(stage.status, stage.phase)
    if (!lane) return
    const nextAt = stages[index + 1]?.at ?? finishedAt
    items.push({
      key: `stage-${stage.at}`,
      lane,
      kind: stage.skipped ? 'mark' : 'stage',
      start: stage.at,
      end: stage.skipped ? stage.at : endAt(nextAt ?? null),
      label: stage.skipped ? `${stage.phase ?? stage.status} skipped` : (stage.phase ?? stage.status),
      tone: 'neutral',
      detail: stage.message,
    })
  })

  for (const call of tl.models) {
    if (!cut(call.startedAt)) continue
    const end = call.startedAt + call.latencyMs
    items.push({
      key: `model-${call.startedAt}-${call.stage}`,
      lane: modelLane(call.stage),
      kind: 'model',
      start: call.startedAt,
      end: endAt(end),
      label: call.model,
      tone: 'neutral',
      detail: [
        `${call.model} · ${call.stage}`,
        `${call.latencyMs} ms`,
        call.outputTokens !== null ? `${call.outputTokens} tok out` : null,
        call.tokensPerSecond !== null ? `${call.tokensPerSecond.toFixed(1)} tok/s` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    })
  }

  for (const tool of tl.tools) {
    if (!cut(tool.startedAt)) continue
    const end = tool.durationMs === null ? null : tool.startedAt + tool.durationMs
    const refused = tool.policy !== null && tool.policy !== 'allow'
    items.push({
      key: `tool-${tool.tool}-${tool.startedAt}`,
      lane: laneForTool(tool.tool, tool.startedAt, tl.stages),
      kind: 'tool',
      start: tool.startedAt,
      end: endAt(end),
      label: tool.tool,
      tone: tool.ok === false || refused ? 'critical' : 'neutral',
      detail: [
        tool.tool,
        tool.durationMs !== null ? `${tool.durationMs} ms` : 'running',
        tool.ok === null ? null : tool.ok ? 'ok' : 'failed',
        tool.policy ? `policy ${tool.policy}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    })
  }

  for (const mark of tl.marks) {
    if (!cut(mark.at)) continue
    items.push({ key: mark.key, lane: mark.lane, kind: 'mark', start: mark.at, end: mark.at, label: mark.label, tone: mark.tone, detail: mark.label })
  }

  if (tl.evidenceAt !== null && cut(tl.evidenceAt) && tl.evidence.length > 0) {
    items.push({
      key: 'evidence',
      lane: 'retrieve',
      kind: 'mark',
      start: tl.evidenceAt,
      end: tl.evidenceAt,
      label: `${tl.evidence.length} hits`,
      tone: 'neutral',
      detail: `${tl.evidence.length} passages retrieved`,
    })
  }

  if (tl.verified && cut(tl.verified.at)) {
    const v = tl.verified
    items.push({
      key: 'verified',
      lane: 'verify',
      kind: 'mark',
      start: v.at,
      end: v.at,
      label: `${v.supported}/${v.total} claims`,
      tone: v.valid ? 'ok' : 'held',
      detail: `${v.supported} of ${v.total} material claims supported · ${v.checks.filter((c) => c.passed).length}/${v.checks.length} checks passed`,
    })
  }

  const chips: LaneView['chips'] = {}
  for (const choice of tl.choices) {
    if (!cut(choice.at)) continue
    const lane = modelLane(choice.stage)
    chips[lane] = { model: choice.model, tokensPerSecond: chips[lane]?.tokensPerSecond ?? null }
  }
  for (const call of tl.models) {
    if (!cut(call.startedAt + call.latencyMs)) continue
    const lane = modelLane(call.stage)
    chips[lane] = { model: chips[lane]?.model ?? call.model, tokensPerSecond: call.tokensPerSecond }
  }

  const moments = Array.from(
    new Set(
      [
        ...tl.stages.map((s) => s.at),
        ...tl.models.flatMap((m) => [m.startedAt, m.startedAt + m.latencyMs]),
        ...tl.tools.flatMap((t) => (t.durationMs === null ? [t.startedAt] : [t.startedAt, t.startedAt + t.durationMs])),
        ...tl.marks.map((m) => m.at),
        ...(tl.evidenceAt !== null ? [tl.evidenceAt] : []),
        ...(tl.verified ? [tl.verified.at] : []),
        ...(tl.finished ? [tl.finished.at] : []),
      ],
    ),
  ).sort((a, b) => a - b)

  const last = until ?? finishedAt ?? tl.lastAt
  const openStage = (() => {
    if (finishedAt !== null) return null
    const current = stages.filter((s) => !TERMINAL.has(s.status)).at(-1)
    return current && !current.skipped ? stageLane(current.status, current.phase) : null
  })()

  return { items, chips, t0: tl.firstAt, tEnd: last, openStage, moments }
}
