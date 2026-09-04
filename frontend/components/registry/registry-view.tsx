'use client'

import { useEffect, useState } from 'react'
import { Search, Plus, Loader2, Trash2 } from 'lucide-react'
import { SOPS, TASK_FILES, SEARCH_CORPUS } from '@/lib/mock-data'
import { api } from '@/lib/api'
import type { EvidenceItem, KnowledgeDocument, SopRecord, StoredFile, TaskFile } from '@/lib/types'
import { PageHeader } from '@/components/page-header'
import { ClassificationTag, StatusIndicator, TechnicalLabel } from '@/components/primitives'
import { SovButton } from '@/components/sov-button'
import { Modal } from '@/components/modal'
import { useToast } from '@/components/toast'
import { useRole } from '@/components/role-context'
import { cn } from '@/lib/utils'

type Tab = 'sops' | 'files' | 'search'

const TABS: { id: Tab; label: string }[] = [
  { id: 'sops', label: 'SOPs & Knowledge Base' },
  { id: 'files', label: 'Task Files' },
  { id: 'search', label: 'Semantic Search Tester' },
]

export function RegistryView() {
  const [tab, setTab] = useState<Tab>('sops')
  const [ingestOpen, setIngestOpen] = useState(false)
  const [docs, setDocs] = useState<KnowledgeDocument[]>([])
  const [files, setFiles] = useState<StoredFile[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = () => {
    Promise.all([
      api.knowledgeDocuments().catch(() => []),
      api.listFiles().catch(() => []),
    ]).then(([d, f]) => {
      setDocs(d)
      setFiles(f)
      setLoading(false)
    })
  }

  useEffect(() => {
    loadData()
  }, [])

  const totalChunks = docs.reduce((acc, d) => acc + (d.chunk_count || 0), 0) || SOPS.reduce((a, s) => a + s.chunks, 0)
  const sopCount = docs.length > 0 ? docs.length : SOPS.length
  const fileCount = files.length > 0 ? files.length : TASK_FILES.length

  return (
    <div>
      <PageHeader
        eyebrow="Knowledge Registry"
        title="Registry"
        description="Locally indexed standard operating procedures, task files and a semantic retrieval tester. Nothing is uploaded off-host."
        meta={[
          { label: 'SOPs', value: String(sopCount) },
          { label: 'Chunks', value: String(totalChunks) },
          { label: 'Task files', value: String(fileCount) },
          { label: 'Embedder', value: 'bge-m3 / bm25' },
        ]}
        actions={
          <SovButton arrow onClick={() => setIngestOpen(true)}>
            <Plus className="h-4 w-4" /> Ingest new SOP
          </SovButton>
        }
      />

      <div className="mx-auto max-w-[1400px] px-5 py-10 lg:px-10">
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'relative -mb-px px-4 py-3 text-[13px] transition-colors',
                tab === t.id ? 'text-foreground' : 'text-foreground-muted hover:text-foreground',
              )}
            >
              {t.label}
              {tab === t.id && <span className="absolute inset-x-4 bottom-0 h-0.5 bg-foreground" />}
            </button>
          ))}
        </div>

        <div className="mt-8">
          {tab === 'sops' && <SopTable docs={docs} onRefresh={loadData} />}
          {tab === 'files' && <FilesTable files={files} />}
          {tab === 'search' && <SemanticSearch />}
        </div>
      </div>

      <IngestModal open={ingestOpen} onClose={() => setIngestOpen(false)} onIngested={loadData} />
    </div>
  )
}

function SopTable({ docs, onRefresh }: { docs: KnowledgeDocument[]; onRefresh: () => void }) {
  const { push } = useToast()
  const displayItems = docs.length > 0 ? docs : (SOPS as any[])

  const handleDelete = async (id: string, title: string) => {
    try {
      await api.deleteKnowledgeDocument(id)
      push({ title: 'Document removed', detail: `${title} deleted from index`, tone: 'default' })
      onRefresh()
    } catch (err: any) {
      push({ title: 'Delete failed', detail: err.detail || err.message, tone: 'critical' })
    }
  }

  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr className="border-b border-border bg-surface-sunken text-left">
            {['ID', 'Title', 'Department', 'Classification', 'Chunks', 'Ingested', 'Status', 'Actions'].map((h) => (
              <th key={h} className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {displayItems.map((s) => {
            const id = s.id
            const title = s.title
            const dept = s.department
            const classification = s.classification || 'CONFIDENTIAL'
            const chunks = s.chunk_count !== undefined ? s.chunk_count : s.chunks
            const ingested = s.ingested_at ? new Date(s.ingested_at).toLocaleDateString() : (s.ingested || 'Today')
            const status = s.status || 'INDEXED'

            return (
              <tr key={id} className="bg-surface transition-colors hover:bg-surface-sunken">
                <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[12px] text-foreground">
                  {id.length > 12 ? `${id.slice(0, 8)}…` : id}
                </td>
                <td className="px-4 py-3.5 text-[13px] font-medium text-foreground">{title}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-foreground-secondary">{dept}</td>
                <td className="px-4 py-3.5">
                  <ClassificationTag level={classification.toUpperCase() as any} />
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[12px] text-foreground-secondary">
                  {chunks}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[12px] text-foreground-muted">
                  {ingested}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5">
                  <StatusIndicator status={status as any} pulse={status === 'INGESTING'} />
                </td>
                <td className="whitespace-nowrap px-4 py-3.5">
                  {docs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleDelete(id, title)}
                      className="text-foreground-muted hover:text-[var(--critical)]"
                      title="Delete from knowledge base"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FilesTable({ files }: { files: StoredFile[] }) {
  const displayItems = files.length > 0 ? files : (TASK_FILES as any[])

  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr className="border-b border-border bg-surface-sunken text-left">
            {['ID', 'Filename', 'Input Type', 'Size', 'Classification', 'Uploaded', 'Quarantine'].map((h) => (
              <th key={h} className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {displayItems.map((f) => {
            const id = f.id
            const name = f.filename
            const type = f.input_type || f.type || 'DOCUMENT'
            const size = f.size_bytes ? `${Math.round(f.size_bytes / 1024)} KB` : `${f.sizeKb || 40} KB`
            const classification = f.classification || 'CONFIDENTIAL'
            const uploaded = f.uploaded_at ? new Date(f.uploaded_at).toLocaleDateString() : (f.uploaded || 'Today')
            const status = f.quarantine_passed !== false ? 'PASSED' : 'FLAGGED'

            return (
              <tr key={id} className="bg-surface transition-colors hover:bg-surface-sunken">
                <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[12px] text-foreground">
                  {id.length > 12 ? `${id.slice(0, 8)}…` : id}
                </td>
                <td className="px-4 py-3.5 text-[13px] font-medium text-foreground">{name}</td>
                <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[11px] uppercase text-foreground-muted">
                  {type}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[12px] text-foreground-secondary">
                  {size}
                </td>
                <td className="px-4 py-3.5">
                  <ClassificationTag level={classification.toUpperCase() as any} />
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[12px] text-foreground-muted">
                  {uploaded}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5">
                  <span className="font-mono text-[11px] text-sovereign">{status}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SemanticSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EvidenceItem[]>(SEARCH_CORPUS)
  const [tookMs, setTookMs] = useState<number>(12)
  const [mode, setMode] = useState<string>('embedding')
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await api.searchKnowledge(query.trim(), 5)
      setResults(res.results || [])
      setTookMs(res.took_ms || 15)
      setMode(res.retrieval_mode || 'embedding')
    } catch {
      // Mock search fallback
      const q = query.toLowerCase()
      setResults(
        SEARCH_CORPUS.filter(
          (c) =>
            c.excerpt.toLowerCase().includes(q) ||
            (c.source || c.source_document || '').toLowerCase().includes(q)
        )
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2.5 border border-border bg-surface px-4 py-3">
          <Search className="h-4 w-4 text-foreground-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch()
            }}
            placeholder="Test query against local SOP chunks (e.g. 'steam isolation lock out protocol')…"
            className="w-full bg-transparent text-[14px] text-foreground placeholder:text-foreground-muted focus:outline-none"
          />
        </div>
        <SovButton onClick={handleSearch} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Run retrieval'}
        </SovButton>
      </div>

      <div className="flex items-center justify-between font-mono text-[11px] text-foreground-muted">
        <span>Mode: <strong className="text-foreground">{mode}</strong> (local Ollama / SQLite)</span>
        <span>Latency: <strong className="text-foreground">{tookMs}ms</strong></span>
      </div>

      <div className="divide-y divide-border border border-border">
        {results.map((r) => {
          const src = r.source || r.source_document || 'Local SOP'
          const loc = r.clause || r.location || ''
          const score = typeof r.similarity === 'number' ? r.similarity : (typeof r.score === 'number' ? r.score : 0.94)
          return (
            <div key={r.id} className="bg-surface p-4 transition-colors hover:bg-surface-sunken">
              <div className="flex items-center justify-between font-mono text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="border border-border px-1.5 py-0.5 text-foreground">{r.id}</span>
                  <span className="text-foreground">{src}</span>
                  {loc && <span className="text-foreground-muted">{loc}</span>}
                </div>
                <span className="text-sovereign">{score.toFixed(3)} cosine</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-foreground-secondary">{r.excerpt}</p>
            </div>
          )
        })}
        {results.length === 0 && (
          <div className="p-8 text-center font-mono text-[12px] text-foreground-muted">
            No matching chunks retrieved.
          </div>
        )}
      </div>
    </div>
  )
}

function IngestModal({
  open,
  onClose,
  onIngested,
}: {
  open: boolean
  onClose: () => void
  onIngested: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [department, setDepartment] = useState('operations')
  const [classification, setClassification] = useState('confidential')
  const [loading, setLoading] = useState(false)
  const { push } = useToast()

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    try {
      await api.ingestKnowledgeDocument(file, file.name, department, classification, '1.0')
      push({
        title: 'SOP Ingested',
        detail: `${file.name} chunked and indexed locally`,
        tone: 'sovereign',
      })
      onIngested()
      onClose()
    } catch (err: any) {
      push({
        title: 'Ingestion failed',
        detail: err.detail || err.message,
        tone: 'critical',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Ingest Standard Operating Procedure">
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-foreground-secondary">
          Uploaded files are quarantined, parsed, chunked, and embedded entirely in-process on this machine.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase text-foreground-muted">Select Document (.txt, .md, .pdf, .docx)</span>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="border border-border bg-surface p-2 text-[13px] text-foreground"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase text-foreground-muted">Department</span>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="border border-border bg-surface px-3 py-2 text-[13px] text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase text-foreground-muted">Classification</span>
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
              className="border border-border bg-surface px-3 py-2 text-[13px] text-foreground"
            >
              <option value="normal">Normal</option>
              <option value="confidential">Confidential</option>
              <option value="restricted">Restricted</option>
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="border border-border px-4 py-2 font-mono text-[12px] text-foreground hover:border-foreground"
          >
            Cancel
          </button>
          <SovButton disabled={!file || loading} onClick={handleUpload}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ingest & Index'}
          </SovButton>
        </div>
      </div>
    </Modal>
  )
}
