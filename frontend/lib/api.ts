/**
 * Sovereign Workbench API service layer.
 *
 * Talks to the local, air-gapped FastAPI backend via Next.js proxy at `/api/*`
 * (or direct `http://127.0.0.1:8000/api/*`).
 * No external network calls are ever made.
 */

import type {
  ModelDescriptor,
  Session,
  SovereigntyStatus,
  StoredFile,
  SystemHealth,
  Skill,
  SkillDraft,
  Task,
  TaskCreateRequest,
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

/**
 * Exported so a feature can own its endpoints in its own folder rather than
 * every new surface appending to this file. Same auth, same error type, same
 * base URL -- one transport, many callers.
 */
export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }

  if (token && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`

  try {
    let res = await fetch(url, {
      ...options,
      headers,
    })

    // A read that failed in the proxy rather than in the API is tried once
    // more. The API reports its own failures as JSON; a 5xx that is not JSON
    // is this server's rewrite losing the connection ("socket hang up") on
    // the way, before the API ever saw the request. Only a read is retried:
    // sending a write twice could do it twice.
    const method = (options.method || 'GET').toUpperCase()
    if (
      !res.ok &&
      res.status >= 500 &&
      method === 'GET' &&
      !(res.headers.get('content-type') || '').includes('application/json')
    ) {
      await new Promise((resolve) => setTimeout(resolve, 250))
      res = await fetch(url, { ...options, headers })
    }

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

  async me(): Promise<User> {
    return request<User>('/auth/me')
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
    deliverableFormat?: string | null,
    /** A registry id, or null/undefined for Automatic. */
    preferredModel?: string | null,
    /** A skill to run the prompt through, or null. */
    skillId?: string | null
  ): Promise<Task> {
    const body: TaskCreateRequest = {
      prompt,
      file_ids: fileIds,
      deliverable_format: deliverableFormat || null,
      preferred_model: preferredModel || null,
      skill_id: skillId || null,
    }
    return request<Task>('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  },

  async listSkills(): Promise<Skill[]> {
    return request<Skill[]>('/skills')
  },

  async createSkill(draft: SkillDraft): Promise<Skill> {
    return request<Skill>('/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
  },

  async deleteSkill(skillId: string): Promise<void> {
    await request<void>(`/skills/${encodeURIComponent(skillId)}`, { method: 'DELETE' })
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

  // ----------------------------------------------------------- sovereignty
  async sovereigntyStatus(): Promise<SovereigntyStatus> {
    return request<SovereigntyStatus>(
      '/sovereignty',
      {})
  },

  // ---------------------------------------------------------------- models
  async listModels(): Promise<ModelDescriptor[]> {
    return request<ModelDescriptor[]>('/models', {})
  },

  // ---------------------------------------------------------------- health
  async health(): Promise<SystemHealth> {
    return request<SystemHealth>('/health')
  },
}
