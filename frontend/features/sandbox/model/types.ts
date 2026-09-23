// Transcribed from the backend pydantic models, field for field:
//   backend/core/schemas.py            -> SandboxResult
//   backend/api/routes/sandbox.py      -> AppliedLimits, ExecutionAccounting,
//                                         SandboxExecuteResponse, SandboxLimits
//   backend/tools/sandbox.py           -> self_test_report() dict
// request<T>() asserts rather than validates, so these must match exactly or a
// figure on screen would be one the backend never sent.

import type { PolicyDecision, Sensitivity } from '@/lib/types'

export interface SandboxResult {
  ok: boolean
  exit_code: number | null
  stdout: string
  stderr: string
  duration_ms: number
  timed_out: boolean
  memory_limit_mb: number
  static_validation_passed: boolean
  static_violations: string[]
  generated_files: string[]
  network_attempts_blocked: number
}

export interface AppliedLimits {
  mechanism: string
  memory_mb: number | null
  cpu_seconds: number | null
  active_process_limit: number | null
  wall_timeout_seconds: number | null
  kill_on_close: boolean
  die_on_unhandled_exception: boolean
}

export interface ExecutionAccounting {
  assessable: boolean
  peak_memory_bytes: number | null
  cpu_user_seconds: number | null
  cpu_kernel_seconds: number | null
  termination_reason: string | null
  output_truncated: boolean
}

export interface SandboxExecuteResponse {
  result: SandboxResult
  limits: AppliedLimits
  accounting: ExecutionAccounting
  classification: Sensitivity
  policy_decision: PolicyDecision
  policy_reason: string
  ran_at: string
}

export interface SandboxLimits {
  enabled: boolean
  execution_allowed: boolean
  reason: string
  runtime: string
  backend: string
  memory_mb: number
  cpu_seconds: number
  wall_timeout_seconds: number
  active_process_limit: number | null
  max_code_bytes: number
  network_allowed: boolean
  max_global_concurrency: number
  max_per_user_concurrency: number
}

export interface SelfTestCheck {
  name: string
  target: string
  passed: boolean
  detail: string
}

export interface SelfTestReport {
  checks: SelfTestCheck[]
  passed: number
  total: number
  assessable: boolean
  backend: string
  overall: string
  // Only present on the not-assessable branch.
  reason?: string
  all_passed: boolean
  duration_ms: number
  ran_at: string
}
