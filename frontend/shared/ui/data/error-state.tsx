'use client'

/* -------------------------------------------------------------------------- */
/* ErrorState — 20-DESIGN-SPEC §4.11.                                          */
/*                                                                            */
/* We tried and we failed. That is a different fact from "the answer is        */
/* nothing" (EmptyState) and from "this host cannot report on it"              */
/* (UnavailableState), and conflating them is how registry-view.tsx came to    */
/* assert six documents in an empty table.                                     */
/*                                                                            */
/* Two rules this component exists to enforce:                                 */
/*                                                                            */
/*  1. The upstream message is NEVER swallowed and never rewritten. It renders */
/*     verbatim, mono, under its own caption so a reader can tell our prose    */
/*     from the machine's. A plant inspector needs the code, the stage, the    */
/*     timestamp and the cause — not a softened consumer apology (10 §4.3).    */
/*  2. The identifier is copyable. Every failure surface carries one.          */
/*                                                                            */
/* The error is the content; the page around it stays completely normal        */
/* (10 §2.4, Sentry). No shake, no flash, no strobe.                           */
/* -------------------------------------------------------------------------- */

import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ErrorStateProps {
  /**
   * State, then next action. No apology and no blame:
   * "Can't reach the API at 127.0.0.1:8000."
   */
  headline: string
  /** What the reader can do about it: "Start the backend, then retry." */
  nextAction: string
  /** A copyable handle on the failure: a run id, a stage, a trace id. */
  identifier?: { label: string; value: string }
  /** The literal upstream message. Rendered verbatim, mono. Never rewritten. */
  detail?: string
  /** Offered only when a retry is actually meaningful. Omit it otherwise. */
  retry?: () => void
  className?: string
}

/**
 * How long the copy confirmation dwells. This is a text label's read time, not
 * an animation, so it is deliberately NOT drawn from the §2.8 motion ladder
 * (whose longest tier, --dur-seal, is 640ms — too short to read "Copied").
 */
const COPY_CONFIRM_MS = 1600

type CopyState = 'idle' | 'copied' | 'blocked'

/* Local until migration step B1 lands `shared/ui/controls/button.tsx`; this is
   §4.1's `secondary` variant at `sm`. The ErrorState sits on --surface, so the
   plain --focus-ring (whose gap is --surface) is the correct ground. */
const ACTION_CLASS = cn(
  'hover-decay inline-flex h-[var(--control-sm)] items-center justify-center gap-[var(--space-3)]',
  'whitespace-nowrap rounded-[var(--radius)] px-[10px] text-ui font-medium',
  'bg-surface text-foreground shadow-[0_0_0_1px_var(--control-default)]',
  'hover:bg-surface-sunken hover:shadow-[0_0_0_1px_var(--control-strong)]',
  'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
)

export function ErrorState({
  headline,
  nextAction,
  identifier,
  detail,
  retry,
  className,
}: ErrorStateProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle')

  useEffect(() => {
    if (copyState === 'idle') return
    const timer = window.setTimeout(() => setCopyState('idle'), COPY_CONFIRM_MS)
    return () => window.clearTimeout(timer)
  }, [copyState])

  async function copyIdentifier(value: string) {
    /* Clipboard access is unavailable on an insecure origin and can be denied
       outright. We say so rather than pretending the copy happened — the same
       discipline the rest of this component applies to the upstream message. */
    if (!navigator.clipboard) {
      setCopyState('blocked')
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      setCopyState('copied')
    } catch {
      setCopyState('blocked')
    }
  }

  return (
    <div
      className={cn(
        'rounded-[var(--radius)] bg-surface shadow-[0_0_0_1px_var(--critical-border)]',
        'px-[var(--space-6)] py-[var(--pad-comfortable)]',
        className,
      )}
    >
      {/* --critical-text, never --critical: 6.03:1 on paper against 4.50:1. */}
      <p className="max-w-[66ch] text-body font-medium text-critical-text">{headline}</p>

      <p className="mt-[var(--space-3)] max-w-[66ch] text-body text-foreground-secondary">{nextAction}</p>

      {identifier && (
        <div className="mt-[var(--space-5)] flex items-center gap-[var(--space-3)]">
          <span className="font-mono text-meta tracking-[var(--ls-meta)] text-foreground-secondary">
            <span className="text-foreground-muted">{identifier.label}</span> {identifier.value}
          </span>
          <button
            type="button"
            onClick={() => void copyIdentifier(identifier.value)}
            aria-label={`Copy ${identifier.label}`}
            className={cn(
              'hover-decay inline-flex h-[var(--space-7)] items-center gap-[var(--space-2)]',
              'rounded-[var(--radius-xs)] px-[var(--space-2)] font-mono text-ledger uppercase',
              'tracking-[var(--ls-ledger)] text-foreground-muted',
              'hover:bg-surface-sunken hover:text-foreground',
              'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
            )}
          >
            {copyState === 'copied' ? (
              <Check aria-hidden className="h-3 w-3" />
            ) : (
              <Copy aria-hidden className="h-3 w-3" />
            )}
            {copyState === 'copied' ? 'COPIED' : copyState === 'blocked' ? 'COPY BLOCKED' : 'COPY'}
          </button>
        </div>
      )}

      {detail && (
        <div className="mt-[var(--space-5)]">
          <p className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
            Reported upstream, verbatim
          </p>
          {/* --critical as a 2px rail is a marker, not text: legal use of the
              fill hue. The message itself stays ink so it reads as a quotation
              of the machine rather than as our own judgement. */}
          <pre
            className={cn(
              'mt-[var(--space-3)] overflow-x-auto whitespace-pre-wrap break-words',
              'border-l-2 border-critical bg-surface-sunken',
              'px-[var(--space-5)] py-[var(--space-4)]',
              'font-mono text-meta tracking-[var(--ls-meta)] text-foreground',
            )}
          >
            {detail}
          </pre>
        </div>
      )}

      {retry && (
        <div className="mt-[var(--space-6)]">
          <button type="button" onClick={retry} className={ACTION_CLASS}>
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
