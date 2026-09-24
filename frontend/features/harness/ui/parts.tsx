'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Seal } from '@/shared/motion'
import type { HarnessOutcome, RunStatus } from '../model/types'
import { OUTCOME, RUN_STATUS, STATE_GLYPH, STATE_TEXT } from './outcome'

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

/**
 * An outcome's spectrum cell at marker size, with its glyph: the same cell
 * the strip at the top draws, so a row and its cell match by eye. Sized by
 * --cell, because the cell rule is unlayered CSS and outranks any size
 * utility.
 */
export function OutcomeMarker({
  outcome,
  size = 16,
  className,
}: {
  outcome: HarnessOutcome
  /** Edge in px. 16 in a row, 14 in a tally. */
  size?: number
  className?: string
}) {
  const spec = OUTCOME[outcome]
  // An empty cell and a skipped one say it by their edge and their dash.
  const glyph = spec.state === 'pending' || spec.state === 'skipped' ? null : spec.glyph
  return (
    <span
      aria-hidden
      data-state={spec.state}
      className={cn(
        'aegis-strip-cell flex items-center justify-center font-mono text-ledger leading-none',
        STATE_GLYPH[spec.state],
        className,
      )}
      style={{ '--cell': `${size}px` } as CSSProperties}
    >
      {glyph}
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
      <span className={cn('font-mono text-meta uppercase tracking-[var(--ls-meta)]', STATE_TEXT[spec.state])}>
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
      <span aria-hidden className={cn('inline-flex size-2 shrink-0 rounded-full', spec.dot)} />
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
  seal,
  className,
}: {
  label: string
  value: string
  display?: string
  /**
   * Draw the value as a SEAL: a rule under it that draws when the value is
   * committed, dashed while it is not. The copy control stays outside it.
   */
  seal?: { sealed: boolean; srLabel?: string }
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

  const text = (
    <span className="truncate-cell font-mono text-meta text-foreground-secondary" title={value}>
      {display ?? value}
    </span>
  )

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      {seal ? (
        <Seal sealed={seal.sealed} token={value} srLabel={seal.srLabel} className="min-w-0">
          {text}
        </Seal>
      ) : (
        text
      )}
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
