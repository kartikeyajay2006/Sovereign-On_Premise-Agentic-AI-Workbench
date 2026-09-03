'use client'

import { X } from 'lucide-react'
import { useEffect } from 'react'
import type { EvidenceItem } from '@/lib/types'

export function EvidenceDrawer({
  open,
  onClose,
  items,
  focusId,
}: {
  open: boolean
  onClose: () => void
  items: EvidenceItem[]
  focusId?: string | null
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div className={`fixed inset-0 z-[100] ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-foreground/20 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label="Evidence"
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-[-24px_0_60px_rgba(0,0,0,0.12)] transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-foreground-muted">Evidence</span>
            <h3 className="text-lg font-medium text-foreground">Cited sources</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-foreground-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 divide-y divide-border overflow-y-auto">
          {items.map((e) => {
            const src = e.source || e.source_document || 'Local Document'
            const loc = e.clause || e.location || ''
            const sim = typeof e.similarity === 'number' ? e.similarity : (typeof e.score === 'number' ? e.score : 0.95)

            return (
              <div
                key={e.id}
                className={`px-6 py-5 transition-colors ${focusId === e.id ? 'bg-surface-sunken' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 font-mono text-[11px] text-foreground">
                    <span className="border border-border px-1.5 py-0.5 text-[10px]">{e.id}</span>
                    {src}
                  </span>
                  {loc && <span className="font-mono text-[11px] text-foreground-muted">{loc}</span>}
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-foreground-secondary">{e.excerpt}</p>
                <div className="mt-4 flex items-center gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
                    Similarity
                  </span>
                  <span className="relative h-1 flex-1 bg-border">
                    <span
                      className="absolute left-0 top-0 h-1 bg-sovereign"
                      style={{ width: `${Math.min(100, Math.max(0, sim * 100))}%` }}
                    />
                  </span>
                  <span className="font-mono text-[11px] text-foreground">{sim.toFixed(2)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </aside>
    </div>
  )
}
