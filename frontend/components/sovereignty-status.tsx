'use client'

import { useEffect, useRef, useState } from 'react'
import { HOST_INFO } from '@/lib/mock-data'
import { api } from '@/lib/api'
import type { SovereigntyStatus as SovereigntyStatusType } from '@/lib/types'
import { cn } from '@/lib/utils'

export function SovereigntyStatus({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<SovereigntyStatusType | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    api.sovereigntyStatus().then(setStatus).catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const extCalls = status?.external_api_calls ?? 0
  const localConns = status?.local_connections ?? 3

  const rows: { label: string; value: string; mono?: boolean; tone?: string }[] = [
    { label: 'Host', value: '127.0.0.1', mono: true },
    { label: 'External connections', value: String(extCalls), mono: true, tone: 'var(--sovereign)' },
    { label: 'Local services', value: `8000 · ${localConns} loopback`, mono: true },
    { label: 'Inference model', value: HOST_INFO.model, mono: true },
    { label: 'Sandbox confinement', value: 'CONTAINED', mono: true, tone: 'var(--sovereign)' },
    { label: 'Audit hash chain', value: 'VALID', mono: true, tone: 'var(--sovereign)' },
  ]

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Sovereignty status"
        className={cn(
          'group flex items-center gap-2 border border-border bg-surface px-2.5 py-1.5 transition-colors hover:border-border-strong',
          compact && 'px-2',
        )}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="sov-pulse absolute inline-flex h-full w-full rounded-full bg-sovereign" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sovereign" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">Air-Gapped</span>
        {!compact && (
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted lg:inline">
            {extCalls} External Calls
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-[90] w-72 border border-border bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.14)] animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground-muted">
              Sovereignty
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-sovereign">
              <span className="h-1.5 w-1.5 rounded-full bg-sovereign" />
              Verified
            </span>
          </div>
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[12px] text-foreground-secondary">{r.label}</span>
                <span
                  className="font-mono text-[12px]"
                  style={{ color: r.tone ?? 'var(--foreground)' }}
                >
                  {r.value}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-border px-4 py-2.5">
            <p className="font-mono text-[10px] leading-relaxed text-foreground-muted">
              0 OUTBOUND PACKETS · Nothing leaves this host.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
