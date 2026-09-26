'use client'

import { cn } from '@/lib/utils'

interface AegisLogoProps {
  className?: string
  size?: number
  /**
   * mark     the lock alone
   * glyph    the same, for a tile or ground drawn by the caller
   * compact  the lock and the name
   * full     the lock, the name and the product line
   */
  variant?: 'mark' | 'glyph' | 'compact' | 'full'
  /** color: the core in the action lime. mono: one flat tone in the text colour. */
  tone?: 'color' | 'mono'
  iconClassName?: string
  /** Play the lock-on once when the mark first draws (the landing's header and hero only). */
  intro?: boolean
}

/*
 * The AEGIS mark: the lock. Four corner brackets closing on a sealed square.
 *
 * The brackets are the ones Harness Control draws onto a passage when every
 * claim resting on it is supported, so the mark and the product say
 * "checked" the same way. The square is the seal. The brackets take the text
 * colour; the core takes --mark-core, lime at night and a deep olive by day,
 * where lime on paper would not read.
 *
 * Drawn on a 48-unit grid. The stroke is set so it renders about 1.25px at
 * sidebar and tab sizes and thins towards 3px at hero size, which keeps the
 * corners crisp at 16px without turning heavy at 96.
 */
const BRACKETS = 'M6 16V6H16M32 6H42V16M42 32V42H32M16 42H6V32'

export function AegisMark({
  size = 24,
  className,
  tone = 'color',
  intro = false,
}: {
  size?: number
  className?: string
  tone?: 'color' | 'mono'
  intro?: boolean
}) {
  const stroke = (Math.max(1.25, size / 32) * 48) / size
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden
      className={cn('shrink-0', intro && 'hv-mark-intro', className)}
    >
      <path className="hv-mark-brackets" d={BRACKETS} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="square" />
      <rect className="hv-mark-core" x="16" y="16" width="16" height="16" fill={tone === 'mono' ? 'currentColor' : 'var(--mark-core, #d4f24a)'} />
    </svg>
  )
}

export function AegisLogo({ className, size = 32, variant = 'full', tone = 'color', iconClassName, intro }: AegisLogoProps) {
  const icon = <AegisMark size={size} tone={tone} intro={intro} className={cn(variant !== 'glyph' && 'text-foreground', iconClassName)} />

  if (variant === 'mark' || variant === 'glyph') return <span className={cn('inline-flex', className)}>{icon}</span>

  return (
    <div className={cn('inline-flex select-none items-center gap-2.5', className)}>
      {icon}
      <div className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-[0.14em] [font-stretch:112%] text-foreground">AEGIS</span>
        {variant === 'full' && <span className="mt-[3px] text-[11px] text-foreground-muted">Agentic workbench</span>}
      </div>
    </div>
  )
}
