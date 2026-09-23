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
 * The previous mark carried six: a dashed "cybernetic grid" ring, a shield
 * outline, an "A" vertex, a green "air-gap core pulse diamond", and two
 * "radar ticks" that protruded past the shield at either end. It is drawn at
 * 26px in the header, where a 0.75px stroke at 25% opacity is not subtle --
 * it is absent, and paid for anyway. Six ideas at 26px is one smudge.
 *
 * What is left is the only idea the product has: a shield, because that is
 * what the word means, with the ledger cut out of it. Three slots, knocked
 * through as negative space rather than drawn on top, so the mark is a single
 * filled path that inherits currentColor and reads at any size on any ground.
 * The slots step inward as they descend, which is the one gesture: each
 * record narrower than the one it rests on, the way each hash commits to the
 * one before it.
 *
 * No box behind it and no hover scale. The mark sat in a filled rounded
 * square that inverted it against everything around it, and grew when a
 * pointer neared -- motion with nothing to report.
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
             M6.9 8.4h10.2v2.1H6.9V8.4Z
             M7.7 12.2h8.6v2.1H7.7v-2.1Z
             M9 16h6v2.1H9V16Z"
          fill="currentColor"
        />
      </svg>

      {variant !== 'mark' && (
        <div className="flex flex-col leading-none">
          {/*
            0.24em tracking at font-black, over a 0.34em sub, is the setting
            of a logo that does not trust its own mark. Normal weight, normal
            tracking; the shield is doing the work.
          */}
          <span className="text-[14px] font-medium tracking-[0.02em] text-foreground">AEGIS</span>
          <span className="mt-[3px] font-mono text-[9px] uppercase tracking-[0.14em] text-foreground-muted">
            {variant === 'compact' ? 'Workbench' : 'Agentic Workbench'}
          </span>
        </div>
      )}
    </div>
  )
}
