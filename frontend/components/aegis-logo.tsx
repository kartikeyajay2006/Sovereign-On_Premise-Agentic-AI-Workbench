import { cn } from '@/lib/utils'

interface AegisLogoProps {
  className?: string
  size?: number
  /**
   * mark     the badge alone: an ink tile with the glyph knocked out of it
   * glyph    the glyph alone, in currentColor, for a tile drawn by the caller
   * compact  the badge and the name
   * full     the badge, the name and the product line
   */
  variant?: 'mark' | 'glyph' | 'compact' | 'full'
  iconClassName?: string
}

/**
 * The AEGIS mark: a Λ with one point beneath its apex.
 *
 * The A of the name with its crossbar taken out, and in its place a single
 * point -- one recorded fact, where a bar would have been drawn. It is a
 * stroke, not a shape, so it stays two clean lines and a dot at 16px, and it
 * sits on an ink tile with generous corners so the mark reads as the
 * product's icon wherever it appears: the header, the sign-in, the tab.
 *
 * The glyph is drawn in the page's own ground colour on the tile, not cut
 * out of it, so no mask id has to be unique per instance.
 */
function Glyph({ ink }: { ink: string }) {
  return (
    <>
      <path d="M6.6 17.4 12 6.6l5.4 10.8" stroke={ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="12" cy="15.1" r="1.5" fill={ink} />
    </>
  )
}

export function AegisLogo({ className, size = 32, variant = 'full', iconClassName }: AegisLogoProps) {
  const icon =
    variant === 'glyph' ? (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={cn('shrink-0', iconClassName)}>
        <Glyph ink="currentColor" />
      </svg>
    ) : (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={cn('shrink-0 text-foreground', iconClassName)}>
        <rect x="0.5" y="0.5" width="23" height="23" rx="6.5" fill="currentColor" />
        <Glyph ink="var(--background)" />
      </svg>
    )

  if (variant === 'mark' || variant === 'glyph') return <span className={cn('inline-flex', className)}>{icon}</span>

  return (
    <div className={cn('inline-flex select-none items-center gap-2.5', className)}>
      {icon}
      <div className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">AEGIS</span>
        {variant === 'full' && <span className="mt-[3px] text-[11px] text-foreground-muted">Agentic workbench</span>}
      </div>
    </div>
  )
}
