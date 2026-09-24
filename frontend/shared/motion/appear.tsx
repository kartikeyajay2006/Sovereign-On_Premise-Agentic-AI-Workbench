import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** The block elements a motion wrapper may render as. */
export type MotionTag = 'div' | 'section' | 'article' | 'aside' | 'header' | 'li' | 'p' | 'span'

export interface AppearProps extends HTMLAttributes<HTMLElement> {
  as?: MotionTag
  /**
   * Position in a group that arrives together, for the capped stagger.
   * A step, not milliseconds: --stagger apart, and nothing past
   * --stagger-cap waits any longer, so a group of forty resolves as fast
   * as a group of six.
   */
  step?: number
  /** How far it travels. `sm` is 4px, for rows; `md` is 8px, for blocks. */
  distance?: 'sm' | 'md'
  children: ReactNode
}

/**
 * APPEAR: a block arriving in place.
 *
 * It mounts moving and fully opaque. The difference from the landing
 * page's Reveal is the trigger: Reveal adds its lift when an observer says
 * the block scrolled into view, and this plays on mount, because in the app
 * a block mounts when its data arrived and that arrival is the event.
 *
 * Nothing here starts transparent, so a block whose animation never runs
 * -- reduced motion, a throttled tab, a print -- is simply there.
 *
 * To play it again for new data, give it a new `key`.
 *
 * No hooks, so it works in a Server Component as well as a client one.
 */
export function Appear({
  as: Tag = 'div',
  step = 0,
  distance = 'md',
  className,
  style,
  children,
  ...rest
}: AppearProps) {
  return (
    <Tag
      {...rest}
      className={cn('aegis-appear', className)}
      style={
        {
          '--appear-i': step,
          '--rise': distance === 'sm' ? 'var(--shift-sm)' : 'var(--shift-md)',
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </Tag>
  )
}
