import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { DisplayHeading } from './display-heading'
import { RevealSection } from './reveal-section'

export interface SectionShellProps {
  /** Anchor target. Matches the header nav hrefs where one exists. */
  id: string
  /** The section's number, set large beside its heading: "02". */
  index?: string
  /** A short label under the number. */
  eyebrow: string
  /** The claim. */
  title: ReactNode
  /**
   * The continuation, in grey, on its own line. Optional, so a section
   * without a natural turn keeps a single line rather than having one
   * invented for it.
   */
  titleTurn?: ReactNode
  /** Optional single paragraph under the heading. */
  lede?: ReactNode
  /**
   * The ground. `surface` is a faintly tinted band for a working surface;
   * `night` takes the dark palette whatever the page's theme, on the
   * drafting grid, for the section the page most wants read closely.
   */
  tone?: 'paper' | 'surface' | 'night'
  /** A faint drafting grid behind the content, fading out at its edges. */
  texture?: 'grid'
  /** How much air the block gets, chosen by how much it carries. */
  density?: 'tight' | 'default' | 'full'
  children: ReactNode
  className?: string
}

const DENSITY = {
  tight: 'pb-16 pt-14 md:pb-20 md:pt-16',
  default: 'pb-20 pt-14 md:pb-28 md:pt-20',
  full: 'pb-20 pt-14 md:pb-32 md:pt-20',
} as const

/**
 * The construction rule a section starts on: a hairline between the page's
 * two guide lines, with a cross where it meets each.
 */
export function SectionRule() {
  return (
    <div aria-hidden className="ae-shell">
      <div className="ae-sec-rule" />
    </div>
  )
}

/**
 * A section's head, drawn like a sheet's title block: the number set large
 * and its label in the left column, the heading and its one line of lede in
 * the right. Stacked on narrow screens.
 */
export function SectionHead({
  id,
  index,
  eyebrow,
  title,
  titleTurn,
  lede,
  className,
}: {
  id: string
  index?: string
  eyebrow: string
  title: ReactNode
  titleTurn?: ReactNode
  lede?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('ae-sec-head ae-reveal', className)}>
      <p className="ae-sec-label">
        {index ? <span className="ix">{index}</span> : null}
        <span>{eyebrow}</span>
      </p>
      <div className="ae-sec-copy">
        {titleTurn ? (
          <DisplayHeading id={id} as="h2" lead={title} turn={titleTurn} />
        ) : (
          <h2 id={id} className="ae-h2">
            {title}
          </h2>
        )}
        {lede ? <p className="ae-lead mt-5 max-w-[62ch]">{lede}</p> : null}
      </div>
    </div>
  )
}

/**
 * Every section of the public page: a construction rule, the title block,
 * then the content, settling in once as the reader reaches it.
 */
export function SectionShell({
  id,
  eyebrow,
  title,
  titleTurn,
  lede,
  index,
  tone = 'paper',
  texture,
  density = 'default',
  children,
  className,
}: SectionShellProps) {
  return (
    <RevealSection
      id={id}
      aria-labelledby={`${id}-title`}
      data-theme={tone === 'night' ? 'dark' : undefined}
      // The landing header reads this to take the night palette over it.
      data-band={tone === 'night' ? '' : undefined}
      className={cn(
        // scroll-mt clears the sticky header when an anchor is followed.
        'scroll-mt-16',
        tone === 'surface' && 'bg-[color-mix(in_oklab,var(--foreground)_2.5%,var(--background))]',
        tone === 'night' && 'ae-night',
        texture === 'grid' && 'ae-gridded',
        className,
      )}
    >
      <SectionRule />
      <div className={cn('ae-shell', DENSITY[density])}>
        <SectionHead id={`${id}-title`} index={index} eyebrow={eyebrow} title={title} titleTurn={titleTurn} lede={lede} />
        <div className="mt-12 md:mt-14">{children}</div>
      </div>
    </RevealSection>
  )
}
