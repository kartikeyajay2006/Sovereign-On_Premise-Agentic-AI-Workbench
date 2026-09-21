// The hero's run receipt, read from the captured fixture.
//
// The import is static and deliberate: if frontend/public/landing/run.json is
// absent, this is a module-resolution error and the build fails. It does not
// fall back to sample data. That mirrors lib/api.ts's refusal to invent a
// number the backend did not return, and it is the one guarantee that matters
// on a page whose argument is that the product does not fabricate artifacts.
//
// The file is written by scripts/capture_landing_fixture.py and is never
// hand-edited. Run:
//
//     python scripts/capture_landing_fixture.py
//
// with the workbench running to refresh it from the most complete finished run
// on the host.

import fixture from '@/public/landing/run.json'
import type { ReceiptRow } from './run-receipt'

interface FixtureRow {
  value: string
  meta: string
}

/** The fourth row carries its own label, because HELD and APPROVED are different facts. */
interface DecisionRow extends FixtureRow {
  label: string
}

export interface CapturedRun {
  task_id: string
  status: string
  prompt: string
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
}

export const run: CapturedRun = fixture

/** A short run id. The full uuid is 36 characters and swamps the header row. */
export const runId = `tsk_${run.task_id.slice(0, 8)}`

export const receiptRows: ReceiptRow[] = [
  { label: 'Cited', ...run.cited },
  { label: 'Checked', ...run.checked },
  { label: 'Computed', ...run.computed },
  { label: run.decision.label, value: run.decision.value, meta: run.decision.meta },
  { label: 'Recorded', value: run.recorded.value, meta: run.recorded.meta },
]
