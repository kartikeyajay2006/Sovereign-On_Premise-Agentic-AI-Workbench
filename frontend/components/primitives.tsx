'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { useReveal } from '@/hooks/use-reveal'

/* Small monospace technical eyebrow label */
export function TechnicalLabel({
  children,
  className,
  dot,
}: {
  children: ReactNode
  className?: string
  dot?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-foreground-muted',
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />}
      {children}
    </span>
  )
}

/* Large editorial section heading with a coordinate annotation */
export function SectionHeading({
  eyebrow,
  index,
  title,
  className,
  dark,
}: {
  eyebrow?: string
  index?: string
  title: ReactNode
  className?: string
  dark?: boolean
}) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {(eyebrow || index) && (
        <div className="flex items-center justify-between">
          {eyebrow && <TechnicalLabel>{eyebrow}</TechnicalLabel>}
          {index && (
            <span className={cn('font-mono text-[11px]', dark ? 'text-ink-muted' : 'text-foreground-muted')}>
              {index}
            </span>
          )}
        </div>
      )}
      <h2
        className={cn(
          'text-balance text-3xl font-medium leading-[1.05] tracking-[-0.02em] md:text-5xl',
          dark ? 'text-ink-foreground' : 'text-foreground',
        )}
      >
        {title}
      </h2>
    </div>
  )
}

/**
 * Status chips.
 *
 * Every row carries a glyph as well as a colour, and every label is set in a
 * `-text` variant rather than in the fill hue.
 *
 * What this replaces: a 1.5px dot plus a label painted in the raw status
 * colour. On the paper background that put DELIVERED at 3.07:1 and PENDING
 * and AWAITING APPROVAL at 2.97:1 — the latter failing not only AA body text
 * but the 3:1 threshold for non-text as well. Those are the two statuses a
 * reviewer looks for most, and a 1.5px dot is not a distinguishing mark at
 * arm's length, in greyscale, or on a projector. Shape now carries the
 * meaning and hue only reinforces it.
 *
 * The `pulse` prop is gone. Whether something is live is a property of its
 * state, not of the caller's opinion, and the old prop let a finished stage
 * be made to pulse. RUNNING, INGESTING and PROCESSING pulse because they are
 * the running states; nothing else can.
 */
type StatusSpec = { text: string; dot: string; glyph: string }

const statusMap = {
  DELIVERED: { text: 'text-sovereign-text', dot: 'bg-sovereign', glyph: '✓' },
  APPROVED: { text: 'text-sovereign-text', dot: 'bg-sovereign', glyph: '✓' },
  INDEXED: { text: 'text-sovereign-text', dot: 'bg-sovereign', glyph: '✓' },
  STORED: { text: 'text-sovereign-text', dot: 'bg-sovereign', glyph: '✓' },

  RUNNING: { text: 'text-active-text', dot: 'bg-active', glyph: '◐' },
  INGESTING: { text: 'text-active-text', dot: 'bg-active', glyph: '◐' },
  PROCESSING: { text: 'text-active-text', dot: 'bg-active', glyph: '◐' },

  'AWAITING APPROVAL': { text: 'text-approval-text', dot: 'bg-approval', glyph: '⏸' },
  PENDING: { text: 'text-approval-text', dot: 'bg-approval', glyph: '⏸' },

  FAILED: { text: 'text-critical-text', dot: 'bg-critical', glyph: '✕' },
  ERROR: { text: 'text-critical-text', dot: 'bg-critical', glyph: '✕' },
  REJECTED: { text: 'text-critical-text', dot: 'bg-critical', glyph: '✕' },
  // Blocked is not a failure. It is the system stopping on purpose.
  BLOCKED: { text: 'text-critical-text', dot: 'bg-critical', glyph: '⛔' },

  CANCELLED: { text: 'text-foreground-muted', dot: 'bg-control-strong', glyph: '—' },
  cancelled: { text: 'text-foreground-muted', dot: 'bg-control-strong', glyph: '—' },
} as const satisfies Record<string, StatusSpec>

/** The three states that are genuinely in motion. Derived, never passed in. */
const LIVE_STATUSES = new Set(['RUNNING', 'INGESTING', 'PROCESSING'])

/**
 * The backend's TaskStatus is snake_case (`awaiting_approval`) while this map
 * is keyed in the display form. Without normalising, a perfectly well-known
 * status fell through to the unrecognised branch and rendered as "?
 * AWAITING_APPROVAL" in muted grey — which was honest, but wrong: the status
 * is known, it was the lookup that was not.
 */
function normaliseStatus(status: string): string {
  return status.replace(/_/g, ' ').toUpperCase()
}

export function StatusIndicator({
  status,
  className,
}: {
  status: keyof typeof statusMap | string
  className?: string
}) {
  const key = normaliseStatus(String(status))
  const s: StatusSpec = (statusMap as Record<string, StatusSpec>)[key] ?? {
    // An unrecognised status is shown as unrecognised rather than guessed at.
    text: 'text-foreground-muted',
    dot: 'bg-control-strong',
    glyph: '?',
  }
  const label = key
  const live = LIVE_STATUSES.has(key)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-meta tracking-[var(--ls-meta)]',
        s.text,
        className,
      )}
    >
      <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
        {live && (
          <span className={cn('sov-pulse absolute inline-flex h-full w-full rounded-full', s.dot)} />
        )}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', s.dot)} />
      </span>
      <span aria-hidden className="text-[10px] leading-none">
        {s.glyph}
      </span>
      <span>{label}</span>
    </span>
  )
}

/**
 * Classification chip.
 *
 * Classification is not a status, so it deliberately takes no status hue —
 * a RESTRICTED document is not an error. It is distinguished by weight of
 * rule instead, which keeps the four status colours meaning exactly one
 * thing across the product.
 */
const CLASSIFICATION_EDGE: Record<string, string> = {
  restricted: 'border-control-strong text-foreground',
  sensitive: 'border-control-default text-foreground-secondary',
  confidential: 'border-control-default text-foreground-secondary',
  normal: 'border-line-default text-foreground-muted',
}

export function ClassificationTag({ level, dark }: { level: string; dark?: boolean }) {
  const edge = CLASSIFICATION_EDGE[String(level).toLowerCase()] ?? CLASSIFICATION_EDGE.normal
  return (
    <span
      className={cn(
        'inline-flex items-center border px-2 py-0.5 font-mono text-ledger uppercase tracking-[var(--ls-ledger)]',
        dark ? 'border-ink-border text-ink-muted' : edge,
      )}
    >
      {level}
    </span>
  )
}

/* Scroll reveal wrapper */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const { ref, inView } = useReveal()
  return (
    <div
      ref={ref}
      className={cn('reveal', inView && 'in-view', className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms && ms !== 0) return '—'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}
