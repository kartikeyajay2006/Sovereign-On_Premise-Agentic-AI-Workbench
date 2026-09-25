import { request } from '@/lib/api'

/*
 * The Knowledge screen's calls and shapes, transcribed from the backend
 * rather than from lib/types.ts.
 *
 * One of them matters: lib/types.ts declares ModelsStatus.resident_in_runtime
 * as string[], but GET /api/models/status fills it from ModelManager
 * .resident_models(), which returns the provider's /api/ps `models` array
 * as-is: objects, not names (backend/models_layer/manager.py:121-130). A
 * string[] type over that would render "[object Object]". The residency block
 * is ModelManager.status() (manager.py:236-247), whose total_mb is 0 when the
 * host could not be measured; that zero means "unknown" and is shown as such.
 */

/** backend/core/schemas.py KnowledgeDocument */
export interface KnowledgeDocument {
  id: string
  title: string
  source_path: string
  department: string
  classification: string
  version: string
  chunk_count: number
  sha256: string
  ingested_at: string
  media_type: string
  size_bytes: number
  /** Revision control: one document code, many revisions, exactly one active. */
  document_code?: string | null
  revision_status?: 'active' | 'superseded' | 'withdrawn'
  effective_date?: string | null
  supersedes?: string | null
  superseded_by?: string | null
}

/** backend/core/schemas.py StoredFile */
export interface StoredFile {
  id: string
  task_id: string | null
  filename: string
  stored_path: string
  media_type: string
  size_bytes: number
  sha256: string
  input_type: string
  classification: string
  owner_id: string
  department: string
  quarantine_passed: boolean
  quarantine_notes: string[]
  uploaded_at: string
}

/** backend/core/schemas.py EvidenceItem, as KnowledgeBase._to_evidence fills it. */
export interface Passage {
  id: string
  source_document: string
  document_id: string | null
  location: string | null
  excerpt: string
  /** Rounded to four places by the service. */
  score: number | null
  department: string | null
  classification: string
  version: string | null
  ingested_at: string | null
  kind: string
}

/** backend/core/schemas.py KnowledgeSearchResponse */
export interface SearchResponse {
  query: string
  retrieval_mode: 'embedding' | 'lexical'
  results: Passage[]
  /** Measured by the service around the search, query embedding included. */
  took_ms: number
}

/** backend/core/schemas.py ModelDescriptor */
export interface ModelDescriptor {
  id: string
  display_name: string
  family: string
  role: string
  capabilities: string[]
  context_window: number
  quantization: string | null
  parameters_b: number | null
  approved_classifications: string[]
  provider: string
  provider_model: string
  available: boolean
  registered: boolean
  size_bytes: number | null
  notes: string | null
}

export interface Residency {
  resident_model: string | null
  loaded_at: string | null
  footprint_mb: number
  loads: number
  evictions: number
  single_residency: boolean
  available_mb: number
  /** 0 when the host's memory could not be read. */
  total_mb: number
  recent_decisions: Record<string, unknown>[]
}

/** One entry of the provider's /api/ps list, passed through unvalidated. */
export interface RuntimeModel {
  name?: string
  model?: string
  size?: number
  size_vram?: number
  expires_at?: string
}

/** GET /api/models/status (backend/api/routes/system.py:152-173) */
export interface ModelsStatus {
  provider: string | null
  base_url: string | null
  reachable: boolean
  registered: number
  available: number
  unregistered_installed: string[]
  residency: Residency
  resident_in_runtime: RuntimeModel[]
  roles: Record<string, string[]>
}

export function readDocuments(signal?: AbortSignal) {
  return request<KnowledgeDocument[]>('/knowledge/documents', { signal })
}

export function readUploads(signal?: AbortSignal) {
  return request<StoredFile[]>('/files', { signal })
}

export function readModels(signal?: AbortSignal) {
  return Promise.all([
    request<ModelsStatus>('/models/status', { signal }),
    request<ModelDescriptor[]>('/models', { signal }),
  ])
}

export function search(query: string, topK: number, signal?: AbortSignal) {
  return request<SearchResponse>('/knowledge/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k: topK }),
    signal,
  })
}

/**
 * Multipart. request() sets no Content-Type of its own, so the browser
 * writes the multipart boundary itself, and auth and errors behave exactly
 * as they do for every other call.
 */
export function ingest(
  file: File,
  fields: { department: string; classification: string; version: string },
) {
  const form = new FormData()
  form.append('file', file, file.name)
  form.append('department', fields.department)
  form.append('classification', fields.classification)
  form.append('version', fields.version)
  return request<KnowledgeDocument>('/knowledge/documents', { method: 'POST', body: form })
}

/** One registered engineering formula, as GET /api/engineering/formulas lists it. */
export interface FormulaEntry {
  id: string
  version: number
  key: string
  title: string
  clause: string
  expression: string
  inputs: { name: string; kind: string; dimension: string | null; description: string; optional: boolean }[]
  outputs: string[]
  source_sha256: string
}

export function readFormulas(signal?: AbortSignal) {
  return request<FormulaEntry[]>('/engineering/formulas', { signal })
}
