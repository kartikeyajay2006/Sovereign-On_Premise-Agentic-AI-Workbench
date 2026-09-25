/**
 * Run comparison shapes, transcribed field for field from
 * backend/proof/compare.py. `request<T>()` asserts a type rather than
 * checking one, so change both together.
 */

export interface CompareSide {
  task_id: string
  status: string
  prompt: string
  created_at: string
  parent_task_id: string | null
  duration_ms: number | null
  answer: string | null
}

export interface Change {
  /** "Configuration" (what the run was given) or "Outcome" (what it produced). */
  group: string
  label: string
  /** "not recorded" when the run has no record of it. */
  a: string
  b: string
  changed: boolean
  note: string | null
}

export interface RunComparison {
  a: CompareSide
  b: CompareSide
  linked: boolean
  changes: Change[]
  evidence: { only_a: string[]; only_b: string[]; common: number }
  changed: number
}
