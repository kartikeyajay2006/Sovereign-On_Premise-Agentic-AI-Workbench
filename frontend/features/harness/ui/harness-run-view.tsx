'use client'

import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowUpRight, ChevronRight, RotateCcw, Square } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/toast'
import { Button } from '@/shared/ui/controls/button'
import { ErrorState } from '@/shared/ui/data/error-state'
import { harnessApi } from '../api'
import { useElapsed } from '../hooks/use-elapsed'
import { useHarnessRun } from '../hooks/use-harness-run'
import type { HarnessChildView, HarnessRunView } from '../model/types'
import { ChildDetail } from './child-detail'
import { writePrefill } from './harness-configure'
import { ACTIVE_RUN, OUTCOME, OUTCOME_ORDER, UNSETTLED } from './outcome'
import { CopyValue, Ledger, Notice, OutcomeLabel, OutcomeMarker, Panel, RunStatusBadge } from './parts'
import { ReportPanel } from './report-panel'
import { RunStrip } from './run-strip'
import { formatClock, formatDateTime, formatDuration, plural } from './format'

// ------------------------------------------------------------ in flight
function InFlight({ run }: { run: HarnessRunView }) {
  if (!ACTIVE_RUN.has(run.status)) return null
  const current = run.children.find((child) => child.index === run.current_index) ?? null
  if (run.status === 'cancelling') {
    return (
      <p className="text-ui text-foreground-secondary">
        Stopping{current ? `: #${current.index} ends at its next stage boundary` : ''}. Nothing
        further will be submitted.
      </p>
    )
  }
  if (!current) {
    return <p className="text-ui text-foreground-secondary">Submitting the next item.</p>
  }
  const lead = <span className="tabular font-mono text-foreground">#{current.index}</span>
  if (current.outcome === 'queued') {
    return (
      <p className="text-ui text-foreground-secondary">
        {lead} is queued for the worker
        {current.queue_ahead !== null && current.queue_ahead > 0
          ? `, with ${plural(current.queue_ahead, 'run')} ahead of it`
          : ''}
        .
      </p>
    )
  }
  if (current.outcome === 'running') {
    return (
      <p className="text-ui text-foreground-secondary">
        {lead} is running
        {current.task_status ? (
          <>
            {' '}
            at stage <span className="font-mono text-foreground">{current.task_status}</span>
          </>
        ) : null}
        {current.started_at ? `, first seen running at ${formatClock(current.started_at)}` : ''}.
      </p>
    )
  }
  // The child's record has settled and the runner has not read it yet; it
  // reads every two seconds, so this line is brief.
  return (
    <p className="text-ui text-foreground-secondary">
      {lead} has settled ({OUTCOME[current.outcome].label.toLowerCase()}); the next item follows.
    </p>
  )
}

// ---------------------------------------------------------------- board
function claimsCell(child: HarnessChildView): string {
  if (child.claims_total === null || child.claims_supported === null) return '—'
  return `${child.claims_supported}/${child.claims_total}`
}

function Board({ run }: { run: HarnessRunView }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<number | null>(null)
  const [focused, setFocused] = useState(0)
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])
  const children = run.children

  const move = (to: number) => {
    const next = Math.max(0, Math.min(children.length - 1, to))
    setFocused(next)
    rowRefs.current[next]?.focus()
  }

  const onKey = (event: KeyboardEvent<HTMLOListElement>) => {
    const child = children[focused]
    if (event.key === 'ArrowDown' || event.key === 'j') move(focused + 1)
    else if (event.key === 'ArrowUp' || event.key === 'k') move(focused - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(children.length - 1)
    else if (event.key === 'Escape') setExpanded(null)
    else if (event.key === 'o' && child?.task_id) router.push(`/console?run=${child.task_id}`)
    else return
    event.preventDefault()
  }

  return (
    <ol onKeyDown={onKey} className="flex list-none flex-col p-0" aria-label="Runs in this harness">
      {children.map((child, position) => {
        const open = expanded === child.index
        const current = child.index === run.current_index
        const groupStarts = child.group && child.group !== children[position - 1]?.group
        const spec = OUTCOME[child.outcome]
        return (
          <li key={child.key} className="grouped-row last:border-b-0">
            {groupStarts && (
              <p className="border-b border-line-subtle bg-surface-sunken px-4 py-2 text-ui font-medium text-foreground-secondary">
                {child.group}
              </p>
            )}
            <div className={cn('relative flex items-stretch', current && 'bg-active-surface')}>
              {current && <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-active" />}
              <button
                ref={(element) => {
                  rowRefs.current[position] = element
                }}
                type="button"
                tabIndex={position === focused ? 0 : -1}
                onFocus={() => setFocused(position)}
                onClick={() => setExpanded(open ? null : child.index)}
                aria-expanded={open}
                aria-controls={`harness-child-${child.index}`}
                className="hover-decay grid min-w-0 flex-1 grid-cols-[28px_16px_minmax(0,1fr)] items-start gap-x-3 px-4 py-3 text-left hover:bg-surface-sunken focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none sm:grid-cols-[28px_16px_minmax(0,1fr)_56px_72px]"
              >
                <span className="tabular pt-px font-mono text-meta text-foreground-muted">{child.index}</span>
                <OutcomeMarker outcome={child.outcome} className="mt-0.5" />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="line-clamp-2 text-body text-foreground">{child.label}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <ChevronRight
                      aria-hidden
                      className={cn(
                        'size-3 shrink-0 text-foreground-muted transition-transform duration-[var(--micro)] ease-[var(--ease-micro)] motion-reduce:transition-none',
                        open && 'rotate-90',
                      )}
                    />
                    <span className={cn('shrink-0 font-mono text-ledger uppercase tracking-[var(--ls-ledger)]', spec.text)}>
                      {spec.label}
                    </span>
                    <span className="truncate text-ui text-foreground-muted">{child.outcome_detail}</span>
                  </span>
                </span>
                <span
                  className="tabular hidden pt-px text-right font-mono text-meta text-foreground-secondary sm:block"
                  title="Material claims traced / material claims"
                >
                  {claimsCell(child)}
                </span>
                <span
                  className="tabular hidden pt-px text-right font-mono text-meta text-foreground-muted sm:block"
                  title="How long the child run took, from its own record"
                >
                  {formatDuration(child.duration_ms)}
                </span>
              </button>
              {child.task_id ? (
                <Link
                  href={`/console?run=${child.task_id}`}
                  aria-label={`Open run ${child.index} in the thread`}
                  title="Open this run in the thread"
                  className="hover-decay flex w-10 shrink-0 items-start justify-center pt-3.5 text-foreground-muted hover:bg-surface-sunken hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                >
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              ) : (
                <span className="w-10 shrink-0" aria-hidden />
              )}
            </div>
            {open && (
              <div
                id={`harness-child-${child.index}`}
                className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-[var(--standard)]"
              >
                <ChildDetail child={child} />
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------- screen
export interface HarnessRunScreenProps {
  runId: string
  onBack: () => void
}

export function HarnessRunScreen({ runId, onBack }: HarnessRunScreenProps) {
  const router = useRouter()
  const { push } = useToast()
  const { run, error, fetchedAt, replace } = useHarnessRun(runId)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const elapsed = useElapsed(run?.created_at ?? null, run?.finished_at ?? null, run?.server_time ?? null, fetchedAt)

  const legend = useMemo(() => {
    if (!run) return []
    return OUTCOME_ORDER.filter(
      (outcome) => run.tally.counts[outcome] > 0 || (!UNSETTLED.has(outcome) && outcome !== 'released_unverified'),
    )
  }, [run])

  if (!run) {
    if (error) {
      return (
        <div className="mx-auto w-full max-w-[1200px] px-5 py-8 lg:px-10">
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack} ground="paper">
            Harnesses
          </Button>
          <ErrorState
            className="mt-6"
            headline={
              error.status === 404
                ? 'No harness run has that id.'
                : error.status === 403
                  ? 'This run belongs to someone else.'
                  : 'The run could not be read.'
            }
            nextAction={
              error.status === 403
                ? 'Your role may read only its own harness runs.'
                : 'Return to the library, or retry once the workbench service answers.'
            }
            identifier={{ label: 'run', value: runId }}
            detail={String(error.detail || error.message)}
          />
        </div>
      )
    }
    return (
      <p className="mx-auto w-full max-w-[1200px] px-5 py-8 font-mono text-meta text-foreground-muted lg:px-10">
        Reading the run…
      </p>
    )
  }

  const active = ACTIVE_RUN.has(run.status)
  const notYetSubmitted = run.children.filter((child) => child.outcome === 'pending').length

  const cancel = async () => {
    setCancelling(true)
    setActionError(null)
    try {
      replace(await harnessApi.cancel(run.id))
      setConfirmCancel(false)
      push({
        title: 'Stopping the run',
        detail: 'Nothing further will be submitted. The running child ends at its next stage boundary.',
        tone: 'default',
      })
    } catch (err) {
      setActionError(err instanceof ApiError ? String(err.detail || err.message) : String(err))
    } finally {
      setCancelling(false)
    }
  }

  const runAgain = () => {
    writePrefill(run.harness.id, run.inputs)
    router.push(`/harnesses?harness=${encodeURIComponent(run.harness.id)}`)
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-5 py-8 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack} ground="paper">
          Harnesses
        </Button>
        {error && (
          <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-critical-text">
            Last read failed · {String(error.detail || error.message)} · retrying
          </span>
        )}
      </div>

      {/* ------------------------------------------------------ header */}
      <header className="flex flex-col gap-3 border-b border-line-default pb-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Ledger>Harness run</Ledger>
          <CopyValue label="run id" value={run.id} />
          <RunStatusBadge status={run.status} />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-title font-medium tracking-[var(--ls-title)] text-foreground">
            {run.harness.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {!active && (
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={runAgain} ground="paper">
                Run again with these inputs
              </Button>
            )}
            {run.permissions.can_cancel && !confirmCancel && (
              <Button variant="danger" size="sm" icon={Square} onClick={() => setConfirmCancel(true)} ground="paper">
                Stop run
              </Button>
            )}
          </div>
        </div>
        <p className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
          Started by {run.user_display_name} · {formatDateTime(run.created_at)} ·{' '}
          <span className="tabular">
            {active ? 'elapsed' : 'took'} {formatDuration(elapsed)}
          </span>{' '}
          · {run.harness.source} v{run.harness.version} · sha256 {run.harness.sha256.slice(0, 12)}
        </p>

        {confirmCancel && (
          <Notice className="flex flex-col gap-3">
            <span className="text-foreground">
              Stop this run? The child in flight is stopped through the task service and ends at its
              next stage boundary
              {notYetSubmitted > 0 ? `; ${plural(notYetSubmitted, 'item')} not yet submitted will never run` : ''}.
              Settled runs keep their records, and a partial report is still written.
            </span>
            <span className="flex flex-wrap items-center gap-3">
              <Button variant="danger" size="sm" onClick={() => void cancel()} busy={cancelling} busyLabel="Stopping…" ground="sunken">
                Stop run
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(false)} ground="sunken" disabled={cancelling}>
                Keep running
              </Button>
            </span>
          </Notice>
        )}
        {actionError && <p className="text-ui text-critical-text">{actionError}</p>}
        {run.cancel_requested_at && (
          <p className="text-ui text-foreground-secondary">
            Stop requested by {run.cancel_requested_by} at {formatClock(run.cancel_requested_at)}.
          </p>
        )}
        {run.error && (
          <p className="border-l-2 border-critical bg-surface-sunken px-3 py-2 text-ui text-foreground">
            {run.error}
          </p>
        )}
      </header>

      {/* ---------------------------------------------------- progress */}
      <section aria-label="Progress" className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <p className="flex items-baseline gap-2">
            <span className="tabular text-display font-medium tracking-[var(--ls-display)] text-foreground">
              {run.tally.settled}
            </span>
            <span className="tabular text-title text-foreground-muted">/ {run.tally.total}</span>
            <Ledger className="ml-1">settled</Ledger>
          </p>
          <RunStrip items={run.children} current={run.current_index} />
          <InFlight run={run} />
        </div>
        <ul className="grid list-none grid-cols-1 gap-x-6 gap-y-1.5 p-0 sm:grid-cols-2" aria-label="Outcomes">
          {legend.map((outcome) => (
            <li key={outcome} className="flex items-center justify-between gap-3" title={OUTCOME[outcome].meaning}>
              <OutcomeLabel outcome={outcome} className={run.tally.counts[outcome] === 0 ? 'opacity-[var(--opacity-dim)]' : undefined} />
              <span className="tabular font-mono text-meta text-foreground">{run.tally.counts[outcome]}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ------------------------------------------------------- board */}
      <Panel
        title={run.harness.aggregation === 'requirements_register' ? 'Register' : 'Answer matrix'}
        id="harness-board"
        aside={<Ledger className="hidden md:inline">↑↓ move · ↵ details · o open in thread · esc close</Ledger>}
      >
        <Board run={run} />
      </Panel>

      <ReportPanel run={run} onReplace={replace} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <Panel title="What these outcomes do not establish" id="harness-limits">
          <ul className="flex list-disc flex-col gap-2 py-4 pl-9 pr-4 text-ui text-foreground-secondary">
            {run.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </Panel>
        <Panel title="What was asked" id="harness-inputs-record">
          <dl className="flex flex-col gap-3 p-4">
            {Object.entries(run.inputs).map(([key, value]) => (
              <div key={key} className="flex flex-col gap-1">
                <dt>
                  <Ledger>{key}</Ledger>
                </dt>
                <dd className="whitespace-pre-wrap break-words text-ui text-foreground">
                  {Array.isArray(value) ? value.join('\n') : value || '—'}
                </dd>
              </div>
            ))}
            {run.excluded.length > 0 && (
              <div className="flex flex-col gap-1">
                <dt>
                  <Ledger>Deselected at preview · never submitted</Ledger>
                </dt>
                <dd className="text-ui text-foreground-secondary">
                  {run.excluded.map((entry) => entry.label).join(' · ')}
                </dd>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <dt>
                <Ledger>Retrieval scope at start</Ledger>
              </dt>
              <dd className="text-ui text-foreground-secondary">
                {run.scope.departments === null ? 'Every department' : run.scope.departments.join(', ')} ·
                up to {run.scope.max_classification} · {plural(run.scope.documents, 'document')},{' '}
                {plural(run.scope.sections, 'section')} indexed
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt>
                <Ledger>Template each run was given</Ledger>
              </dt>
              <dd>
                <pre className="whitespace-pre-wrap break-words border-l-2 border-line-strong bg-surface-sunken px-3 py-2 font-mono text-meta text-foreground-secondary">
                  {run.harness.template}
                </pre>
              </dd>
            </div>
          </dl>
        </Panel>
      </div>
    </div>
  )
}
