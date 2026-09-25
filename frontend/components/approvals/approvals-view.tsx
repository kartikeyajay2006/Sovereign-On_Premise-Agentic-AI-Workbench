'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { RotateCw } from 'lucide-react'
import type { StreamEvent, Task, TaskSummary } from '@/lib/types'
import { useEventStream } from '@/hooks/use-event-stream'
import { APPROVALS_CHANGED_EVENT } from '@/components/navigation'
import { PageHeader } from '@/components/page-header'
import { useToast } from '@/components/toast'
import { useRole } from '@/components/role-context'
import { Button } from '@/shared/ui/controls/button'
import { Segmented } from '@/shared/ui/controls/segmented'
import { EmptyState } from '@/shared/ui/data/empty-state'
import {
  DEFAULT_TIMEOUT_MS,
  FailureState,
  ReadingLine,
  clockTime,
  describeFailure,
  useReading,
} from '@/shared/ui/data/reading'
import { cn } from '@/lib/utils'
import { readHeld, readRuns, readTask, recordDecision } from './api'
import { DecisionDialog, type DecisionKind } from './decision-dialog'
import {
  SENSITIVITY_ORDER,
  awaitingSignature,
  interimSignature,
  mergeQueue,
  type Decision,
  type QueueItem,
} from './model'
import { QueueRow } from './queue-list'
import { ReviewPane, type DetailRead } from './review-pane'

/**
 * The approval queue.
 *
 * A reviewer's working surface, built to be run from the keyboard: j and k
 * (or the arrow keys) move through the queue, Enter opens the selected run,
 * Escape returns to the list, and a or r open the confirm step for approve or
 * reject, where the note is written. After a decision the next held run is
 * selected, so a queue is cleared without reaching for the pointer.
 *
 * Kept from the fixes that preceded this layout: every evidence score is the
 * measured `score`, citations jump to labelled passages, the priority badge
 * nothing computed is gone in favour of the classification the run carries,
 * "Approve & release" appears only when there is a document to release, and
 * there is exactly one approve control.
 *
 * Decided runs are read from the task list rather than remembered by this
 * page, so the Approved and Rejected filters show what the service recorded,
 * including decisions made in another session.
 */

type StatusFilter = Decision | 'all'

interface QueueData {
  /** The queue endpoint refused this role. */
  forbidden: boolean
  held: Task[]
  /** Null when the task list could not be read: decided runs are unknown, not zero. */
  runs: TaskSummary[] | null
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

const NONE_KEPT: ReadonlySet<string> = new Set()

function sensitivityRank(value: string): number {
  const index = (SENSITIVITY_ORDER as readonly string[]).indexOf(value)
  return index === -1 ? SENSITIVITY_ORDER.length : index
}

export function ApprovalsView() {
  const { role, can, user, setRole } = useRole()
  const { push } = useToast()

  const canRead = can('approval.read')
  const canDecide = can('approval.decide')
  const canReadAll = can('task.read.all')
  const reviewer = user?.display_name || role.label

  const queue = useReading<QueueData>(
    async (signal) => {
      const [held, runs] = await Promise.allSettled([
        canRead ? readHeld(signal) : Promise.reject({ status: 403 }),
        readRuns(signal),
      ])
      const runsOrNull = runs.status === 'fulfilled' ? runs.value : null
      if (held.status === 'rejected') {
        const failure = describeFailure(held.reason)
        // Refused by policy is an answer, and the page explains it. Anything
        // else is a failure and is shown as one.
        if (failure.kind === 'forbidden') return { forbidden: true, held: [], runs: runsOrNull }
        throw held.reason
      }
      return { forbidden: false, held: held.value, runs: runsOrNull }
    },
    [canRead],
  )

  // Full records, from opening a decided run or from a decision's response.
  // Cleared on every fresh read of the queue, which supersedes them.
  const [records, setRecords] = useState<Map<string, Task>>(() => new Map())
  useEffect(() => {
    setRecords(new Map())
  }, [queue.readAt])

  /*
   * The queue follows the event stream, so a run held while this screen is
   * open appears without a reload, and a decision made in another session
   * leaves the held list. The stream replays its last fifty events when it
   * connects; those predate this screen and are ignored. Bursts are
   * coalesced into one read, because a finishing run emits several events.
   */
  const mountedAt = useRef(Date.now())
  const reloadTimer = useRef<number | null>(null)
  const { reload: reloadQueue } = queue
  const onStreamEvent = useCallback(
    (event: StreamEvent) => {
      const at = Date.parse(event.at)
      if (!Number.isNaN(at) && at < mountedAt.current) return
      const held =
        event.event === 'task.stage' && String(event.data?.status ?? '').toLowerCase() === 'awaiting_approval'
      if (!held && event.event !== 'task.approval_decided' && event.event !== 'task.approval_signed') return
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current)
      reloadTimer.current = window.setTimeout(() => {
        reloadTimer.current = null
        reloadQueue()
        // The header counts the same queue. Without this, a run held or
        // decided elsewhere moves this screen's Held figure while the tab's
        // count above it stays where it was until the next navigation.
        window.dispatchEvent(new Event(APPROVALS_CHANGED_EVENT))
      }, 600)
    },
    [reloadQueue],
  )
  useEffect(
    () => () => {
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current)
    },
    [],
  )
  const { connected: live } = useEventStream({
    enabled: Boolean(queue.data && !queue.data.forbidden),
    onEvent: onStreamEvent,
  })

  const [status, setStatus] = useState<StatusFilter>('held')
  const [sensitivity, setSensitivity] = useState<string>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [dialog, setDialog] = useState<{ kind: DecisionKind; id: string } | null>(null)
  const [detailRead, setDetailRead] = useState<DetailRead | null>(null)
  const [detailAttempt, setDetailAttempt] = useState(0)
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)
  // Runs decided on this screen since the filter last changed. Each stays in
  // the list it was decided in, showing its new decision, instead of leaving
  // the Held filter the moment it stops being held: the row turning from
  // held to what was decided is the reviewer's confirmation, and it can only
  // be seen if the row is still there. Changing the filter lets them go.
  const [decidedHere, setDecidedHere] = useState<ReadonlySet<string>>(NONE_KEPT)

  const listRef = useRef<HTMLUListElement | null>(null)
  const detailRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const headingId = useId()

  const data = queue.data
  const items = useMemo(
    () => (data && !data.forbidden ? mergeQueue(data.held, data.runs, records) : []),
    [data, records],
  )

  const counts = useMemo(() => {
    const c = { held: 0, approved: 0, rejected: 0, returned: 0 }
    for (const item of items) c[item.decision]++
    return c
  }, [items])

  const sensitivities = useMemo(() => {
    const present = new Set(items.map((i) => i.sensitivity ?? 'unclassified'))
    return [...present].sort((a, b) => sensitivityRank(a) - sensitivityRank(b))
  }, [items])

  const filterItems = useCallback(
    (s: StatusFilter, c: string, kept: ReadonlySet<string> = NONE_KEPT) =>
      items.filter(
        (i) =>
          (s === 'all' || i.decision === s || kept.has(i.id)) &&
          (c === 'all' || (i.sensitivity ?? 'unclassified') === c),
      ),
    [items],
  )
  const filtered = useMemo(
    () => filterItems(status, sensitivity, decidedHere),
    [filterItems, status, sensitivity, decidedHere],
  )

  // The selection survives a filter it does not match only until the filter
  // changes, so a just-decided run stays on screen showing its new state.
  const selected: QueueItem | null =
    items.find((i) => i.id === selectedId) ?? filtered[0] ?? null
  const selectedTask = selected ? (records.get(selected.id) ?? selected.task) : null
  // Separation of duties, as task_service.decide_approval enforces it: the
  // person who ran a task cannot approve or reject it.
  const ownRun = Boolean(user && selectedTask && selectedTask.user_id === user.id)

  // A decided run arrives as a summary; its record is read when it is opened.
  const loadId = selected && !selectedTask ? selected.id : null
  useEffect(() => {
    if (!loadId) {
      setDetailRead(null)
      return
    }
    const controller = new AbortController()
    let timedOut = false
    const timer = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, DEFAULT_TIMEOUT_MS)
    setDetailRead({ id: loadId, status: 'reading', startedAt: Date.now() })
    readTask(loadId, controller.signal)
      .then((task) => {
        setRecords((m) => new Map(m).set(task.id, task))
        setDetailRead(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted && !timedOut) return
        setDetailRead({
          id: loadId,
          status: 'failed',
          startedAt: Date.now(),
          failure: timedOut
            ? { kind: 'timeout', status: null, detail: null, waitedS: DEFAULT_TIMEOUT_MS / 1000 }
            : describeFailure(error),
        })
      })
      .finally(() => window.clearTimeout(timer))
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [loadId, detailAttempt])

  const registerRow = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) rowRefs.current.set(id, el)
    else rowRefs.current.delete(id)
  }, [])

  const focusDetail = useCallback(() => {
    setMobileView('detail')
    // After the detail is visible at phone width.
    window.requestAnimationFrame(() => bodyRef.current?.focus())
  }, [])

  const backToList = useCallback(() => {
    setMobileView('list')
    const id = selected?.id
    window.requestAnimationFrame(() => {
      if (id) rowRefs.current.get(id)?.focus()
    })
  }, [selected?.id])

  const onSelect = useCallback(
    (id: string, viaKeyboard: boolean) => {
      setSelectedId(id)
      if (viaKeyboard) focusDetail()
      else setMobileView('detail')
    },
    [focusDetail],
  )

  const move = (step: 1 | -1) => {
    if (filtered.length === 0) return
    const index = selected ? filtered.findIndex((i) => i.id === selected.id) : -1
    const next =
      index === -1
        ? step > 0
          ? 0
          : filtered.length - 1
        : Math.min(filtered.length - 1, Math.max(0, index + step))
    const id = filtered[next].id
    const readingDetail = Boolean(detailRef.current?.contains(document.activeElement))
    setSelectedId(id)
    const row = rowRefs.current.get(id)
    if (listRef.current?.contains(document.activeElement)) row?.focus()
    row?.scrollIntoView({ block: 'nearest' })
    // The detail remounts for the new run; a reader who was in it stays in it.
    if (readingDetail) window.requestAnimationFrame(() => bodyRef.current?.focus())
  }

  const openDialog = (kind: DecisionKind) => {
    if (!selected || selected.decision !== 'held' || !canDecide || ownRun) return
    setDialog({ kind, id: selected.id })
  }

  // One listener for the screen's keys, reading current state through a ref
  // so it is bound once rather than on every render.
  const onKeyRef = useRef<(event: KeyboardEvent) => void>(() => {})
  onKeyRef.current = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    if (isTypingTarget(event.target)) return
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
    if (!data || data.forbidden) return

    const active = document.activeElement
    const inDetail = Boolean(active && detailRef.current?.contains(active))
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key

    if (key === 'j' || key === 'k' || ((key === 'ArrowDown' || key === 'ArrowUp') && !inDetail)) {
      event.preventDefault()
      move(key === 'j' || key === 'ArrowDown' ? 1 : -1)
    } else if (key === 'Enter' && (active === document.body || active === listRef.current)) {
      if (!selected) return
      event.preventDefault()
      focusDetail()
    } else if (key === 'Escape' && (inDetail || mobileView === 'detail')) {
      event.preventDefault()
      backToList()
    } else if (key === 'a' || key === 'r') {
      if (!selected || selected.decision !== 'held' || !canDecide || ownRun) return
      event.preventDefault()
      openDialog(key === 'a' ? 'approve' : 'reject')
    }
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => onKeyRef.current(event)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const changeFilter = (nextStatus: StatusFilter, nextSensitivity: string) => {
    setStatus(nextStatus)
    setSensitivity(nextSensitivity)
    setDecidedHere(NONE_KEPT)
    const next = filterItems(nextStatus, nextSensitivity)
    if (!selected || !next.some((i) => i.id === selected.id)) setSelectedId(next[0]?.id ?? null)
  }

  const dialogItem = dialog ? (items.find((i) => i.id === dialog.id) ?? null) : null
  const dialogTask = dialogItem ? (records.get(dialogItem.id) ?? dialogItem.task) : null

  const confirmDecision = async (kind: DecisionKind, id: string, note: string): Promise<string | null> => {
    // Where to go next is decided from the queue as it stood before this
    // decision: the nearest run after it that is still held, else before it.
    const before = filtered
    const index = before.findIndex((i) => i.id === id)
    const nextHeld =
      before.slice(index + 1).find((i) => i.decision === 'held') ??
      before.slice(0, Math.max(0, index)).reverse().find((i) => i.decision === 'held') ??
      null
    try {
      // Bound to the version on screen: a run that changed since is refused.
      const seen = records.get(id) ?? items.find((i) => i.id === id)?.task ?? null
      const task = await recordDecision(id, kind, note, seen?.review_digest ?? null)
      setRecords((m) => new Map(m).set(task.id, task))
      setDecidedHere((kept) => new Set(kept).add(task.id))
      setDialog(null)
      // The service has recorded it, so the header's held count re-reads
      // now rather than at the next navigation.
      window.dispatchEvent(new Event(APPROVALS_CHANGED_EVENT))
      const released = task.deliverables.filter((d) => d.released).map((d) => d.filename)
      // One signature of several: the run is still held for the next one.
      const awaiting = awaitingSignature(task)
      push(
        kind === 'approve' && awaiting
          ? {
              title: 'Signature recorded',
              detail: `Nothing was released. Waiting for the ${awaiting.authority}, who ${awaiting.capacity} it. Recorded in the audit chain.`,
              tone: 'default',
            }
          : kind === 'approve'
          ? {
              title: released.length > 0 ? 'Approved and released' : 'Approved',
              detail:
                released.length > 0
                  ? `${released.join(', ')} released. Recorded in the audit chain.`
                  : 'Recorded in the audit chain. There was no file to release.',
              tone: 'sovereign',
            }
          : kind === 'revise'
            ? {
                title: 'Returned for revision',
                detail: 'Nothing was released. Your note went back to the submitter and into the audit chain.',
                tone: 'default',
              }
            : {
                title: 'Rejected',
                detail: 'Nothing was released. Your reason is on the run and in the audit chain.',
                tone: 'default',
              },
      )
      if (nextHeld) {
        setSelectedId(nextHeld.id)
        window.requestAnimationFrame(() => rowRefs.current.get(nextHeld.id)?.scrollIntoView({ block: 'nearest' }))
      } else {
        setSelectedId(task.id)
      }
      return null
    } catch (error) {
      const failure = describeFailure(error)
      return failure.detail
        ? `Not recorded. The service said: ${failure.detail}`
        : 'Not recorded. The service could not be reached.'
    }
  }

  const switchToReviewer = async () => {
    setSwitching(true)
    setSwitchError(null)
    try {
      await setRole('reviewer')
    } catch (error: any) {
      setSwitchError(error?.message ?? 'Could not sign in as the reviewer account.')
      setSwitching(false)
    }
  }

  const forbidden = data?.forbidden === true
  const visibleHeld = data?.runs
    ? data.runs.filter((r) => String(r.status).toLowerCase() === 'awaiting_approval').length
    : null

  return (
    // Sized against the shell's own top inset, not a literal 72px, so the
    // queue and the pane always end at the bottom of the window.
    <div className="flex flex-col lg:h-[calc(100dvh-var(--shell-top))]">
      <PageHeader
        title="Approvals"
        description="Runs held for a person before anything they produced is released. Each decision is recorded against the reviewer who made it."
        // No row of readings: the counts are on the filter below, and who
        // signs is said beside the decision itself.
        actions={
          <>
            {/* The reading's time is kept, in the titles: a header is not the
                place for a clock, and the queue says when it was read to anyone
                who asks. */}
            {queue.readAt !== null && (
              <span
                className="flex items-center gap-2 text-[12.5px] text-foreground-muted"
                title={
                  (live
                    ? 'Connected to the event stream: held runs and decisions arrive without a reload.'
                    : 'Not connected to the event stream: use Refresh to read the queue again.') +
                  ` Read ${clockTime(queue.readAt)}.`
                }
              >
                <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', live ? 'bg-sovereign' : 'bg-control-strong')} />
                {live ? 'Live' : 'Not live'}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              ground="paper"
              icon={RotateCw}
              busy={queue.refreshing}
              busyLabel="Reading…"
              onClick={queue.reload}
              title={queue.readAt !== null ? `Read ${clockTime(queue.readAt)}` : undefined}
            >
              Refresh
            </Button>
          </>
        }
      />

      <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col px-4 pb-6 sm:px-6">
        {queue.status === 'reading' || queue.status === 'idle' ? (
          <ReadingLine what="the approval queue" source="GET /api/approvals" startedAt={queue.startedAt} />
        ) : queue.status === 'failed' && !data ? (
          <FailureState
            failure={queue.failure!}
            what="the approval queue"
            retry={queue.reload}
            className="mt-6"
          />
        ) : forbidden ? (
          <ForbiddenNotice
            roleLabel={role.label}
            held={visibleHeld}
            allRuns={canReadAll}
            switching={switching}
            switchError={switchError}
            onSwitch={() => void switchToReviewer()}
          />
        ) : (
          <>
            {queue.status === 'failed' && queue.failure && (
              <p role="alert" className="mt-4 text-ui text-critical-text">
                The last refresh failed, so this is the queue as read at {clockTime(queue.readAt)}.{' '}
                {queue.failure.detail ?? ''}
              </p>
            )}
            {data?.runs === null && (
              <p className="mt-4 text-ui text-foreground-muted">
                The task list could not be read, so decided runs are not shown. Held runs are
                complete.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Segmented<StatusFilter>
                  label="Decision"
                  value={status}
                  onChange={(v) => changeFilter(v, sensitivity)}
                  options={[
                    { value: 'held', label: 'Held', count: counts.held },
                    { value: 'approved', label: 'Approved', count: data?.runs ? counts.approved : null },
                    { value: 'rejected', label: 'Rejected', count: data?.runs ? counts.rejected : null },
                    { value: 'returned', label: 'Returned', count: data?.runs ? counts.returned : null },
                    { value: 'all', label: 'All', count: items.length },
                  ]}
                />
                {sensitivities.length > 1 && (
                  <Segmented<string>
                    label="Classification"
                    value={sensitivity}
                    onChange={(v) => changeFilter(status, v)}
                    options={[
                      { value: 'all', label: 'Any class' },
                      ...sensitivities.map((s) => ({ value: s, label: s })),
                    ]}
                  />
                )}
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-[var(--radius)] shadow-[var(--elev-0)] lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
              <div
                className={cn(
                  'min-h-0 flex-col bg-surface lg:flex lg:border-r lg:border-line-default',
                  mobileView === 'detail' ? 'hidden' : 'flex',
                )}
              >
                {filtered.length === 0 ? (
                  <QueueEmpty
                    status={status}
                    counts={counts}
                    filteredBySensitivity={sensitivity !== 'all'}
                    onShow={(s) => changeFilter(s, 'all')}
                  />
                ) : (
                  <ul
                    ref={listRef}
                    aria-label="Approval queue"
                    // The keys are said here and on the two decision buttons,
                    // which carry theirs, rather than in a row of their own.
                    title="j and k move through the queue; Enter opens a run"
                    className="min-h-0 flex-1 lg:overflow-y-auto"
                  >
                    {filtered.map((item) => (
                      <QueueRow
                        key={item.id}
                        item={item}
                        selected={selected?.id === item.id}
                        mine={Boolean(user && item.task && item.task.user_id === user.id)}
                        onSelect={onSelect}
                        registerRow={registerRow}
                      />
                    ))}
                  </ul>
                )}
              </div>

              <div
                ref={detailRef}
                className={cn(
                  'min-h-0 flex-col bg-background lg:static lg:z-auto lg:flex',
                  // The reader opened a run at phone width: the detail rises
                  // 8px over the list at full opacity. A slide with no fade,
                  // so it is legible from its first frame.
                  mobileView === 'detail'
                    ? 'fixed inset-x-0 bottom-0 top-14 z-[var(--z-drawer)] flex animate-in slide-in-from-bottom-2 duration-[var(--spatial)] ease-[var(--ease-spatial)] motion-reduce:animate-none lg:animate-none'
                    : 'hidden',
                )}
              >
                {selected ? (
                  <ReviewPane
                    key={selected.id}
                    item={selected}
                    task={selectedTask}
                    detailRead={detailRead && detailRead.id === selected.id ? detailRead : null}
                    canDecide={canDecide}
                    ownRun={ownRun}
                    reviewer={reviewer}
                    onApprove={() => openDialog('approve')}
                    onReject={() => openDialog('reject')}
                    onRevise={() => openDialog('revise')}
                    onBack={backToList}
                    onRetryDetail={() => setDetailAttempt((n) => n + 1)}
                    onTaskUpdated={(task) => setRecords((previous) => new Map(previous).set(task.id, task))}
                    headingId={headingId}
                    bodyRef={bodyRef}
                  />
                ) : (
                  <EmptyState
                    title="Nothing to review"
                    body="When a run in this view is held for a decision, it opens here with its deliverable, evidence and verification."
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {dialog && dialogItem && (
        <DecisionDialog
          key={`${dialog.kind}-${dialog.id}`}
          kind={dialog.kind}
          item={dialogItem}
          filename={dialogTask?.deliverables[0]?.filename ?? null}
          signature={interimSignature(dialogTask)}
          reviewer={reviewer}
          onCancel={() => setDialog(null)}
          onConfirm={(note) => confirmDecision(dialog.kind, dialog.id, note)}
        />
      )}
    </div>
  )
}

function QueueEmpty({
  status,
  counts,
  filteredBySensitivity,
  onShow,
}: {
  status: StatusFilter
  counts: Record<Decision, number>
  filteredBySensitivity: boolean
  onShow: (status: StatusFilter) => void
}) {
  if (filteredBySensitivity) {
    return (
      <EmptyState
        title="Nothing at this classification"
        body="No run in this view carries the classification selected."
        action={
          <Button variant="secondary" size="sm" onClick={() => onShow(status)}>
            Any classification
          </Button>
        }
      />
    )
  }
  if (status === 'held') {
    const decided = counts.approved + counts.rejected + counts.returned
    return (
      <EmptyState
        title="Nothing is waiting for a decision"
        body="Every held run has been released or returned. While this screen is connected to the event stream, a run that needs a signature appears here as soon as it is held."
        action={
          decided > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => onShow('all')}>
              Show {decided} decided
            </Button>
          ) : undefined
        }
      />
    )
  }
  return (
    <EmptyState
      title={status === 'all' ? 'No runs have needed approval' : `No ${status} runs`}
      body={
        status === 'all'
          ? 'None of the runs this role can read was held for a decision.'
          : `None of the recent runs this role can read was ${status}.`
      }
    />
  )
}

function ForbiddenNotice({
  roleLabel,
  held,
  allRuns,
  switching,
  switchError,
  onSwitch,
}: {
  roleLabel: string
  held: number | null
  allRuns: boolean
  switching: boolean
  switchError: string | null
  onSwitch: () => void
}) {
  // A role without approval rights is told what is actually happening,
  // rather than shown an empty queue it will read as "nothing to do".
  const headline =
    held && held > 0
      ? allRuns
        ? `${held} run${held === 1 ? ' is' : 's are'} held on this host, and releasing them is not this role's decision`
        : `${held} of your run${held === 1 ? ' is' : 's are'} held for a reviewer`
      : 'This role cannot open the approval queue'
  return (
    <div className="mt-6 max-w-[72ch] border-l-2 border-approval bg-approval-surface px-4 py-4">
      <p className="text-body font-medium text-foreground">{headline}</p>
      <p className="mt-2 text-body text-foreground-secondary">
        Approval is separated from execution on purpose: whoever ran a task does not sign it off. Your
        role, <span className="font-mono text-ui text-foreground">{roleLabel}</span>, does not hold{' '}
        <span className="font-mono text-ui text-foreground">approval.read</span>, so the queue is closed
        to it.
      </p>
      <p className="mt-2 text-body text-foreground-secondary">
        To decide held runs, sign in as the Approving Reviewer or the Platform Admin.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" ground="paper" busy={switching} busyLabel="Signing in…" onClick={onSwitch}>
          Sign in as reviewer
        </Button>
        {switchError && <span className="text-ui text-critical-text">{switchError}</span>}
      </div>
    </div>
  )
}
