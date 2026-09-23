'use client'

import type { ReactNode } from 'react'
import { ClassificationTag } from '@/components/primitives'
import { Append, AppendScope, MeasuredNumber } from '@/shared/motion'
import { EmptyState } from '@/shared/ui/data/empty-state'
import { cn } from '@/lib/utils'
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
const TD = 'min-w-0 px-4 py-3'

/*
 * The columns, as grid tracks, so each row is one box that can arrive as a
 * record (see DocumentsTable). Size and Ingested join at lg, the hash at xl,
 * matching the cells hidden below those widths.
 */
const COLUMNS = cn(
  'grid grid-cols-[minmax(0,1fr)_140px_132px_72px]',
  'lg:grid-cols-[minmax(0,1fr)_140px_132px_72px_88px_136px]',
  'xl:grid-cols-[minmax(0,1fr)_140px_132px_72px_88px_136px_120px]',
)

/**
 * The documents retrieval can cite.
 *
 * This table used to print "READY · EMBEDDED" on every row. The service
 * does not report whether a document's chunks were embedded: ingestion falls
 * back to storing chunks without vectors when no embedding model answers, and
 * those chunks are only reachable lexically. What is known is shown: the
 * chunk count, which is what makes a document retrievable at all. The empty
 * state used to claim six SOPs in a vector table; it now says there are none.
 *
 * APPEND: a document the service indexed while this list was on screen --
 * the re-read after an ingest -- arrives lit and cools, in the proved tone,
 * because it is in the index and its chunks are counted (the service refuses
 * a file that produces none). Rows present when the list opens were read,
 * not appended, and do not move. The scope wraps the empty state too, so the
 * first document ever indexed arrives the same way.
 *
 * The wide layout is an ARIA table of grid rows rather than a <table>: a row
 * that arrives needs a box of its own to move and to carry its light, which
 * a table row does not reliably have.
 */
export function DocumentsTable({ documents, emptyAction }: { documents: KnowledgeDocument[]; emptyAction?: ReactNode }) {
  return (
    <AppendScope>
      {documents.length === 0 ? (
        <EmptyState
          className="grouped"
          title="No documents are indexed on this host"
          body="Retrieval has nothing to search, so a task that needs evidence will find none. Ingest a document to make it citable."
          action={emptyAction}
        />
      ) : (
        <div className="grouped overflow-hidden">
          {/* Phone: one block per document. */}
          <ul className="md:hidden">
            {documents.map((d) => (
              <Append
                as="li"
                key={d.id}
                tone="sovereign"
                className="grouped-row flex flex-col gap-1 px-4 py-3 last:border-b-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-body font-medium text-foreground">{d.title}</span>
                  <ClassificationTag level={d.classification} />
                </div>
                <span className="truncate font-mono text-ledger text-foreground-muted">{d.source_path}</span>
                <span className="tabular flex flex-wrap gap-x-3 font-mono text-ledger text-foreground-secondary">
                  <span>{d.department}</span>
                  <span>v{d.version}</span>
                  <span>
                    <MeasuredNumber value={d.chunk_count} /> chunks
                  </span>
                  <span>{formatBytes(d.size_bytes)}</span>
                  <span>{day(d.ingested_at)}</span>
                </span>
              </Append>
            ))}
          </ul>

          <div role="table" aria-label="Indexed documents" className="hidden md:block">
            <div role="rowgroup">
              <div role="row" className={cn(COLUMNS, 'border-b border-line-default')}>
                <span role="columnheader" className={TH}>
                  Document
                </span>
                <span role="columnheader" className={TH}>
                  Department
                </span>
                <span role="columnheader" className={TH}>
                  Class
                </span>
                <span role="columnheader" className={cn(TH, 'text-right')}>
                  Chunks
                </span>
                <span role="columnheader" className={cn(TH, 'hidden text-right lg:block')}>
                  Size
                </span>
                <span role="columnheader" className={cn(TH, 'hidden lg:block')}>
                  Ingested
                </span>
                <span role="columnheader" className={cn(TH, 'hidden xl:block')}>
                  SHA-256
                </span>
              </div>
            </div>
            <div role="rowgroup">
              {documents.map((d) => (
                <Append
                  key={d.id}
                  role="row"
                  tone="sovereign"
                  className={cn(COLUMNS, 'hover-decay grouped-row last:border-b-0 hover:bg-surface-sunken')}
                >
                  <div role="cell" className={TD}>
                    <span className="block truncate text-body font-medium text-foreground" title={d.title}>
                      {d.title}
                    </span>
                    <span className="block truncate font-mono text-ledger text-foreground-muted" title={d.source_path}>
                      {d.source_path} · v{d.version}
                    </span>
                  </div>
                  <div role="cell" className={cn(TD, 'truncate font-mono text-ui text-foreground-secondary')}>
                    {d.department}
                  </div>
                  <div role="cell" className={TD}>
                    <ClassificationTag level={d.classification} />
                  </div>
                  <div role="cell" className={cn(TD, 'text-right font-mono text-ui text-foreground')}>
                    <MeasuredNumber value={d.chunk_count} />
                  </div>
                  <div
                    role="cell"
                    className={cn(TD, 'tabular hidden text-right font-mono text-ui text-foreground-secondary lg:block')}
                  >
                    {formatBytes(d.size_bytes)}
                  </div>
                  <div role="cell" className={cn(TD, 'tabular hidden font-mono text-ui text-foreground-secondary lg:block')}>
                    {day(d.ingested_at)}
                  </div>
                  <div
                    role="cell"
                    className={cn(TD, 'hidden truncate font-mono text-ui text-foreground-muted xl:block')}
                    title={d.sha256}
                  >
                    {d.sha256.slice(0, 12)}…
                  </div>
                </Append>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppendScope>
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
        className="grouped"
        title="No uploads visible to this role"
        body="Files attached to runs appear here once they are stored. A role sees the uploads it is entitled to read."
      />
    )
  }
  return (
    <ul className="grouped overflow-hidden">
      {files.map((f) => (
        <li
          key={f.id}
          className="grouped-row grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_132px_minmax(0,220px)]"
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
