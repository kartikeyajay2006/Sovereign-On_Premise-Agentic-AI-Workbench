'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HarnessOutcome, RunStatus } from '../model/types'
import { OUTCOME, RUN_STATUS } from './outcome'

/** The product's mono eyebrow: machine vocabulary, never prose. */
export function Ledger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function OutcomeMarker({ outcome, className }: { outcome: HarnessOutcome; className?: string }) {
  const spec = OUTCOME[outcome]
  return (
    <span
      aria-hidden
      className={cn(
        'relative flex size-4 shrink-0 items-center justify-center rounded-[var(--radius-xs)] font-mono text-[10px] leading-none',
        spec.marker,
        className,
      )}
    >
      {spec.live ? (
        <span className="sov-pulse size-1.5 rounded-full bg-active" />
      ) : (
        spec.glyph
      )}
    </span>
  )
}

/** Glyph and words together: an outcome is never carried by hue alone. */
export function OutcomeLabel({
  outcome,
  className,
  title,
}: {
  outcome: HarnessOutcome
  className?: string
  title?: string
}) {
  const spec = OUTCOME[outcome]
  return (
    <span className={cn('inline-flex items-center gap-2', className)} title={title ?? spec.meaning}>
      <OutcomeMarker outcome={outcome} />
      <span className={cn('font-mono text-meta uppercase tracking-[var(--ls-meta)]', spec.text)}>
        {spec.label}
      </span>
    </span>
  )
}

export function RunStatusBadge({ status, className }: { status: RunStatus; className?: string }) {
  const spec = RUN_STATUS[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-mono text-meta uppercase tracking-[var(--ls-meta)]',
        spec.text,
        className,
      )}
    >
      <span className="relative flex size-2 shrink-0">
        {spec.live && (
          <span className={cn('sov-pulse absolute inline-flex size-full rounded-full', spec.dot)} />
        )}
        <span className={cn('relative inline-flex size-2 rounded-full', spec.dot)} />
      </span>
      {spec.label}
    </span>
  )
}

type CopyState = 'idle' | 'copied' | 'blocked'

/**
 * A machine-issued value with a copy control. Clipboard access can be denied
 * outright on this origin; that is said rather than pretended away.
 */
export function CopyValue({
  label,
  value,
  display,
  className,
}: {
  label: string
  value: string
  display?: string
  className?: string
}) {
  const [state, setState] = useState<CopyState>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = window.setTimeout(() => setState('idle'), 1600)
    return () => window.clearTimeout(timer)
  }, [state])

  const copy = async () => {
    if (!navigator.clipboard) {
      setState('blocked')
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      setState('blocked')
    }
  }

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <span className="truncate-cell font-mono text-meta text-foreground-secondary" title={value}>
        {display ?? value}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy ${label}`}
        className="hover-decay inline-flex h-5 shrink-0 items-center gap-1 rounded-[var(--radius-xs)] px-1 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted hover:bg-surface-sunken hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        {state === 'copied' ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
        {state === 'copied' ? 'Copied' : state === 'blocked' ? 'Copy blocked' : null}
      </button>
    </span>
  )
}

/** A neutral aside. Not a status: nothing here has happened yet. */
export function Notice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'border-l-2 border-line-strong bg-surface-sunken px-4 py-3 text-body text-foreground-secondary',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** A titled block on the page, card-less: one surface, one hairline ring. */
export function Panel({
  title,
  aside,
  children,
  className,
  id,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section aria-labelledby={id ? `${id}-title` : undefined} className={cn('grouped', className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle px-4 py-3">
        <h2 id={id ? `${id}-title` : undefined}>
          <Ledger className="text-foreground-secondary">{title}</Ledger>
        </h2>
        {aside}
      </header>
      {children}
    </section>
  )
}
