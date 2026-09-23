import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { DisplayHeading } from './display-heading'
import { RevealSection } from './reveal-section'

export interface SectionShellProps {
  /** Anchor target. Matches the header nav hrefs where one exists. */
  id: string
  /** Kept for the copy's structure; the page no longer prints ordinals. */
  index?: string
  /** A short label above the heading, in plain sans. */
  eyebrow: string
  /** The claim. */
  title: ReactNode
  /**
   * The continuation, in grey. Optional, so a section without a natural
   * turn keeps a single line rather than having one invented for it.
   */
  titleTurn?: ReactNode
  /** Optional single paragraph under the heading. */
  lede?: ReactNode
  /** A faintly tinted band, for a section that holds a working surface. */
  tone?: 'paper' | 'surface'
  /** How much air the block gets, chosen by how much it carries. */
  density?: 'tight' | 'default' | 'full'
  children: ReactNode
  className?: string
}

const DENSITY = {
  tight: 'py-16 md:py-20',
  default: 'py-20 md:py-28',
  full: 'py-20 md:py-32',
} as const

/**
 * Every section of the public page: a short label, a two-tone headline, one
 * line of lede, then the content, settling in once as the reader reaches
 * it. Left-aligned and generously spaced; the space does the separating, so
 * there are no rules between sections.
 */
export function SectionShell({
  id,
  eyebrow,
  title,
  titleTurn,
  lede,
  tone = 'paper',
  density = 'default',
  children,
  className,
}: SectionShellProps) {
  const headingId = `${id}-title`

  return (
    <RevealSection
      id={id}
      aria-labelledby={headingId}
      // scroll-mt clears the sticky header when an anchor is followed.
      className={cn(
        'scroll-mt-16',
        tone === 'surface' && 'bg-[color-mix(in_oklab,var(--foreground)_2.5%,var(--background))]',
        className,
      )}
    >
      <div className={cn('ae-shell', DENSITY[density])}>
        <div className="ae-reveal max-w-[760px]">
          <p className="ae-kicker m-0">{eyebrow}</p>
          {titleTurn ? (
            <DisplayHeading id={headingId} as="h2" lead={title} turn={titleTurn} className="mt-3" />
          ) : (
            <h2 id={headingId} className="ae-h2 mt-3">
              {title}
            </h2>
          )}
          {lede ? <p className="ae-lead mt-5 max-w-[62ch]">{lede}</p> : null}
        </div>

        <div className="mt-12 md:mt-14">{children}</div>
      </div>
    </RevealSection>
  )
}
