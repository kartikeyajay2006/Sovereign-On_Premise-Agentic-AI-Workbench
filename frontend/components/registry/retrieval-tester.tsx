'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { History, Search } from 'lucide-react'
import { Append, AppendScope } from '@/shared/motion'
import { Button } from '@/shared/ui/controls/button'
import { Kbd } from '@/shared/ui/controls/kbd'
import { Segmented } from '@/shared/ui/controls/segmented'
import { EmptyState } from '@/shared/ui/data/empty-state'
import { LEDGER_MUTED, Readout, ReadoutRow } from '@/shared/ui/data/ledger'
import { FailureState, describeFailure, type ReadFailure } from '@/shared/ui/data/reading'
import { cn } from '@/lib/utils'
import { search, type Passage, type SearchResponse } from './api'

/* ------------------------------------------------------------------------ */
/* This session's runs.                                                      */
/*                                                                           */
/* Held in module memory, not in sessionStorage or localStorage. The results */
/* carry excerpts of documents that may be classified restricted, and a     */
/* workbench that keeps data on the host should not also leave copies of it  */
/* in browser storage. Memory survives moving between screens and is gone    */
/* on reload, which is what "this session" should mean here.                 */
/* ------------------------------------------------------------------------ */

export interface RunRecord {
  id: number
  query: string
  topK: number
  at: number
  response: SearchResponse
  /** Measured by this browser around the request, network and proxy included. */
  roundTripMs: number
}

const MAX_RUNS = 20
let runs: RunRecord[] = []
let nextId = 1
const listeners = new Set<() => void>()

function addRun(record: Omit<RunRecord, 'id'>): RunRecord {
  const run = { ...record, id: nextId++ }
  runs = [run, ...runs].slice(0, MAX_RUNS)
  listeners.forEach((l) => l())
  return run
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const NO_RUNS: RunRecord[] = []
const getRuns = () => runs
// One stable empty list: React compares snapshots by identity.
const getNoRuns = () => NO_RUNS

const TOP_K = ['3', '5', '10'] as const

const MODE_SCORE: Record<SearchResponse['retrieval_mode'], { unit: string; meaning: string }> = {
  hybrid: {
    unit: 'rrf rel.',
    meaning:
      "Reciprocal rank fusion of two rankings: cosine similarity from the embedding model registered on this host, and BM25 term matching. Divided by the most a passage can earn (first in both), so 1.000 means first in both; these scores rank the passages, they do not measure similarity. Each passage's own ranks are in its evidence record.",
  },
  lexical: {
    unit: 'bm25 rel.',
    meaning:
      'BM25 term matching, divided by the best match. The top result is 1.000 by construction, so these scores rank the passages; they do not measure how similar any one of them is.',
  },
}

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function PassageRow({
  passage,
  mode,
  rank,
}: {
  passage: Passage
  mode: SearchResponse['retrieval_mode']
  /** Position in the service's ranking, which is also the stagger step. */
  rank: number
}) {
  const score = passage.score
  return (
    <Append as="li" index={rank} className="flex flex-col gap-2 border-b border-line-subtle px-4 py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 rounded-[var(--radius-xs)] px-1 font-mono text-ledger text-foreground shadow-[0_0_0_1px_var(--control-default)]">
            {passage.id}
          </span>
          <span className="truncate text-ui font-medium text-foreground">{passage.source_document}</span>
        </span>
        {typeof score === 'number' ? (
          <span className="tabular shrink-0 font-mono text-ui text-foreground">
            {score.toFixed(3)} <span className="text-foreground-muted">{MODE_SCORE[mode].unit}</span>
          </span>
        ) : (
          <span className="shrink-0 font-mono text-ledger text-foreground-muted">no score</span>
        )}
      </div>
      {/* The bar draws the number beside it and nothing else. Relevance is
          a measurement, not a verdict, so it is ink and never green. */}
      {typeof score === 'number' && (
        <div aria-hidden className="h-0.5 w-full bg-line-subtle">
          <div
            className="h-full bg-foreground-muted"
            style={{ width: `${Math.max(0, Math.min(1, score)) * 100}%` }}
          />
        </div>
      )}
      <p className="font-mono text-ledger text-foreground-muted">
        {[passage.location, passage.department, passage.classification, passage.version ? `v${passage.version}` : null]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <p className="text-ui leading-[var(--lh-body)] text-foreground-secondary">{passage.excerpt}</p>
    </Append>
  )
}

/**
 * The retrieval tester.
 *
 * Runs a query against the same index and the same endpoint a task uses, and
 * reports what came back as the service measured it: the retrieval mode it
 * actually used, a score labelled with what that mode's score means, and the
 * service's own timing beside the round trip this browser measured. Every run
 * stays in this session's list, so a query can be compared with itself, and
 * the cold first embedding call with the warm ones after it.
 */
export function RetrievalTester({ canSearch, searchedAs }: { canSearch: boolean; searchedAs: string }) {
  const history = useSyncExternalStore(subscribe, getRuns, getNoRuns)
  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState<(typeof TOP_K)[number]>('5')
  const [shown, setShown] = useState<RunRecord | null>(() => history[0] ?? null)
  // True when `shown` is an answer the service has just returned, false when
  // it was reopened from this session's list: only the first is an arrival.
  const [fresh, setFresh] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<ReadFailure | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  // "/" focuses the query from anywhere on the screen, as it does in most
  // tools that have one search field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      controllerRef.current?.abort()
    }
  }, [])

  const run = async (text: string, k: number) => {
    const q = text.trim()
    if (!q || busy || !canSearch) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    let timedOut = false
    const timer = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 30_000)
    setBusy(true)
    setFailure(null)
    const t0 = performance.now()
    try {
      const response = await search(q, k, controller.signal)
      const record = addRun({ query: q, topK: k, at: Date.now(), response, roundTripMs: performance.now() - t0 })
      setShown(record)
      setFresh(true)
    } catch (error) {
      if (controller.signal.aborted && !timedOut) return
      setFailure(
        timedOut ? { kind: 'timeout', status: null, detail: null, waitedS: 30 } : describeFailure(error),
      )
    } finally {
      window.clearTimeout(timer)
      setBusy(false)
    }
  }

  const result = shown?.response ?? null
  const isLatest = shown !== null && history[0]?.id === shown.id

  const results =
    result && shown ? (
      <section aria-label="Results" className="flex flex-col gap-3">
        <ReadoutRow className="border-b border-line-default pb-3">
          <Readout label="Mode" value={result.retrieval_mode} hint={MODE_SCORE[result.retrieval_mode].meaning} />
          <Readout label="Passages" value={result.results.length} />
          <Readout label="Service" value={`${result.took_ms} ms`} hint="took_ms, measured by the service around the search, query embedding included" />
          <Readout label="Round trip" value={`${Math.round(shown.roundTripMs)} ms`} hint="Measured by this browser: request, proxy, service and response" />
          <Readout label={isLatest ? 'Ran' : 'From'} value={clock(shown.at)} tone={isLatest ? 'default' : 'muted'} />
        </ReadoutRow>
        <p className="max-w-[80ch] text-ui text-foreground-muted">{MODE_SCORE[result.retrieval_mode].meaning}</p>
        {result.results.length === 0 ? (
          <EmptyState
            className="rounded-[var(--radius)] bg-surface shadow-[var(--elev-0)]"
            title="No passage cleared the retrieval threshold"
            body={`Nothing in the index this role can read scored high enough for “${result.query}”. A task asking this would retrieve no evidence, and any citation it made would resolve to nothing.`}
          />
        ) : (
          <ol className="overflow-hidden rounded-[var(--radius)] bg-surface shadow-[var(--elev-0)]">
            {result.results.map((passage, rank) => (
              // Keyed by the run as well, so another run's passages are new
              // rows even where the service reuses an id like S1.
              <PassageRow
                key={`${shown.id}-${passage.id}`}
                passage={passage}
                mode={result.retrieval_mode}
                rank={rank}
              />
            ))}
          </ol>
        )}
      </section>
    ) : null

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault()
            void run(query, Number(topK))
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
            <input
              ref={inputRef}
              value={query}
              disabled={!canSearch}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && query) {
                  e.preventDefault()
                  setQuery('')
                }
              }}
              placeholder="Ask the index what a task would ask it, e.g. severity for cladding damage over 20%"
              aria-label="Retrieval query"
              className="hover-decay h-[var(--control-lg)] w-full rounded-[var(--radius)] bg-surface pl-9 pr-10 text-body text-foreground shadow-[0_0_0_1px_var(--control-default)] outline-none placeholder:text-foreground-muted hover:shadow-[0_0_0_1px_var(--control-strong)] focus:shadow-[var(--focus-halo)] disabled:opacity-[var(--opacity-disabled)]"
            />
            <Kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 sm:inline-flex">/</Kbd>
          </div>
          <div className="flex items-center gap-2">
            <Segmented
              label="Passages to return"
              value={topK}
              onChange={setTopK}
              options={TOP_K.map((k) => ({ value: k, label: `top ${k}` }))}
            />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              ground="paper"
              busy={busy}
              busyLabel="Searching…"
              disabled={!canSearch || !query.trim()}
            >
              Run
            </Button>
          </div>
        </form>

        <p className="text-ui text-foreground-muted">
          {canSearch ? (
            <>
              Runs as {searchedAs}. The service limits retrieval to the departments this role may read,
              exactly as it does for a task.
            </>
          ) : (
            <>
              Your role does not hold <span className="font-mono">knowledge.search</span>, so the service
              refuses retrieval for it.
            </>
          )}
        </p>

        {failure && <FailureState failure={failure} what="the search results" retry={() => void run(query, Number(topK))} />}

        {/* APPEND: the passages the service has just returned, in its rank
            order. The scope is mounted with the tester, before any answer,
            so a fresh answer's rows arrive into a list already on screen. A
            run reopened from this session's list is a read, so it is drawn
            outside the scope and nothing in it moves. */}
        <AppendScope>{fresh ? results : null}</AppendScope>
        {fresh ? null : results}

        {!result && !failure && canSearch && (
          <EmptyState
            className="px-0"
            title="No query run yet"
            body="Results appear here with the mode the service used, what its scores mean, and how long it took."
          />
        )}
      </div>

      <aside aria-label="This session's runs" className="flex min-w-0 flex-col gap-2">
        <h3 className={cn(LEDGER_MUTED, 'flex items-center gap-2')}>
          <History className="h-3 w-3" aria-hidden />
          This session
        </h3>
        {history.length === 0 ? (
          <p className="text-ui text-foreground-muted">
            Each run is listed here until you reload, with its mode and timing, so runs can be compared.
            Results are kept in memory only.
          </p>
        ) : (
          <ol className="flex flex-col overflow-hidden rounded-[var(--radius)] bg-surface shadow-[var(--elev-0)]">
            {history.map((entry) => {
              const top = entry.response.results[0]?.score
              const active = shown?.id === entry.id
              return (
                <li key={entry.id} className="border-b border-line-subtle last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShown(entry)
                      setFresh(false)
                      setQuery(entry.query)
                      setTopK((String(entry.topK) as (typeof TOP_K)[number]) ?? '5')
                      setFailure(null)
                    }}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'hover-decay flex w-full flex-col gap-1 px-3 py-2 text-left',
                      'focus-visible:shadow-[inset_0_0_0_2px_var(--foreground)] focus-visible:outline-none',
                      active ? 'bg-[var(--selected-surface)] shadow-[inset_2px_0_0_0_var(--selected-rail)]' : 'hover:bg-surface-sunken',
                    )}
                  >
                    <span className="line-clamp-2 text-ui text-foreground">{entry.query}</span>
                    <span className="tabular flex flex-wrap gap-x-2 font-mono text-ledger text-foreground-muted">
                      <span>{clock(entry.at)}</span>
                      <span>{entry.response.retrieval_mode}</span>
                      <span>{entry.response.results.length} of {entry.topK}</span>
                      <span>{entry.response.took_ms} ms</span>
                      {typeof top === 'number' && <span>top {top.toFixed(3)}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
        {shown && !isLatest && (
          <Button variant="secondary" size="sm" ground="paper" busy={busy} onClick={() => void run(shown.query, shown.topK)}>
            Run this again
          </Button>
        )}
      </aside>
    </div>
  )
}
