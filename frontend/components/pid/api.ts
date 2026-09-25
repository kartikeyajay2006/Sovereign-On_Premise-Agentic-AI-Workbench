import { request } from '@/lib/api'

/* Shapes from backend/api/routes/engineering.py (P&ID) and engineering/pid.py. */

export interface PidNode {
  id: string
  type: string
  x: number
  y: number
  label: string
  service?: string
  measures?: string
  controls?: string
  car_sealed?: string
}

export interface PidEdge {
  from: string
  to: string
  line: string
  service?: string
}

export interface PidDrawing {
  id: string
  title: string
  revision: string
  status?: string
  unit?: string
  width: number
  height: number
  nodes: PidNode[]
  edges: PidEdge[]
}

export interface PidSummary {
  id: string
  title: string
  revision: string
  status?: string
  unit?: string
  classification?: string
  elements: number
  lines: number
}

export interface IsolationBranch {
  line: string
  service: string
  beyond: string | null
  elements: string[]
  method: string
  compliant: boolean
  clause: string
  action: string
  notes: string[]
  close: string[]
  bleeds: string[]
  blind: string[]
}

export interface TopologyResult {
  kind: 'isolation' | 'upstream' | 'downstream' | 'path' | 'instruments'
  drawing: string
  tag?: string
  from?: string
  to?: string
  purpose?: string
  purpose_words?: string
  compliant?: boolean
  branches?: IsolationBranch[]
  close_and_lock?: string[]
  open_bleeds?: string[]
  blinds?: string[]
  affected_equipment?: string[]
  non_compliant?: string[]
  reached?: { tag: string; type: string; label: string; line: string; steps: number }[]
  steps?: { from: string; to: string; line: string }[]
  lines: string[]
  evidence_id?: string
}

export function readDrawings(signal?: AbortSignal) {
  return request<PidSummary[]>('/pid', { signal })
}

export function readDrawing(id: string, signal?: AbortSignal) {
  return request<PidDrawing>(`/pid/${encodeURIComponent(id)}`, { signal })
}

export function queryDrawing(
  id: string,
  query: { kind: TopologyResult['kind']; tag: string; to?: string | null; purpose?: string },
) {
  return request<TopologyResult>(`/pid/${encodeURIComponent(id)}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  })
}

/** "PID-2104-01 rev B" -> "PID-2104-01" */
export function drawingIdOf(reference: string): string {
  return reference.split(' rev ')[0]
}

export interface Highlight {
  target: string | null
  close: Set<string>
  bleeds: Set<string>
  blinds: Set<string>
  /** Lines of branches that cannot be isolated as drawn. */
  failedLines: Set<string>
  affected: Set<string>
  /** Edges on a path or reached by a flow walk, as "from>to". */
  route: Set<string>
  reached: Set<string>
}

export function highlightFor(result: TopologyResult | null): Highlight {
  const empty: Highlight = {
    target: null, close: new Set(), bleeds: new Set(), blinds: new Set(), failedLines: new Set(),
    affected: new Set(), route: new Set(), reached: new Set(),
  }
  if (!result) return empty
  if (result.kind === 'isolation') {
    return {
      ...empty,
      target: result.tag ?? null,
      close: new Set(result.close_and_lock ?? []),
      bleeds: new Set(result.open_bleeds ?? []),
      blinds: new Set(result.blinds ?? []),
      failedLines: new Set(result.non_compliant ?? []),
      affected: new Set(result.affected_equipment ?? []),
    }
  }
  if (result.kind === 'path') {
    return {
      ...empty,
      target: result.from ?? null,
      route: new Set((result.steps ?? []).map((s) => `${s.from}>${s.to}`)),
      reached: new Set((result.steps ?? []).map((s) => s.to)),
    }
  }
  return { ...empty, target: result.tag ?? null, reached: new Set((result.reached ?? []).map((r) => r.tag)) }
}
