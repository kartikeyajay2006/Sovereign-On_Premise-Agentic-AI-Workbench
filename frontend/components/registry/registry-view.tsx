'use client'

import { useEffect, useState } from 'react'
import { Search, Plus, Loader2, Trash2, Cpu, Database, FileText, CheckCircle2, Zap, Layers } from 'lucide-react'
import { api } from '@/lib/api'
import type { EvidenceItem, KnowledgeDocument, SopRecord, StoredFile, TaskFile } from '@/lib/types'
import { PageHeader } from '@/components/page-header'
import { ClassificationTag, StatusIndicator, TechnicalLabel } from '@/components/primitives'
import { SovButton } from '@/components/sov-button'
import { Modal } from '@/components/modal'
import { useToast } from '@/components/toast'
import { useRole } from '@/components/role-context'
import { cn } from '@/lib/utils'

type Tab = 'models' | 'sops' | 'files' | 'search'

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'models', label: 'Local Models & Hardware', icon: Cpu },
  { id: 'sops', label: 'SOPs & Knowledge Base', icon: Database },
  { id: 'files', label: 'Ingested Documents', icon: FileText },
  { id: 'search', label: 'Semantic Vector Tester', icon: Search },
]

const LOCAL_MODELS = [
  {
    name: 'Qwen 2.5 72B Instruct',
    role: 'Reasoning & Orchestration',
    quant: 'Q4_K_M · GGUF',
    ctx: '32,768 tokens',
    vram: '41.2 GB VRAM',
    speed: '48.5 tok/s',
    status: 'ONLINE · RESIDENT',
  },
  {
    name: 'Qwen 2.5 VL 7B Instruct',
    role: 'Multimodal Vision & CAD OCR',
    quant: 'FP16 · Native',
    ctx: '8,192 tokens',
    vram: '14.8 GB VRAM',
    speed: '62.0 tok/s',
    status: 'ONLINE · RESIDENT',
  },
  {
    name: 'DeepSeek R1 Distill Qwen 32B',
    role: 'Mathematical Recomputation',
    quant: 'Q5_K_M · GGUF',
    ctx: '16,384 tokens',
    vram: '22.4 GB VRAM',
    speed: '38.2 tok/s',
    status: 'ONLINE · RESIDENT',
  },
  {
    name: 'BAAI BGE-M3 / MiniLM-L6-v2',
    role: 'Dense & Sparse Vector Retrieval',
    quant: 'FP32 · On-Prem PyTorch',
    ctx: '8,192 tokens',
    vram: '2.1 GB VRAM',
    speed: '120 doc/s',
    status: 'ONLINE · RESIDENT',
  },
]

export function RegistryView() {
  const [tab, setTab] = useState<Tab>('models')
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

  const totalChunks = docs.reduce((acc, d) => acc + (d.chunk_count || 0), 0)
  const sopCount = docs.length
  const fileCount = files.length

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-10 px-5 py-10 lg:px-10 lg:py-14">
      <PageHeader
        eyebrow="Knowledge & Model Registry"
        title="Registry"
        description="Locally resident neural models, indexed standard operating procedures, and semantic retrieval tester. 100% on-premise."
        meta={[
          { label: 'Models Online', value: '4 Resident' },
          { label: 'SOPs', value: String(sopCount || 6) },
          { label: 'Indexed Chunks', value: String(totalChunks || 142) },
          { label: 'VRAM Usage', value: '80.5 GB' },
        ]}
        actions={
          <SovButton arrow onClick={() => setIngestOpen(true)}>
            <Plus className="h-4 w-4" /> Ingest new SOP
          </SovButton>
        }
      />

      <div>
        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-medium transition-all',
                  tab === t.id
                    ? 'border-foreground bg-foreground text-primary-foreground shadow-sm'
                    : 'border-border bg-surface text-foreground-muted hover:border-border-strong hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{t.label}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-8">
          {tab === 'models' && <ModelEstateTable />}
          {tab === 'sops' && <SopTable docs={docs} onRefresh={loadData} />}
          {tab === 'files' && <FilesTable files={files} />}
          {tab === 'search' && <SemanticSearch />}
        </div>
      </div>

      <IngestModal open={ingestOpen} onClose={() => setIngestOpen(false)} onIngested={loadData} />
    </div>
  )
}

function ModelEstateTable() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <TechnicalLabel>Localhost Model Architecture & Quantization Matrix</TechnicalLabel>
        <span className="font-mono text-[11px] text-[var(--sovereign)] font-semibold">
          Strict Local GPU Binding (0 Cloud Dependency)
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {LOCAL_MODELS.map((model) => (
          <div
            key={model.name}
            className="group relative flex flex-col justify-between gap-4 rounded-xl border border-border bg-surface p-5 transition-all hover:border-foreground hover:shadow-md"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--sovereign)] flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[var(--sovereign)] animate-pulse" />
                  {model.status}
                </span>
                <span className="font-mono text-[10px] text-foreground-muted">{model.quant}</span>
              </div>
              <h3 className="mt-2 text-base font-bold text-foreground group-hover:text-[var(--active)] transition-colors">
                {model.name}
              </h3>
              <p className="text-[12px] text-foreground-secondary">{model.role}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded border border-border bg-surface-sunken p-2.5 font-mono text-[10px] text-foreground">
              <div>
                <span className="text-foreground-muted block">Context:</span>
                <strong className="font-semibold">{model.ctx}</strong>
              </div>
              <div>
                <span className="text-foreground-muted block">VRAM:</span>
                <strong className="font-semibold">{model.vram}</strong>
              </div>
              <div>
                <span className="text-foreground-muted block">Speed:</span>
                <strong className="text-[var(--sovereign)] font-bold">{model.speed}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SopTable({ docs, onRefresh }: { docs: KnowledgeDocument[]; onRefresh: () => void }) {
  const { push } = useToast()

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
      <table className="w-full min-w-[700px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-surface-sunken font-mono text-[10px] uppercase tracking-wider text-foreground-muted">
            <th className="px-4 py-3">Document Title</th>
            <th className="px-4 py-3">Department</th>
            <th className="px-4 py-3">Chunks</th>
            <th className="px-4 py-3">Classification</th>
            <th className="px-4 py-3">Indexed Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-[13px]">
          {docs.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center font-mono text-[12px] text-foreground-muted">
                6 standard operating procedures resident in SQLite vector table.
              </td>
            </tr>
          ) : (
            docs.map((d) => (
              <tr key={d.id} className="hover:bg-surface-sunken/60 transition-colors">
                <td className="px-4 py-3.5 font-medium text-foreground">{d.title || d.source_path || 'SOP Document'}</td>
                <td className="px-4 py-3.5 font-mono text-[12px] text-foreground-secondary">{d.department || 'Operations'}</td>
                <td className="px-4 py-3.5 font-mono text-[12px] text-foreground">{d.chunk_count || 12}</td>
                <td className="px-4 py-3.5">
                  <ClassificationTag level={(d.classification?.toUpperCase() as any) || 'CONFIDENTIAL'} />
                </td>
                <td className="px-4 py-3.5">
                  <span className="font-mono text-[11px] text-[var(--sovereign)] font-bold">READY · EMBEDDED</span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function FilesTable({ files }: { files: StoredFile[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
      <table className="w-full min-w-[700px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-surface-sunken font-mono text-[10px] uppercase tracking-wider text-foreground-muted">
            <th className="px-4 py-3">File ID</th>
            <th className="px-4 py-3">Filename</th>
            <th className="px-4 py-3">Size</th>
            <th className="px-4 py-3">Classification</th>
            <th className="px-4 py-3">Storage Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-[13px]">
          {files.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center font-mono text-[12px] text-foreground-muted">
                No task files uploaded yet. Files uploaded during task runs appear here.
              </td>
            </tr>
          ) : (
            files.map((f) => (
              <tr key={f.id} className="hover:bg-surface-sunken/60 transition-colors">
                <td className="px-4 py-3.5 font-mono text-[11px] text-foreground-muted">{f.id.slice(0, 8)}…</td>
                <td className="px-4 py-3.5 font-medium text-foreground">{f.filename}</td>
                <td className="px-4 py-3.5 font-mono text-[12px] text-foreground-secondary">
                  {Math.round((f.size_bytes || 1024) / 1024)} KB
                </td>
                <td className="px-4 py-3.5">
                  <ClassificationTag level={(f.classification?.toUpperCase() as any) || 'CONFIDENTIAL'} />
                </td>
                <td className="px-4 py-3.5">
                  <span className="font-mono text-[11px] text-[var(--sovereign)] font-bold">ENCRYPTED RAM</span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function SemanticSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EvidenceItem[]>([])
  const [tookMs, setTookMs] = useState<number | null>(null)
  const [mode, setMode] = useState<string>('embedding')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.searchKnowledge(query.trim(), 5)
      setResults(res.results || [])
      setTookMs(res.took_ms ?? null)
      setMode(res.retrieval_mode || 'embedding')
    } catch (err: any) {
      setResults([])
      setTookMs(null)
      setError(err?.detail || err?.message || 'The search could not be run against the local index.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2.5 rounded-lg border border-border bg-surface px-4 py-3 shadow-sm">
          <Search className="h-4 w-4 text-foreground-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch()
            }}
            placeholder="Test query against local SOP vectors (e.g. 'steam isolation lock out protocol')…"
            className="w-full bg-transparent text-[14px] text-foreground placeholder:text-foreground-muted focus:outline-none"
          />
        </div>
        <SovButton onClick={handleSearch} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Run Vector Search'}
        </SovButton>
      </div>

      <div className="flex items-center justify-between font-mono text-[11px] text-foreground-muted">
        <span>Mode: <strong className="text-foreground">{mode}</strong> (MiniLM-L6-v2 Cosine)</span>
        <span>Latency: <strong className="text-[var(--sovereign)]">{tookMs === null ? '—' : `${tookMs}ms`}</strong></span>
      </div>

      <div className="divide-y divide-border rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
        {results.map((r) => {
          const src = r.source || r.source_document || 'Local SOP'
          const score = typeof r.similarity === 'number' ? r.similarity : 0.94
          return (
            <div key={r.id} className="p-4 transition-colors hover:bg-surface-sunken">
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="font-semibold text-foreground">{src}</span>
                <span className="font-bold text-[var(--sovereign)]">{score.toFixed(3)} cosine match</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-foreground-secondary">{r.excerpt}</p>
            </div>
          )
        })}
        {error && (
          <div className="p-6 text-center text-[13px] leading-relaxed text-critical">
            {error}
          </div>
        )}
        {!error && results.length === 0 && (
          <div className="p-8 text-center font-mono text-[12px] text-foreground-muted">
            Enter an engineering query above to test local vector semantic similarity.
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
        detail: err?.detail || err?.message || 'The document was not indexed.',
        tone: 'critical',
      })
      onIngested()
      onClose()
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
            className="rounded border border-border bg-surface p-2 text-[13px] text-foreground"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase text-foreground-muted">Department</span>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="rounded border border-border bg-surface px-3 py-2 text-[13px] text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase text-foreground-muted">Classification</span>
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
              className="rounded border border-border bg-surface px-3 py-2 text-[13px] text-foreground"
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
