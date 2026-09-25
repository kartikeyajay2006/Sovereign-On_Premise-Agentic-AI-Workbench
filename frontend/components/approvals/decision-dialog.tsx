'use client'

import { useRef, useState } from 'react'
import { Modal } from '@/components/modal'
import { ClassificationTag } from '@/components/primitives'
import { Button } from '@/shared/ui/controls/button'
import { Kbd } from '@/shared/ui/controls/kbd'
import type { RequiredSignature } from '@/lib/types'
import type { QueueItem } from './model'

export type DecisionKind = 'approve' | 'reject' | 'revise'

/**
 * The confirm step, and where the reviewer's note is written.
 *
 * A rejection needs a reason before it can be recorded. The backend accepts
 * a rejection with no comment, but the person whose run was returned then
 * learns that it was refused and nothing about why, and the audit record
 * holds a decision nobody can review. Approval notes are optional.
 *
 * The note is the dialog's first focus, and Ctrl or Cmd with Enter records
 * the decision, so a keyboard reviewer goes a, note, Ctrl+Enter without
 * reaching for the pointer.
 */
export function DecisionDialog({
  kind,
  item,
  filename,
  signature = null,
  reviewer,
  onCancel,
  onConfirm,
}: {
  kind: DecisionKind
  item: QueueItem
  /** The first deliverable's name, when the run produced a file. */
  filename: string | null
  /** Set when approving gives one signature of several and releases nothing. */
  signature?: RequiredSignature | null
  reviewer: string
  onCancel: () => void
  /** Resolves to an error message to show, or null once recorded. */
  onConfirm: (note: string) => Promise<string | null>
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const noteRef = useRef<HTMLTextAreaElement | null>(null)

  const approve = kind === 'approve'
  const revise = kind === 'revise'
  const needsNote = !approve
  const blank = note.trim().length === 0

  // The first of two signatures on a High finding releases nothing.
  const signing = approve && signature != null
  const title = signing
    ? `Sign as ${signature.authority}`
    : approve ? (filename ? 'Approve and release' : 'Approve') : revise ? 'Request a revision' : 'Reject and return'
  const consequence = signing
    ? `Records your signature as the ${signature.authority}, who ${signature.capacity} this finding, against ${reviewer} in the audit chain. Nothing is released: the run waits for the second authority.`
    : approve
    ? filename
      ? `Releases ${filename} to the submitter and records the decision against ${reviewer} in the audit chain.`
      : `This run produced no file, so nothing is released. The approval is recorded against ${reviewer} in the audit chain.`
    : revise
      ? `Nothing is released and nothing is rejected: the run goes back to its submitter with your note, recorded against ${reviewer} in the audit chain.`
      : `Nothing is released. The run is marked rejected, and your reason is stored on it and in the audit chain against ${reviewer}.`

  const submit = async () => {
    if (busy) return
    if (needsNote && blank) {
      setError(revise ? 'Say what should change.' : 'Add the reason this run is being returned.')
      noteRef.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    const failure = await onConfirm(note)
    // On success the parent closes the dialog and this component unmounts.
    if (failure) {
      setError(failure)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => !busy && onCancel()}
      title={title}
      description={consequence}
      initialFocusRef={noteRef}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={approve ? 'primary' : revise ? 'secondary' : 'danger'}
            size="md"
            busy={busy}
            busyLabel="Recording…"
            onClick={() => void submit()}
          >
            {signing
              ? 'Sign'
              : approve ? (filename ? 'Approve & release' : 'Approve') : revise ? 'Request revision' : 'Reject'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-[var(--radius)] bg-surface-sunken px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 font-mono text-ledger text-foreground-muted">
            <span>#{item.id.slice(0, 8)}</span>
            <ClassificationTag level={item.sensitivity ?? 'unclassified'} />
            {filename && <span className="min-w-0 max-w-full truncate text-foreground-secondary">{filename}</span>}
          </div>
          <p className="line-clamp-2 text-ui text-foreground-secondary">{item.prompt}</p>
        </div>

        <label className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-ui font-medium text-foreground-secondary">
              {revise ? 'What should change' : needsNote ? 'Reason' : 'Note'}
            </span>
            <span className="text-ui text-foreground-muted">{needsNote ? 'required' : 'optional'}</span>
          </span>
          <textarea
            ref={noteRef}
            value={note}
            onChange={(e) => {
              setNote(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void submit()
              }
            }}
            rows={4}
            aria-invalid={Boolean(error) || undefined}
            placeholder={
              needsNote
                ? 'What must change before this can be released?'
                : 'Anything the record should carry with this approval'
            }
            className="hover-decay w-full resize-y rounded-[var(--radius)] bg-surface px-3 py-2 text-body text-foreground shadow-[0_0_0_1px_var(--control-default)] outline-none placeholder:text-foreground-muted hover:shadow-[0_0_0_1px_var(--control-strong)] focus:shadow-[var(--focus-halo)] aria-[invalid=true]:shadow-[var(--focus-halo-invalid)]"
          />
        </label>

        {error && (
          <p role="alert" className="text-ui text-critical-text">
            {error}
          </p>
        )}

        <p className="hidden items-center gap-2 text-ui text-foreground-muted sm:flex">
          {/* Rendered only in the browser (the dialog is a portal), so the
              platform can be read directly. */}
          <Kbd>{/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'}</Kbd>
          <Kbd>↵</Kbd>
          <span>records the decision</span>
          <span aria-hidden>·</span>
          <Kbd>Esc</Kbd>
          <span>cancels</span>
        </p>
      </div>
    </Modal>
  )
}
