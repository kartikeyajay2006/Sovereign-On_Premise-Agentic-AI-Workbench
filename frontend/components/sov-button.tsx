'use client'

import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'ink'

const base =
  'group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 text-[13px] font-medium tracking-[0.01em] transition-all duration-200 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30'

const variants: Record<Variant, string> = {
  primary: 'bg-foreground text-primary-foreground hover:bg-foreground/90 active:translate-y-px',
  ink: 'bg-ink-foreground text-ink hover:bg-ink-foreground/90 active:translate-y-px',
  outline: 'border border-border-strong bg-surface text-foreground hover:border-foreground',
  ghost: 'text-foreground-secondary hover:text-foreground',
  danger: 'border border-critical/40 text-critical hover:bg-critical/10',
}

export function SovButton({
  children,
  variant = 'primary',
  arrow,
  className,
  ...props
}: {
  children: ReactNode
  variant?: Variant
  arrow?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn(base, variants[variant], className)} {...props}>
      {children}
      {arrow && <ArrowRight className="arrow-shift h-4 w-4" />}
    </button>
  )
}
