// The sandbox feature owns its endpoints in its own folder rather than growing
// lib/api.ts. Same transport, same auth, same error type -- request<T>() is
// exported from lib/api for exactly this.

import { request } from '@/lib/api'
import type { Sensitivity } from '@/lib/types'
import type { SandboxExecuteResponse, SandboxLimits, SelfTestReport } from './types'

export function getSandboxLimits(): Promise<SandboxLimits> {
  return request<SandboxLimits>('/sandbox/limits')
}

export function executeInSandbox(
  code: string,
  classification: Sensitivity,
): Promise<SandboxExecuteResponse> {
  return request<SandboxExecuteResponse>('/sandbox/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, classification }),
  })
}

export function runSandboxSelfTest(): Promise<SelfTestReport> {
  return request<SelfTestReport>('/sandbox/self-test', { method: 'POST' })
}
