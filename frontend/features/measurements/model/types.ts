/**
 * The measurements dashboard's shapes, transcribed field for field from
 * backend/proof/measurements.py. `request<T>()` asserts a type rather than
 * checking one, so change both together.
 */

export interface MetricSource {
  kind: 'runs' | 'audit_event' | 'report_file' | 'certificates'
  name: string
  path: string | null
  sha256: string | null
  at: string | null
  /** The API route that returns the artifact itself. */
  href: string | null
  run_ids: string[]
}

export interface MetricPart {
  label: string
  display: string
}

export interface Metric {
  id: string
  group: string
  label: string
  status: 'measured' | 'skipped'
  value: number | null
  unit: string | null
  display: string | null
  sample: string | null
  /** Why a skipped metric has no value; a caveat on a measured one. */
  reason: string | null
  verdict: 'good' | 'bad' | null
  source: MetricSource | null
  breakdown: MetricPart[]
}

export interface Measurements {
  generated_at: string
  scope: string
  runs_considered: number
  metrics: Metric[]
}
