import { AegisMark } from '@/components/aegis-logo'
import { cn } from '@/lib/utils'

/**
 * The mark and the name, one way, everywhere on the public pages: the block
 * shield, and AEGIS in the mono face, spaced like a label on an instrument.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <AegisMark size={26} />
      <span className="font-mono text-[0.98rem] font-semibold tracking-[0.16em] text-foreground">AEGIS</span>
    </span>
  )
}
