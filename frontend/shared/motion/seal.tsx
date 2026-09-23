'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * SEAL: a hash committing.
 *
 * The hash is on screen, whole and legible, before and throughout: what
 * moves is a rule drawn beneath it, left to right, over --dur-seal. That
 * is the one 640ms motion in the product, because a seal is a commitment
 * made across a body of content and the line crossing the whole value is
 * the picture of that. When the rule completes, a small filled mark seats
 * at the end of it: filled, because in this interface a filled glyph
 * means "actively confirmed" (it is VERIFIED's glyph too).
 *
 * No character is ever scrambled, typed on or decoded. An animation that
 * cycled random hex before settling would put characters on screen that
 * are not the hash, in the one place a reader may be comparing it by eye.
 *
 * Unsealed is drawn rather than omitted: a dashed rule says "not
 * committed", which is a different fact from there being nothing here.
 *
 * It draws when `sealed` becomes true after mount, or when `token` (the
 * hash itself, usually) changes while sealed. A value that was already
 * sealed when the screen opened is shown sealed, without the ceremony:
 * it was read, not committed just now.
 */
export function Seal({
  sealed,
  token,
  tone = 'sovereign',
  mark = true,
  srLabel,
  className,
  children,
}: {
  sealed: boolean
  token?: string | number | null
  /** Critical for a seal that was checked and broke; ink for a neutral one. */
  tone?: 'sovereign' | 'critical' | 'ink'
  mark?: boolean
  /** What the seal means, for a screen reader: "chain head, verified". */
  srLabel?: string
  className?: string
  children: ReactNode
}) {
  const [seen, setSeen] = useState({ sealed, token })
  const [draws, setDraws] = useState(0)

  if (seen.sealed !== sealed || seen.token !== token) {
    setSeen({ sealed, token })
    if (sealed) setDraws((n) => n + 1)
  }

  const toneValue =
    tone === 'critical' ? 'var(--critical)' : tone === 'ink' ? 'var(--foreground)' : undefined

  return (
    <span
      className={cn('aegis-seal', className)}
      data-sealed={sealed ? 'true' : 'false'}
      data-draw={draws > 0 ? '' : undefined}
      style={toneValue ? ({ '--seal-tone': toneValue } as CSSProperties) : undefined}
    >
      {children}
      {srLabel && <span className="sr-only">{srLabel}</span>}
      <span key={`rule-${draws}`} aria-hidden className="aegis-seal-rule" />
      {sealed && mark && (
        <span key={`mark-${draws}`} aria-hidden className="aegis-seal-mark">
          ■
        </span>
      )}
    </span>
  )
}
