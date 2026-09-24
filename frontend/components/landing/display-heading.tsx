import type { ElementType, ReactNode } from 'react'
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
  className?: string
}

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
  className,
}: DisplayHeadingProps) {
  return (
    <Tag
      id={id}
      className={cn(scale === 'hero' ? 'ae-display' : 'ae-h2', align === 'center' && 'mx-auto text-center', className)}
    >
      {lead}
      {scale === 'hero' ? <br /> : ' '}
      <span className="soft">{turn}</span>
    </Tag>
  )
}
