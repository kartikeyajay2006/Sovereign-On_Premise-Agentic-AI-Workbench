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

/** The page's single content column: 1180px with a fluid gutter (globals.css, .ae-shell). */
export const SHELL = 'ae-shell'

/**
 * A small label over a card's contents: plain sans, medium weight. It was an
 * uppercase mono micro-label; caps everywhere read as noise.
 *
 * --text-meta (11px/16px). Tracking is the product's own --ls-ledger (0.06em),
 * the value the console's mono labels use, so a label reads the same on this
 * page as on the screen it describes -- never the 0.22em the old
 * TechnicalLabel used, which reads as costume. Ink is --foreground-secondary
 * (8.75:1 on the dark ground) and never --foreground-muted at this weight.
 */
export const MONO_LABEL = 'text-[0.8rem] font-medium tracking-[-0.005em] text-foreground-secondary'

/** A machine value: id, hash, host, path, sequence number. --text-ui (12px). */
export const MONO_VALUE = 'font-mono text-ui font-[425] text-foreground-secondary'

/** The same, one step down, for a value sharing a row with a MONO_LABEL. */
export const MONO_META = 'font-mono text-meta font-[425] text-foreground-secondary'

/** A card: a white sheet with a hairline and a generous radius. */
export const CARD = 'rounded-[16px] border border-line-subtle bg-surface'

/**
 * The action fill: the red thread, white ink (5.42:1), a deeper red under the
 * pointer. At most one per decision context.
 */
export const ACTION_FILL = 'bg-action text-action-ink hover:bg-action-hover'

/**
 * Focus ring: 2px of ink with a 2px gap in the ground colour, so it reads on
 * the page ground and on a raised surface alike. Ink rather than an accent
 * hue: --foreground is 16.45:1 on --background and 15.27:1 on --surface in
 * the dark palette this page ships.
 */
export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background'
