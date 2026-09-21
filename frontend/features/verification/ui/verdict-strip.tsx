'use client'

/**
 * VerdictStrip — the five-slot run summary.
 *
 * Spec: 20-DESIGN-SPEC §5.2 ("The verdict strip"), §5.1 (channel priority),
 * §5.4 (greyscale and projector proof).
 * Research: 12-RESEARCH-EVIDENCE-UI §4 (fixed slot order), §2.9 (PatternFly:
 * 3–6 icons ordered most -> least severe, paired with counts), §5.3
 * (Honeycomb's "Highlight errors" generalised to a filter toggle).
 *
 *     ■ 3   □ 2   ◇ 1   ○ 1   ⇄ 1          14 claims · 1 of 14 conflicted
 *
 * Five fixed slots, ALWAYS all five, counts included, zeros shown. A slot with
 * a count of 0 is still drawn, greyed, and is not clickable: the shape of the
 * strip must be constant across runs or it stops being readable by position.
 *
 * Each slot also carries its verdict word, because §5.1 admits no icon-only
 * rendering of a status anywhere in this product — the glyph is the fast
 * channel, the word is the unambiguous one, and position is what survives a
 * beamer and a monochrome printout.
 */

import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'

import {
  VERDICT_GLYPH,
  VERDICT_LABEL,
  VERDICT_MEANING,
  VERDICT_ORDER,
  VERDICT_TEXT_CLASS,
  type Verdict,
} from './verdict-badge'

export interface VerdictStripProps {
  /** All five keys are required. A missing verdict is a zero, and a zero is
   *  drawn — it is never an absent slot. */
  counts: Readonly<Record<Verdict, number>>
  /** Claims in this run. Stated separately because it is the denominator the
   *  cohort sentence reads from; it is never derived by summing the counts,
   *  which would silently hide a claim that carries no verdict at all. */
  total: number
  /** Verdicts currently filtering the view. */
  selected?: readonly Verdict[]
  /** Omit to render a read-only strip (a printed evidence pack, a PDF). */
  onToggle?: (verdict: Verdict) => void
  className?: string
}

/** Weight is channel 3: the two extremes sit heavier than the middle three. */
const SLOT_WEIGHT: Record<Verdict, string> = {
  VERIFIED: 'var(--weight-strong)',
  SUPPORTED: 'var(--weight-mono)',
  NEEDS_REVIEW: 'var(--weight-mono)',
  UNSUPPORTED: 'var(--weight-mono)',
  CONFLICTED: 'var(--weight-strong)',
}

function summarise(total: number, conflicted: number): string {
  if (conflicted > 0) {
    return `${total} claims · ${conflicted} of ${total} conflicted`
  }
  return `${total} claims`
}

export function VerdictStrip({
  counts,
  total,
  selected,
  onToggle,
  className,
}: VerdictStripProps) {
  return (
    <div
      role="group"
      aria-label="Verdict summary"
      className={cn('flex flex-wrap items-start', className)}
      style={{ gap: 'var(--space-7)' }}
    >
      {VERDICT_ORDER.map((verdict) => {
        const count = counts[verdict]
        const isEmpty = count === 0
        const isSelected = selected?.includes(verdict) ?? false
        // A zero slot is drawn but inert: there is nothing to filter to.
        const isInteractive = !isEmpty && onToggle !== undefined

        const body = (
          <>
            <span
              className="flex items-baseline"
              style={{ gap: 'var(--space-3)' }}
            >
              <span
                aria-hidden="true"
                className="font-mono"
                style={{ fontSize: 'var(--size-heading)', lineHeight: 1 }}
              >
                {VERDICT_GLYPH[verdict]}
              </span>
              <span
                className="tabular font-mono"
                style={{
                  fontSize: 'var(--size-title)',
                  lineHeight: 'var(--lh-title)',
                  fontVariationSettings: `'wght' ${SLOT_WEIGHT[verdict]}`,
                }}
              >
                {count}
              </span>
            </span>
            <span
              className="font-mono uppercase"
              style={{
                fontSize: 'var(--size-ledger)',
                lineHeight: 'var(--lh-ledger)',
                letterSpacing: 'var(--ls-ledger)',
              }}
            >
              {VERDICT_LABEL[verdict]}
            </span>
          </>
        )

        const slotStyle = {
          gap: 'var(--space-1)',
          padding: 'var(--space-2) var(--space-3)',
          // Carried as a custom property so the focus-visible utility can win:
          // an inline box-shadow would outrank any class.
          '--slot-ring': isSelected ? 'var(--foreground)' : 'transparent',
        } as CSSProperties

        const slotClass = cn(
          'hover-decay flex flex-col items-start rounded-[var(--radius-xs)]',
          'shadow-[0_0_0_1px_var(--slot-ring)]',
          // Greyed, per §5.2 — an empty slot is quiet but still present.
          isEmpty ? 'text-foreground-muted' : VERDICT_TEXT_CLASS[verdict],
        )

        const title = `${VERDICT_LABEL[verdict]} — ${count} of ${total}. ${VERDICT_MEANING[verdict]}`

        if (!isInteractive) {
          return (
            <span
              key={verdict}
              data-verdict={verdict}
              data-empty={isEmpty || undefined}
              title={title}
              className={slotClass}
              style={slotStyle}
            >
              {body}
            </span>
          )
        }

        return (
          <button
            key={verdict}
            type="button"
            data-verdict={verdict}
            aria-pressed={isSelected}
            title={title}
            onClick={() => onToggle(verdict)}
            className={cn(
              slotClass,
              'cursor-pointer text-left focus-visible:shadow-focus focus-visible:outline-none',
            )}
            style={slotStyle}
          >
            {body}
          </button>
        )
      })}

      <p
        className="text-foreground-secondary tabular ml-auto self-center font-mono"
        style={{
          fontSize: 'var(--size-meta)',
          lineHeight: 'var(--lh-meta)',
        }}
      >
        {summarise(total, counts.CONFLICTED)}
      </p>
    </div>
  )
}
