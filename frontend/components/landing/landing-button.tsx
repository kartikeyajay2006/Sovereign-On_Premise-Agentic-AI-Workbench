import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CONTROL, CONTROL_EDGE, FOCUS } from './tokens'

type Variant = 'primary' | 'outline' | 'quiet'
type Size = keyof typeof CONTROL

export interface LandingButtonProps extends Omit<ComponentProps<typeof Link>, 'children'> {
  children: ReactNode
  variant?: Variant
  size?: Size
  /** Full width below the `sm` breakpoint. Used for the hero CTAs. */
  blockOnMobile?: boolean
}

const VARIANTS: Record<Variant, string> = {
  // Exactly one filled button is visible on this page, and it is the hero
  // primary. A second filled button is a second answer to "what do I do here".
  primary: 'bg-foreground text-primary-foreground hover:bg-[#1f1f1f]',
  outline: cn(
    'border bg-transparent text-foreground hover:border-foreground hover:bg-surface',
    CONTROL_EDGE,
  ),
  quiet: 'text-foreground-secondary hover:text-foreground',
}

export function LandingButton({
  children,
  variant = 'outline',
  size = 'md',
  blockOnMobile = false,
  className,
  ...props
}: LandingButtonProps) {
  return (
    <Link
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[4px] font-medium tracking-[-0.006em]',
        // Only the three properties that actually change. Never `transition-all`:
        // it animates layout properties nobody asked to animate.
        'transition-[background-color,border-color,color] duration-[150ms] ease-out hover:duration-0',
        'motion-reduce:transition-none',
        CONTROL[size],
        VARIANTS[variant],
        blockOnMobile && 'w-full sm:w-auto',
        FOCUS,
        className,
      )}
    >
      {children}
    </Link>
  )
}
