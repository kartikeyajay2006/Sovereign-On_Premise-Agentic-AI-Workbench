import { cn } from '@/lib/utils'

interface AegisLogoProps {
  className?: string
  size?: number
  /**
   * mark     the shield alone, in the text colour
   * glyph    the same, for a tile or ground drawn by the caller
   * compact  the shield and the name
   * full     the shield, the name and the product line
   */
  variant?: 'mark' | 'glyph' | 'compact' | 'full'
  iconClassName?: string
}

/** The signal orange: the one colour the brand adds to ink and paper. */
export const SIGNAL = '#ff5b1a'

/**
 * The AEGIS mark: a shield split down the middle, with a slit of signal
 * light in the gap.
 *
 * The shield is the name; the gap is the product -- the model, the search
 * and the record on one side of a line that nothing crosses unmeasured. Two
 * solid halves rather than an outline, so it holds its shape at 16px, drawn
 * in currentColor so it is ink on paper and white on night without a
 * second asset.
 */
export function AegisMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={cn('shrink-0', className)}>
      <path d="M11 1.9 3.2 4.3v6.9c0 5.1 3.3 9.3 7.8 11V1.9Z" fill="currentColor" />
      <path d="M13 1.9l7.8 2.4v6.9c0 5.1-3.3 9.3-7.8 11V1.9Z" fill="currentColor" />
      <rect x="11.45" y="6.2" width="1.1" height="10.6" rx="0.55" fill={SIGNAL} />
    </svg>
  )
}

export function AegisLogo({ className, size = 32, variant = 'full', iconClassName }: AegisLogoProps) {
  const icon = <AegisMark size={size} className={cn(variant !== 'glyph' && 'text-foreground', iconClassName)} />

  if (variant === 'mark' || variant === 'glyph') return <span className={cn('inline-flex', className)}>{icon}</span>

  return (
    <div className={cn('inline-flex select-none items-center gap-2.5', className)}>
      {icon}
      <div className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-[0.02em] text-foreground">AEGIS</span>
        {variant === 'full' && <span className="mt-[3px] text-[11px] text-foreground-muted">Agentic workbench</span>}
      </div>
    </div>
  )
}
