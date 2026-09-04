'use client'

/**
 * The audit trail.
 *
 * Every task, model call, tool execution and policy decision on this host, in
 * an append-only log where each record carries the hash of the one before it.
 * Delete or edit a line and the chain no longer computes — which is the whole
 * point, so this screen reports what verification actually returned rather
 * than asserting the chain is fine.
 *
 * The presentation is Raghav's: hash blocks as cards, the HASH/PREV pair in a
 * sunken mono panel, category badges carrying their own colour. What sits
 * behind it is real — 'Verify chain' re-runs verification on the server and
 * reports the answer, the blocks are the actual tail of the log, and the
 * filters are built from the categories present in it rather than a list
 * written by hand.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  Loader2,
  Lock,
  RefreshCw,
  RotateCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { AuditChainStatus, AuditEvent } from '@/lib/types'
import { PageHeader } from '@/components/page-header'
import { TechnicalLabel } from '@/components/primitives'
import { SovButton } from '@/components/sov-button'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/utils'

/** Category accents. Anything not listed falls back to plain foreground. */
const CATEGORY_COLOUR: Record<string, string> = {
  task: 'var(--foreground)',
  model: 'var(--active)',
  tool: 'var(--foreground-secondary)',
  agent: 'var(--foreground-secondary)',
  policy: 'var(--approval)',
  approval: 'var(--approval)',
  security: 'var(--critical)',
  sovereignty: 'var(--sovereign)',
  verification: 'var(--sovereign)',
  deliverable: 'var(--foreground)',
  file: 'var(--foreground-secondary)',
  identity: 'var(--approval)',
  system: 'var(--foreground-muted)',
  audit: 'var(--foreground-muted)',
}

const PAGE_SIZE = 200

export function AuditView() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [chainStatus, setChainStatus] = useState<AuditChainStatus | null>(null)
  const [category, setCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [justVerified, setJustVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { push } = useToast()

  const load = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true)
      setError(null)
      try {
        const [rows, chain] = await Promise.all([
          api.auditEvents({
            category: category !== 'all' ? category : undefined,
            search: applied || undefined,
            limit: PAGE_SIZE,
          }),
          api.auditChain().catch(() => null),
        ])
        setEvents(rows || [])
        setChainStatus(chain)
      } catch (err: any) {
        setError(
          err?.detail ||
            err?.message ||
            'The activity log could not be read. Your role may not carry audit permission.',
        )
        setEvents([])
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [category, applied],
  )

  useEffect(() => {
    load()
  }, [load])

  // Filters follow the log. A category nobody has written to does not appear,
  // and one the backend starts writing shows up without a frontend change.
  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const event of events) {
      const key = (event.category || 'system').toLowerCase()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [events])

  /** The most recent records, newest last, as the chain's visible tail. */
  const tail = useMemo(() => [...events].slice(0, 4).reverse(), [events])

  /**
   * Re-run verification on the server and report what came back.
   *
   * This recomputes every link in the chain, so it is a real check and can
   * genuinely fail. It must never be a timer that congratulates itself.
   */
  const verifyChain = async () => {
    setVerifying(true)
    setJustVerified(false)
    try {
      const status = await api.auditChain()
      setChainStatus(status)
      setJustVerified(status.valid)
      push(
        status.valid
          ? {
              title: 'Chain verified',
              detail: `${status.events} records recompute · no tampering detected`,
              tone: 'sovereign',
            }
          : {
              title: 'Chain does not verify',
              detail:
                status.broken_at != null
                  ? `First mismatch at sequence ${status.broken_at}.`
                  : 'A record has been altered or removed.',
              tone: 'critical',
            },
      )
    } catch (err: any) {
      push({
        title: 'Verification could not run',
        detail: err?.detail || err?.message || 'The workbench could not be reached.',
        tone: 'critical',
      })
    } finally {
      setVerifying(false)
    }
  }

  const exportLog = async () => {
    setExporting(true)
    try {
      const response = await fetch(api.getAuditExportUrl(), { credentials: 'include' })
      if (!response.ok) {
        let detail = `The server refused the export (${response.status}).`
        try {
          const body = await response.json()
          if (body?.detail) detail = String(body.detail)
        } catch {
          // Status alone is all we have.
        }
        push({ title: 'Export refused', detail, tone: 'critical' })
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `audit-${new Date().toISOString().slice(0, 10)}.jsonl`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      push({
        title: 'Audit log exported',
        detail: 'Tamper-evident .jsonl · written to this machine only',
        tone: 'sovereign',
      })
    } catch (err: any) {
      push({
        title: 'Export failed',
        detail: err?.message ?? 'The workbench could not be reached.',
        tone: 'critical',
      })
    } finally {
      setExporting(false)
    }
  }

  // Report what verification returned. Not knowing is its own state, and is
  // not the same as being valid.
  const chainVerdict = chainStatus
    ? chainStatus.valid
      ? { label: 'VALID', tone: 'sovereign' as const }
      : { label: 'BROKEN', tone: 'critical' as const }
    : { label: 'UNVERIFIED', tone: 'muted' as const }

  const head = chainStatus?.head_hash
  const total = chainStatus?.events

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-10 px-5 py-10 lg:px-10 lg:py-14">
      <PageHeader
        eyebrow="Tamper-Evident Record"
        title="Audit Trail"
        description="Every task, model call, tool execution and policy decision on this host, hash-linked so that removing or altering a line breaks the chain."
        meta={[
          { label: 'Chain', value: chainVerdict.label },
          { label: 'Events in chain', value: total != null ? String(total) : '—' },
          { label: 'Algorithm', value: 'SHA-256' },
          { label: 'Head', value: head ? `${head.slice(0, 10)}…` : '—' },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={verifyChain}
              disabled={verifying}
              className={cn(
                'flex items-center gap-1.5 rounded border px-3 py-2 font-mono text-[12px] transition-all disabled:opacity-50',
                justVerified
                  ? 'border-[var(--sovereign)] bg-[var(--sovereign)]/10 text-[var(--sovereign)]'
                  : 'border-border bg-surface text-foreground hover:border-foreground',
              )}
            >
              {verifying ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-[var(--sovereign)]" />
              ) : justVerified ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--sovereign)]" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              <span>
                {verifying ? 'Recomputing hashes…' : justVerified ? 'Chain verified' : 'Verify chain'}
              </span>
            </button>
            <SovButton arrow onClick={exportLog} disabled={exporting}>
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Exporting
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" /> Export audit log
                </>
              )}
            </SovButton>
          </div>
        }
      />

      {/* ------------------------------------------------- chain verdict */}
      <div
        className={cn(
          'flex flex-col gap-3 rounded-xl border p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between',
          chainVerdict.tone === 'critical'
            ? 'border-critical/40 bg-critical/[0.04]'
            : chainVerdict.tone === 'sovereign'
              ? 'border-[var(--sovereign)]/30 bg-[var(--sovereign)]/[0.04]'
              : 'border-border bg-surface',
        )}
      >
        <div className="flex items-start gap-3">
          {chainVerdict.tone === 'sovereign' ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--sovereign)]" />
          ) : chainVerdict.tone === 'critical' ? (
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-critical" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-foreground-muted" />
          )}
          <div className="flex flex-col gap-1">
            <span className="text-[14px] font-semibold text-foreground">
              {chainVerdict.tone === 'sovereign' && `Chain verified across ${total ?? 0} records`}
              {chainVerdict.tone === 'critical' && 'The hash chain does not verify'}
              {chainVerdict.tone === 'muted' && 'Chain status unavailable'}
            </span>
            <span className="max-w-2xl text-[13px] leading-relaxed text-foreground-secondary">
              {chainVerdict.tone === 'sovereign' &&
                'Each record hashes the one before it, and every link recomputes. Nothing has been removed or altered since the log began.'}
              {chainVerdict.tone === 'critical' &&
                (chainStatus?.broken_at != null
                  ? `The first mismatch is at sequence ${chainStatus.broken_at}. Records from that point on cannot be trusted; everything before it still verifies.`
                  : 'A record has been altered or removed. Treat the trail as compromised until it is investigated.')}
              {chainVerdict.tone === 'muted' &&
                'The chain could not be verified just now. This says nothing about whether it is intact.'}
            </span>
          </div>
        </div>
        {head && (
          <span className="shrink-0 font-mono text-[11px] text-foreground-muted">
            HEAD {head.slice(0, 16)}…
          </span>
        )}
      </div>

      {/* --------------------------------------------------- chain tail */}
      <AuditChain tail={tail} verified={chainStatus?.valid === true} loading={loading} />

      {/* ------------------------------------------------------ controls */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="relative flex-1 basis-[280px]"
            onSubmit={(e) => {
              e.preventDefault()
              setApplied(search.trim())
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actions, actors, task ids…"
              aria-label="Search the audit trail"
              className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-[13px] text-foreground shadow-sm outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground"
            />
            {applied && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setApplied('')
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-foreground-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>

          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-foreground-secondary shadow-sm transition-colors hover:border-foreground hover:text-foreground disabled:opacity-50"
          >
            <RotateCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
            Category
          </span>
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={cn(
              'rounded border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors',
              category === 'all'
                ? 'border-foreground bg-foreground text-primary-foreground'
                : 'border-border text-foreground-secondary hover:border-foreground',
            )}
          >
            All
          </button>
          {categories.map(([name, count]) => {
            const on = category === name
            return (
              <button
                key={name}
                type="button"
                onClick={() => setCategory(name)}
                style={on ? undefined : { borderColor: CATEGORY_COLOUR[name] || 'var(--border)' }}
                className={cn(
                  'flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors',
                  on
                    ? 'border-foreground bg-foreground text-primary-foreground'
                    : 'bg-surface hover:border-foreground',
                )}
              >
                <span style={on ? undefined : { color: CATEGORY_COLOUR[name] || 'var(--foreground)' }}>
                  {name}
                </span>
                <span className={on ? 'opacity-70' : 'text-foreground-muted'}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* --------------------------------------------------------- events */}
      <div className="flex flex-col">
        <div className="flex items-baseline justify-between gap-3 pb-3">
          <TechnicalLabel>
            {category === 'all' ? 'All records' : `${category} records`}
          </TechnicalLabel>
          <span className="font-mono text-[11px] text-foreground-muted">
            {loading
              ? 'reading…'
              : `showing ${events.length}${events.length === PAGE_SIZE ? ` of ${total ?? 'many'} — most recent` : ''}`}
          </span>
        </div>

        {error && (
          <p className="flex items-start gap-2.5 rounded-xl border border-critical/30 bg-critical/[0.04] p-4 text-[13px] leading-relaxed text-critical">
            <ShieldAlert className="mt-px h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {!error && (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            {loading && (
              <p className="flex items-center justify-center gap-2 px-4 py-12 font-mono text-[12px] text-foreground-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the trail…
              </p>
            )}

            {!loading &&
              events.map((event, index) => {
                const key = event.id || event.hash || String(index)
                return (
                  <AuditRow
                    key={key}
                    event={event}
                    open={expanded === key}
                    onToggle={() => setExpanded(expanded === key ? null : key)}
                  />
                )
              })}

            {!loading && events.length === 0 && (
              <p className="px-4 py-12 text-center text-[13px] text-foreground-secondary">
                {applied
                  ? `Nothing in the trail matches “${applied}”.`
                  : 'No records in this category yet.'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The visible tail of the chain, as blocks.
 *
 * These are real records. Where the log is empty the panel says so — a set of
 * plausible-looking specimen blocks would be a picture of tampering evidence
 * that does not exist.
 */
function AuditChain({
  tail,
  verified,
  loading,
}: {
  tail: AuditEvent[]
  verified: boolean
  loading: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TechnicalLabel>Hash chain · most recent blocks</TechnicalLabel>
        <span
          className={cn(
            'flex items-center gap-1 font-mono text-[11px]',
            verified ? 'font-bold text-[var(--sovereign)]' : 'text-foreground-muted',
          )}
        >
          <Lock className="h-3 w-3 text-[var(--sovereign)]" />
          {verified ? 'Hₙ = SHA256(Hₙ₋₁ ‖ payload) verified' : 'SHA-256 linked'}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-10 font-mono text-[12px] text-foreground-muted shadow-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the chain…
        </div>
      ) : tail.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-[13px] text-foreground-secondary shadow-sm">
          No records yet. The first task run on this host writes the opening block.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tail.map((event, index) => {
            const sequence = event.sequence ?? event.seq ?? index + 1
            const category = (event.category || 'system').toLowerCase()
            const colour = CATEGORY_COLOUR[category] || 'var(--foreground)'
            const hash = event.hash || ''
            const previous = event.prev_hash || event.prevHash || ''

            return (
              <div
                key={event.id || event.hash || index}
                className={cn(
                  'group relative flex flex-col justify-between gap-3 rounded-xl border bg-surface p-4 shadow-sm transition-all duration-200 hover:border-foreground hover:shadow-md',
                  verified && 'border-[var(--sovereign)]/50 ring-1 ring-[var(--sovereign)]/40',
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold tabular-nums text-foreground-muted">
                      BLOCK #{sequence}
                    </span>
                    <span
                      className="rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase"
                      style={{ borderColor: colour, color: colour }}
                    >
                      {category}
                    </span>
                  </div>
                  <h4 className="mt-2 text-[13px] font-semibold text-foreground transition-colors group-hover:text-[var(--sovereign)]">
                    {event.action}
                  </h4>
                </div>

                <div className="flex flex-col gap-1 rounded border border-border bg-surface-sunken p-2 font-mono text-[9px] text-foreground-muted">
                  <div className="truncate">
                    <span className="text-foreground">HASH: </span>
                    <span className="text-[var(--sovereign)]">
                      {hash ? `${hash.slice(0, 14)}…` : '—'}
                    </span>
                  </div>
                  <div className="truncate">
                    <span>PREV: </span>
                    <span>{previous ? `${previous.slice(0, 14)}…` : '— genesis'}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** One record. The hash pair is what makes it evidence, so it is always shown. */
function AuditRow({
  event,
  open,
  onToggle,
}: {
  event: AuditEvent
  open: boolean
  onToggle: () => void
}) {
  const sequence = event.sequence ?? event.seq
  const category = (event.category || 'system').toLowerCase()
  const colour = CATEGORY_COLOUR[category] || 'var(--foreground)'
  const at = event.at ? new Date(event.at) : null
  const detail = event.detail && Object.keys(event.detail).length > 0 ? event.detail : null

  return (
    <div className="bg-surface transition-colors hover:bg-surface-sunken/60">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-col gap-2 p-4 text-left sm:flex-row sm:items-center sm:justify-between"
      >
        <span className="flex min-w-0 items-start gap-4">
          <span className="shrink-0 pt-0.5 font-mono text-[11px] font-bold tabular-nums text-foreground-muted">
            #{sequence ?? '—'}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <span
                className="font-mono text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ color: colour }}
              >
                {category}
              </span>
              <span className="font-mono text-[10px] text-foreground-muted">
                · {event.actor}
                {event.actor_role ? ` (${event.actor_role})` : ''}
              </span>
            </span>
            <span className="text-[13px] font-medium text-foreground">{event.action}</span>
            {event.task_id && (
              <span className="font-mono text-[10px] text-foreground-muted">
                task {event.task_id.slice(0, 8)}
              </span>
            )}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-4 self-end sm:self-center">
          {at && (
            <span
              className="font-mono text-[11px] tabular-nums text-foreground-muted"
              title={at.toISOString()}
            >
              {at.toLocaleTimeString()}
            </span>
          )}
          <span className="font-mono text-[11px] text-foreground-muted" title={event.hash}>
            {event.hash ? `${event.hash.slice(0, 8)}…` : '—'}
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-foreground-muted transition-transform',
              open && 'rotate-180',
            )}
          />
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border bg-surface-sunken/40 px-4 py-4 pl-[3.25rem]">
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Field label="This record" value={event.hash} />
            <Field label="Previous record" value={event.prev_hash || event.prevHash} />
            <Field label="Recorded at" value={at ? at.toISOString() : undefined} />
            <Field label="Task" value={event.task_id || undefined} />
          </div>
          {detail && (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
                Detail
              </span>
              <pre className="overflow-x-auto rounded border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-foreground-secondary">
                {JSON.stringify(detail, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
        {label}
      </span>
      <span className="break-all font-mono text-[11px] text-foreground-secondary">
        {value || '—'}
      </span>
    </div>
  )
}
