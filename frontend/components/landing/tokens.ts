// Class strings shared across the public landing page.
//
// One file so that no component invents a fourth control height or a fifth
// grey. Every value here is bound to a token already declared in
// app/globals.css; nothing below introduces a hue, a radius or a size that the
// design system does not already carry.
//
// On type: the product's scale is --text-display (32px) down to --text-ledger
// (10px), exposed by Tailwind as text-display / text-title / text-heading /
// text-answer / text-body / text-ui / text-meta / text-ledger. Those utilities
// are used everywhere they fit. The two marketing display steps -- the hero h1
// above 32px, and the section h2 at 36px -- have no token because the product
// surface has no text that large, so they step up from text-display with an
// explicit size at the breakpoint. Those are the only font sizes on the page
// that are not a token, and they are all in this file.

/** The page's single content column. 1120px is the widest thing on the page. */
export const SHELL = 'mx-auto w-full max-w-[1120px] px-4 md:px-8 lg:px-10'

/** A narrower column for long-form prose: roughly 62 characters. */
export const PROSE = 'max-w-[62ch]'

/**
 * Uppercase mono micro-label, over machine-readable data only.
 *
 * --text-meta (11px/16px). Tracking is 0.08em, never the 0.22em the old
 * TechnicalLabel used -- that reads as costume. Ink is --foreground-secondary
 * (6.27:1 on paper) and never --foreground-muted, which is 3.33:1 and fails AA
 * at exactly the size it was being used at.
 */
export const MONO_LABEL =
  'font-mono text-meta font-medium uppercase tracking-[0.08em] text-foreground-secondary'

/** A machine value: id, hash, host, path, sequence number. --text-ui (12px). */
export const MONO_VALUE = 'font-mono text-ui font-[425] text-foreground-secondary'

/** The same, one step down, for a value sharing a row with a MONO_LABEL. */
export const MONO_META = 'font-mono text-meta font-[425] text-foreground-secondary'

/**
 * Section heading. text-display (32px) is the largest product token; the 36px
 * step above it is a marketing size and exists only here.
 */
export const SECTION_TITLE =
  'text-balance text-display font-medium leading-[1.12] tracking-[-0.024em] text-foreground md:text-[36px] md:leading-[1.08] md:tracking-[-0.028em]'

/** Section lede, directly under a section heading. --text-heading (16px/24px). */
export const SECTION_LEDE = 'mt-4 text-heading font-normal text-foreground-secondary'

/** Hairline card. No shadow. The border is the elevation. */
export const CARD = 'rounded-[4px] border border-border bg-surface'

/**
 * Focus ring: 2px of ink with a 2px gap in the ground colour, so it reads on
 * both #f7f7f5 and #ffffff. Ink rather than an accent hue -- --foreground on
 * --background is 19.2:1, and the old --ring #8a8783 was 3.33:1 on paper.
 */
export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/**
 * The only control heights on this page.
 *
 * sm/md/lg are --control-sm (32px), --control-lg (40px) and 44px. The 44px rung
 * exists for the hero CTAs at mobile, where WCAG 2.2 AAA target size applies to
 * the page's actual conversion path.
 */
export const CONTROL = {
  sm: 'h-8 px-3 text-ui',
  md: 'h-10 px-5 text-body',
  lg: 'h-11 px-5 text-answer',
} as const

/**
 * The outline control boundary.
 *
 * --border-strong (#c8c5bf) is 1.42:1 against paper and fails WCAG 2.2 SC
 * 1.4.11, which requires 3:1 for the visual boundary of a user-interface
 * component. Mixing --foreground into --background at 55% lands at roughly
 * 3.2:1 and introduces no hue: it is the ink and the paper the page already
 * has. Hairlines between rows keep --border, because a row rule is decorative
 * grouping rather than a control boundary.
 */
export const CONTROL_EDGE =
  'border-[color-mix(in_oklab,var(--foreground)_55%,var(--background))]'
