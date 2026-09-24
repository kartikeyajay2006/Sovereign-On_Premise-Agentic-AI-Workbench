'use client'

import { memo, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import { Menu } from '@base-ui/react/menu'
import { ArrowUp, Check, ChevronDown, Loader2, Paperclip, Square, X } from 'lucide-react'
import { DELIVERABLE_FORMATS } from '@/lib/presentation'
import type { ModelDescriptor, Skill } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ModelMenu } from './model-menu'
import { SlashMenu, slashItems, type HarnessEntry, type SlashItem } from './slash-menu'

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
  /** From GET /api/skills; null until it answers. */
  skills?: Skill[] | null
  /** The harness catalogue, offered after the skills. */
  harnesses?: HarnessEntry[] | null
  /** The skill the next run goes through, or null. */
  skill?: Skill | null
  onSkillChange?: (skill: Skill | null) => void
}

/** "/", then letters: the composer is asking for a skill or a harness by name. */
const SLASH = /^\/([a-z0-9-]*)$/i

/** Tall enough for a long request, short enough to keep the thread in view. */
const MAX_INPUT_HEIGHT = 320

const ITEM = cn(
  'grid cursor-default grid-cols-[14px_minmax(0,1fr)] items-center gap-x-2 rounded-[10px] px-2.5 py-2 outline-none select-none',
  'data-[highlighted]:bg-surface-sunken',
)

/** What the run should hand back: an answer, or a document as well. */
function FormatMenu({ value, onChange }: { value: string; onChange: (f: string) => void }) {
  const current = DELIVERABLE_FORMATS.find((f) => f.id === value) ?? DELIVERABLE_FORMATS[0]
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Deliverable: ${current.label}`}
        className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-foreground-secondary transition-colors hover:bg-surface-sunken hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none data-[popup-open]:bg-surface-sunken"
      >
        {current.label}
        <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={8} className="z-[var(--z-menu)] outline-none">
          <Menu.Popup className="w-[220px] origin-[var(--transform-origin)] rounded-[16px] border border-line-subtle bg-surface p-1.5 shadow-[var(--elev-2)] outline-none transition-[scale,opacity] duration-150 motion-safe:data-[starting-style]:scale-[0.97] motion-safe:data-[starting-style]:opacity-0 motion-safe:data-[ending-style]:scale-[0.97] motion-safe:data-[ending-style]:opacity-0">
            <p className="px-2.5 pb-1 pt-1.5 text-[12px] text-foreground-muted">Deliver as</p>
            <Menu.RadioGroup value={value} onValueChange={(next) => onChange(String(next))}>
              {DELIVERABLE_FORMATS.map((f) => (
                <Menu.RadioItem key={f.id} value={f.id} closeOnClick className={ITEM}>
                  <Menu.RadioItemIndicator className="col-start-1">
                    <Check className="size-3.5 text-foreground" aria-hidden />
                  </Menu.RadioItemIndicator>
                  <span className="col-start-2 flex items-baseline justify-between gap-3">
                    <span className="text-[13.5px] text-foreground">{f.label}</span>
                    {f.ext ? <span className="font-mono text-[11px] text-foreground-muted">{f.ext}</span> : null}
                  </span>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

/**
 * The composer: one rounded field, the way the best chat products draw it.
 *
 * Enter runs and Shift+Enter breaks the line, the convention every chat
 * product has taught; Ctrl/Cmd+Enter still runs. The field stays writable
 * while a run is in flight -- a CPU run takes minutes, and the next question
 * is usually composed while reading the current answer -- and only sending is
 * held until the run ends or is stopped. It asserts no posture: readings live
 * in the header, where they come from the API.
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
  skills = null,
  harnesses = null,
  skill = null,
  onSkillChange,
}: ComposerProps) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const ownRef = useRef<HTMLTextAreaElement | null>(null)
  const inputRef = textareaRef ?? ownRef
  const [dragging, setDragging] = useState(false)
  const router = useRouter()

  // The "/" menu: open while the whole draft is "/" and a name, until Escape.
  const [highlight, setHighlight] = useState(0)
  const [dismissedAt, setDismissedAt] = useState<string | null>(null)
  const query = !skill && onSkillChange ? value.match(SLASH)?.[1] ?? null : null
  const items = useMemo(() => (query === null ? [] : slashItems(query, skills, harnesses)), [query, skills, harnesses])
  const menuOpen = query !== null && dismissedAt !== value
  const active = Math.min(highlight, Math.max(0, items.length - 1))
  // Open toward the room: up from a composer docked at the foot of a
  // thread, down from the empty state's, which sits high under the header.
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [placement, setPlacement] = useState<'above' | 'below'>('above')
  useLayoutEffect(() => {
    if (!menuOpen || !rootRef.current) return
    setPlacement(rootRef.current.getBoundingClientRect().top < 400 ? 'below' : 'above')
  }, [menuOpen])

  const choose = (item: SlashItem) => {
    if (item.kind === 'harness') {
      router.push(`/harnesses?harness=${encodeURIComponent(item.harness.id)}`)
      return
    }
    onSkillChange?.(item.skill)
    onChange('')
    setHighlight(0)
    inputRef.current?.focus()
  }

  // A file still uploading has no id yet. Sending then dispatched the run
  // without it, and the answer came back about a document it never saw.
  const uploading = attachments.some((a) => a.uploading)
  // A bare "/name" is a request for the menu, not a question to send.
  const canSend = value.trim().length > 0 && !busy && !disabled && !uploading && !(onSkillChange && !skill && SLASH.test(value))

  // Grow with the text, up to a ceiling. Measured before paint so the field
  // never shows a frame at the wrong height.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`
  }, [value, inputRef])

  return (
    <div ref={rootRef} className="relative">
    {menuOpen && (
      <SlashMenu
        id="composer-slash"
        query={query ?? ''}
        items={items}
        highlight={active}
        onHighlight={setHighlight}
        onChoose={choose}
        placement={placement}
      />
    )}
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
        'rounded-[26px] border border-line-subtle bg-surface shadow-[0_1px_2px_oklch(0_0_0/0.04),0_12px_32px_-18px_oklch(0_0_0/0.22)]',
        'transition-[border-color,box-shadow] duration-150 focus-within:border-line-default',
        dragging && 'border-foreground shadow-[0_0_0_1px_var(--foreground)]',
      )}
    >
      <label htmlFor="composer-input" className="sr-only">
        Describe the task
      </label>
      {skill && (
        <div className="flex items-center gap-2 px-4 pt-3">
          <span className="ae-skill-chip flex min-w-0 items-center gap-1.5 rounded-full bg-surface-sunken py-1 pl-2.5 pr-1 text-[12.5px]">
            <span className="font-mono text-foreground">/{skill.id}</span>
            <span className="truncate text-foreground-secondary">{skill.name}</span>
            {skill.deliverable_format && (
              <span className="shrink-0 font-mono text-[11px] uppercase text-foreground-muted">{skill.deliverable_format}</span>
            )}
            <button
              type="button"
              onClick={() => {
                onSkillChange?.(null)
                inputRef.current?.focus()
              }}
              aria-label={`Stop using /${skill.id}`}
              className="grid size-5 shrink-0 place-items-center rounded-full text-foreground-muted hover:bg-surface hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              <X className="size-3" />
            </button>
          </span>
        </div>
      )}
      <textarea
        id="composer-input"
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setHighlight(0)
        }}
        role={menuOpen ? 'combobox' : undefined}
        aria-expanded={menuOpen || undefined}
        aria-controls={menuOpen && items.length > 0 ? 'composer-slash' : undefined}
        aria-activedescendant={menuOpen && items.length > 0 ? `composer-slash-${active}` : undefined}
        onKeyDown={(e) => {
          if (menuOpen) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              if (items.length === 0) return
              const step = e.key === 'ArrowDown' ? 1 : -1
              setHighlight((active + step + items.length) % items.length)
              return
            }
            if ((e.key === 'Enter' || e.key === 'Tab') && items.length > 0 && !e.nativeEvent.isComposing) {
              e.preventDefault()
              choose(items[active])
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setDismissedAt(value)
              return
            }
          }
          // Backspace in an empty field takes the skill off, as a chip does.
          if (e.key === 'Backspace' && skill && value === '') {
            e.preventDefault()
            onSkillChange?.(null)
            return
          }
          if (e.key !== 'Enter') return
          // An input method editor commits a composed character with Enter.
          // Sending on that keystroke would dispatch half a word -- the case
          // for anyone typing Hindi or any other IME-composed script.
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.shiftKey) return
          e.preventDefault()
          if (canSend) onSubmit()
        }}
        rows={1}
        disabled={disabled}
        aria-describedby="composer-keys"
        placeholder={
          skill
            ? skill.input_hint || 'What should it look at?'
            : onSkillChange
              ? 'Ask about a procedure, a report or a calculation — or type / for skills'
              : 'Ask about a procedure, a report or a calculation…'
        }
        style={{ maxHeight: MAX_INPUT_HEIGHT }}
        className="block min-h-[56px] w-full resize-none overflow-y-auto bg-transparent px-5 pb-1 pt-4 text-[16px] leading-[1.55] text-foreground placeholder:text-foreground-muted focus:outline-none disabled:opacity-[var(--opacity-disabled)]"
      />
      <span id="composer-keys" className="sr-only">
        {busy ? 'Enter sends once this run ends.' : 'Enter sends. Shift and Enter start a new line.'}
      </span>

      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-4 pb-1 pt-2">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex max-w-full items-center gap-2 rounded-full bg-surface-sunken py-1 pl-2.5 pr-1.5 text-[12.5px]"
            >
              {a.uploading ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-foreground-muted motion-reduce:animate-none" aria-hidden />
              ) : (
                <Paperclip className="size-3.5 shrink-0 text-foreground-muted" aria-hidden />
              )}
              <span className="max-w-[220px] truncate font-medium text-foreground">{a.name}</span>
              {/* The classification comes back from the upload; it is not decided here. */}
              <span className="shrink-0 text-foreground-muted">
                {a.uploading ? 'uploading' : `${Math.max(1, Math.round(a.sizeBytes / 1024))} kB · ${a.classification}`}
              </span>
              <button
                type="button"
                onClick={() => onRemoveAttachment(a.id)}
                aria-label={`Remove ${a.name}`}
                className="grid size-5 shrink-0 place-items-center rounded-full text-foreground-muted hover:bg-surface hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {hint && <p className="px-5 pb-1 pt-1 text-[12.5px] text-foreground-secondary">{hint}</p>}

      <div className="flex items-center gap-1 px-2.5 pb-2.5 pt-1">
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
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          aria-label="Attach files"
          title="Attach files"
          className="grid size-8 place-items-center rounded-full text-foreground-secondary transition-colors hover:bg-surface-sunken hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-40"
        >
          <Paperclip className="size-4" aria-hidden />
        </button>

        <FormatMenu value={format} onChange={onFormatChange} />

        {onPreferredModelChange && (
          <ModelMenu models={models} error={modelsError} value={preferredModel} onChange={onPreferredModelChange} />
        )}

        <div className="ml-auto">
          {busy && onStop ? (
            <button
              type="button"
              onClick={onStop}
              disabled={stopping}
              aria-label={stopping ? 'Stopping' : 'Stop this run'}
              title={stopping ? 'Stopping…' : 'Stop this run'}
              className="grid size-9 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-85 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-50"
            >
              {stopping ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <Square className="size-3.5 fill-current" aria-hidden />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSend}
              aria-label="Run"
              title={uploading ? 'Waiting for the attachment to finish uploading' : 'Run (Enter)'}
              className={cn(
                'grid size-9 place-items-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-95',
                'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
                canSend ? 'bg-foreground text-background hover:opacity-90' : 'bg-surface-sunken text-foreground-muted',
              )}
            >
              <ArrowUp className="size-[18px]" strokeWidth={2.2} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
    </div>
  )
})
