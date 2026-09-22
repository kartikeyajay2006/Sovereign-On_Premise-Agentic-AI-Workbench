'use client'

import { useRef, useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { Button } from '@/shared/ui/controls/button'
import { DELIVERABLE_FORMATS } from '@/lib/presentation'
import { cn } from '@/lib/utils'

export interface ComposerAttachment {
  id: string
  name: string
  sizeBytes: number
  classification: string
  uploading: boolean
}

export interface ComposerProps {
  value: string
  onChange: (v: string) => void
  format: string
  onFormatChange: (f: string) => void
  attachments: ComposerAttachment[]
  onAttach: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
  onSubmit: () => void
  onStop?: () => void
  busy: boolean
  disabled?: boolean
}

/**
 * The composer.
 *
 * It is the first thing on the page now rather than the fourth. It also no
 * longer prints "AIR-GAPPED 127.0.0.1" or "Local: 127.0.0.1 · 0 Egress" —
 * both were literals, and a control that dispatches work is the last place
 * that should be asserting a posture it does not measure. Those readings
 * live on the status strip, where they come from the API.
 */
export function Composer({
  value,
  onChange,
  format,
  onFormatChange,
  attachments,
  onAttach,
  onRemoveAttachment,
  onSubmit,
  onStop,
  busy,
  disabled,
}: ComposerProps) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const canSend = value.trim().length > 0 && !busy && !disabled

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!busy) setDragging(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (busy) return
        if (e.dataTransfer.files?.length) onAttach(Array.from(e.dataTransfer.files))
      }}
      className={cn(
        'rounded-[var(--radius-lg-token)] bg-surface shadow-[var(--elev-1)] transition-shadow',
        dragging && 'shadow-[0_0_0_2px_var(--foreground)]',
      )}
    >
      <label htmlFor="composer-input" className="sr-only">
        Describe the task
      </label>
      <textarea
        id="composer-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSend) {
            e.preventDefault()
            onSubmit()
          }
        }}
        rows={3}
        disabled={busy || disabled}
        placeholder="Ask a procedural question, or describe an analysis task…"
        className="w-full resize-none bg-transparent px-4 pt-4 text-answer leading-[var(--lh-answer)] text-foreground placeholder:text-foreground-muted focus:outline-none disabled:opacity-[var(--opacity-disabled)]"
      />

      {attachments.length > 0 && (
        <ul className="flex flex-col gap-1 px-4 pb-2">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 font-mono text-meta">
              <Paperclip className="h-3 w-3 shrink-0 text-foreground-muted" aria-hidden />
              <span className="truncate-cell text-foreground">{a.name}</span>
              <span className="tabular shrink-0 text-foreground-muted">
                {Math.max(1, Math.round(a.sizeBytes / 1024))} kB
              </span>
              {/* The classification comes back from the upload. It is not
                  decided here — the old composer printed RESTRICTED on every
                  file while uploading them as confidential. */}
              <span className="shrink-0 text-foreground-muted">
                {a.uploading ? 'uploading…' : a.classification}
              </span>
              <button
                type="button"
                onClick={() => onRemoveAttachment(a.id)}
                aria-label={`Remove ${a.name}`}
                className="ml-auto shrink-0 text-foreground-muted hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle px-3 py-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onAttach(Array.from(e.target.files))
            e.target.value = ''
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          icon={Paperclip}
          onClick={() => fileRef.current?.click()}
          disabled={busy || disabled}
        >
          Attach
        </Button>

        <div className="flex items-center gap-1">
          <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
            Deliverable
          </span>
          {DELIVERABLE_FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFormatChange(f.id)}
              aria-pressed={format === f.id}
              /*
                Five outlined boxes gave a settings row the weight of a
                primary action, and the eye read the composer's least
                important control first. Only the chosen one is drawn now;
                the rest are quiet text until hovered. Same targets, same
                affordance, a fifth of the ink.
              */
              className={cn(
                'hover-decay rounded-[var(--radius-xs)] px-2 py-1 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
                format === f.id
                  ? 'bg-surface-sunken text-foreground'
                  : 'text-foreground-muted hover:text-foreground-secondary',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden font-mono text-ledger text-foreground-muted sm:inline">⌘↵</span>
          {busy && onStop ? (
            <Button variant="danger" size="sm" onClick={onStop}>
              Stop
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={onSubmit}
              disabled={!canSend}
              busy={busy}
              busyLabel="Running…"
            >
              Run
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
