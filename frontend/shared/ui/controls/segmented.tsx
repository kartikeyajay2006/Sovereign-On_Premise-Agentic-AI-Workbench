'use client'

import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SegmentedOption<V extends string> {
  value: V
  label: ReactNode
  /**
   * Shown after the label. `null` or absent draws nothing: an unknown count
   * is not zero, and a filter that says "0" when it has not counted anything
   * is making a claim.
   */
  count?: number | null
  disabled?: boolean
  title?: string
}

/**
 * A single choice from a short set: a filter, a scope, a result count.
 *
 * Radio semantics, so the arrow keys move and select together and Tab leaves
 * the group in one step, the way a native radio group behaves. The selected
 * segment is raised on a sunken track rather than filled, because a filled
 * segment would be a second action colour on a screen that already has one.
 */
export function Segmented<V extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  /** Names the group for assistive technology. Not rendered. */
  label: string
  value: V
  onChange: (value: V) => void
  options: SegmentedOption<V>[]
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const move = (from: number, step: number) => {
    const n = options.length
    for (let k = 1; k <= n; k++) {
      const next = (from + step * k + n * k) % n
      if (!options[next].disabled) {
        onChange(options[next].value)
        refs.current[next]?.focus()
        return
      }
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = options.findIndex((o) => o.value === value)
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      move(current, 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(current, -1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      move(-1, 1)
    } else if (event.key === 'End') {
      event.preventDefault()
      move(options.length, -1)
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-[var(--radius)] bg-surface-sunken p-0.5',
        'shadow-[0_0_0_1px_var(--control-subtle)]',
        className,
      )}
    >
      {options.map((option, index) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={option.disabled}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              'hover-decay inline-flex h-7 items-center gap-2 rounded-[var(--radius-xs)] px-3 text-ui font-medium',
              'focus-visible:shadow-[var(--focus-ring-on-sunken)] focus-visible:outline-none',
              'disabled:pointer-events-none disabled:opacity-[var(--opacity-disabled)]',
              checked
                ? 'bg-surface text-foreground shadow-[var(--elev-1)]'
                : 'text-foreground-secondary hover:text-foreground',
            )}
          >
            <span>{option.label}</span>
            {typeof option.count === 'number' && (
              <span className="tabular font-mono text-ledger text-foreground-muted">{option.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
