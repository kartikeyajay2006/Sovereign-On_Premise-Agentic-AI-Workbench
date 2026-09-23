'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Paperclip } from 'lucide-react'
import { Modal } from '@/components/modal'
import { Button } from '@/shared/ui/controls/button'
import { describeFailure } from '@/shared/ui/data/reading'
import { ingest, type KnowledgeDocument } from './api'
import { formatBytes } from './tables'

/** The four levels backend/core/schemas.py Sensitivity accepts. */
const LEVELS = ['normal', 'confidential', 'sensitive', 'restricted'] as const

const FIELD =
  'hover-decay h-[var(--control-md)] w-full rounded-[var(--radius)] bg-surface px-3 text-body text-foreground shadow-[0_0_0_1px_var(--control-default)] outline-none hover:shadow-[0_0_0_1px_var(--control-strong)] focus:shadow-[var(--focus-halo)]'

/**
 * How long the upload has been waiting, counted from the moment it was sent.
 *
 * One request that returns once, so there is no progress to draw: a bar
 * here would fill at a rate nobody measured. What is known is the time
 * since the request left this browser, and that is all this says. It
 * ticks only while the request is pending, because it is mounted only then.
 */
function Waiting({ since }: { since: number }) {
  const [now, setNow] = useState(since)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 100)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <span
      className="tabular self-center font-mono text-ui text-foreground-muted"
      title="Wall time in this browser since the upload was sent: parsing, chunking and embedding happen on the service in that time"
    >
      waiting {(Math.max(0, now - since) / 1000).toFixed(1)} s
    </span>
  )
}

/**
 * Ingest a document into the local index.
 *
 * A failure keeps the dialog open with the service's reason and the chosen
 * file still selected. It used to close on failure and refresh the table as
 * though something had been added, so the only sign an ingest had failed was
 * a toast that was gone in four seconds.
 */
export function IngestDialog({
  open,
  onClose,
  onIngested,
  defaultDepartment,
  departments,
}: {
  open: boolean
  onClose: () => void
  onIngested: (document: KnowledgeDocument) => void
  defaultDepartment: string
  departments: string[]
}) {
  const [file, setFile] = useState<File | null>(null)
  const [department, setDepartment] = useState(defaultDepartment)
  const [classification, setClassification] = useState<(typeof LEVELS)[number]>('confidential')
  const [version, setVersion] = useState('1.0')
  const [busy, setBusy] = useState(false)
  // When the pending upload was sent, for the waiting readout.
  const [sentAt, setSentAt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const listId = useId()

  const reset = () => {
    setFile(null)
    setError(null)
    setBusy(false)
  }

  const submit = async () => {
    if (!file || busy) return
    setSentAt(performance.now())
    setBusy(true)
    setError(null)
    try {
      const document = await ingest(file, {
        department: department.trim() || defaultDepartment,
        classification,
        version: version.trim() || '1.0',
      })
      reset()
      onIngested(document)
    } catch (err) {
      const failure = describeFailure(err)
      setError(
        failure.kind === 'forbidden'
          ? 'Your role does not hold knowledge.ingest, so the service refused the upload.'
          : failure.detail
            ? `Not indexed. The service said: ${failure.detail}`
            : 'Not indexed. The service could not be reached.',
      )
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (busy) return
        reset()
        onClose()
      }}
      title="Ingest a document"
      description="Parsed, chunked and indexed by the service on this machine. It becomes retrievable, and citable, as soon as it is indexed."
      footer={
        <>
          {busy && <Waiting since={sentAt} />}
          <Button variant="ghost" size="md" disabled={busy} onClick={() => { reset(); onClose() }}>
            Cancel
          </Button>
          <Button variant="primary" size="md" busy={busy} busyLabel="Indexing…" disabled={!file} onClick={() => void submit()}>
            Ingest and index
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-ui font-medium text-foreground-secondary">Document</span>
          <input
            ref={fileRef}
            type="file"
            // The parsers registered in backend/rag/parsing.py.
            accept=".txt,.md,.pdf,.docx,.xlsx,.xls,.csv,.pptx,.json,.yaml,.yml,.log"
            className="sr-only"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setError(null)
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="hover-decay flex min-h-[var(--control-lg)] w-full items-center gap-3 rounded-[var(--radius)] bg-surface-sunken px-3 py-2 text-left shadow-[0_0_0_1px_var(--control-subtle)] hover:shadow-[0_0_0_1px_var(--control-strong)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            <Paperclip className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden />
            {file ? (
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body text-foreground">{file.name}</span>
                <span className="font-mono text-ledger text-foreground-muted">{formatBytes(file.size)}</span>
              </span>
            ) : (
              <span className="text-body text-foreground-secondary">
                Choose a file: .pdf .docx .xlsx .pptx .csv .md .txt
              </span>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-2 sm:col-span-1">
            <span className="text-ui font-medium text-foreground-secondary">Department</span>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              list={listId}
              className={FIELD}
            />
            <datalist id={listId}>
              {departments.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-ui font-medium text-foreground-secondary">Classification</span>
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value as (typeof LEVELS)[number])}
              className={FIELD}
            >
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-ui font-medium text-foreground-secondary">Version</span>
            <input value={version} onChange={(e) => setVersion(e.target.value)} className={`${FIELD} font-mono`} />
          </label>
        </div>

        <p className="text-ui text-foreground-muted">
          The classification is stored with each chunk and carried by every passage retrieved from it.
          The ingest is recorded in the audit chain with the document&rsquo;s SHA-256.
        </p>

        {error && (
          <p role="alert" className="text-ui text-critical-text">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
