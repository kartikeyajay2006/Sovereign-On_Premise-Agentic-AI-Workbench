'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export function SiteFooter() {
  // Read from this host rather than stated: the footer is the last place a
  // reader checks what they are actually connected to.
  const [host, setHost] = useState('reading…')
  const [model, setModel] = useState('reading…')
  // The intent above was right but three of the footer's lines did not follow
  // it: "Sandbox CONTAINED", "AIR-GAPPED · 0 OUTBOUND PACKETS" and "Audit
  // chain VALID" were literals on every page of the application, including
  // pages whose whole job is to report those three things honestly. /health
  // already returns all of them.
  const [sandbox, setSandbox] = useState('reading…')
  const [posture, setPosture] = useState<boolean | null>(null)
  const [chainValid, setChainValid] = useState<boolean | null>(null)

  useEffect(() => {
    api
      .health()
      .then((h) => {
        setHost(`${h.inference_provider} · loopback`)
        setModel(`${h.models_available}/${h.models_registered} models ready`)
        setSandbox(
          h.sandbox_ready ? `sandbox ${h.sandbox_runtime}` : 'sandbox not ready',
        )
        setPosture(h.sovereignty_ok)
        setChainValid(h.audit_chain_valid)
      })
      .catch(() => {
        setHost('service unreachable')
        setModel('unknown')
        setSandbox('unknown')
        setPosture(null)
        setChainValid(null)
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
          <span className="font-mono text-[12px] text-foreground-secondary">{sandbox}</span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Posture</span>
          <span
            className="flex items-center gap-2 font-mono text-[12px]"
            style={{
              color:
                posture === null
                  ? 'var(--foreground-muted)'
                  : posture
                    ? 'var(--sovereign)'
                    : 'var(--critical)',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor:
                  posture === null
                    ? 'var(--foreground-muted)'
                    : posture
                      ? 'var(--sovereign)'
                      : 'var(--critical)',
              }}
            />
            {posture === null
              ? 'posture unknown'
              : posture
                ? 'no unapproved egress observed'
                : 'egress violations recorded'}
          </span>
          <span
            className="font-mono text-[12px]"
            style={{
              color:
                chainValid === false ? 'var(--critical)' : 'var(--foreground-secondary)',
            }}
          >
            {chainValid === null
              ? 'audit chain unknown'
              : chainValid
                ? 'audit chain valid'
                : 'AUDIT CHAIN BROKEN'}
          </span>
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
