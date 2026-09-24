// The captured run, read from the fixture.
//
// The import is static and deliberate: if frontend/public/landing/run.json is
// absent, this is a module-resolution error and the build fails. It does not
// fall back to sample data. That mirrors lib/api.ts's refusal to invent a
// number the backend did not return, and it is the one guarantee that matters
// on a page whose argument is that the product does not fabricate artifacts.
//
// The file is written by scripts/capture_landing_fixture.py and is never
// hand-edited. The current one was written with:
//
//     python scripts/capture_landing_fixture.py \
//         --db storage/workbench.db --task 5aa3e4b6-45c1-4b4c-9e03-efc92b47d7c9
//
// which reads the task record read-only, with no backend running. That run is
// pinned rather than chosen by the script's ranking because it is the run in
// public/landing/thread-run.png: same prompt, 195249 ms against the 195.2s in
// the image, three of four checks. One run, followed through the whole page.
//
// Every interface below is transcribed from that JSON and from the dicts the
// script builds, not written from memory. The assignment to `run` is checked
// by the compiler against the imported file's inferred type, so a field that
// drifts out of step with the fixture is a build error rather than a silent
// undefined on the page.
//
// This module is imported by server components only. A client component gets
// the slice it needs as props, so the fixture is not bundled into client
// JavaScript whole.

import fixture from '@/public/landing/run.json'

interface FixtureRow {
  value: string
  meta: string
}

/** The fourth row carries its own label, because HELD and APPROVED are different facts. */
interface DecisionRow extends FixtureRow {
  label: string
}

/** One retrieved passage. scripts/capture_landing_fixture.py export_evidence(). */
export interface EvidenceUnit {
  id: string
  /** 1-based position in retrieval's ranking. */
  rank: number
  /** Whether the answer carries this passage's [S] marker. */
  cited: boolean
  source_document: string
  document_id: string
  /** "section: 5. Findings Classification" */
  location: string
  /**
   * Cosine similarity between the question and this passage, from embedding
   * search (backend/rag/knowledge_base.py). Null when the backend reported
   * none, and then the page omits it rather than drawing a default.
   */
  score: number | null
  classification: string
  version: string
  /** The stored chunk, verbatim, markdown included. */
  excerpt: string
}

export interface Retrieval {
  mode: string
  duration_ms: number
  summary: string
  policy_decision: string
}

export interface VerificationCheck {
  name: string
  passed: boolean
  detail: string
  warnings: readonly string[]
}

export interface Verification {
  valid: boolean
  checks: readonly VerificationCheck[]
  material_claims_total: number
  material_claims_supported: number
  completed_at: string
}

export interface Approval {
  required: boolean
  /** Null when no approval was required, so none was ever pending. */
  decision: string | null
  approver_roles: readonly string[]
  reasons: readonly string[]
  reviewer_name: string | null
  decided_at: string | null
}

export interface PolicyEvent {
  action: string
  subject: string
  decision: string
  rule: string
  reason: string
  at: string
}

/** One pipeline stage. `ms` is null when the stage did not run or nothing measured it. */
export interface TimelineStage {
  /** classify | plan | read | retrieve | sandbox | draft | verify */
  id: string
  ran: boolean
  ms: number | null
  model: string | null
  model_version: string | null
  note: string
}

/** A stored audit record. `line` is the line exactly as it sits in the log. */
export interface AuditRecord {
  sequence: number
  at: string
  category: string
  action: string
  prev_hash: string
  hash: string
  line: string
}

/** backend/tools/sandbox.py self_test_report(), as recorded in the audit log. */
export interface SelfTestCheck {
  name: string
  target: string
  passed: boolean
  detail: string
}

export interface SandboxSelfTest {
  sequence: number
  at: string
  hash: string
  detail: {
    checks: readonly SelfTestCheck[]
    passed: number
    total: number
    /** Absent on records written before the not-assessable outcome existed. */
    assessable?: boolean
    overall: string
    reason?: string
    /** Which containment mechanism ran: windows_job_object, posix_rlimit. */
    backend?: string
    all_passed: boolean
    duration_ms: number
    ran_at: string
  }
}

export interface CapturedRun {
  task_id: string
  status: string
  prompt: string
  created_at: string
  captured_on: string
  captured_at: string
  captured_from: string
  duration_ms: number | null
  models: readonly string[]
  cited: FixtureRow
  checked: FixtureRow
  computed: FixtureRow
  decision: DecisionRow
  recorded: FixtureRow & { hash_full: string }
  answer: string
  evidence: readonly EvidenceUnit[]
  retrieval: Retrieval | null
  verification: Verification | null
  approval: Approval
  policy_events: readonly PolicyEvent[]
  timeline: { total_ms: number | null; stages: readonly TimelineStage[] }
  audit: {
    path: string
    count: number
    first_sequence: number | null
    last_sequence: number | null
    tail: readonly AuditRecord[]
  }
  sandbox_self_test: SandboxSelfTest | null
  /** Each model call as the runtime reported it. Absent from older captures. */
  usage?: readonly UsageCall[]
  /** The skill the request went through, when it went through one. */
  skill?: { id: string; name: string; sha256: string; source: string; input: string } | null
}

export interface UsageCall {
  stage: string
  model: string
  display_name: string | null
  prompt_tokens: number | null
  output_tokens: number | null
  tokens_per_second: number | null
  latency_ms: number | null
  load_ms: number | null
  prompt_eval_ms: number | null
  eval_ms: number | null
  context_window: number | null
  cancelled: boolean | null
}

export const run: CapturedRun = fixture

/** A short run id. The full uuid is 36 characters and swamps the header row. */
export const runId = `tsk_${run.task_id.slice(0, 8)}`

// --------------------------------------------------------------------------- //
// Formatting. Every helper returns null for a value the record does not carry,
// so a caller has to decide what absence looks like instead of receiving a
// zero it might print.
// --------------------------------------------------------------------------- //

/** 195249 -> "195.2 s"; 4625 -> "4.6 s"; 2 -> "2 ms". */
export function seconds(ms: number | null | undefined): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

/** "SOP-INS-014 — Pressure Vessel ..." -> "SOP-INS-014". */
export function documentCode(item: Pick<EvidenceUnit, 'source_document'>): string {
  return item.source_document.split(' — ')[0].trim()
}

/** "SOP-INS-014 — Pressure Vessel External and Internal Inspection" -> the title after the dash. */
export function documentTitle(item: Pick<EvidenceUnit, 'source_document'>): string {
  const parts = item.source_document.split(' — ')
  return (parts.length > 1 ? parts.slice(1).join(' — ') : parts[0]).trim()
}

/**
 * "section: 5. Findings Classification" -> "§5. Findings Classification".
 * A passage from before the first section is located by the document's own
 * title line; that is shown as the title, without a section mark it lacks.
 */
export function sectionLabel(item: Pick<EvidenceUnit, 'location'>): string {
  const section = item.location.match(/^\s*section:\s*(.*)$/)?.[1]?.trim()
  if (section !== undefined) {
    // The chunk before a document's first section is located by the
    // document's own title line, "SOP-INS-014 — Pressure …": that is a
    // title, and it gets no section mark it does not have.
    if (/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\s+—\s+/.test(section)) return section.split(' — ').slice(1).join(' — ').trim()
    return `§${section}`
  }
  const parts = item.location.split(' — ')
  return (parts.length > 1 ? parts.slice(1).join(' — ') : item.location).trim()
}

/** "section: 5. Findings Classification" -> "§5"; nothing when there is no section number. */
export function sectionNumber(item: Pick<EvidenceUnit, 'location'>): string {
  const match = /^\s*section:\s*([0-9]+(?:\.[0-9]+)*)/.exec(item.location)
  return match ? `§${match[1]}` : ''
}

/** "2026-09-22T16:32:47.179239Z" -> "16:32:47 UTC". */
export function clock(iso: string | null | undefined): string | null {
  if (!iso) return null
  const match = /T(\d{2}:\d{2}:\d{2})/.exec(iso)
  return match ? `${match[1]} UTC` : null
}
