import { AegisLogo } from '@/components/aegis-logo'
import { cn } from '@/lib/utils'

/**
 * The mark and the name, one way, everywhere on this page.
 *
 * The header drew the mark at 26px beside text-answer and the footer at 24px
 * beside text-body: two sizes of the same logo a scroll apart. It is 24 in
 * both now because the mark is drawn on a 24-unit grid, so at 24px every
 * edge of the shield and of its three slots lands where it was drawn rather
 * than being resampled between pixels.
 *
 * The name is Geist Sans rather than AegisLogo's own `full` variant, whose
 * mono sub-line is too small to read at header size. The mark is what is
 * reused, as it is.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <AegisLogo variant="mark" size={26} />
      <span className="text-[1.02rem] font-semibold tracking-[-0.02em] text-foreground">AEGIS</span>
    </span>
  )
}
