'use client'

/**
 * The audit trail.
 *
 * Every task, model call, tool execution, policy decision and sign-in on this
 * host, in an append-only log where each record carries the hash of the one
 * before it. Delete or edit a line and the chain no longer computes, which is
 * the whole point, so this screen reports what verification returned rather
 * than asserting the chain is fine.
 *
 * It now verifies twice, independently. The server's check is read as
 * before. A role that may read the whole log can also have this browser
 * download it and recompute every hash itself, record by record, with the
 * sweep drawn as it goes. Each cell and each row turns only once its own hash
 * has been recomputed; nothing is marked checked on a timer. The arithmetic
 * was proved against the real log before it was wired in: all 741 records of
 * storage/logs/audit.jsonl recompute, an edited record fails on its own
 * digest, and a deleted one breaks the next record's link.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, RotateCw, Search, ShieldCheck, X } from 'lucide-react'
import { PageHeader, type PageHeaderStat } from '@/components/page-header'
import { useRole } from '@/components/role-context'
import { useToast } from '@/components/toast'
import { Button } from '@/shared/ui/controls/button'
import { EmptyState } from '@/shared/ui/data/empty-state'
import { LEDGER_MUTED } from '@/shared/ui/data/ledger'
import { FailureState, ReadingLine, clockTime, describeFailure, useReading } from '@/shared/ui/data/reading'
import { cn } from '@/lib/utils'
import { readChain, readExport, readRecords, type AuditRecord } from './api'
import { ChainTail } from './chain-tail'
import { RecordRow, type RowCheck } from './record-list'
import { useChainCheck } from './use-chain-check'
import { VerificationPanel } from './verification-panel'

const PAGE_SIZE = 200
const TAIL_SIZE = 6

function shortHash(hash: string | null | undefined) {
  return hash ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : '—'
}

export function AuditView() {
  const { can } = useRole()
  const { push } = useToast()
  const canReadAll = can('audit.read.all')

  const chain = useReading((signal) => readChain(signal), [])
  const tail = useReading((signal) => readRecords({ limit: TAIL_SIZE }, signal), [])

  const [category, setCategory] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const records = useReading(
    (signal) => readRecords({ category, search: applied || null, limit: PAGE_SIZE }, signal),
    [category, applied],
  )

  const [expanded, setExpanded] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [serverChecking, setServerChecking] = useState(false)
  const [categories, setCategories] = useState<string[]>([])

  const check = useChainCheck((summary) => {
    chain.reload()
    records.reload()
    tail.reload()
    push(
      summary.failureCount === 0
        ? {
            title: 'Chain recomputed in this browser',
            detail: `${summary.total} of ${summary.total} records verify, through #${summary.lastSequence ?? '?'}.`,
            tone: 'sovereign',
          }
        : {
            title: 'The chain does not recompute',
            detail: `${summary.failureCount} record${summary.failureCount === 1 ? '' : 's'} fail. The first is #${summary.firstFailure?.sequence ?? '?'}.`,
            tone: 'critical',
          },
    )
  })

  // Categories come from the log itself: every category seen in an
  // unfiltered read is kept, so choosing one does not make the others vanish
  // from the list of choices.
  useEffect(() => {
    const seen = [...(category ? [] : (records.data ?? [])), ...(tail.data ?? [])].map((r) => r.category)
    if (seen.length === 0) return
    setCategories((prev) => {
      const merged = new Set([...prev, ...seen])
      return merged.size === prev.length ? prev : [...merged].sort()
    })
  }, [records.data, tail.data, category])

  const verify = async () => {
    if (canReadAll) {
      void check.run()
      return
    }
    setServerChecking(true)
    try {
      const status = await readChain()
      chain.setData(() => status)
      push(
        status.valid
          ? { title: 'Chain verified by the server', detail: `${status.events} records recompute.`, tone: 'sovereign' }
          : {
              title: 'The chain does not verify',
              detail: `The server's first mismatch is at #${status.broken_at ?? '?'}.`,
              tone: 'critical',
            },
      )
    } catch (error) {
      const failure = describeFailure(error)
      push({
        title: 'Verification could not run',
        detail: failure.detail ?? 'The workbench service could not be reached.',
        tone: 'critical',
      })
    } finally {
      setServerChecking(false)
    }
  }

  const exportLog = async () => {
    setExporting(true)
    try {
      const text = await readExport()
      const body = typeof text === 'string' ? text : ''
      const lines = body.split('\n').filter((l) => l.trim()).length
      const url = URL.createObjectURL(new Blob([body], { type: 'application/x-ndjson' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `audit-${new Date().toISOString().slice(0, 10)}.jsonl`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      push({
        title: 'Audit log exported',
        detail: `${lines} records, saved by this browser. The export is itself recorded in the chain.`,
        tone: 'sovereign',
      })
      records.reload()
      tail.reload()
    } catch (error) {
      const failure = describeFailure(error)
      push({
        title: failure.kind === 'forbidden' ? 'Export refused' : 'Export failed',
        detail: failure.detail ?? 'The workbench service could not be reached.',
        tone: 'critical',
      })
    } finally {
      setExporting(false)
    }
  }

  const toggle = useCallback((id: string) => setExpanded((cur) => (cur === id ? null : id)), [])

  const openRecord = (record: AuditRecord) => {
    const present = records.data?.some((r) => r.id === record.id)
    if (!present) return
    setExpanded(record.id)
    window.requestAnimationFrame(() =>
      document.getElementById(`record-${record.id}`)?.scrollIntoView({ block: 'center' }),
    )
  }

  const bySequence = useMemo(
    () => new Map((records.data ?? []).map((r) => [r.sequence, r])),
    [records.data],
  )

  // Row glyphs follow the browser check as it sweeps. Before it runs, or
  // for a record appended after the copy it checked, a row carries no glyph
  // at all rather than a borrowed one.
  const rowCheck = (sequence: number): RowCheck => {
    const phase = check.state.phase
    if (phase !== 'sweeping' && phase !== 'done') return undefined
    const result = check.results.current.bySequence.get(sequence)
    if (result) return result
    return phase === 'sweeping' ? 'pending' : undefined
  }

  const server = chain.data
  const checkStat: PageHeaderStat = !canReadAll
    ? { label: 'Browser check', value: 'not for this role', tone: 'muted' }
    : check.state.phase === 'idle'
      ? { label: 'Browser check', value: 'not run', tone: 'muted' }
      : check.state.phase === 'fetching'
        ? { label: 'Browser check', value: 'downloading', tone: 'active' }
        : check.state.phase === 'sweeping'
          ? { label: 'Browser check', value: `${check.state.checked}/${check.state.total}`, tone: 'active' }
          : check.state.phase === 'failed'
            ? { label: 'Browser check', value: 'could not run', tone: 'muted' }
            : check.state.failureCount === 0
              ? { label: 'Browser check', value: `${check.state.total} recompute`, tone: 'sovereign' }
              : { label: 'Browser check', value: `${check.state.failureCount} fail`, tone: 'critical' }

  const busyVerifying =
    serverChecking || check.state.phase === 'fetching' || check.state.phase === 'sweeping'

  const resultNote =
    records.data === null
      ? null
      : records.data.length < PAGE_SIZE
        ? `${records.data.length} record${records.data.length === 1 ? '' : 's'}${category || applied ? ' match' : ''}`
        : `the ${PAGE_SIZE} most recent${category || applied ? ' matching' : ''}`

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Audit"
        description="Every task, model call, tool run, policy decision and sign-in on this host, hash-linked so that altering or removing a record breaks the chain."
        meta={[
          {
            label: 'Chain',
            value: !server ? '—' : server.valid ? 'valid' : `broken at #${server.broken_at ?? '?'}`,
            tone: !server ? 'muted' : server.valid ? 'sovereign' : 'critical',
            hint: server ? `GET /api/audit/chain · checked ${clockTime(Date.parse(server.checked_at))}` : undefined,
          },
          { label: 'Records', value: server ? String(server.events) : '—' },
          { label: 'Head', value: shortHash(server?.head_hash), hint: server?.head_hash ?? undefined },
          checkStat,
        ]}
        actions={
          <>
            {/* The export route needs audit.read.all, so a role without it is
                not offered a button that can only be refused. */}
            {canReadAll && (
              <Button
                variant="ghost"
                size="sm"
                ground="paper"
                icon={Download}
                busy={exporting}
                busyLabel="Exporting…"
                title="Download the log as JSON lines. The export is recorded in the chain."
                onClick={() => void exportLog()}
              >
                Export
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              ground="paper"
              icon={ShieldCheck}
              busy={busyVerifying}
              busyLabel={check.state.phase === 'sweeping' ? 'Recomputing…' : 'Verifying…'}
              onClick={() => void verify()}
            >
              Verify chain
            </Button>
          </>
        }
      />

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-4 pb-16 pt-6 sm:px-6">
        <VerificationPanel
          chain={chain}
          check={check.state}
          results={check.results.current}
          canCheck={canReadAll}
        />

        <section aria-labelledby="tail-heading" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="tail-heading" className="text-heading font-medium tracking-[var(--ls-heading)] text-foreground">
              Newest blocks
            </h2>
            {!canReadAll && (
              <span className="text-ui text-foreground-muted">Only records your role acted in are visible to it.</span>
            )}
          </div>
          {tail.status === 'failed' && !tail.data ? (
            <FailureState failure={tail.failure!} what="the newest records" retry={tail.reload} />
          ) : !tail.data ? (
            <ReadingLine what="the newest records" source="GET /api/audit" startedAt={tail.startedAt} />
          ) : tail.data.length === 0 ? (
            <EmptyState
              className="px-0"
              title="No records yet"
              body="The first action on this host writes the opening block."
            />
          ) : (
            <ChainTail records={tail.data} onOpen={openRecord} />
          )}
        </section>

        <section aria-labelledby="records-heading" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="records-heading" className="text-heading font-medium tracking-[var(--ls-heading)] text-foreground">
              Records
            </h2>
            {resultNote && <span className={LEDGER_MUTED}>{resultNote}</span>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <form
              role="search"
              className="relative min-w-0 flex-1 basis-[240px]"
              onSubmit={(e) => {
                e.preventDefault()
                setApplied(search.trim())
              }}
            >
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search actions, actors, task ids — Enter to search"
                aria-label="Search the audit trail"
                className="hover-decay h-[var(--control-sm)] w-full rounded-[var(--radius)] bg-surface pl-8 pr-8 text-body text-foreground shadow-[0_0_0_1px_var(--control-default)] outline-none placeholder:text-foreground-muted hover:shadow-[0_0_0_1px_var(--control-strong)] focus:shadow-[var(--focus-halo)] [&::-webkit-search-cancel-button]:hidden"
              />
              {(search || applied) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setApplied('')
                  }}
                  aria-label="Clear search"
                  className="hover-decay absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-[var(--radius-xs)] text-foreground-muted hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </form>

            <label className="flex items-center gap-2">
              <span className="sr-only">Category</span>
              <select
                value={category ?? ''}
                onChange={(e) => setCategory(e.target.value || null)}
                className="hover-decay h-[var(--control-sm)] max-w-[200px] rounded-[var(--radius)] bg-surface px-2 text-body text-foreground shadow-[0_0_0_1px_var(--control-default)] outline-none hover:shadow-[0_0_0_1px_var(--control-strong)] focus:shadow-[var(--focus-halo)]"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <Button
              variant="ghost"
              size="sm"
              ground="paper"
              icon={RotateCw}
              busy={records.refreshing}
              busyLabel="Reading…"
              onClick={() => {
                records.reload()
                tail.reload()
                chain.reload()
              }}
            >
              Refresh
            </Button>
          </div>

          {records.status === 'failed' && records.data && (
            <p role="alert" className="text-ui text-critical-text">
              The last refresh failed; these are the records read at {clockTime(records.readAt)}.{' '}
              {records.failure?.detail ?? ''}
            </p>
          )}

          {records.status === 'failed' && !records.data ? (
            <FailureState failure={records.failure!} what="the audit trail" retry={records.reload} />
          ) : (
          <div
            className={cn(
              'overflow-hidden rounded-[var(--radius)] bg-surface shadow-[var(--elev-0)]',
              'transition-opacity duration-[var(--standard)] ease-[var(--ease-standard)]',
              records.refreshing && 'opacity-[var(--opacity-dim)]',
            )}
          >
            {!records.data ? (
              <ReadingLine what="the audit trail" source="GET /api/audit" startedAt={records.startedAt} className="px-4" />
            ) : records.data.length === 0 ? (
              <EmptyState
                title={applied || category ? 'Nothing matches' : 'No records yet'}
                body={
                  applied
                    ? `No record${category ? ` in ${category}` : ''} contains “${applied}”.`
                    : category
                      ? `No ${category} records are visible to this role.`
                      : 'The first action on this host writes the opening record.'
                }
              />
            ) : (
              <ol>
                {records.data.map((record) => (
                  <RecordRow
                    key={record.id}
                    record={record}
                    predecessor={bySequence.get(record.sequence - 1) ?? null}
                    open={expanded === record.id}
                    check={rowCheck(record.sequence)}
                    onToggle={toggle}
                  />
                ))}
              </ol>
            )}
          </div>
          )}
        </section>
      </div>
    </div>
  )
}
