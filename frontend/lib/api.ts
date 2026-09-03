"use client";

/**
 * Typed client for the workbench API.
 *
 * Requests go to the same origin and are proxied to the local API by
 * next.config.mjs, so the browser never addresses anything but this host.
 * The session token lives in sessionStorage: it dies with the tab, which is
 * the right lifetime for a console on a shared industrial workstation.
 */

import type {
  AuditChainStatus,
  AuditEvent,
  Deliverable,
  KnowledgeDocument,
  KnowledgeSearchResponse,
  ModelDescriptor,
  ModelsStatus,
  SandboxSelfTest,
  Session,
  SovereigntyStatus,
  StoredFile,
  SystemHealth,
  Task,
  TaskSummary,
  ToolDescriptor,
  User,
} from "./types";

const TOKEN_KEY = "workbench.session";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
  else window.sessionStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...init, headers, cache: "no-store" });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : detail;
    } catch {
      /* response carried no JSON body */
    }
    throw new ApiError(detail, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  // -- identity ----------------------------------------------------------
  async login(username: string, password: string): Promise<Session> {
    const session = await request<Session>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setToken(session.token);
    return session;
  },

  async logout(): Promise<void> {
    try {
      await request<void>("/api/auth/logout", { method: "POST" });
    } finally {
      setToken(null);
    }
  },

  me: () => request<User>("/api/auth/me"),
  directory: () => request<User[]>("/api/auth/directory"),

  // -- tasks -------------------------------------------------------------
  createTask: (prompt: string, fileIds: string[], deliverableFormat?: string | null) =>
    request<Task>("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        file_ids: fileIds,
        deliverable_format: deliverableFormat ?? null,
      }),
    }),

  listTasks: (limit = 50) => request<TaskSummary[]>(`/api/tasks?limit=${limit}`),
  getTask: (id: string) => request<Task>(`/api/tasks/${id}`),

  // -- files -------------------------------------------------------------
  async upload(file: File, classification?: string): Promise<StoredFile> {
    const form = new FormData();
    form.append("file", file);
    if (classification) form.append("classification", classification);
    return request<StoredFile>("/api/files", { method: "POST", body: form });
  },

  listFiles: () => request<StoredFile[]>("/api/files"),

  // -- approvals ---------------------------------------------------------
  pendingApprovals: () => request<Task[]>("/api/approvals"),

  decide: (taskId: string, decision: "approve" | "reject", comment: string) =>
    request<Task>(`/api/tasks/${taskId}/approve`, {
      method: "POST",
      body: JSON.stringify({ decision, comment }),
    }),

  // -- knowledge ---------------------------------------------------------
  knowledgeDocuments: () => request<KnowledgeDocument[]>("/api/knowledge/documents"),

  knowledgeSearch: (query: string, topK?: number) =>
    request<KnowledgeSearchResponse>("/api/knowledge/search", {
      method: "POST",
      body: JSON.stringify({ query, top_k: topK ?? null }),
    }),

  async ingest(
    file: File,
    department: string,
    classification: string,
    version: string,
  ): Promise<KnowledgeDocument> {
    const form = new FormData();
    form.append("file", file);
    form.append("department", department);
    form.append("classification", classification);
    form.append("version", version);
    return request<KnowledgeDocument>("/api/knowledge/documents", {
      method: "POST",
      body: form,
    });
  },

  deleteDocument: (id: string) =>
    request<void>(`/api/knowledge/documents/${id}`, { method: "DELETE" }),

  // -- models and policy -------------------------------------------------
  models: () => request<ModelDescriptor[]>("/api/models"),
  modelsStatus: () => request<ModelsStatus>("/api/models/status"),
  tools: () => request<ToolDescriptor[]>("/api/tools"),
  policies: () => request<Record<string, any>>("/api/policies"),
  routingRules: () => request<Record<string, any>>("/api/routing/rules"),

  // -- audit and sovereignty --------------------------------------------
  audit: (params: { taskId?: string; category?: string; search?: string; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.taskId) query.set("task_id", params.taskId);
    if (params.category) query.set("category", params.category);
    if (params.search) query.set("search", params.search);
    query.set("limit", String(params.limit ?? 300));
    return request<AuditEvent[]>(`/api/audit?${query.toString()}`);
  },

  auditChain: () => request<AuditChainStatus>("/api/audit/chain"),
  sovereignty: () => request<SovereigntyStatus>("/api/sovereignty"),
  sandboxSelfTest: () => request<SandboxSelfTest>("/api/sovereignty/sandbox-test"),
  health: () => request<SystemHealth>("/api/health"),
};

export function deliverableUrl(deliverable: Deliverable): string {
  return deliverable.download_url;
}

/** Download a protected file through fetch, since links cannot carry headers. */
export async function downloadProtected(url: string, filename: string): Promise<void> {
  const token = getToken();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* no JSON body */
    }
    throw new ApiError(detail, response.status);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
