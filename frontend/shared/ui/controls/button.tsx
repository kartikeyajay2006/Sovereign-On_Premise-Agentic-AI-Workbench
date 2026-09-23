'use client'

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type { Size } from '@/shared/ui/types'
import type { Size } from '@/shared/ui/types'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: Size
  /**
   * Shows a spinner without changing the button's width, so nothing on the
   * row reflows while a request is in flight.
   */
  busy?: boolean
  /** What to say while busy, phrased as a person would say it: "Signing in…". */
  busyLabel?: string
  icon?: LucideIcon
  iconPosition?: 'start' | 'end'
  /**
   * Which ground the button sits on. The focus ring's gap is painted in the
   * page colour, so it has to match or the ring shows a seam.
   */
  ground?: 'surface' | 'paper' | 'sunken'
  /**
   * A single key that triggers this button from the keyboard, printed after
   * the label and announced through aria-keyshortcuts. Printing it is not
   * binding it: the screen that owns the shortcut listens for it. Hidden at
   * phone width, where there is usually no keyboard to press it on.
   */
  shortcut?: string
  ref?: Ref<HTMLButtonElement>
}

/**
 * The house button.
 *
 * Visual rules live in the `.btn` block in globals.css and are selected by
 * data attributes, so a variant cannot be half-applied by a caller passing a
 * stray className.
 *
 * Replaces SovButton, which was `rounded-full` with `transition-all
 * duration-200`, a press translate, and a focus ring at `ring-foreground/30`
 * — about 1.1:1 against its surroundings, which is decoration rather than an
 * accessibility affordance.
 */
export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  busy = false,
  busyLabel,
  icon: Icon,
  iconPosition = 'start',
  ground = 'surface',
  shortcut,
  className,
  disabled,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  const label = busy && busyLabel ? busyLabel : children

  return (
    <button
      ref={ref}
      type={type}
      data-variant={variant}
      data-size={size}
      data-ground={ground}
      // Disabled while busy so a second submit cannot be queued, but the
      // reason is carried separately: aria-busy says "working", aria-disabled
      // would say "not available", and those are different facts.
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      aria-keyshortcuts={shortcut}
      className={cn('btn', className)}
      {...rest}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
      ) : (
        Icon && iconPosition === 'start' && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      {/*
        inline-flex, because callers pass icons inside the label as well as
        through `icon`. As a bare span its contents were inline, and as a
        flex item it shrinks, so "＋ Ingest new SOP" broke after the icon and
        put the plus on a line of its own above the words. A single text
        label is unaffected: gap needs two children to apply.
      */}
      <span className="inline-flex shrink-0 items-center gap-2">{label}</span>
      {!busy && Icon && iconPosition === 'end' && (
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      {/* Drawn in currentColor so it reads on every variant, the action
          fill included, without a colour of its own. */}
      {!busy && shortcut && (
        <kbd
          aria-hidden
          className="ml-1 hidden h-4 min-w-4 items-center justify-center rounded-[var(--radius-xs)] px-1 font-mono text-ledger uppercase leading-none opacity-70 shadow-[0_0_0_1px_currentColor] sm:inline-flex"
        >
          {shortcut}
        </kbd>
      )}
    </button>
  )
}
