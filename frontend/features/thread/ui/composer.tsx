'use client'

import { memo, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Paperclip, Square, X } from 'lucide-react'
import { Button } from '@/shared/ui/controls/button'
import { DELIVERABLE_FORMATS } from '@/lib/presentation'
import type { ModelDescriptor } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ModelMenu } from './model-menu'

export interface ComposerAttachment {
  /** Local, for the list. The stored file's id arrives with the upload. */
  id: string
  name: string
  sizeBytes: number
  classification: string
  uploading: boolean
  /**
   * The id the backend stored the file under, once the upload has returned.
   * Carried on the attachment itself: the ids used to live in a parallel
   * list that removing an attachment did not touch, so a file taken off the
   * composer was still sent with the run.
   */
  fileId?: string
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
  /** A stop was asked for and the run has not reported that it ended. */
  stopping?: boolean
  disabled?: boolean
  /** From GET /api/models; null until it answers. */
  models?: ModelDescriptor[] | null
  modelsError?: string | null
  /** A registry id, or null for Automatic. */
  preferredModel?: string | null
  onPreferredModelChange?: (modelId: string | null) => void
  /** One line of guidance above the controls, e.g. the file a starter expects. */
  hint?: string | null
  textareaRef?: RefObject<HTMLTextAreaElement | null>
}

/** Tall enough for a long request, short enough to keep the thread in view. */
const MAX_INPUT_HEIGHT = 320

/**
 * The composer.
 *
 * It is the first thing on the page now rather than the fourth. It also no
 * longer prints "AIR-GAPPED 127.0.0.1" or "Local: 127.0.0.1 · 0 Egress" —
 * both were literals, and a control that dispatches work is the last place
 * that should be asserting a posture it does not measure. Those readings
 * live on the status strip, where they come from the API.
 *
 * Enter runs and Shift+Enter breaks the line, the convention every chat
 * product has taught; Ctrl/Cmd+Enter still runs. The field stays writable
 * while a run is in flight -- a CPU run takes minutes, and the next question
 * is usually composed while reading the current answer -- and only sending is
 * held until the run ends or is stopped.
 */
export const Composer = memo(function Composer({
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
  stopping = false,
  disabled,
  models = null,
  modelsError = null,
  preferredModel = null,
  onPreferredModelChange,
  hint,
  textareaRef,
}: ComposerProps) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const ownRef = useRef<HTMLTextAreaElement | null>(null)
  const inputRef = textareaRef ?? ownRef
  const [dragging, setDragging] = useState(false)

  // A file still uploading has no id yet. Sending then dispatched the run
  // without it, and the answer came back about a document it never saw.
  const uploading = attachments.some((a) => a.uploading)
  const canSend = value.trim().length > 0 && !busy && !disabled && !uploading

  // Grow with the text, up to a ceiling. Measured before paint so the field
  // never shows a frame at the wrong height.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`
  }, [value, inputRef])

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (disabled) return
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
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          // An input method editor commits a composed character with Enter.
          // Sending on that keystroke would dispatch half a word -- the case
          // for anyone typing Hindi or any other IME-composed script.
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.shiftKey) return
          e.preventDefault()
          if (canSend) onSubmit()
        }}
        rows={2}
        disabled={disabled}
        aria-describedby="composer-keys"
        placeholder="Ask a procedural question, or describe an analysis task…"
        style={{ maxHeight: MAX_INPUT_HEIGHT }}
        className="block w-full resize-none overflow-y-auto bg-transparent px-4 pt-4 text-answer leading-[var(--lh-answer)] text-foreground placeholder:text-foreground-muted focus:outline-none disabled:opacity-[var(--opacity-disabled)]"
      />

      {attachments.length > 0 && (
        <ul className="flex flex-col gap-1 px-4 pb-2 pt-1">
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

      {hint && <p className="px-4 pb-2 text-meta text-foreground-secondary">{hint}</p>}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-subtle px-3 py-2">
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
          disabled={disabled}
        >
          Attach
        </Button>

        <div className="flex flex-wrap items-center gap-1">
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

        {onPreferredModelChange && (
          <ModelMenu
            models={models}
            error={modelsError}
            value={preferredModel}
            onChange={onPreferredModelChange}
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          <span id="composer-keys" className="hidden font-mono text-ledger text-foreground-muted sm:inline">
            {busy ? '↵ available when this run ends' : '↵ run · ⇧↵ new line'}
          </span>
          {busy && onStop ? (
            <Button
              variant="secondary"
              size="sm"
              icon={Square}
              onClick={onStop}
              busy={stopping}
              busyLabel="Stopping…"
            >
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
              title={uploading ? 'Waiting for the attachment to finish uploading' : undefined}
            >
              Run
            </Button>
          )}
        </div>
      </div>
    </div>
  )
})
