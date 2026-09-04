/**
 * Sovereign Workbench API service layer.
 *
 * Talks to the local, air-gapped FastAPI backend via Next.js proxy at `/api/*`
 * (or direct `http://127.0.0.1:8000/api/*`).
 * No external network calls are ever made.
 */

import type {
  ApprovalDecisionRequest,
  ApprovalItem,
  AuditChainStatus,
  AuditEvent,
  DirectoryUser,
  EvidenceItem,
  KnowledgeDocument,
  KnowledgeSearchResponse,
  ModelDescriptor,
  ModelsStatus,
  SandboxTestResult,
  Session,
  SopRecord,
  SovereigntyStatus,
  StoredFile,
  SystemHealth,
  Task,
  TaskCreateRequest,
  TaskFile,
  TaskSummary,
  User,
} from './types'

const API_BASE = '/api'
const TOKEN_KEY = 'workbench_session_token'

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem(TOKEN_KEY) || window.localStorage.getItem(TOKEN_KEY)
}

export function setAuthToken(token: string | null) {
  if (typeof window === 'undefined') return
  if (token) {
    window.sessionStorage.setItem(TOKEN_KEY, token)
    window.localStorage.setItem(TOKEN_KEY, token)
  } else {
    window.sessionStorage.removeItem(TOKEN_KEY)
    window.localStorage.removeItem(TOKEN_KEY)
  }
}

export class ApiError extends Error {
  status: number
  detail: any

  constructor(status: number, message: string, detail?: any) {
    super(message)
    this.status = status
    this.detail = detail
    this.name = 'ApiError'
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }

  if (token && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    })

    if (!res.ok) {
      let detail = ''
      try {
        const body = await res.json()
        detail = body.detail || body.message || JSON.stringify(body)
      } catch {
        detail = await res.text()
      }
      throw new ApiError(res.status, `API ${res.status}: ${detail || res.statusText}`, detail)
    }

    // Check if response is JSON
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      return (await res.json()) as T
    }
    return (await res.text()) as unknown as T
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err
    }
    // Deliberately no fallback to sample data.
    //
    // This application's whole claim is that the figures on screen are
    // measured on this host. Quietly substituting invented numbers when the
    // backend is unreachable would put fabricated egress counts and audit
    // entries in front of someone auditing the platform, with nothing marking
    // them as unreal. A failure must look like a failure.
    throw new ApiError(0, err.message || 'Cannot reach the local workbench service')
  }
}

export const api = {
  // ------------------------------------------------------------------ auth
  async login(username: string, password: string): Promise<Session> {
    const res = await request<Session>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    setAuthToken(res.token)
    return res
  },

  async register(
    username: string,
    displayName: string,
    password: string,
    department: string = 'operations'
  ): Promise<Session> {
    const res = await request<Session>('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        display_name: displayName,
        password,
        department,
      }),
    })
    setAuthToken(res.token)
    return res
  },

  async me(): Promise<User> {
    return request<User>('/auth/me')
  },

  async directory(): Promise<DirectoryUser[]> {
    return request<DirectoryUser[]>('/auth/directory')
  },

  async logout(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST' })
    } catch {
      // Ignore network failure on logout
    } finally {
      setAuthToken(null)
    }
  },

  // ----------------------------------------------------------------- tasks
  async createTask(
    prompt: string,
    fileIds: string[] = [],
    deliverableFormat?: string | null
  ): Promise<Task> {
    return request<Task>('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        file_ids: fileIds,
        deliverable_format: deliverableFormat || null,
      }),
    })
  },

  async cancelTask(taskId: string): Promise<Task> {
    return request<Task>(`/tasks/${taskId}/cancel`, { method: 'POST' })
  },

  async listTasks(limit: number = 50): Promise<TaskSummary[]> {
    return request<TaskSummary[]>(`/tasks?limit=${limit}`)
  },

  async getTask(taskId: string): Promise<Task> {
    return request<Task>(`/tasks/${taskId}`)
  },

  // ------------------------------------------------------------- approvals
  async pendingApprovals(): Promise<Task[]> {
    return request<Task[]>('/approvals')
  },

  async decideApproval(
    taskId: string,
    decision: 'approve' | 'reject',
    comment?: string
  ): Promise<Task> {
    return request<Task>(`/tasks/${taskId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, comment }),
    })
  },

  // ----------------------------------------------------------------- files
  async uploadFile(
    file: File | Blob,
    filename: string,
    classification?: string
  ): Promise<StoredFile> {
    const token = getAuthToken()
    const form = new FormData()
    form.append('file', file, filename)
    if (classification) {
      form.append('classification', classification)
    }

    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const res = await fetch(`${API_BASE}/files`, {
      method: 'POST',
      headers,
      body: form,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new ApiError(res.status, err.detail || 'Upload failed')
    }

    return res.json()
  },

  async listFiles(): Promise<StoredFile[]> {
    return request<StoredFile[]>('/files')
  },

  getDownloadUrl(fileId: string): string {
    return `${API_BASE}/files/${fileId}/download`
  },

  getDeliverableUrl(taskId: string, filename: string): string {
    return `${API_BASE}/deliverables/${taskId}/${encodeURIComponent(filename)}`
  },

  // ------------------------------------------------------------- knowledge
  async knowledgeDocuments(): Promise<KnowledgeDocument[]> {
    return request<KnowledgeDocument[]>('/knowledge/documents')
  },

  async ingestKnowledgeDocument(
    file: File | Blob,
    filename: string,
    department: string,
    classification: string = 'normal',
    version: string = '1.0'
  ): Promise<KnowledgeDocument> {
    const token = getAuthToken()
    const form = new FormData()
    form.append('file', file, filename)
    form.append('department', department)
    form.append('classification', classification)
    form.append('version', version)

    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const res = await fetch(`${API_BASE}/knowledge/documents`, {
      method: 'POST',
      headers,
      body: form,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new ApiError(res.status, err.detail || 'Ingestion failed')
    }

    return res.json()
  },

  async deleteKnowledgeDocument(documentId: string): Promise<void> {
    return request(`/knowledge/documents/${documentId}`, { method: 'DELETE' })
  },

  async searchKnowledge(
    query: string,
    topK: number = 5,
    departments?: string[]
  ): Promise<KnowledgeSearchResponse> {
    return request<KnowledgeSearchResponse>(
      '/knowledge/search',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, top_k: topK, departments }),
      })
  },

  // ----------------------------------------------------------- sovereignty
  async sovereigntyStatus(): Promise<SovereigntyStatus> {
    return request<SovereigntyStatus>(
      '/sovereignty',
      {})
  },

  async sandboxSelfTest(): Promise<SandboxTestResult> {
    return request<SandboxTestResult>('/sovereignty/sandbox-test', {})
  },

  // ---------------------------------------------------------------- models
  async modelsStatus(): Promise<ModelsStatus> {
    return request<ModelsStatus>('/models/status', {})
  },

  async listModels(): Promise<ModelDescriptor[]> {
    return request<ModelDescriptor[]>('/models', {})
  },

  // -------------------------------------------------------------- policies
  async policies(): Promise<Record<string, any>> {
    return request<Record<string, any>>('/policies', {})
  },

  // ----------------------------------------------------------------- audit
  async auditEvents(params?: {
    category?: string
    actor?: string
    taskId?: string
    // The endpoint has always accepted a free-text search; the client simply
    // never sent one, so the audit screen could filter but not look for
    // anything.
    search?: string
    limit?: number
  }): Promise<AuditEvent[]> {
    const search = new URLSearchParams()
    if (params?.category && params.category !== 'ALL') search.set('category', params.category)
    if (params?.actor) search.set('actor', params.actor)
    if (params?.taskId) search.set('task_id', params.taskId)
    if (params?.search) search.set('search', params.search)
    if (params?.limit) search.set('limit', String(params.limit))

    const query = search.toString() ? `?${search.toString()}` : ''
    return request<AuditEvent[]>(`/audit${query}`)
  },

  async auditChain(): Promise<AuditChainStatus> {
    // Never assume the chain is intact: that verdict is the whole point.
    return request<AuditChainStatus>('/audit/chain')
  },

  getAuditExportUrl(): string {
    return `${API_BASE}/audit/export`
  },

  // ---------------------------------------------------------------- health
  async health(): Promise<SystemHealth> {
    return request<SystemHealth>('/health')
  },

  // ----------------------------------------------------------- convenience
  getHostStatus: () => request<any>('/sovereignty'),
  getTasks: () => request<any>('/tasks'),
  getApprovals: () => request<any>('/approvals'),
  getSops: () => request<any>('/knowledge/documents'),
  getTaskFiles: () => request<any>('/files'),
  getAuditEvents: () => request<any>('/audit'),
  search: (query: string) =>
    request<any>('/knowledge/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    }),
}
