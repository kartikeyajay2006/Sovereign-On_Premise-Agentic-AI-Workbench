import type { CSSProperties, ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface DisplayHeadingProps {
  /** The claim, in full ink. */
  lead: ReactNode
  /** The continuation, receded to grey. */
  turn: ReactNode
  as?: ElementType
  id?: string
  /** Hero scale steps up one notch above section scale. */
  scale?: 'hero' | 'section'
  align?: 'start' | 'center'
  /**
   * Set the words in one at a time as the page loads, each coming into
   * focus. The claim goes word by word; the continuation arrives whole, so
   * its gradient runs across it as one.
   */
  reveal?: boolean
  className?: string
}

const at = (n: number) => ({ '--i': n }) as CSSProperties

/**
 * A headline in two tones of one typeface: the claim in full ink, its
 * continuation receded to grey. One family, one weight, one size -- the
 * sentence's own structure carries the emphasis, so nothing decorative has
 * to. In the hero the continuation takes its own line.
 */
export function DisplayHeading({
  lead,
  turn,
  as: Tag = 'h2',
  id,
  scale = 'section',
  align = 'start',
  reveal = false,
  className,
}: DisplayHeadingProps) {
  const words = reveal && typeof lead === 'string' ? lead.split(' ') : null
  return (
    <Tag
      id={id}
      className={cn(scale === 'hero' ? 'ae-display' : 'ae-h2', align === 'center' && 'mx-auto text-center', className)}
    >
      {words
        ? words.map((word, n) => (
            <span key={n}>
              <span className="ae-w" style={at(n)}>
                {word}
              </span>
              {n < words.length - 1 ? ' ' : null}
            </span>
          ))
        : lead}
      {scale === 'hero' ? <br /> : ' '}
      <span className={cn('soft', words && 'ae-w')} style={words ? at(words.length + 1) : undefined}>
        {turn}
      </span>
    </Tag>
  )
}
