import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { DisplayHeading } from './display-heading'
import { MONO_LABEL, MONO_META, PROSE, SECTION_LEDE, SECTION_TITLE, SHELL } from './tokens'

export interface SectionShellProps {
  /** Anchor target. Matches the header nav hrefs where one exists. */
  id: string
  /** Two-digit ordinal shown at the right of the eyebrow row. */
  index: string
  /** Uppercase mono eyebrow. Two to four words. */
  eyebrow: string
  /** The `h2`, first line: sans, full ink. */
  title: ReactNode
  /**
   * The second line, set serif italic and receded.
   *
   * Optional, so a section without a natural turn keeps a single sans line
   * rather than having one invented for it. Splitting a heading that does
   * not want to be split is worse than not splitting it.
   */
  titleTurn?: ReactNode
  /** Optional single paragraph under the heading. */
  lede?: ReactNode
  /** Paints the block on --surface instead of --background, with hairlines. */
  tone?: 'paper' | 'surface'
  children: ReactNode
  className?: string
}

/**
 * Every block from 02 to 07 is wrapped in this. It owns the index, the eyebrow,
 * the heading, the lede and the vertical padding, so no section invents its own
 * rhythm and the page reads as one instrument rather than seven.
 */
export function SectionShell({
  id,
  index,
  eyebrow,
  title,
  titleTurn,
  lede,
  tone = 'paper',
  children,
  className,
}: SectionShellProps) {
  const headingId = `${id}-title`

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      // scroll-mt clears the sticky header when an anchor is followed.
      className={cn(
        'scroll-mt-16 py-14 md:py-20 lg:py-24',
        tone === 'surface' && 'border-y border-border bg-surface',
        className,
      )}
    >
      <div className={SHELL}>
        <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
          <span className={MONO_LABEL}>{eyebrow}</span>
          <span className={MONO_META}>{index}</span>
        </div>

        {titleTurn ? (
          <DisplayHeading
            id={headingId}
            as="h2"
            scale="section"
            lead={title}
            turn={titleTurn}
            className="mt-8"
          />
        ) : (
          <h2 id={headingId} className={cn(SECTION_TITLE, 'mt-8 max-w-[22ch]')}>
            {title}
          </h2>
        )}
        {lede ? <p className={cn(SECTION_LEDE, PROSE)}>{lede}</p> : null}

        <div className="mt-10 md:mt-12">{children}</div>
      </div>
    </section>
  )
}
