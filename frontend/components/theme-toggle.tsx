'use client'

import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Paper or ink night, persisted per browser.
 *
 * The boot script in app/layout.tsx applies the saved choice (or the
 * operating system's) before first paint; this only flips it. Storage can be
 * refused in a private window, in which case the choice lasts for the page.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null)

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  }, [])

  const flip = useCallback(() => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('aegis-theme', next)
    } catch {
      // Private mode: the choice holds for this page only.
    }
    setTheme(next)
  }, [])

  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={dark ? 'Switch to paper' : 'Switch to ink night'}
      title={dark ? 'Lamp on' : 'Lamp off'}
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-[9px] border border-line-default bg-surface text-foreground-secondary',
        'transition-[color,border-color,transform] duration-[var(--standard)] ease-[var(--ease-spatial)]',
        'hover:-translate-y-px hover:border-line-strong hover:text-foreground',
        'focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none',
      )}
    >
      {dark ? (
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
          <circle cx="8" cy="8" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M8 1.2v1.8M8 13v1.8M1.2 8H3M13 8h1.8M3.2 3.2l1.3 1.3M11.5 11.5l1.3 1.3M12.8 3.2l-1.3 1.3M4.5 11.5l-1.3 1.3"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
          <path
            d="M13.4 9.6A5.8 5.8 0 0 1 6.4 2.6a5.8 5.8 0 1 0 7 7Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}
