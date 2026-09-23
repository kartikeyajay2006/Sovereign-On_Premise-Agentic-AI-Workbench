/**
 * Harness endpoints, owned by this feature rather than appended to lib/api.ts.
 *
 * Same transport as the rest of the app -- request<T>() adds the session and
 * turns a refusal into an ApiError carrying the server's own sentence -- so a
 * 400 here reads "Questions: 26 entries given; one run takes at most 25."
 * rather than a status code.
 */

import { request } from '@/lib/api'
import type { Task } from '@/lib/types'
import type {
  HarnessCatalogView,
  HarnessDefinitionView,
  HarnessPreview,
  HarnessPreviewRequest,
  HarnessRunSummary,
  HarnessRunView,
  HarnessStartRequest,
  ReportDecisionRequest,
} from './model/types'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function path(segment: string): string {
  return encodeURIComponent(segment)
}

export const harnessApi = {
  catalog(): Promise<HarnessCatalogView> {
    return request<HarnessCatalogView>('/harnesses')
  },

  definition(harnessId: string): Promise<HarnessDefinitionView> {
    return request<HarnessDefinitionView>(`/harnesses/${path(harnessId)}`)
  },

  /** Expands the inputs into the exact child prompts. Creates nothing. */
  preview(harnessId: string, body: HarnessPreviewRequest): Promise<HarnessPreview> {
    return request<HarnessPreview>(`/harnesses/${path(harnessId)}/preview`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    })
  },

  start(body: HarnessStartRequest): Promise<HarnessRunView> {
    return request<HarnessRunView>('/harness-runs', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    })
  },

  runs(limit: number = 30): Promise<HarnessRunSummary[]> {
    return request<HarnessRunSummary[]>(`/harness-runs?limit=${limit}`)
  },

  run(runId: string): Promise<HarnessRunView> {
    return request<HarnessRunView>(`/harness-runs/${path(runId)}`)
  },

  cancel(runId: string): Promise<HarnessRunView> {
    return request<HarnessRunView>(`/harness-runs/${path(runId)}/cancel`, { method: 'POST' })
  },

  regenerateReport(runId: string): Promise<HarnessRunView> {
    return request<HarnessRunView>(`/harness-runs/${path(runId)}/report`, { method: 'POST' })
  },

  decideReport(runId: string, body: ReportDecisionRequest): Promise<HarnessRunView> {
    return request<HarnessRunView>(`/harness-runs/${path(runId)}/report/decision`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    })
  },

  /**
   * A child's full record, through the ordinary task endpoint and its own
   * ownership check. Used only to show a released answer in the drill-down.
   */
  childTask(taskId: string): Promise<Task> {
    return request<Task>(`/tasks/${path(taskId)}`)
  },
}
