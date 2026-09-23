'use client'

import type { ReactNode } from 'react'
import { ClassificationTag } from '@/components/primitives'
import { EmptyState } from '@/shared/ui/data/empty-state'
import type { KnowledgeDocument, StoredFile } from './api'

export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function day(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const TH = 'px-4 py-2 text-left font-mono text-ledger font-normal uppercase tracking-[var(--ls-ledger)] text-foreground-muted'
const TD = 'px-4 py-3 align-top'

/**
 * The documents retrieval can cite.
 *
 * This table used to print "READY · EMBEDDED" on every row. The service
 * does not report whether a document's chunks were embedded: ingestion falls
 * back to storing chunks without vectors when no embedding model answers, and
 * those chunks are only reachable lexically. What is known is shown: the
 * chunk count, which is what makes a document retrievable at all. The empty
 * state used to claim six SOPs in a vector table; it now says there are none.
 */
export function DocumentsTable({ documents, emptyAction }: { documents: KnowledgeDocument[]; emptyAction?: ReactNode }) {
  if (documents.length === 0) {
    return (
      <EmptyState
        className="rounded-[var(--radius)] bg-surface shadow-[var(--elev-0)]"
        title="No documents are indexed on this host"
        body="Retrieval has nothing to search, so a task that needs evidence will find none. Ingest a document to make it citable."
        action={emptyAction}
      />
    )
  }
  return (
    <div className="overflow-hidden rounded-[var(--radius)] bg-surface shadow-[var(--elev-0)]">
      {/* Phone: one block per document. */}
      <ul className="md:hidden">
        {documents.map((d) => (
          <li key={d.id} className="flex flex-col gap-1 border-b border-line-subtle px-4 py-3 last:border-b-0">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 text-body font-medium text-foreground">{d.title}</span>
              <ClassificationTag level={d.classification} />
            </div>
            <span className="truncate font-mono text-ledger text-foreground-muted">{d.source_path}</span>
            <span className="tabular flex flex-wrap gap-x-3 font-mono text-ledger text-foreground-secondary">
              <span>{d.department}</span>
              <span>v{d.version}</span>
              <span>{d.chunk_count} chunks</span>
              <span>{formatBytes(d.size_bytes)}</span>
              <span>{day(d.ingested_at)}</span>
            </span>
          </li>
        ))}
      </ul>

      <table className="hidden w-full table-fixed border-collapse md:table">
        <thead className="border-b border-line-default">
          <tr>
            <th className={TH}>Document</th>
            <th className={`${TH} w-[140px]`}>Department</th>
            <th className={`${TH} w-[132px]`}>Class</th>
            <th className={`${TH} w-[72px] text-right`}>Chunks</th>
            <th className={`${TH} hidden w-[88px] text-right lg:table-cell`}>Size</th>
            <th className={`${TH} hidden w-[136px] lg:table-cell`}>Ingested</th>
            <th className={`${TH} hidden w-[120px] xl:table-cell`}>SHA-256</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((d) => (
            <tr key={d.id} className="hover-decay border-b border-line-subtle last:border-b-0 hover:bg-surface-sunken">
              <td className={TD}>
                <span className="block truncate text-body font-medium text-foreground" title={d.title}>
                  {d.title}
                </span>
                <span className="block truncate font-mono text-ledger text-foreground-muted" title={d.source_path}>
                  {d.source_path} · v{d.version}
                </span>
              </td>
              <td className={`${TD} truncate font-mono text-ui text-foreground-secondary`}>{d.department}</td>
              <td className={TD}>
                <ClassificationTag level={d.classification} />
              </td>
              <td className={`${TD} tabular text-right font-mono text-ui text-foreground`}>{d.chunk_count}</td>
              <td className={`${TD} tabular hidden text-right font-mono text-ui text-foreground-secondary lg:table-cell`}>
                {formatBytes(d.size_bytes)}
              </td>
              <td className={`${TD} tabular hidden font-mono text-ui text-foreground-secondary lg:table-cell`}>
                {day(d.ingested_at)}
              </td>
              <td className={`${TD} hidden truncate font-mono text-ui text-foreground-muted xl:table-cell`} title={d.sha256}>
                {d.sha256.slice(0, 12)}…
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Files uploaded to runs. "ENCRYPTED RAM" was printed on every row; uploads
 * are written to storage/uploads on disk, and nothing in the backend
 * encrypts them. The quarantine result is real and is what is shown instead.
 */
export function UploadsTable({ files }: { files: StoredFile[] }) {
  if (files.length === 0) {
    return (
      <EmptyState
        className="rounded-[var(--radius)] bg-surface shadow-[var(--elev-0)]"
        title="No uploads visible to this role"
        body="Files attached to runs appear here once they are stored. A role sees the uploads it is entitled to read."
      />
    )
  }
  return (
    <ul className="overflow-hidden rounded-[var(--radius)] bg-surface shadow-[var(--elev-0)]">
      {files.map((f) => (
        <li
          key={f.id}
          className="grid grid-cols-1 gap-x-4 gap-y-1 border-b border-line-subtle px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_132px_minmax(0,220px)]"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-body font-medium text-foreground" title={f.filename}>
              {f.filename}
            </span>
            <span className="tabular flex flex-wrap gap-x-3 font-mono text-ledger text-foreground-muted">
              <span>{formatBytes(f.size_bytes)}</span>
              <span>{f.input_type}</span>
              <span>{day(f.uploaded_at)}</span>
              {f.task_id && <span>run {f.task_id.slice(0, 8)}</span>}
              <span title={f.sha256}>sha256 {f.sha256.slice(0, 8)}…</span>
            </span>
          </div>
          <div className="md:pt-0.5">
            <ClassificationTag level={f.classification} />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span
              className={`font-mono text-ledger uppercase tracking-[var(--ls-ledger)] ${
                f.quarantine_passed ? 'text-sovereign-text' : 'text-critical-text'
              }`}
            >
              {f.quarantine_passed ? '✓ quarantine passed' : '✕ quarantine failed'}
            </span>
            {f.quarantine_notes.map((note) => (
              <span key={note} className="text-ui text-foreground-secondary">
                {note}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}
