'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Toast {
  id: number
  title: string
  detail?: string
  tone: 'default' | 'sovereign' | 'critical' | 'approval'
  /** How long it stays, in ms. Defaults by tone; see DWELL. */
  duration?: number
}

interface ToastContextValue {
  push: (t: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/*
 * A glyph and a fill per tone, so the tone survives greyscale and a
 * projector: shape first, hue second. The label itself is always ink.
 */
const TONE: Record<Toast['tone'], { glyph: string; mark: string }> = {
  default: { glyph: '•', mark: 'bg-surface-sunken text-foreground-secondary' },
  sovereign: { glyph: '✓', mark: 'bg-sovereign text-[var(--on-sovereign)]' },
  approval: { glyph: '⏸', mark: 'bg-approval text-[var(--on-approval)]' },
  critical: { glyph: '✕', mark: 'bg-critical text-[var(--on-critical)]' },
}

/**
 * Reading time, not animation time. A failure usually carries the reason in
 * its detail line and needs longer on screen than a confirmation does.
 */
const DWELL: Record<Toast['tone'], number> = {
  default: 4200,
  sovereign: 4200,
  approval: 6000,
  critical: 8000,
}

/** More than three stacked notices is a log, and there is a real one of those. */
const MAX_VISIBLE = 3

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = Date.now() + Math.random()
      setToasts((prev) => [...prev, { ...t, id }].slice(-MAX_VISIBLE))
      timers.current.set(id, window.setTimeout(() => dismiss(id), t.duration ?? DWELL[t.tone]))
    },
    [dismiss],
  )

  // A stable value, so a toast arriving does not re-render every screen that
  // only holds `push`.
  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[var(--z-toast)] flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2 sm:bottom-6 sm:right-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'critical' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-[var(--radius-md-token)] bg-surface py-3 pl-3 pr-2 shadow-[var(--elev-2)]',
              // Arrives by moving, never by fading, so it is legible from its
              // first frame. Reduced motion drops the travel entirely.
              'animate-in slide-in-from-bottom-2 duration-[var(--spatial)] ease-[var(--ease-spatial)] motion-reduce:animate-none',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-ledger leading-none',
                TONE[t.tone].mark,
              )}
            >
              {TONE[t.tone].glyph}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-foreground">{t.title}</p>
              {t.detail && (
                <p className="mt-0.5 break-words text-ui text-foreground-secondary">{t.detail}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="hover-decay -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-xs)] text-foreground-muted hover:bg-surface-sunken hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
