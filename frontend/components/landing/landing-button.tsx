import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'outline' | 'quiet'
type Size = 'sm' | 'md' | 'lg'

export interface LandingButtonProps extends Omit<ComponentProps<typeof Link>, 'children'> {
  children: ReactNode
  variant?: Variant
  size?: Size
  /** Full width below the `sm` breakpoint. Used for the hero CTAs. */
  blockOnMobile?: boolean
}

/**
 * The public pages' button: a pill. `primary` is the ink fill, one per
 * decision; `outline` is a soft grey pill beside it; `quiet` is a text
 * action. Colours are the action tokens, so both themes read correctly.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'ae-btn primary',
  outline: 'ae-btn secondary',
  quiet: 'ae-btn ghost',
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
    <Link {...props} className={cn(VARIANTS[variant], size === 'sm' && 'sm', blockOnMobile && 'w-full sm:w-auto', className)}>
      {children}
    </Link>
  )
}
