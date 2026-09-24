'use client'

import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface TabItem<V extends string> {
  value: V
  label: ReactNode
  /** Absent or null draws nothing. An uncounted tab does not say "0". */
  count?: number | null
}

/** Ids shared by a tab and its panel, so the pair is announced together. */
export function tabIds(base: string, value: string) {
  return { tab: `${base}-tab-${value}`, panel: `${base}-panel-${value}` }
}

/**
 * Props for the element that holds a tab's content. The caller renders it,
 * so the panel can be any shape a screen needs.
 */
export function tabPanelProps(base: string, value: string) {
  const ids = tabIds(base, value)
  return { role: 'tabpanel' as const, id: ids.panel, 'aria-labelledby': ids.tab, tabIndex: -1 }
}

/**
 * Sections of one screen.
 *
 * The same ink rule under the current tab that the global navigation uses,
 * so a section switch and a screen switch read as the same gesture at two
 * scales. The list scrolls sideways inside itself at phone width instead of
 * pushing the page wider than the screen.
 */
export function Tabs<V extends string>({
  label,
  idBase,
  value,
  onChange,
  items,
  className,
}: {
  label: string
  idBase: string
  value: V
  onChange: (value: V) => void
  items: TabItem<V>[]
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = items.findIndex((item) => item.value === value)
    let next = -1
    if (event.key === 'ArrowRight') next = (current + 1) % items.length
    else if (event.key === 'ArrowLeft') next = (current - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    if (next === -1) return
    event.preventDefault()
    onChange(items[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'flex max-w-full items-end gap-6 overflow-x-auto border-b border-line-default [scrollbar-width:none]',
        className,
      )}
    >
      {items.map((item, index) => {
        const selected = item.value === value
        const ids = tabIds(idBase, item.value)
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="tab"
            id={ids.tab}
            aria-selected={selected}
            aria-controls={ids.panel}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative -mb-px flex h-10 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 text-body font-medium',
              // The hover pair: a highlight arrives at once and decays. A
              // selection moved with the arrow keys does not animate at all,
              // so while a tab holds keyboard focus the list drops its
              // transitions.
              'hover-decay [[role=tablist]:has(:focus-visible)_&]:transition-none',
              // Inset: the list scrolls sideways, which clips anything drawn
              // outside a tab.
              'rounded-t-[var(--radius-xs)] focus-visible:shadow-[inset_0_0_0_2px_var(--foreground)] focus-visible:outline-none',
              selected
                ? 'border-foreground text-foreground'
                : 'border-transparent text-foreground-muted hover:text-foreground',
            )}
          >
            {item.label}
            {typeof item.count === 'number' && (
              <span className="tabular font-mono text-ledger text-foreground-muted">{item.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
