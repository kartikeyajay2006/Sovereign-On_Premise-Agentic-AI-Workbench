'use client'

/* -------------------------------------------------------------------------- */
/* Input — 20-DESIGN-SPEC §4.2.                                                */
/*                                                                            */
/* The label is required and is Geist SANS, never mono (principle P4: mono    */
/* means machine-issued). `mono` is a property of the VALUE, not the field,    */
/* and is legal only when the value itself is machine-issued — a host, a       */
/* hash, a port.                                                               */
/*                                                                            */
/* Focus is a SOFT INK HALO, not the gap ring used by Button. §4.2 is explicit */
/* about why: an input already carries a 1px edge, and 2px of page colour      */
/* punched around a 40px field reads as an error rather than as focus. Ink     */
/* only, no accent hue (§2.7's rationale, applied at a different radius).      */
/* -------------------------------------------------------------------------- */

import { useId, type CSSProperties, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { cn } from '@/lib/utils'

/**
 * Mirrors `Size` from `shared/ui/types.ts` (§4 preamble). That module is owned
 * by migration step B1 and does not exist yet, so the union is declared here
 * and is structurally identical — swapping in the shared import later is a
 * one-line change with no call-site churn.
 */
export type InputSize = 'sm' | 'md' | 'lg'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Required. Geist Sans, never mono (P4). */
  label: string
  /** sm 32 | md 36 | lg 40. Default 'md'; auth uses 'lg'. */
  size?: InputSize
  /** Present => the field is in error; the string renders under the field. */
  error?: string
  /** Right-aligned affordance on the label row (e.g. a reveal toggle). */
  labelAction?: ReactNode
  /** Mono is legal only when the VALUE is machine-issued (a host, a hash). */
  mono?: boolean
  /** Id of extra descriptive text; merged with the error id when both exist. */
  describedBy?: string
  ref?: Ref<HTMLInputElement>
}

/* Height, inline padding and label size bind to the control size so no caller
   invents a fourth scale (§2.5). */
const SIZE_CLASS: Record<InputSize, string> = {
  sm: 'h-[var(--control-sm)] px-[10px] text-ui',
  md: 'h-[var(--control-md)] px-[10px] text-body',
  lg: 'h-[var(--control-lg)] px-[var(--space-5)] text-body',
}

export function Input({
  label,
  size = 'md',
  error,
  labelAction,
  mono = false,
  describedBy,
  className,
  style,
  id,
  ref,
  ...props
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? `field-${generatedId}`
  const errorId = `${inputId}-error`
  const invalid = error !== undefined && error.length > 0
  const describedByValue = [describedBy, invalid ? errorId : undefined].filter(Boolean).join(' ') || undefined

  /* The three rings are declared as local custom properties rather than as
     escaped arbitrary values, so the oklch() relative-colour syntax survives
     the class-name parser intact and the invalid/valid swap is one object. */
  const rings = {
    '--field-ring': invalid ? '0 0 0 1px var(--critical)' : '0 0 0 1px var(--control-default)',
    '--field-ring-hover': invalid ? '0 0 0 1px var(--critical)' : '0 0 0 1px var(--control-strong)',
    /* NEEDS-GLOBAL: the focus halo is the only §4.2 value with no token behind
       it — §2.7 ships the three gap rings but not this. I would add to :root
         --focus-halo: 0 0 0 1px var(--foreground),
                       0 0 0 4px oklch(from var(--foreground) l c h / 0.08);
         --focus-halo-invalid: 0 0 0 1px var(--critical),
                               0 0 0 4px oklch(from var(--foreground) l c h / 0.08);
       and replace the two literals below with var() references. */
    '--field-ring-focus': invalid
      ? '0 0 0 1px var(--critical), 0 0 0 4px oklch(from var(--foreground) l c h / 0.08)'
      : '0 0 0 1px var(--foreground), 0 0 0 4px oklch(from var(--foreground) l c h / 0.08)',
  } as CSSProperties

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-[var(--space-4)]">
        <label
          htmlFor={inputId}
          className="text-ui font-medium tracking-[var(--ls-ui)] text-foreground-secondary"
        >
          {label}
        </label>
        {labelAction}
      </div>

      <input
        {...props}
        ref={ref}
        id={inputId}
        aria-invalid={invalid || undefined}
        aria-describedby={describedByValue}
        style={{ ...rings, ...style }}
        className={cn(
          /* hover-decay carries the asymmetric transition from §2.8: box-shadow
             decays over --hover-out and arrives in --hover-in. Never `all`. */
          'hover-decay mt-[var(--space-3)] w-full rounded-[var(--radius)] bg-surface text-foreground',
          'shadow-[var(--field-ring)] outline-none',
          'hover:shadow-[var(--field-ring-hover)]',
          'focus:shadow-[var(--field-ring-focus)] focus:outline-none',
          'placeholder:text-foreground-muted',
          'disabled:pointer-events-none disabled:opacity-[var(--opacity-disabled)]',
          SIZE_CLASS[size],
          mono && 'font-mono',
          className,
        )}
      />

      {invalid && (
        <p id={errorId} className="mt-[var(--space-2)] text-ui text-critical-text">
          {error}
        </p>
      )}
    </div>
  )
}
