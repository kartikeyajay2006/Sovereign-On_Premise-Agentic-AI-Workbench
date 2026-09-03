'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

interface Toast {
  id: number
  title: string
  detail?: string
  tone: 'default' | 'sovereign' | 'critical' | 'approval'
}

interface ToastContextValue {
  push: (t: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const toneColor: Record<Toast['tone'], string> = {
  default: 'var(--foreground)',
  sovereign: 'var(--sovereign)',
  critical: 'var(--critical)',
  approval: 'var(--approval)',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { ...t, id }])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200)
  }, [])

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[120] flex w-[340px] max-w-[calc(100vw-3rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="reveal in-view pointer-events-auto flex items-start gap-3 border border-border bg-surface px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
          >
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: toneColor[t.tone] }}
            />
            <div className="min-w-0">
              <p className="text-[13px] font-medium leading-tight text-foreground">{t.title}</p>
              {t.detail && (
                <p className="mt-1 font-mono text-[11px] leading-snug text-foreground-muted">
                  {t.detail}
                </p>
              )}
            </div>
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
