'use client'

import { useId } from 'react'

import { cn } from '@/lib/utils'

interface AegisLogoProps {
  className?: string
  size?: number
  /**
   * mark     the shield alone
   * glyph    the same, for a tile or ground drawn by the caller
   * compact  the shield and the name
   * full     the shield, the name and the product line
   */
  variant?: 'mark' | 'glyph' | 'compact' | 'full'
  /** color: the signal gradient. mono: one flat tone in the text colour. */
  tone?: 'color' | 'mono'
  iconClassName?: string
}

/** The signal orange: where the brand gradient starts, and the accent it keeps in the product. */
export const SIGNAL = '#ff5b1a'

/** The brand gradient, left to right: signal orange, ember pink, proof violet. */
export const BRAND_GRADIENT = ['#ff6a1a', '#ff2d6f', '#7c4dff'] as const

/*
 * The AEGIS mark: a shield with an upward chevron cut through it, and a seal
 * dot where the chevron's crossbar would be.
 *
 * The shield is the name. The chevron is the A, and the direction every run
 * takes: evidence at the base, a checked answer at the apex. The dot is the
 * seal -- the hash that closes the record. Both are cut out of the shield
 * with a mask rather than painted over it, so the mark reads on paper, on
 * night and on any tile a caller draws, at 16px and at 160.
 */
const SHIELD =
  'M12 1.6C14.9 2.9 17.7 3.7 20.6 4.1V11.2C20.6 16.3 17.2 20.4 12 22.4C6.8 20.4 3.4 16.3 3.4 11.2V4.1C6.3 3.7 9.1 2.9 12 1.6Z'
const CHEVRON = 'M7.7 16.4 12 6.7l4.3 9.7'

export function AegisMark({
  size = 24,
  className,
  tone = 'color',
}: {
  size?: number
  className?: string
  tone?: 'color' | 'mono'
}) {
  const id = useId().replace(/:/g, '')
  const mask = `aegis-cut-${id}`
  const fill = `aegis-fill-${id}`

  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={cn('shrink-0', className)}>
      <defs>
        <linearGradient id={fill} x1="3.4" y1="1.6" x2="20.6" y2="22.4" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={BRAND_GRADIENT[0]} />
          <stop offset="0.52" stopColor={BRAND_GRADIENT[1]} />
          <stop offset="1" stopColor={BRAND_GRADIENT[2]} />
        </linearGradient>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="#fff" />
          <path d={CHEVRON} fill="none" stroke="#000" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="13.6" r="1.05" fill="#000" />
        </mask>
      </defs>
      <path d={SHIELD} mask={`url(#${mask})`} fill={tone === 'mono' ? 'currentColor' : `url(#${fill})`} />
    </svg>
  )
}

export function AegisLogo({ className, size = 32, variant = 'full', tone = 'color', iconClassName }: AegisLogoProps) {
  const icon = <AegisMark size={size} tone={tone} className={cn(variant !== 'glyph' && 'text-foreground', iconClassName)} />

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
