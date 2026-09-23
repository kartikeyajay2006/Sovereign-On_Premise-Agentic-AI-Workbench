'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'
import type { MotionTag } from './appear'

/**
 * APPEND: a record joining the chain.
 *
 * A row the backend wrote while the reader was watching arrives lit and
 * cools: it settles 4px into place at full opacity while a wash and a 2px
 * rule in its tone fade out behind it over the afterglow. A reader who
 * glances back a second later can still tell which row is new.
 *
 * The distinction that matters is between a row that was APPENDED and a
 * row that was READ. Opening a run with forty evidence items is a read:
 * nothing happened just now, and forty rows sliding in would claim
 * something did. So a row animates only if it mounts after its list was
 * already on screen, and <AppendScope> is what knows when that was. A row
 * outside any scope never animates, which is the safe default.
 */

export type AppendTone = 'neutral' | 'sovereign' | 'active' | 'approval' | 'critical'

interface Scope {
  /** Flips to true once the scope has painted. Read, never rendered. */
  live: MutableRefObject<boolean>
  /** A burst too large to animate row by row. */
  bulk: MutableRefObject<boolean>
}

const AppendContext = createContext<Scope | null>(null)

export function AppendScope({
  children,
  bulk = false,
}: {
  children: ReactNode
  /**
   * Set while a batch is too large to animate -- the evidence ledger's
   * own rule is more than sixty rows in one event. Rows that mount while
   * it is set land still; the count above them still moves.
   */
  bulk?: boolean
}) {
  const live = useRef(false)
  const bulkRef = useRef(bulk)
  // Assigned during render on purpose: rows mounting in this same render
  // must see this render's value, and an effect would run after them.
  // Idempotent, so a repeated render in development changes nothing.
  bulkRef.current = bulk

  useEffect(() => {
    live.current = true
  }, [])

  // One object for the scope's lifetime. Its fields are refs, so a change
  // to either never re-renders the rows under it.
  const [scope] = useState<Scope>(() => ({ live, bulk: bulkRef }))
  return <AppendContext.Provider value={scope}>{children}</AppendContext.Provider>
}

export interface AppendProps extends HTMLAttributes<HTMLElement> {
  as?: MotionTag
  /**
   * The row's position within the batch that arrived with it, not within
   * the whole list: the stagger is between rows that arrived together.
   */
  index?: number
  /** The state the row reports. Neutral for a plain record. */
  tone?: AppendTone
  children: ReactNode
}

export function Append({
  as: Tag = 'div',
  index = 0,
  tone = 'neutral',
  className,
  style,
  children,
  ...rest
}: AppendProps) {
  const scope = useContext(AppendContext)
  // Decided once, at this row's own mount, and never revisited: a row
  // does not become "new" again because its list re-rendered.
  const [appended] = useState(() => Boolean(scope && scope.live.current && !scope.bulk.current))

  return (
    <Tag
      {...rest}
      className={cn(appended && 'aegis-append', className)}
      data-tone={appended && tone !== 'neutral' ? tone : undefined}
      style={appended ? ({ '--append-i': index, ...style } as CSSProperties) : style}
    >
      {children}
    </Tag>
  )
}
