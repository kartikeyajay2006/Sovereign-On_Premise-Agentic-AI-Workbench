/**
 * VerdictBadge — the five verification verdicts.
 *
 * Spec: 20-DESIGN-SPEC §4.6 (the component), §5.1 (channel priority),
 * §5.2 (the drawing table), §1 P2 (hue is the scarcest channel).
 * Research: 12-RESEARCH-EVIDENCE-UI §4, §2.1 (C2PA: do not adjudicate truth),
 * §2.9 (PatternFly: "status icons … should never communicate severity alone").
 *
 * Channel priority is position -> shape -> weight -> hue, and hue is spent only
 * on the two extremes. Every rendering is `glyph + LABEL`; there is no icon-only
 * verdict anywhere in this product, at any size.
 *
 * NEEDS-GLOBAL: §4.6 ships a `.verdict` / `.verdict-glyph` rule set for
 * app/globals.css. It is not installed here because another agent owns that
 * file. The exact block I would add:
 *
 *   .verdict       { display: inline-flex; align-items: center; gap: var(--space-3);
 *                    font-family: var(--font-mono); font-size: var(--text-meta);
 *                    letter-spacing: var(--ls-meta); text-transform: uppercase;
 *                    padding: 2px var(--space-3); border-radius: var(--radius-xs); }
 *   .verdict-glyph { font-size: var(--size-meta); line-height: 1; }
 *   .verdict[data-size='headline'] { font-size: var(--text-ui);
 *                                    padding: 3px var(--space-4); }
 *
 * Until then the same declarations are carried inline off the same tokens, so
 * installing the block later is a pure subtraction from this file.
 */

import type { CSSProperties, ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type { Verdict } from '@/shared/ui/types'
import type { Verdict } from '@/shared/ui/types'

/**
 * Fixed slot order, most -> least severe as a SEVERITY SCALE, not a palette.
 * The order is load-bearing: it is what makes the summary strip readable by
 * position alone, in greyscale, at projector distance (§5.2).
 */
export const VERDICT_ORDER = [
  'VERIFIED',
  'SUPPORTED',
  'NEEDS_REVIEW',
  'UNSUPPORTED',
  'CONFLICTED',
] as const satisfies readonly Verdict[]

/**
 * Shape is channel 2 and carries the meaning on its own. Filled = we actively
 * confirmed; hollow = we did not. Five distinct silhouettes, distinguishable
 * before any fill or hue is applied.
 */
export const VERDICT_GLYPH: Record<Verdict, string> = {
  VERIFIED: '■', // filled square
  SUPPORTED: '□', // hollow square
  NEEDS_REVIEW: '◇', // hollow diamond
  UNSUPPORTED: '○', // hollow circle
  CONFLICTED: '⇄', // double chevron
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  VERIFIED: 'VERIFIED',
  SUPPORTED: 'SUPPORTED',
  NEEDS_REVIEW: 'NEEDS REVIEW',
  UNSUPPORTED: 'UNSUPPORTED',
  CONFLICTED: 'CONFLICTED',
}

/**
 * One plain sentence per verdict, so nobody has to re-derive the semantics from
 * the colour. Used as the badge's accessible description.
 */
export const VERDICT_MEANING: Record<Verdict, string> = {
  VERIFIED: 'Recomputed or checked independently.',
  SUPPORTED: 'A source says so; the arithmetic was not rechecked.',
  NEEDS_REVIEW: 'A human must look at this.',
  UNSUPPORTED: 'No evidence in this run backs this claim.',
  CONFLICTED: 'Two sources disagree.',
}

/**
 * Text colour classes resolve through the `--color-verdict-*` theme tokens that
 * app/globals.css already installs, which are themselves `-text` variants or
 * plain ink. A raw `--sovereign` / `--active` / `--approval` / `--critical`
 * never reaches a text node: all four fail AA as text on paper, and approval
 * (2.97:1) fails even the 3:1 non-text threshold.
 */
export const VERDICT_TEXT_CLASS: Record<Verdict, string> = {
  VERIFIED: 'text-verdict-verified', // --sovereign-text  5.50:1
  SUPPORTED: 'text-verdict-supported', // --foreground     18.46:1
  NEEDS_REVIEW: 'text-verdict-needs-review', // --approval-text 5.60:1
  UNSUPPORTED: 'text-verdict-unsupported', // --foreground-muted 3.33:1 †
  CONFLICTED: 'text-verdict-conflicted', // --critical-text  6.03:1
}

/**
 * † UNSUPPORTED is the one exception and it is deliberate (§5.2). Muted ink is
 * 3.33:1 — it clears the 3:1 UI threshold but not 4.5:1 body, so it is legal
 * only as an 11px/590 mono badge label paired with its glyph, and the mandatory
 * `reason` renders beneath in --foreground-secondary (6.27:1). Red would say
 * WRONG; grey says ABSENT, which is what the system actually found.
 */

/** Ring colour per verdict. Borders are not text nodes, so the -border
 *  (30% alpha) status derivatives are legal here. */
const VERDICT_RING: Record<Verdict, string> = {
  VERIFIED: 'var(--sovereign-border)',
  SUPPORTED: 'var(--control-default)',
  NEEDS_REVIEW: 'var(--approval-border)',
  UNSUPPORTED: 'var(--control-default)',
  CONFLICTED: 'var(--critical-border)',
}

/** Weight is channel 3. 590 for the two we confirmed something about,
 *  mono-regular 425 for the three we did not. */
const VERDICT_WEIGHT: Record<Verdict, string> = {
  VERIFIED: 'var(--weight-strong)',
  SUPPORTED: 'var(--weight-mono)',
  NEEDS_REVIEW: 'var(--weight-mono)',
  UNSUPPORTED: 'var(--weight-mono)',
  CONFLICTED: 'var(--weight-strong)',
}

/**
 * The two verdicts whose explanation is ALWAYS expanded. A reader must not have
 * to click to discover that a sentence they just read has nothing behind it
 * (§5.2). The other three are click-to-open.
 */
const ALWAYS_EXPLAINED: readonly Verdict[] = ['UNSUPPORTED', 'CONFLICTED']

export type VerdictBadgeSize = 'inline' | 'row' | 'headline'

const SIZE_STYLE: Record<VerdictBadgeSize, CSSProperties> = {
  inline: {
    fontSize: 'var(--size-meta)',
    lineHeight: 'var(--lh-meta)',
    padding: 'var(--space-0) var(--space-2)',
  },
  row: {
    fontSize: 'var(--size-meta)',
    lineHeight: 'var(--lh-meta)',
    padding: 'var(--space-1) var(--space-3)',
  },
  headline: {
    fontSize: 'var(--size-ui)',
    lineHeight: 'var(--lh-ui)',
    padding: 'var(--space-2) var(--space-4)',
  },
}

interface VerdictBadgeBase {
  size?: VerdictBadgeSize
  /**
   * "1 of 14 claims in this run carry this verdict" — Honeycomb's Minigraph
   * idea, so a lone UNSUPPORTED reads as a proportion rather than an orphan.
   * (12 §2.3, §5.3)
   */
  cohort?: { withThisVerdict: number; total: number }
  className?: string
}

/**
 * `reason` is REQUIRED for the two verdicts that mean "a human must act".
 * A badge that says UNSUPPORTED without saying why is the failure mode of every
 * compliance dashboard, so the type system refuses it. (01 §6.3.5)
 *
 * This is intended to break future call sites.
 */
export type VerdictBadgeProps =
  | (VerdictBadgeBase & { verdict: 'UNSUPPORTED' | 'CONFLICTED'; reason: string })
  | (VerdictBadgeBase & {
      verdict: 'VERIFIED' | 'SUPPORTED' | 'NEEDS_REVIEW'
      reason?: string
    })

export function VerdictBadge(props: VerdictBadgeProps) {
  const { verdict, reason, size = 'row', cohort, className } = props

  const alwaysExplained = ALWAYS_EXPLAINED.includes(verdict)
  const hasReason = typeof reason === 'string' && reason.length > 0

  const chip = (
    <span
      data-verdict={verdict}
      data-size={size}
      title={VERDICT_MEANING[verdict]}
      className={cn(
        'inline-flex items-center rounded-[var(--radius-xs)] font-mono uppercase',
        VERDICT_TEXT_CLASS[verdict],
      )}
      style={{
        ...SIZE_STYLE[size],
        gap: 'var(--space-3)',
        letterSpacing: 'var(--ls-meta)',
        fontVariationSettings: `'wght' ${VERDICT_WEIGHT[verdict]}`,
        boxShadow: `0 0 0 1px ${VERDICT_RING[verdict]}`,
      }}
    >
      {/* Shape, always. Hidden from the reading order because the label that
          follows says the same thing in words. */}
      <span
        aria-hidden="true"
        style={{ fontSize: 'var(--size-meta)', lineHeight: 1 }}
      >
        {VERDICT_GLYPH[verdict]}
      </span>
      <span>{VERDICT_LABEL[verdict]}</span>
      {cohort ? (
        <span
          className="text-foreground-secondary"
          style={{
            fontSize: 'var(--size-ledger)',
            lineHeight: 'var(--lh-ledger)',
            letterSpacing: 'var(--ls-ledger)',
            fontVariationSettings: `'wght' var(--weight-mono)`,
          }}
        >
          {cohort.withThisVerdict} of {cohort.total}
        </span>
      ) : null}
    </span>
  )

  let explanation: ReactNode = null
  if (hasReason) {
    const reasonText = (
      <span
        className="text-foreground-secondary font-sans"
        style={{ fontSize: 'var(--size-body)', lineHeight: 'var(--lh-body)' }}
      >
        {reason}
      </span>
    )
    explanation = alwaysExplained ? (
      reasonText
    ) : (
      // VERIFIED / SUPPORTED / NEEDS_REVIEW explanations are click-to-open
      // (§5.2). A native <details> is the disclosure with no JS in the path.
      <details className="group">
        <summary
          className="text-foreground-muted cursor-pointer list-none font-mono uppercase select-none [&::-webkit-details-marker]:hidden"
          style={{
            fontSize: 'var(--size-ledger)',
            lineHeight: 'var(--lh-ledger)',
            letterSpacing: 'var(--ls-ledger)',
          }}
        >
          why
        </summary>
        <span className="mt-[var(--space-2)] block">{reasonText}</span>
      </details>
    )
  }

  return (
    <span
      className={cn('inline-flex flex-col items-start', className)}
      style={{ gap: 'var(--space-2)' }}
    >
      {chip}
      {explanation}
    </span>
  )
}
