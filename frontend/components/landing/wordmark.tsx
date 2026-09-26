import { AegisMark } from '@/components/aegis-logo'
import { cn } from '@/lib/utils'

/**
 * The mark and the name, one way, everywhere on the public pages: the lock
 * at 24px and AEGIS set a little wide and tracked open, as a name in capitals
 * wants.
 *
 * The brackets take the text colour and the seal takes the mark's core
 * colour, so it reads on night and paper alike. `intro` plays the lock-on
 * once; the header uses it, nothing else should.
 */
export function Wordmark({ className, intro = false }: { className?: string; tone?: 'color' | 'mono'; intro?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-foreground', className)}>
      <AegisMark size={24} intro={intro} />
      <span className="text-[1.02rem] font-semibold tracking-[0.14em] [font-stretch:112%]">AEGIS</span>
    </span>
  )
}
