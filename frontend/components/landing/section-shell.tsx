import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { DisplayHeading } from './display-heading'
import { Reveal } from './reveal'
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
  /**
   * How much air the block gets, chosen by how much it carries.
   *
   * Uniform padding is not rhythm. Every section paid the same 96px top and
   * bottom, so a block with 324px of content spent more height on its own
   * title than on its substance, and the page read as padded emptiness. The
   * fix is proportion: a thin block is held tight so its content does not
   * float, a block carrying a full product surface is given room.
   *
   * Measured at 1440px before the change: premise 324px of content inside
   * 790px (41%), run 426/892 (48%), run-it 363/745 (49%) -- against proof at
   * 1208/1700 (71%), which was the only section whose air was earned.
   */
  density?: 'tight' | 'default' | 'full'
  children: ReactNode
  className?: string
}

const DENSITY = {
  tight: 'py-12 md:py-14 lg:py-[68px]',
  default: 'py-14 md:py-18 lg:py-[88px]',
  full: 'py-16 md:py-24 lg:py-[120px]',
} as const

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
  density = 'default',
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
        'scroll-mt-16',
        DENSITY[density],
        tone === 'surface' && 'border-y border-border bg-surface',
        className,
      )}
    >
      <div className={SHELL}>
        {/*
          The section's entrance: the heading group settles first, and each
          block of content under it carries its own Reveal one stagger step
          behind. Visible from first paint either way -- see reveal.tsx.
        */}
        <Reveal>
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
              className="mt-6"
            />
          ) : (
            <h2 id={headingId} className={cn(SECTION_TITLE, 'mt-6 max-w-[22ch]')}>
              {title}
            </h2>
          )}
          {lede ? <p className={cn(SECTION_LEDE, PROSE)}>{lede}</p> : null}
        </Reveal>

        <div className="mt-8 md:mt-10">{children}</div>
      </div>
    </section>
  )
}
