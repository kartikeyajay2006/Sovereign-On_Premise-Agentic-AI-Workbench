import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface DisplayHeadingProps {
  /** The first line: sans, heavier, full ink. The claim. */
  lead: ReactNode
  /** The second line: serif italic, lighter, receded. The turn. */
  turn: ReactNode
  as?: ElementType
  id?: string
  /** Hero scale steps up one notch above section scale. */
  scale?: 'hero' | 'section'
  align?: 'start' | 'center'
  className?: string
}

/**
 * A two-tone display heading.
 *
 * The first line is sans at weight 590 in full ink; the second is a serif
 * italic at 400, receded to --foreground-secondary. Two typefaces, two
 * weights and two lightnesses in one heading.
 *
 * This is lifted from the pattern the best pages in this category use — a
 * bold sans claim followed by an italic serif turn, at the same size, on the
 * same baseline grid. It is the cheapest character a page can buy: it costs
 * one system font and no bytes over the wire, and it makes a headline read
 * as written rather than generated.
 *
 * Why it works here specifically: this product's whole argument is a turn.
 * "Local is not enough" / "so the workbench proves the rest." The typography
 * performs the sentence's own structure — the claim in the voice of the
 * system, the qualification in a human one.
 *
 * The serif is a system stack, never a webfont. An air-gapped product must
 * not have a build step that reaches for a font server.
 */
export function DisplayHeading({
  lead,
  turn,
  as: Tag = 'h2',
  id,
  scale = 'section',
  align = 'start',
  className,
}: DisplayHeadingProps) {
  const size =
    scale === 'hero'
      ? 'text-[40px] leading-[0.98] tracking-[-0.03em] md:text-[56px] lg:text-[68px] lg:tracking-[-0.032em]'
      : 'text-[30px] leading-[1.02] tracking-[-0.024em] md:text-[40px] lg:text-[48px] lg:tracking-[-0.026em]'

  return (
    <Tag
      id={id}
      className={cn(
        'max-w-[19ch] font-medium text-balance',
        size,
        align === 'center' && 'mx-auto max-w-[22ch] text-center',
        className,
      )}
    >
      <span className="block font-sans font-[590] text-foreground">{lead}</span>
      {/*
        The optical size difference between a sans and a serif at the same
        nominal px is real: the serif reads slightly smaller, so it is nudged
        up a touch and its tracking loosened, because tight negative tracking
        that flatters a grotesque closes up an italic serif.
      */}
      <span
        className="block font-normal italic text-foreground-secondary"
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '1.06em',
          letterSpacing: '-0.012em',
        }}
      >
        {turn}
      </span>
    </Tag>
  )
}
