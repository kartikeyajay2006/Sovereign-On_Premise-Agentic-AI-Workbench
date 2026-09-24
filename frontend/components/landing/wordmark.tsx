import { AegisMark } from '@/components/aegis-logo'
import { cn } from '@/lib/utils'

/**
 * The mark and the name, one way, everywhere on the public pages: the split
 * shield at 24px, on the grid it is drawn on, and AEGIS in Geist, tracked
 * open a little as a name set in capitals wants.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-foreground', className)}>
      <AegisMark size={24} />
      <span className="text-[1.02rem] font-semibold tracking-[0.03em]">AEGIS</span>
    </span>
  )
}
