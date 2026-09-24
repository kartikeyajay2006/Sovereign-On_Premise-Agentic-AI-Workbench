'use client'

import { ArrowRight } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Button } from '@/shared/ui/controls/button'

/**
 * Deprecated. Use `Button` from `@/shared/ui/controls/button`.
 *
 * This is a shim so the ~20 existing call sites keep working while they are
 * migrated one screen at a time, rather than in one unreviewable change.
 *
 * What changed underneath them:
 *
 * - `rounded-full` becomes the 4px house radius. A pill-shaped control reads
 *   consumer; this is an instrument panel, and `rounded-full` was the most
 *   common radius in a product whose radius token is 4px.
 * - `transition-all duration-200` becomes three named properties on the
 *   asymmetric hover pair — instant in, 150ms decay. Transitioning `all`
 *   animates properties nobody chose, including layout ones.
 * - `active:translate-y-px` is gone. A button that moves when pressed is a
 *   consumer gesture, and it animates layout.
 * - `focus-visible:ring-foreground/30` becomes the ink gap ring. The old ring
 *   was roughly 1.1:1 against its surroundings, against a 3:1 requirement:
 *   decoration rather than an affordance.
 *
 * The five old variants map onto the new four. `ink` and `primary` were both
 * filled dark buttons differing only in which near-black they used, so they
 * collapse together.
 */
type LegacyVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'ink'

const VARIANT_MAP = {
  primary: 'primary',
  ink: 'primary',
  outline: 'secondary',
  ghost: 'ghost',
  danger: 'danger',
} as const satisfies Record<LegacyVariant, 'primary' | 'secondary' | 'ghost' | 'danger'>

export function SovButton({
  children,
  variant = 'primary',
  arrow,
  className,
  ...props
}: {
  children: ReactNode
  variant?: LegacyVariant
  arrow?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      variant={VARIANT_MAP[variant]}
      size="md"
      className={className}
      icon={arrow ? ArrowRight : undefined}
      iconPosition="end"
      {...props}
    >
      {children}
    </Button>
  )
}
