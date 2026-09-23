import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A key, as printed on a keyboard. A 1px control-edge ring rather than a
 * border, so a row of them does not grow by a pixel when one is added.
 */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-4 min-w-4 items-center justify-center rounded-[var(--radius-xs)] px-1',
        'font-mono text-ledger leading-none text-foreground-secondary',
        'shadow-[0_0_0_1px_var(--control-subtle)]',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
