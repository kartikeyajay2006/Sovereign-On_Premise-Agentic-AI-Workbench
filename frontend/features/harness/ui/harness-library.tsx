'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowRight, FileWarning, Lock } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ErrorState } from '@/shared/ui/data/error-state'
import { harnessApi } from '../api'
import type { HarnessCatalogView, HarnessRunSummary, HarnessTally } from '../model/types'
import { ACTIVE_RUN, OUTCOME, OUTCOME_ORDER, UNSETTLED } from './outcome'
import { Ledger, OutcomeMarker, Panel, RunStatusBadge } from './parts'
import { plural, relativeTime, shortId } from './format'

/** The runs list is re-read only while one of them is still moving. */
const RUNS_POLL_MS = 5000

/** Settled outcomes as glyph-and-count pairs; zeros are omitted, not shown as 0. */
export function TallyGlyphs({ tally, className }: { tally: HarnessTally; className?: string }) {
  const present = OUTCOME_ORDER.filter((outcome) => !UNSETTLED.has(outcome) && tally.counts[outcome] > 0)
  if (present.length === 0) return null
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {present.map((outcome) => (
        <span
          key={outcome}
          className="inline-flex items-center gap-1.5"
          title={`${OUTCOME[outcome].label}: ${tally.counts[outcome]}`}
        >
          <OutcomeMarker outcome={outcome} className="size-3.5 text-[9px]" />
          <span className="tabular font-mono text-meta text-foreground-secondary">
            {tally.counts[outcome]}
          </span>
          <span className="sr-only">{OUTCOME[outcome].label}</span>
        </span>
      ))}
    </span>
  )
}

function reportState(run: HarnessRunSummary): { text: string; tone: string } {
  if (run.report_version === null) {
    return ACTIVE_RUN.has(run.status)
      ? { text: 'Written when the run ends', tone: 'text-foreground-muted' }
      : { text: 'No report', tone: 'text-foreground-muted' }
  }
  if (run.report_requires_approval && run.report_decision === 'pending') {
    return { text: `v${run.report_version} · awaiting sign-off`, tone: 'text-approval-text' }
  }
  if (run.report_decision === 'rejected') {
    return { text: `v${run.report_version} · rejected`, tone: 'text-critical-text' }
  }
  return { text: `v${run.report_version} · released`, tone: 'text-foreground-secondary' }
}

export interface HarnessLibraryProps {
  onConfigure: (harnessId: string) => void
  onOpenRun: (runId: string) => void
}

export function HarnessLibrary({ onConfigure, onOpenRun }: HarnessLibraryProps) {
  const [catalog, setCatalog] = useState<HarnessCatalogView | null>(null)
  const [catalogError, setCatalogError] = useState<ApiError | null>(null)
  const [runs, setRuns] = useState<HarnessRunSummary[] | null>(null)
  const [runsError, setRunsError] = useState<ApiError | null>(null)
  const [focused, setFocused] = useState(0)
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    let live = true
    harnessApi
      .catalog()
      .then((value) => live && setCatalog(value))
      .catch((err) => live && setCatalogError(err instanceof ApiError ? err : new ApiError(0, String(err))))
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    let live = true
    let timer: number | undefined
    const read = async () => {
      try {
        const rows = await harnessApi.runs(30)
        if (!live) return
        setRuns(rows)
        setRunsError(null)
        if (rows.some((row) => ACTIVE_RUN.has(row.status))) timer = window.setTimeout(read, RUNS_POLL_MS)
      } catch (err) {
        if (live) setRunsError(err instanceof ApiError ? err : new ApiError(0, String(err)))
      }
    }
    void read()
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [])

  const harnesses = catalog?.harnesses ?? []

  const onListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = harnesses.length - 1
    let next = focused
    if (event.key === 'ArrowDown' || event.key === 'j') next = Math.min(last, focused + 1)
    else if (event.key === 'ArrowUp' || event.key === 'k') next = Math.max(0, focused - 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    else return
    event.preventDefault()
    setFocused(next)
    rowRefs.current[next]?.focus()
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-5 py-8 lg:px-10">
      <header className="flex flex-col gap-2 border-b border-line-default pb-6">
        <Ledger>Harnesses</Ledger>
        <h1 className="text-title font-medium tracking-[var(--ls-title)] text-foreground">
          Whole jobs, every step governed
        </h1>
        <p className="max-w-[72ch] text-body text-foreground-secondary">
          A harness runs many ordinary tasks, one after another. Each is classified, checked
          against policy, grounded in retrieval, verified and, where the rules say so, held for a
          reviewer, exactly as a question typed into the thread. The harness adds the sequence and
          one hashed report of what the runs actually did.
        </p>
      </header>

      <Panel
        title="Library"
        id="harness-library"
        aside={
          harnesses.length > 0 ? (
            <Ledger className="hidden sm:inline">↑↓ move · ↵ configure</Ledger>
          ) : null
        }
      >
        {catalogError ? (
          <div className="p-4">
            <ErrorState
              headline="The harness library could not be read."
              nextAction="Check that the workbench service is running, then reload."
              detail={String(catalogError.detail || catalogError.message)}
            />
          </div>
        ) : catalog === null ? (
          <p className="px-4 py-6 font-mono text-meta text-foreground-muted">Reading definitions…</p>
        ) : harnesses.length === 0 ? (
          <p className="px-4 py-6 text-body text-foreground-secondary">
            No harness is defined on this host. Definitions live in{' '}
            <code className="font-mono text-meta">config/harnesses/*.yaml</code>.
          </p>
        ) : (
          <ul role="list" onKeyDown={onListKey} className="flex list-none flex-col p-0">
            {harnesses.map((harness, index) => (
              <li key={harness.id} className="grouped-row last:border-b-0">
                <button
                  ref={(element) => {
                    rowRefs.current[index] = element
                  }}
                  type="button"
                  tabIndex={index === focused ? 0 : -1}
                  onFocus={() => setFocused(index)}
                  onClick={() => onConfigure(harness.id)}
                  className="hover-decay group flex w-full items-start gap-4 px-4 py-4 text-left hover:bg-surface-sunken focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="text-heading font-medium tracking-[var(--ls-heading)] text-foreground">
                      {harness.name}
                    </span>
                    <span className="max-w-[80ch] text-body text-foreground-secondary">
                      {harness.summary}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <Ledger>
                        Fans out over{' '}
                        {harness.expansion_source === 'knowledge_sections'
                          ? 'indexed sections'
                          : harness.inputs.find((input) => input.kind === 'lines')?.label.toLowerCase() ||
                            'lines'}{' '}
                        · up to {harness.max_items}
                      </Ledger>
                      {harness.report_requires_approval && (
                        <Ledger className="inline-flex items-center gap-1">
                          <Lock className="size-3" aria-hidden /> Report needs sign-off
                        </Ledger>
                      )}
                      <Ledger>
                        v{harness.version} · sha256 {harness.sha256.slice(0, 12)}
                      </Ledger>
                    </span>
                  </div>
                  <ArrowRight
                    className="arrow-shift mt-1 size-4 shrink-0 text-foreground-muted group-hover:text-foreground"
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
        {catalog && catalog.errors.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-line-subtle px-4 py-3">
            {catalog.errors.map((error) => (
              <p key={error.source} className="flex items-start gap-2 text-ui text-critical-text">
                <FileWarning className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <span className="font-mono">{error.source}</span> failed validation and is not
                  offered: <span className="font-mono text-foreground-secondary">{error.message}</span>
                </span>
              </p>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Runs" id="harness-runs">
        {runsError ? (
          <p className="px-4 py-4 text-body text-critical-text">
            Past runs could not be read: {String(runsError.detail || runsError.message)}
          </p>
        ) : runs === null ? (
          <p className="px-4 py-6 font-mono text-meta text-foreground-muted">Reading runs…</p>
        ) : runs.length === 0 ? (
          <p className="px-4 py-6 text-body text-foreground-secondary">
            No harness has run on this host yet.
          </p>
        ) : (
          <ul role="list" className="flex list-none flex-col p-0">
            {runs.map((run) => {
              const report = reportState(run)
              return (
                <li key={run.id} className="grouped-row last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onOpenRun(run.id)}
                    className="hover-decay grid w-full grid-cols-1 gap-x-6 gap-y-2 px-4 py-3 text-left hover:bg-surface-sunken focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center"
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-body font-medium text-foreground">
                        {run.harness_name}
                      </span>
                      <Ledger>
                        {shortId(run.id)} · {run.user_display_name} · {relativeTime(run.created_at)}
                      </Ledger>
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="tabular font-mono text-meta text-foreground">
                        {run.tally.settled} of {plural(run.tally.total, 'item')} settled
                        {run.current_index !== null && (
                          <span className="text-active-text"> · #{run.current_index} in flight</span>
                        )}
                      </span>
                      <TallyGlyphs tally={run.tally} />
                    </span>
                    <span className="flex flex-col items-start gap-1 md:items-end">
                      <RunStatusBadge status={run.status} />
                      <span className={cn('font-mono text-ledger uppercase tracking-[var(--ls-ledger)]', report.tone)}>
                        {report.text}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
