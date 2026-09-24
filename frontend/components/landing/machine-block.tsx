import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CARD, MONO_LABEL, MONO_META } from './tokens'

export interface MachineBlockProps {
  /** Uppercase mono label in the block's header bar. */
  label: string
  /** Optional right-aligned machine fact in the header bar, usually a path. */
  source?: string
  /** Pre-formatted content. Rendered inside `<pre>`; whitespace is preserved. */
  children: ReactNode
  /** Sentence under the block. Says what it proves AND what it does not. */
  caption?: ReactNode
  /** Wraps long lines instead of scrolling horizontally. */
  wrap?: boolean
  className?: string
}

/**
 * The mono artifact container.
 *
 * No syntax-highlighting library. Two colours and one weight: the excerpt is
 * themed from the page's own tokens rather than from a highlighter's palette,
 * and the minimal version of that is --foreground for the tokens that carry the
 * argument and --foreground-secondary for everything else.
 */
export function MachineBlock({
  label,
  source,
  children,
  caption,
  wrap = false,
  className,
}: MachineBlockProps) {
  return (
    <figure className={cn('m-0 flex flex-col', className)}>
      <div className={cn(CARD, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
        <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
          <span className={MONO_LABEL}>{label}</span>
          {source ? <span className={cn(MONO_META, 'truncate')}>{source}</span> : null}
        </div>
        {/*
          The <pre> owns its own horizontal scroll, so a long hash scrolls this
          block rather than the document.
        */}
        <pre
          className={cn(
            'm-0 flex-1 overflow-x-auto p-3 font-mono text-ui font-[425] leading-[20px] text-foreground-secondary',
            wrap && 'whitespace-pre-wrap break-words',
          )}
        >
          {children}
        </pre>
      </div>
      {caption ? (
        <figcaption className="mt-3 text-body text-foreground-secondary">{caption}</figcaption>
      ) : null}
    </figure>
  )
}

/** Lifts one token inside a MachineBlock to ink. Used to link a hash to its prev_hash. */
export function Hash({ children }: { children: ReactNode }) {
  return <span className="text-foreground">{children}</span>
}
