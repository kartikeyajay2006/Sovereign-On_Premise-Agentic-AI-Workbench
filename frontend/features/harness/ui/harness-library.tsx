'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { MeasuredNumber } from '@/shared/motion'
import { ErrorState } from '@/shared/ui/data/error-state'
import { PageHeader } from '@/components/page-header'
import { harnessApi } from '../api'
import type { HarnessCatalogView, HarnessRunSummary, HarnessTally } from '../model/types'
import { ACTIVE_RUN, OUTCOME, OUTCOME_ORDER, UNSETTLED } from './outcome'
import { OutcomeMarker, Panel, RunStatusBadge } from './parts'
import { LABEL, MONO } from './control/style'
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
          <OutcomeMarker outcome={outcome} size={14} />
          {/* ROLL: the runs list is re-read while a run moves. */}
          <MeasuredNumber value={tally.counts[outcome]} className="font-mono text-meta text-foreground-secondary" />
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
    <>
    <PageHeader
      title="Harnesses"
      description="One harness, many items. Each item is an ordinary checked run; the harness ends in one hashed report."
    />
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-4 pb-16 pt-6 sm:px-6">
      <Panel
        title="Library"
        id="harness-library"
      >
        {catalogError ? (
          <div className="p-4">
            <ErrorState
              headline="The harness library could not be read."
              nextAction="Start the workbench service, then reload."
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
          // Square tiles on a 1px-ruled grid, each numbered, in the Hi-Vis
          // manner. The same buttons as before, in the same order, with the
          // same keys: j/k and the arrows move, Enter configures.
          <ul
            role="list"
            onKeyDown={onListKey}
            className="grid list-none grid-cols-1 gap-px bg-line-default p-0 md:grid-cols-2 xl:grid-cols-3"
          >
            {harnesses.map((harness, index) => (
              <li key={harness.id} className="flex bg-surface">
                <button
                  ref={(element) => {
                    rowRefs.current[index] = element
                  }}
                  type="button"
                  tabIndex={index === focused ? 0 : -1}
                  onFocus={() => setFocused(index)}
                  onClick={() => onConfigure(harness.id)}
                  className="group flex min-h-[184px] w-full flex-col gap-3 p-4 text-left hover:bg-surface-sunken focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-foreground"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className={cn(MONO, 'flex size-7 items-center justify-center border border-line-strong text-foreground')}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <ArrowRight
                      className="arrow-shift size-4 shrink-0 text-foreground-muted group-hover:text-action"
                      aria-hidden
                    />
                  </span>
                  <span className="text-[22px] font-light leading-tight tracking-[-0.03em] text-foreground [font-stretch:88%]">
                    {harness.name}
                  </span>
                  <span className="text-[13px] leading-5 text-foreground-secondary">{harness.summary}</span>
                  <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-subtle pt-2">
                    <span className={LABEL}>
                      Fans out over{' '}
                      {harness.expansion_source === 'knowledge_sections'
                        ? 'indexed sections'
                        : harness.inputs.find((input) => input.kind === 'lines')?.label.toLowerCase() ||
                          'lines'}{' '}
                      · up to {harness.max_items}
                    </span>
                    {/* Configuration, so ink: nothing is held until a report exists. */}
                    {harness.report_requires_approval && (
                      <span className={cn(LABEL, 'inline-flex items-center gap-1')}>
                        <span aria-hidden>⏸</span> Report needs approval
                      </span>
                    )}
                    {/* The hash is on the configure screen, beside what it hashes. */}
                    <span className={LABEL}>v{harness.version}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* A definition that failed validation: the words are ink, and the
            failure is carried by the ✕ and the file it names. */}
        {catalog && catalog.errors.length > 0 && (
          <ul role="list" className="flex list-none flex-col border-t border-line-subtle p-0">
            {catalog.errors.map((error) => (
              <li key={error.source} className="grouped-row flex items-start gap-3 px-4 py-3 last:border-b-0">
                <span aria-hidden className="w-4 shrink-0 text-center font-mono text-ui text-critical-text">
                  ✕
                </span>
                <span className="min-w-0 text-ui text-foreground-secondary">
                  <span className="font-mono text-critical-text">{error.source}</span> failed validation and
                  is not offered: <span className="font-mono text-foreground">{error.message}</span>
                </span>
              </li>
            ))}
          </ul>
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
                    className="grid min-h-7 w-full grid-cols-1 gap-x-6 gap-y-1 px-4 py-2 text-left hover:bg-surface-sunken focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-foreground md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center"
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-[13px] text-foreground">{run.harness_name}</span>
                      <span className={LABEL}>
                        {shortId(run.id)} · {run.user_display_name} · {relativeTime(run.created_at)}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className={cn(MONO, 'text-foreground')}>
                        {run.tally.settled} of {plural(run.tally.total, 'item')} settled
                        {run.current_index !== null && (
                          <span className="text-action"> · #{run.current_index} in flight</span>
                        )}
                      </span>
                      <TallyGlyphs tally={run.tally} />
                    </span>
                    <span className="flex flex-col items-start gap-1 md:items-end">
                      <RunStatusBadge status={run.status} />
                      <span className={cn(LABEL, report.tone)}>
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
    </>
  )
}
