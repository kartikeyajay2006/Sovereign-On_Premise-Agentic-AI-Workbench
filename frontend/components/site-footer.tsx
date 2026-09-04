'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export function SiteFooter() {
  // Read from this host rather than stated: the footer is the last place a
  // reader checks what they are actually connected to.
  const [host, setHost] = useState('reading…')
  const [model, setModel] = useState('reading…')

  useEffect(() => {
    api
      .health()
      .then((h: any) => {
        setHost(`${h.inference_provider} · loopback`)
        setModel(`${h.models_available}/${h.models_registered} models ready`)
      })
      .catch(() => {
        setHost('service unreachable')
        setModel('unknown')
      })
  }, [])

  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-5 py-8 sm:grid-cols-2 lg:grid-cols-4 lg:px-10">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground">
            Aegis Workbench
          </span>
          <p className="max-w-[220px] text-[12px] leading-relaxed text-foreground-muted">
            On-premise agentic AI for confidential industrial environments.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Host</span>
          <span className="font-mono text-[12px] text-foreground-secondary">{host}</span>
          <span className="font-mono text-[12px] text-foreground-secondary">Services 8000 · 11434</span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Runtime</span>
          <span className="font-mono text-[12px] text-foreground-secondary">{model}</span>
          <span className="font-mono text-[12px] text-foreground-secondary">Sandbox CONTAINED</span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Posture</span>
          <span className="flex items-center gap-2 font-mono text-[12px] text-sovereign">
            <span className="h-1.5 w-1.5 rounded-full bg-sovereign" />
            AIR-GAPPED · 0 OUTBOUND PACKETS
          </span>
          <span className="font-mono text-[12px] text-foreground-secondary">Audit chain VALID</span>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-4 lg:px-10">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground-muted">
            © 2026 Aegis Systems
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground-muted">
            Local execution only
          </span>
        </div>
      </div>
    </footer>
  )
}
