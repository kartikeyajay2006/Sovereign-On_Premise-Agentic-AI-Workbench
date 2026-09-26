/**
 * Proof Mode's shapes, transcribed field for field from
 * backend/proof/proof_view.py. `request<T>()` asserts a type rather than
 * checking one, so change both together.
 */

/** ok: the link holds; attention: it waits on a person or carries a caveat;
 *  fail: it did not hold; none: nothing is recorded for it. */
export type ProofTone = 'ok' | 'attention' | 'fail' | 'none'

export interface ProofFact {
  label: string
  value: string
  mono: boolean
}

export interface ProofEntry {
  id: string | null
  title: string
  detail: string | null
  meta: string[]
  tone: ProofTone
}

export interface ProofRow {
  key: string
  label: string
  tone: ProofTone
  summary: string | null
  /** Why the link is empty; set exactly when nothing is recorded for it. */
  empty: string | null
  facts: ProofFact[]
  entries: ProofEntry[]
}

export interface ProofView {
  task_id: string
  status: string
  prompt: string
  created_at: string
  completed_at: string | null
  parent_task_id: string | null
  rows: ProofRow[]
}
