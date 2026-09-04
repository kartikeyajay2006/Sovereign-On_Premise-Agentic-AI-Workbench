'use client'

import { cn } from '@/lib/utils'

interface AegisLogoProps {
  className?: string
  size?: number
  variant?: 'mark' | 'full' | 'compact'
  iconClassName?: string
}

export function AegisLogo({
  className,
  size = 32,
  variant = 'full',
  iconClassName,
}: AegisLogoProps) {
  return (
    <div className={cn('inline-flex items-center gap-3 select-none', className)}>
      {/* Bespoke Geometric Aegis Shield Mark */}
      <div
        className={cn(
          'relative flex items-center justify-center shrink-0 rounded-[6px] bg-foreground text-background shadow-xs transition-transform duration-200 group-hover:scale-[1.03]',
          iconClassName,
        )}
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-[78%] h-[78%]"
        >
          {/* Subtle Cybernetic Grid / Background Ring */}
          <circle
            cx="18"
            cy="18"
            r="14.5"
            stroke="currentColor"
            strokeWidth="0.75"
            strokeDasharray="2 3"
            strokeOpacity="0.25"
          />

          {/* Aegis Outer Protective Shield Facets */}
          <path
            d="M18 4.5L29 9.5V17.5C29 24.2 24.3 29.8 18 31.5C11.7 29.8 7 24.2 7 17.5V9.5L18 4.5Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Inner Geometric Alpha / Aegis Core Vertex */}
          <path
            d="M18 9.5L24 22H20.5L18 16.5L15.5 22H12L18 9.5Z"
            fill="currentColor"
            fillOpacity="0.95"
          />

          {/* Central Air-Gap Core Pulse Diamond */}
          <path
            d="M18 20L19.8 23L18 26L16.2 23L18 20Z"
            fill="var(--sovereign)"
            className="transition-colors group-hover:fill-[var(--sovereign)]"
          />

          {/* Subtle Top Radar Ticks */}
          <line x1="18" y1="2" x2="18" y2="4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="18" y1="31.5" x2="18" y2="34" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Typography for 'full' and 'compact' variants */}
      {variant !== 'mark' && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[13px] font-black uppercase tracking-[0.24em] text-foreground">
              AEGIS
            </span>
            <span className="h-1 w-1 rounded-full bg-[var(--sovereign)]" />
          </div>
          <span className="mt-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.34em] text-foreground-muted">
            {variant === 'compact' ? 'WORKBENCH' : 'AGENTIC WORKBENCH'}
          </span>
        </div>
      )}
    </div>
  )
}
