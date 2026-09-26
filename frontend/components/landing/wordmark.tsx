import { AegisMark } from '@/components/aegis-logo'
import { cn } from '@/lib/utils'

/**
 * The mark and the name, one way, everywhere on the public pages: the shield
 * at 24px and AEGIS tracked open a little, as a name set in capitals wants.
 *
 * `tone="mono"` draws the shield in one flat colour, the text colour of the
 * mark's own span, which the public page sets to its hi-vis lime. The default
 * keeps the gradient, for surfaces that have not moved to Hi-Vis yet.
 */
export function Wordmark({ className, tone = 'color' }: { className?: string; tone?: 'color' | 'mono' }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-foreground', className)}>
      <AegisMark size={24} tone={tone} className={tone === 'mono' ? 'lp-mark' : undefined} />
      <span className="text-[1.02rem] font-semibold tracking-[0.03em]">AEGIS</span>
    </span>
  )
}
