'use client'

import { cn } from '@/lib/utils'
import { LABEL, LABEL_STRONG, MONO } from './style'

export const KEYS: [string, string][] = [
  ['j / k', 'next / previous child'],
  ['1 – 9', 'child by its number'],
  ['h / l', 'previous / next lane'],
  ['Enter', 'open the child in the matrix'],
  ['o', 'open the child in the thread'],
  ['g', 'focus the evidence graph'],
  ['m', 'focus the answer matrix'],
  ['.', 'follow the live child'],
  ['[ / ]', 'step back / forward through events'],
  ['?', 'this help'],
  ['Esc', 'close, collapse, or leave replay'],
]

/** Shown and hidden at once: a key never starts a motion. */
export function KeyboardHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Keyboard"
      className="fixed bottom-4 right-4 z-40 w-[320px] border border-line-strong bg-surface shadow-[0_0_0_1px_var(--surface-sunken)]"
    >
      <header className="flex h-7 items-center justify-between border-b border-line-default px-3">
        <h2 className={LABEL_STRONG}>Keyboard</h2>
        <button type="button" onClick={onClose} className={cn(LABEL, 'hover:text-foreground')}>
          esc
        </button>
      </header>
      <dl className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 px-3 py-2">
        {KEYS.map(([key, meaning]) => (
          <div key={key} className="contents">
            <dt className={cn(MONO, 'leading-6 text-foreground')}>{key}</dt>
            <dd className="text-[13px] leading-6 text-foreground-secondary">{meaning}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
