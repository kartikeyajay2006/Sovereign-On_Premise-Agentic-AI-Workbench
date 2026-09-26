'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight, Keyboard, RotateCcw, Square } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/toast'
import { Button } from '@/shared/ui/controls/button'
import { ErrorState } from '@/shared/ui/data/error-state'
import { harnessApi } from '../api'
import { useChildTimeline } from '../hooks/use-child-timeline'
import { useElapsed } from '../hooks/use-elapsed'
import { useHarnessRun } from '../hooks/use-harness-run'
import { LANES, laneView, type LaneId } from '../model/timeline'
import type { HarnessChildView } from '../model/types'
import { AnswerMatrix } from './control/answer-matrix'
import { EvidenceGraph } from './control/evidence-graph'
import { KeyboardHelp } from './control/keyboard-help'
import { RunRail } from './control/run-rail'
import { StageLanes } from './control/stage-lanes'
import { LABEL, LABEL_STRONG, MONO } from './control/style'
import { writePrefill } from './harness-configure'
import { ACTIVE_RUN } from './outcome'
import { CopyValue, Ledger, Notice, RunStatusBadge } from './parts'
import { ReportPanel } from './report-panel'
import { formatClock, formatDuration, plural } from './format'

/**
 * Harness Control: one run, side by side.
 *
 * Children run one at a time -- the runner waits for each to settle and
 * the task service has one worker -- so "side by side" never means two
 * children at once. It means the live child's stages as parallel lanes on
 * one time axis, beside the claim -> evidence graph the settled children
 * have built; and the children themselves as a rail and a matrix. The
 * header says SERIAL · 1 WORKER so nobody reads the rail as a pool.
 *
 * Every figure on this screen is one the backend measured or emitted: the
 * run record (re-read on each harness.* event), the child's task record,
 * and the child's own task.* events. A key press changes what is shown at
 * once and never starts a motion.
 */
export interface HarnessRunScreenProps {
  runId: string
  onBack: () => void
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function HarnessRunScreen({ runId, onBack }: HarnessRunScreenProps) {
  const router = useRouter()
  const { push } = useToast()
  const { run, signals, error, fetchedAt, replace } = useHarnessRun(runId)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [follow, setFollow] = useState(true)
  const [picked, setPicked] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [laneIndex, setLaneIndex] = useState(2)
  const [step, setStep] = useState<number | null>(null)
  const [help, setHelp] = useState(false)
  const graphRef = useRef<HTMLDivElement>(null)
  const matrixRef = useRef<HTMLDivElement>(null)

  const elapsed = useElapsed(run?.created_at ?? null, run?.finished_at ?? null, run?.server_time ?? null, fetchedAt)

  const children = useMemo(() => run?.children ?? [], [run])
  const active = run ? ACTIVE_RUN.has(run.status) : false
  const liveChild = active ? (children.find((child) => child.index === run?.current_index) ?? null) : null
  const lastRun = [...children].reverse().find((child) => child.task_id) ?? null
  const selected: HarnessChildView | null =
    follow && liveChild
      ? liveChild
      : (children.find((child) => child.index === picked) ?? liveChild ?? lastRun ?? children[0] ?? null)
  const live = Boolean(selected && liveChild && selected.index === liveChild.index && (selected.outcome === 'running' || selected.outcome === 'queued'))

  const { timeline, loaded, error: timelineError } = useChildTimeline(selected?.task_id ?? null, live)
  const moments = useMemo(() => laneView(timeline).moments, [timeline])
  const until = step !== null && moments.length > 0 ? moments[Math.min(step, moments.length - 1)] : null

  // A different child is a different timeline; its replay starts from the end.
  const selectedKey = selected?.key ?? null
  useEffect(() => setStep(null), [selectedKey])

  // SEAL: only a release this page saw. A report already released when the
  // run was opened is drawn sealed, without the sequence.
  const record = run?.report?.record ?? null
  const sealKey = record ? `${record.version}|${record.released}` : null
  const sealAtOpen = useRef<string | null | undefined>(undefined)
  if (run && sealAtOpen.current === undefined) sealAtOpen.current = sealKey
  const sealAnimate = Boolean(record?.released) && sealKey !== sealAtOpen.current

  // ------------------------------------------------------------ keyboard
  const keys = useRef<(event: KeyboardEvent) => void>(() => {})
  keys.current = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return
    const position = selected ? children.findIndex((child) => child.index === selected.index) : -1
    const pick = (child: HarnessChildView | undefined) => {
      if (!child) return
      setFollow(false)
      setPicked(child.index)
    }
    switch (event.key) {
      case 'j':
        pick(children[Math.min(children.length - 1, position + 1)])
        break
      case 'k':
        pick(children[Math.max(0, position - 1)])
        break
      case 'h':
        setLaneIndex((index) => Math.max(0, index - 1))
        break
      case 'l':
        setLaneIndex((index) => Math.min(LANES.length - 1, index + 1))
        break
      case 'Enter':
        // A focused control's own Enter is that control's; this one is for
        // the page.
        if (!selected || (event.target instanceof HTMLElement && /^(BUTTON|A|SUMMARY)$/.test(event.target.tagName))) return
        setExpanded((open) => (open === selected.index ? null : selected.index))
        break
      case 'o':
        if (!selected?.task_id) return
        router.push(`/console?run=${selected.task_id}`)
        break
      case 'g':
        graphRef.current?.focus()
        break
      case 'm':
        matrixRef.current?.focus()
        break
      case '.':
        setFollow(true)
        setPicked(null)
        setStep(null)
        break
      case '[':
        if (moments.length === 0) return
        setStep((current) => Math.max(0, (current ?? moments.length - 1) - 1))
        break
      case ']':
        if (moments.length === 0) return
        setStep((current) => (current === null || current + 1 >= moments.length - 1 ? null : current + 1))
        break
      case '?':
        setHelp((open) => !open)
        break
      case 'Escape':
        if (help) setHelp(false)
        else if (expanded !== null) setExpanded(null)
        else if (step !== null) setStep(null)
        else return
        break
      default:
        if (/^[1-9]$/.test(event.key)) {
          pick(children.find((child) => child.index === Number(event.key)))
          break
        }
        return
    }
    event.preventDefault()
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keys.current(event)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!run) {
    if (error) {
      return (
        <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>
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
    return <p className={cn(LABEL, 'mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6')}>Reading the run…</p>
  }

  const notYetSubmitted = children.filter((child) => child.outcome === 'pending').length
  const aggregating = active && signals.aggregating && signals.written === null

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
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>
          Harnesses
        </Button>
        <span className="flex flex-wrap items-center gap-2">
          {error && (
            <span className={cn(LABEL, 'text-[var(--hv-critical)]')}>
              Last read failed · {String(error.detail || error.message)} · retrying
            </span>
          )}
          <button
            type="button"
            onClick={() => setHelp((open) => !open)}
            className={cn(LABEL, 'inline-flex h-7 items-center gap-1.5 border border-line-default px-2 hover:text-foreground')}
            aria-expanded={help}
          >
            <Keyboard className="size-3.5" aria-hidden /> ? keys
          </button>
          {!active && (
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={runAgain}>
              Run again with these inputs
            </Button>
          )}
          {run.permissions.can_cancel && !confirmCancel && (
            <Button variant="secondary" size="sm" icon={Square} onClick={() => setConfirmCancel(true)}>
              Stop run
            </Button>
          )}
        </span>
      </div>

      {/* ------------------------------------------------------------ header */}
      <header className="flex flex-col gap-2 border-b border-line-default pb-3">
        <h1 className="text-[32px] font-light leading-[1.05] tracking-[-0.03em] text-foreground [font-stretch:88%]">
          {run.harness.name}
        </h1>
        <p className={cn(LABEL, 'flex flex-wrap items-center gap-x-3 gap-y-1')}>
          <span className="inline-flex items-center gap-1">
            run <CopyValue label="run id" value={run.id} display={run.id.slice(0, 8)} />
          </span>
          <span aria-hidden>·</span>
          <span className="border border-foreground px-1.5 text-foreground" title="Children run one at a time: the runner waits for each to settle, and the task service has one worker.">
            serial · 1 worker
          </span>
          <span aria-hidden>·</span>
          <span title="From the run's start, on the server's clock">
            {active ? 'elapsed' : 'took'} <span className={cn(MONO, 'text-foreground')}>{formatDuration(elapsed)}</span>
          </span>
          <span aria-hidden>·</span>
          <span title={`${run.harness.source} v${run.harness.version} · sha256 ${run.harness.sha256}`}>
            def sha256 <span className={cn(MONO, 'text-foreground')}>{run.harness.sha256.slice(0, 12)}</span> · v
            {run.harness.version}
          </span>
          <span aria-hidden>·</span>
          <RunStatusBadge status={run.status} />
        </p>
        <p className="text-[13px] text-foreground-muted">
          Started by {run.user_display_name} at {formatClock(run.created_at)}.
          {run.cancel_requested_at && ` Stop requested by ${run.cancel_requested_by} at ${formatClock(run.cancel_requested_at)}.`}
        </p>
        {confirmCancel && (
          <Notice className="flex flex-col gap-3">
            <span className="text-foreground">
              Stop this run? The child in flight is stopped through the task service and ends at its next stage boundary
              {notYetSubmitted > 0 ? `; ${plural(notYetSubmitted, 'item')} not yet submitted will never run` : ''}. Settled
              runs keep their records, and a partial report is still written.
            </span>
            <span className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" size="sm" onClick={() => void cancel()} busy={cancelling} busyLabel="Stopping…" ground="sunken">
                Stop run
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(false)} ground="sunken" disabled={cancelling}>
                Keep running
              </Button>
            </span>
          </Notice>
        )}
        {actionError && <p className="text-[13px] text-[var(--hv-critical)]">{actionError}</p>}
        {run.error && (
          <p className="border-l-2 border-[var(--hv-critical)] bg-surface-sunken px-3 py-2 text-[13px] text-foreground">{run.error}</p>
        )}
      </header>

      {/* ---------------------------------------------------------- run rail */}
      <div className="border border-line-default bg-surface">
        <RunRail
          run={run}
          selected={selected?.index ?? null}
          onSelect={(index) => {
            setFollow(false)
            setPicked(index)
          }}
          aggregating={aggregating}
        />
        <p className={cn(LABEL, 'flex flex-wrap items-center gap-x-3 px-4 py-1.5')}>
          {follow && liveChild ? (
            <span className="text-foreground">following #{liveChild.index} · the child the worker is on</span>
          ) : selected ? (
            <span>
              showing #{selected.index}
              {liveChild ? ` · #${liveChild.index} is live, press . to follow` : ''}
            </span>
          ) : null}
          <span>j/k or 1–9 pick a child</span>
        </p>
      </div>

      {/* ------------------------------------------ lanes | graph, matrix | seal */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <StageLanes
            child={selected}
            timeline={timeline}
            loaded={loaded}
            error={timelineError}
            live={live}
            until={until}
            step={step !== null && moments.length > 0 ? { index: Math.min(step, moments.length - 1), total: moments.length } : null}
            focusedLane={LANES[laneIndex].id as LaneId}
          />
        </div>
        <div className="min-w-0 xl:col-span-4">
          <EvidenceGraph ref={graphRef} run={run} selected={selected?.index ?? null} />
        </div>
        <div className="min-w-0 xl:col-span-8">
          <AnswerMatrix
            ref={matrixRef}
            run={run}
            selected={selected?.index ?? null}
            expanded={expanded}
            onSelect={(index) => {
              setFollow(false)
              setPicked(index)
            }}
            onToggle={(index) => setExpanded((open) => (open === index ? null : index))}
          />
        </div>
        <div className="min-w-0 xl:col-span-4">
          <ReportPanel
            run={run}
            onReplace={replace}
            written={signals.written}
            aggregating={aggregating}
            sealAnimate={sealAnimate}
          />
        </div>
      </div>

      {/*
        Folded, both of them: the caveats and the request are one click away,
        and read in full they would bury the matrix a reader opens a run for.
      */}
      <div className="flex flex-col gap-2">
        <details className="group/fold border border-line-default bg-surface">
          <summary className="flex h-7 cursor-pointer list-none items-center justify-between gap-3 px-3 hover:bg-surface-sunken [&::-webkit-details-marker]:hidden">
            <span className={LABEL_STRONG}>What these outcomes do not establish · {run.limitations.length}</span>
            <ChevronRight aria-hidden className="size-4 text-foreground-muted group-open/fold:rotate-90" />
          </summary>
          <ul className="flex list-disc flex-col gap-2 border-t border-line-subtle py-3 pl-8 pr-3 text-[13px] text-foreground-secondary">
            {run.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </details>
        <details className="group/asked border border-line-default bg-surface">
          <summary className="flex h-7 cursor-pointer list-none items-center justify-between gap-3 px-3 hover:bg-surface-sunken [&::-webkit-details-marker]:hidden">
            <span className={LABEL_STRONG}>What was asked, and the scope it ran in</span>
            <ChevronRight aria-hidden className="size-4 text-foreground-muted group-open/asked:rotate-90" />
          </summary>
          <dl className="flex flex-col gap-3 border-t border-line-subtle p-3">
            {Object.entries(run.inputs).map(([key, value]) => (
              <div key={key} className="flex flex-col gap-1">
                <dt>
                  <Ledger>{key}</Ledger>
                </dt>
                <dd className="whitespace-pre-wrap break-words text-[13px] text-foreground">
                  {Array.isArray(value) ? value.join('\n') : value || '—'}
                </dd>
              </div>
            ))}
            {run.excluded.length > 0 && (
              <div className="flex flex-col gap-1">
                <dt>
                  <Ledger>Deselected at preview · never submitted</Ledger>
                </dt>
                <dd className="text-[13px] text-foreground-secondary">{run.excluded.map((entry) => entry.label).join(' · ')}</dd>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <dt>
                <Ledger>Retrieval scope at start</Ledger>
              </dt>
              <dd className="text-[13px] text-foreground-secondary">
                {run.scope.departments === null ? 'Every department' : run.scope.departments.join(', ')} · up to{' '}
                {run.scope.max_classification} · {plural(run.scope.documents, 'document')},{' '}
                {plural(run.scope.sections, 'section')} indexed
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt>
                <Ledger>Template each run was given</Ledger>
              </dt>
              <dd>
                <pre className="whitespace-pre-wrap break-words border-l-2 border-line-strong bg-surface-sunken px-3 py-2 font-mono text-[11px] text-foreground-secondary">
                  {run.harness.template}
                </pre>
              </dd>
            </div>
          </dl>
        </details>
      </div>

      {help && <KeyboardHelp onClose={() => setHelp(false)} />}
    </div>
  )
}
