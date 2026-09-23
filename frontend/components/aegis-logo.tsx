import { cn } from '@/lib/utils'

interface AegisLogoProps {
  className?: string
  size?: number
  variant?: 'mark' | 'full' | 'compact'
  iconClassName?: string
}

/**
 * One shape, one idea.
 *
 * The mark before this one carried six: a dashed "cybernetic grid" ring, a
 * shield outline, an "A" vertex, a green "air-gap core pulse diamond", and
 * two "radar ticks" past the shield's ends. At 26px in the header six ideas
 * are one smudge.
 *
 * What is left is the only idea the product has: a shield, because that is
 * what the word means, with the ledger cut out of it. Three slots, knocked
 * through as negative space rather than drawn on top, so the mark is a
 * single filled path that inherits currentColor and reads at any size on
 * any ground. Each record is narrower than the one before it, the way each
 * hash commits to the one it follows.
 *
 * Refined, not replaced. The slots now step in by exactly one unit a side
 * (10, 8, 6 wide), where they stepped 1.6 and then 2.6 and the last record
 * read as an afterthought; a chain whose every link is the same step is the
 * point of a ledger. They sit on whole units, 2 tall with 2 between, so at
 * 24px -- the header's size -- every edge lands on a pixel and the slots
 * are crisp rather than smeared across two. And the group is centred on
 * the shield's optical middle (y 7 to 17 of 1.5 to 22.5) instead of hanging
 * a unit low. Rendered and compared at 16 to 48px before it was changed.
 *
 * No box behind it and no hover scale: a logo that grows when a pointer
 * nears it is motion with nothing to report.
 */
export function AegisLogo({
  className,
  size = 32,
  variant = 'full',
  iconClassName,
}: AegisLogoProps) {
  return (
    <div className={cn('inline-flex select-none items-center gap-2.5', className)}>
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        aria-hidden
        className={cn('shrink-0 text-foreground', iconClassName)}
      >
        {/*
          evenodd is what makes the slots holes rather than bars: one path,
          so there is no second colour to keep in step with the ground it is
          drawn on.
        */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 1.5 21.5 5.6V12c0 5.2-3.8 9.3-9.5 10.5C6.3 21.3 2.5 17.2 2.5 12V5.6L12 1.5Z
             M7 7h10v2H7V7Z
             M8 11h8v2H8v-2Z
             M9 15h6v2H9v-2Z"
          fill="currentColor"
        />
      </svg>

      {variant !== 'mark' && (
        <div className="flex flex-col leading-none">
          {/*
            Normal weight, normal tracking: the shield is doing the work.
            The sub-label is the ledger role, 10px mono at 0.06em, which is
            the smallest type in the product -- it was 9px, under the scale
            the rest of the interface keeps to.
          */}
          <span className="text-[14px] font-medium tracking-[0.02em] text-foreground">AEGIS</span>
          {variant === 'full' && (
            <span className="mt-[3px] font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
              Agentic Workbench
            </span>
          )}
        </div>
      )}
    </div>
  )
}
