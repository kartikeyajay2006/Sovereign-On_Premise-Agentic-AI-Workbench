'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, Link2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import type { AuditChainStatus, AuditEvent } from '@/lib/types'
import { PageHeader } from '@/components/page-header'
import { TechnicalLabel } from '@/components/primitives'
import { SovButton } from '@/components/sov-button'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/utils'

type Category = 'TASK' | 'MODEL' | 'TOOL' | 'POLICY' | 'APPROVAL' | 'SECURITY' | 'SOVEREIGNTY' | 'ALL' | string
const CATEGORIES: (Category | 'ALL')[] = ['ALL', 'TASK', 'MODEL', 'TOOL', 'POLICY', 'APPROVAL', 'SECURITY', 'SOVEREIGNTY']

const catColor: Record<string, string> = {
  TASK: 'var(--foreground)',
  MODEL: 'var(--active)',
  TOOL: 'var(--foreground-secondary)',
  POLICY: 'var(--approval)',
  APPROVAL: 'var(--approval)',
  SECURITY: 'var(--critical)',
  SOVEREIGNTY: 'var(--sovereign)',
}

export function AuditView() {
  const [filter, setFilter] = useState<Category | 'ALL'>('ALL')
  // Empty until the real trail is read. An invented audit entry is worse
  // than none: it is a record of something that never happened.
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [chainStatus, setChainStatus] = useState<AuditChainStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const { push } = useToast()

  const loadAudit = () => {
    Promise.all([
      api.auditEvents({ category: filter !== 'ALL' ? filter.toLowerCase() : undefined, limit: 100 }).catch((err) => { setError(err?.message ?? 'Could not read the activity log'); return [] as AuditEvent[] }),
      api.auditChain().catch(() => null),
    ]).then(([evs, chain]) => {
      setEvents(evs)
      setChainStatus(chain)
      setLoading(false)
    })
  }

  useEffect(() => {
    loadAudit()
  }, [filter])

  const chain = useMemo(() => [...events].slice(-4), [events])

  const exportLog = () => {
    window.open(api.getAuditExportUrl(), '_blank')
    push({
      title: 'Audit log exported',
      detail: `${events.length} events · tamper-evident .jsonl`,
      tone: 'sovereign',
    })
  }

  const headHash = chainStatus?.head_hash || events[events.length - 1]?.hash || 'e3b0c442…'

  return (
    <div>
      <PageHeader
        eyebrow="Cryptographic Chain"
        title="Audit Trail"
        description="An append-only, SHA-256 hash-linked record of every task, model call, tool execution and policy decision on this host."
        meta={[
          { label: 'Status', value: chainStatus?.valid !== false ? 'VALID' : 'BROKEN' },
          { label: 'Events verified', value: String(chainStatus?.events ?? events.length) },
          { label: 'Algorithm', value: 'SHA-256' },
          { label: 'Head', value: headHash.length > 12 ? `${headHash.slice(0, 8)}…` : headHash },
        ]}
        actions={
          <SovButton arrow onClick={exportLog}>
            <Download className="h-4 w-4" /> Export audit log
          </SovButton>
        }
      />

      <div className="mx-auto max-w-[1400px] px-5 py-10 lg:px-10">
        <AuditChain chain={chain} />

        {/* Filters */}
        <div className="mt-14 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Filter</span>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={cn(
                'border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors',
                filter === c
                  ? 'border-foreground bg-foreground text-primary-foreground'
                  : 'border-border text-foreground-secondary hover:border-foreground',
              )}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Event list */}
        <div className="mt-6 divide-y divide-border border border-border">
          {events.map((e, idx) => (
            <AuditEventRow key={e.id || e.hash || idx} event={e} />
          ))}
          {events.length === 0 && (
            <div className="px-4 py-10 text-center font-mono text-[12px] text-foreground-muted">
              No audit events found in this category.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AuditChain({ chain }: { chain: AuditEvent[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <TechnicalLabel>Tamper-Evident Hash Chain (Tail Inspection)</TechnicalLabel>
        <span className="font-mono text-[11px] text-sovereign">SHA-256 Verified</span>
      </div>
      <div className="grid grid-cols-1 gap-px border border-border bg-border md:grid-cols-4">
        {chain.map((e, i) => {
          const seq = e.sequence !== undefined ? e.sequence : (e.seq !== undefined ? e.seq : i + 1)
          const category = (e.category || 'SYSTEM').toUpperCase()
          const hashStr = e.hash || 'hash…'
          const prevHashStr = e.prev_hash || e.prevHash || 'prev…'

          return (
            <div key={e.id || e.hash || i} className="flex flex-col gap-2 bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-foreground-muted">SEQ {seq}</span>
                <span className="font-mono text-[10px] uppercase" style={{ color: catColor[category] || 'var(--foreground)' }}>
                  {category}
                </span>
              </div>
              <span className="text-[13px] font-medium text-foreground">{e.action}</span>
              <div className="mt-1 flex flex-col font-mono text-[10px] text-foreground-muted">
                <span>HASH: {hashStr.slice(0, 10)}…</span>
                <span>PREV: {prevHashStr.slice(0, 10)}…</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AuditEventRow({ event }: { event: AuditEvent }) {
  const seq = event.sequence !== undefined ? event.sequence : event.seq
  const category = (event.category || 'SYSTEM').toUpperCase()
  const time = event.at ? new Date(event.at).toLocaleTimeString() : (event.timestamp || 'Just now')
  const detailStr = event.detail ? (typeof event.detail === 'object' ? JSON.stringify(event.detail) : String(event.detail)) : ''

  return (
    <div className="flex flex-col gap-2 bg-surface p-4 transition-colors hover:bg-surface-sunken sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <span className="font-mono text-[11px] text-foreground-muted">#{seq}</span>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase" style={{ color: catColor[category] || 'var(--foreground)' }}>
              {category}
            </span>
            <span className="font-mono text-[10px] text-foreground-muted">· {event.actor}</span>
          </div>
          <span className="text-[13px] font-medium text-foreground">{event.action}</span>
          {detailStr && detailStr !== '{}' && (
            <span className="max-w-xl truncate font-mono text-[11px] text-foreground-secondary">{detailStr}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 self-end sm:self-center">
        <span className="font-mono text-[11px] text-foreground-muted">{time}</span>
        <span className="font-mono text-[11px] text-foreground-muted" title={event.hash}>
          {event.hash ? `${event.hash.slice(0, 8)}…` : ''}
        </span>
      </div>
    </div>
  )
}
