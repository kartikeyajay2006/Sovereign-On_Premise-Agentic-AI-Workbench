import { cn } from '@/lib/utils'

interface AegisLogoProps {
  className?: string
  size?: number
  /**
   * mark     the shield alone
   * glyph    the shield in one colour, currentColor, for a surface that sets it
   * compact  the shield and the name
   * full     the shield, the name and the product line
   */
  variant?: 'mark' | 'glyph' | 'compact' | 'full'
  iconClassName?: string
}

/**
 * The AEGIS mark: a shield built from five stacked blocks.
 *
 * A record on the audit chain is a block that carries the hash of the one
 * before it. Stacked, narrowing to a point, the blocks are the shield: the
 * protection is the record. Each block takes one hue of the palette, top to
 * bottom -- mauve, pink, flamingo, peach, yellow -- so the mark is the
 * brand's colours in the order the chain is written.
 *
 * Drawn on a 32-unit grid with every edge on a half unit, so the gaps still
 * read at 16px. No gradient and no ids: five filled rectangles whose colours
 * are CSS variables, so any number of marks render on one page and each
 * takes the theme it sits in.
 */
const BLOCKS = [
  { x: 3.5, y: 2.5, w: 25, fill: 'var(--brand-1)' },
  { x: 3.5, y: 8.5, w: 25, fill: 'var(--brand-2)' },
  { x: 5.5, y: 14.5, w: 21, fill: 'var(--brand-3)' },
  { x: 9, y: 20.5, w: 14, fill: 'var(--brand-4)' },
  { x: 13, y: 26.5, w: 6, fill: 'var(--brand-5)' },
] as const

export function AegisMark({ size = 32, mono = false, className }: { size?: number; mono?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden className={cn('shrink-0', className)}>
      {BLOCKS.map((block) => (
        <rect
          key={block.y}
          x={block.x}
          y={block.y}
          width={block.w}
          height={4.5}
          rx={1.4}
          style={{ fill: mono ? 'currentColor' : block.fill }}
        />
      ))}
    </svg>
  )
}

export function AegisLogo({ className, size = 32, variant = 'full', iconClassName }: AegisLogoProps) {
  const icon = <AegisMark size={size} mono={variant === 'glyph'} className={iconClassName} />

  if (variant === 'mark' || variant === 'glyph') return <span className={cn('inline-flex', className)}>{icon}</span>

  return (
    <div className={cn('inline-flex select-none items-center gap-2.5', className)}>
      {icon}
      <div className="flex flex-col leading-none">
        <span className="font-mono text-[15px] font-semibold tracking-[0.14em] text-foreground">AEGIS</span>
        {variant === 'full' && <span className="mt-[4px] font-mono text-[10px] tracking-[0.04em] text-foreground-muted">sovereign workbench</span>}
      </div>
    </div>
  )
}
