'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { DEFAULT_PIPELINE } from '@/lib/presentation'
import type {
  EvidenceItem,
  ModelDescriptor,
  ModelUsage,
  PipelineStage,
  StreamEvent,
  Task,
  Skill,
} from '@/lib/types'
import { useEventStream } from '@/hooks/use-event-stream'
import { useRole } from '@/components/role-context'
import { useToast } from '@/components/toast'
import { NEW_RUN_EVENT } from '@/components/command-palette'
import { APPROVALS_CHANGED_EVENT, RUNS_CHANGED_EVENT, type RunsChangedDetail } from '@/components/navigation'
import { TraceScope } from '@/shared/motion'
import { EvidenceRail } from '@/features/evidence/ui/evidence-rail'
import { harnessApi } from '@/features/harness/api'
import { Composer, type ComposerAttachment } from './composer'
import type { HarnessEntry } from './slash-menu'
import { UserTurn } from './user-turn'
import { AssistantTurn } from './assistant-turn'
import { StarterPrompts, starterAttachment, type StarterTemplate } from './starter-prompts'
import { selectableModels } from './model-menu'
import type {
  AssistantTurn as AssistantTurnModel,
  RunRequest,
  Turn,
  UserTurn as UserTurnModel,
} from '../model/types'
import { appendUsage, choiceFromEvent, choicesFromRouting } from '../model/usage'
import {
  MODEL_STAGE_TO_ROW,
  TERMINAL,
  closeStages,
  enterStage,
  outcomeFor,
  reconcileStages,
  rowForStageEvent,
  stagesFromTask,
} from '../model/board'

/**
 * The thread.
 *
 * One column. A person asks the machine to do something, watches it do it,
 * and checks its work — in that order, without navigating. A completed run
 * stays on screen when the next one starts, which is the whole reason for
 * threading: the previous answer and its evidence remain available while you
 * ask the follow-up.
 *
 * The composer is the first thing on the page. There is no headline, because
 * the emptiness above a composer is composure and does not need a slogan in
 * it.
 */

const PREFERRED_MODEL_KEY = 'aegis.console.preferred-model'

const NO_EVIDENCE: EvidenceItem[] = []

/** Everything a turn shows that the task record is the authority for. */
function recordFields(task: Task) {
  const first = task.deliverables?.[0]
  return {
    taskId: task.id,
    outcome: outcomeFor(String(task.status).toLowerCase()),
    answer: task.answer || null,
    // The checked answer supersedes the draft. Dropping it here is what
    // stops provisional text surviving into the verified slot.
    streamingDraft: null,
    streamProgress: null,
    evidence: task.evidence || [],
    verification: task.verification?.checks || [],
    deliverable: first ? { ...first, sizeKb: Math.round(first.size_bytes / 1024) } : null,
    denialReason: task.error || null,
    elapsedMs: task.duration_ms ?? null,
    usage: task.usage || [],
    modelChoices: choicesFromRouting(task.routing),
    profile: task.profile ? { taskType: task.profile.task_type, sensitivity: task.profile.sensitivity } : null,
    approval: task.approval
      ? {
          reasons: task.approval.reasons || [],
          approverRoles: task.approval.approver_roles || [],
          decision: task.approval.decision ?? null,
          reviewerName: task.approval.reviewer_name ?? null,
          comment: task.approval.comment ?? null,
        }
      : null,
    queue: null,
    stopRequested: false,
  } satisfies Partial<AssistantTurnModel>
}

/** The request a record was dispatched with, so it can be sent again. */
function requestFromTask(task: Task): RunRequest {
  const files = task.files || []
  return {
    // What was typed, so Run again sends it through the same skill.
    prompt: task.skill ? task.skill.input : task.prompt,
    fileIds: files.map((f) => f.id),
    attachments: files.map((f) => ({
      fileId: f.id,
      filename: f.filename,
      sizeBytes: f.size_bytes,
      classification: f.classification,
    })),
    // The analyzer infers a format from the prompt too, so sending the one
    // it settled on reproduces the run whether or not it was chosen by hand.
    format: task.profile?.produces_deliverable ? (task.profile.deliverable_format ?? null) : null,
    preferredModel: task.preferred_model ?? null,
    skill: task.skill ? { id: task.skill.id, name: task.skill.name } : null,
  }
}

/**
 * How far the end of the thread is below the bottom of the window, in px.
 *
 * Measured to the thread's own last element, not the document's height: a
 * box anywhere else on the page that overflowed -- the run rail's labels
 * once did, by the length of its hidden list -- made "the end of the
 * document" a stretch of blank page below the thread, and following a run
 * scrolled into it.
 */
function gapToEnd(end: HTMLElement | null): number {
  if (!end) return document.documentElement.scrollHeight - (window.scrollY + window.innerHeight)
  return end.getBoundingClientRect().bottom - window.innerHeight
}

/** Scroll so the thread's end sits at the bottom of the window. */
function scrollToEnd(end: HTMLElement | null) {
  const top = end
    ? window.scrollY + end.getBoundingClientRect().bottom - window.innerHeight
    : document.documentElement.scrollHeight
  window.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
}

function freshAssistantTurn(id: string, request: RunRequest, at: string): AssistantTurnModel {
  return {
    role: 'assistant',
    id,
    taskId: null,
    outcome: 'running',
    stages: DEFAULT_PIPELINE.map((s) => ({ ...s, status: 'pending' })),
    answer: null,
    releasedLive: false,
    streamingDraft: null,
    streamProgress: null,
    evidence: [],
    verification: [],
    deliverable: null,
    denialReason: null,
    error: null,
    startedAt: at,
    elapsedMs: null,
    stream: 'live',
    usage: [],
    modelChoices: [],
    request,
    stopRequested: false,
    queue: null,
    profile: null,
    approval: null,
  }
}

/**
 * Keep ?run= pointing at the run on screen, through the History API that
 * Next's router listens to, so a reload -- or a link sent to a colleague --
 * lands on the same run without a server round trip.
 */
function replaceRunParam(taskId: string | null) {
  const url = new URL(window.location.href)
  if (taskId) url.searchParams.set('run', taskId)
  else url.searchParams.delete('run')
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

export function ThreadView() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [prompt, setPrompt] = useState('')
  const [format, setFormat] = useState('answer')
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const [busy, setBusy] = useState(false)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const [models, setModels] = useState<ModelDescriptor[] | null>(null)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [preferredModel, setPreferredModel] = useState<string | null>(null)
  const [skills, setSkills] = useState<Skill[] | null>(null)
  const [harnesses, setHarnesses] = useState<HarnessEntry[] | null>(null)
  const [skill, setSkill] = useState<Skill | null>(null)
  // Read by the starter handler, which is memoised and must not be rebuilt.
  const skillsRef = useRef<Skill[] | null>(null)
  skillsRef.current = skills
  const [hint, setHint] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [focusEvidenceId, setFocusEvidenceId] = useState<string | null>(null)
  // Whose evidence the rail shows. It showed the newest turn's whatever was
  // clicked, so [S1] in an earlier answer opened a different run's S1.
  const [evidenceTurnId, setEvidenceTurnId] = useState<string | null>(null)
  // Which past run the thread is showing, and a counter the rail watches so
  // a run that just finished appears without a reload.
  const [openedTaskId, setOpenedTaskId] = useState<string | null>(null)
  const [runsVersion, setRunsVersion] = useState(0)
  const [awayFromEnd, setAwayFromEnd] = useState(false)
  // Bumped by every citation click, so tracing to the same source a second
  // time lands again instead of doing nothing.
  const [traceCount, setTraceCount] = useState(0)

  const { user, role, can } = useRole()
  const { push } = useToast()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  /** The last thing in the thread's column: where following a run stops. */
  const endRef = useRef<HTMLDivElement | null>(null)

  /*
    Refs for what callbacks need to read without being rebuilt. handleEvent
    in particular is handed to the event stream once, and a callback that
    changed identity every render would also defeat the memoised turns --
    and during a draft this component renders twenty times a second.
  */
  const activeTaskIdRef = useRef<string | null>(null)
  activeTaskIdRef.current = activeTaskId
  const busyRef = useRef(false)
  busyRef.current = busy
  const turnsRef = useRef<Turn[]>(turns)
  turnsRef.current = turns
  const openedRef = useRef<string | null>(null)
  const stoppingRef = useRef(false)
  /** Events already applied, so a reconnect's replay is not applied twice. */
  const seenRef = useRef<Set<string>>(new Set())
  /** Whether the reader is at the bottom, and so wants to follow the run. */
  const pinnedRef = useRef(true)
  /** The next scroll event is the thread's own, not the reader's. */
  const programmaticRef = useRef(false)
  /** The next render shows a reopened run, which opens at its top. */
  const openAtTopRef = useRef(false)
  /**
   * Held in a ref because handleEvent is memoised and must not be rebuilt
   * every render, but it has to reach the current settle.
   *
   * More importantly: EVERY path to a terminal state calls this. The first
   * version only called it from task.finished, and a run that ended at
   * awaiting_approval — which is the interesting outcome, the one where a
   * deliverable is held for a human — announced itself through task.stage
   * instead. The turn sat on RUNNING for ever while the backend had long
   * since finished, because the code that loads the answer was on a branch
   * the event never took.
   */
  const settleRef = useRef<(taskId: string, failure?: string) => Promise<void>>(async () => {})
  /** Runs already announced to the header as held, since a run can settle more than once. */
  const announcedHeldRef = useRef<Set<string>>(new Set())

  // What "/" offers. Neither is needed to ask a question, so a failure
  // leaves the menu with less in it rather than saying anything louder.
  // Only for a role that can run work: listing skills needs task.create, and
  // asking without it wrote a refused permission check to the audit chain
  // every time an auditor opened the thread.
  const canRun = can('task.create')
  useEffect(() => {
    if (!canRun) return
    let cancelled = false
    api
      .listSkills()
      .then((list) => {
        if (cancelled) return
        setSkills(list)
        // Arrived from "Use in the thread" on the Skills page.
        const wanted = new URLSearchParams(window.location.search).get('skill')
        const found = wanted ? list.find((s) => s.id === wanted) : undefined
        if (found) {
          setSkill(found)
          textareaRef.current?.focus()
        }
      })
      .catch(() => !cancelled && setSkills([]))
    harnessApi
      .catalog()
      .then((view) => !cancelled && setHarnesses(view.harnesses.map((h) => ({ id: h.id, name: h.name, summary: h.summary }))))
      .catch(() => !cancelled && setHarnesses([]))
    return () => {
      cancelled = true
    }
  }, [canRun])

  useEffect(() => {
    let cancelled = false
    api
      .listModels()
      .then((list) => !cancelled && setModels(list))
      .catch((err: any) => {
        if (cancelled) return
        setModels([])
        setModelsError(err?.detail || err?.message || 'unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // A model choice outlives the page, like any chat product's. It is only
  // ever a request, and the menu shows it, so remembering it hides nothing.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PREFERRED_MODEL_KEY)
      if (stored) setPreferredModel(stored)
    } catch {
      // Storage refused (private window, policy). Automatic is the default.
    }
  }, [])

  // A remembered model that is no longer installed is dropped once the list
  // says so, rather than sent with every run to be declined at every stage.
  useEffect(() => {
    if (!models || modelsError || !preferredModel) return
    if (!selectableModels(models).some((m) => m.id === preferredModel)) {
      setPreferredModel(null)
      try {
        window.localStorage.removeItem(PREFERRED_MODEL_KEY)
      } catch {}
    }
  }, [models, modelsError, preferredModel])

  const choosePreferredModel = useCallback((modelId: string | null) => {
    setPreferredModel(modelId)
    try {
      if (modelId) window.localStorage.setItem(PREFERRED_MODEL_KEY, modelId)
      else window.localStorage.removeItem(PREFERRED_MODEL_KEY)
    } catch {}
  }, [])

  /** Mutate one assistant turn in place, found by its turn id. */
  const patchTurn = useCallback(
    (turnId: string, fn: (t: AssistantTurnModel) => AssistantTurnModel) => {
      setTurns((prev) => {
        const index = prev.findIndex((t) => t.id === turnId && t.role === 'assistant')
        if (index === -1) return prev
        const next = [...prev]
        next[index] = fn(prev[index] as AssistantTurnModel)
        return next
      })
    },
    [],
  )

  /** Mutate the turn for one task. Turns never re-order. */
  const patchTask = useCallback(
    (taskId: string, fn: (t: AssistantTurnModel) => AssistantTurnModel) => {
      setTurns((prev) => {
        for (let i = prev.length - 1; i >= 0; i -= 1) {
          const t = prev[i]
          if (t.role === 'assistant' && t.taskId === taskId) {
            const updated = fn(t)
            if (updated === t) return prev
            const next = [...prev]
            next[i] = updated
            return next
          }
        }
        return prev
      })
    },
    [],
  )

  /** Stop following a run: its turn stays, its stream closes. */
  const detach = useCallback(() => {
    activeTaskIdRef.current = null
    busyRef.current = false
    setBusy(false)
    setActiveTaskId(null)
    // The run is now in the record, so the rail should show it.
    setRunsVersion((n) => n + 1)
  }, [])

  /**
   * Leave a live run without stopping it. Said out loud, because the two
   * look alike from here: the run keeps going on the host, and Runs can
   * bring it back.
   */
  const leaveLiveRun = useCallback(() => {
    detach()
    push({
      title: 'The run is still going',
      detail: 'Leaving it did not stop it. Open it from Runs to follow it again.',
      tone: 'default',
    })
  }, [detach, push])

  const handleEvent = useCallback(
    (event: StreamEvent) => {
      const { event: name, data } = event
      if (!data || !name.startsWith('task.')) return
      const id = activeTaskIdRef.current
      // Scoped to the run this thread is attached to. A person who may read
      // every task receives every task's events, and another operator's run
      // would otherwise have written its stages into this turn.
      if (!id || (event.task_id && event.task_id !== id)) return

      // The text so far, as the model produces it. Replaced, never
      // appended: each frame carries the whole visible draft, so a frame
      // lost to an EventSource reconnect is repaired by the next one instead
      // of leaving a permanent gap. Appending is what made a draft start
      // mid-sentence.
      //
      // Routed by stage, because not every stage produces prose.
      // `drafting` is the reader's text. `planning` is JSON, so its frames
      // drive a progress readout and nothing more -- showing a reader raw
      // `{"steps":` is worse than showing them a stage that is honestly
      // still working.
      if (name === 'task.token') {
        if (typeof data.text !== 'string') return
        const stage = String(data.stage || '')
        const text: string = data.text
        patchTask(id, (t) =>
          t.stream !== 'live'
            ? t
            : stage === 'drafting'
              ? { ...t, streamingDraft: text }
              : { ...t, streamProgress: { stage, chars: text.length } },
        )
        return
      }

      // A reconnect replays the recent record for this task. Applied again,
      // an old stage event would reopen a stage that has already finished,
      // and an old usage record would count a call twice.
      const key = `${name}|${event.at}|${JSON.stringify(data)}`
      if (seenRef.current.has(key)) return
      seenRef.current.add(key)

      switch (name) {
        case 'task.stage': {
          const status = String(data.status || '').toLowerCase()
          const target = rowForStageEvent(data.phase, status)
          const message = typeof data.message === 'string' ? data.message : ''
          const terminal = TERMINAL.has(status)
          patchTask(id, (t) => {
            let stages = target ? enterStage(t.stages, target, event.at, message, Boolean(data.skipped)) : t.stages
            // The board closes on the event, timed by it. The outcome waits
            // for the record: set here, a held run showed "finished without
            // an answer" for the moment before its answer was read back.
            if (terminal) stages = closeStages(stages, outcomeFor(status), event.at)
            return { ...t, stages, queue: null }
          })
          // Terminal via task.stage — including awaiting_approval, which is
          // how a held deliverable reports. Load the record.
          if (terminal) void settleRef.current(id)
          return
        }

        case 'task.queued':
          // Measured by the worker queue: how many runs hold the worker
          // ahead of this one. Absent, it says nothing rather than zero.
          if (data.running) {
            patchTask(id, (t) => (t.queue ? { ...t, queue: null } : t))
          } else if (typeof data.ahead === 'number') {
            const queue = {
              position: typeof data.position === 'number' ? data.position : null,
              ahead: data.ahead,
            }
            patchTask(id, (t) => ({ ...t, queue }))
          }
          return

        case 'task.model_selected': {
          const choice = choiceFromEvent(data)
          const row = choice.stage ? MODEL_STAGE_TO_ROW[choice.stage] : undefined
          const label = choice.displayName || choice.model
          patchTask(id, (t) => ({
            ...t,
            modelChoices: [...t.modelChoices, choice],
            stages:
              row && label ? t.stages.map((s) => (s.id === row ? { ...s, model: label } : s)) : t.stages,
          }))
          return
        }

        case 'task.model_completed': {
          const record = data.usage
          if (!record || typeof record.stage !== 'string' || typeof record.latency_ms !== 'number') return
          patchTask(id, (t) => {
            const usage = appendUsage(t.usage, record as ModelUsage)
            return usage === t.usage ? t : { ...t, usage }
          })
          return
        }

        case 'task.tool_completed':
          // Attachments are read by a tool, not announced as a stage, so the
          // Read row learns of them here. A failed read is not a done one.
          if (data.tool === 'file_read') {
            const ok = Boolean(data.ok)
            patchTask(id, (t) => ({
              ...t,
              stages: t.stages.map((s): PipelineStage =>
                s.id !== 'read' || s.status === 'failed'
                  ? s
                  : { ...s, status: ok ? 'done' : 'failed' },
              ),
            }))
          }
          return

        // The payload key is `items`, and it carries the whole retrieved set.
        case 'task.evidence':
          if (Array.isArray(data.items)) {
            patchTask(id, (t) => {
              const seen = new Set(t.evidence.map((e) => e.id))
              const fresh = data.items.filter((i: any) => !seen.has(i.id))
              return fresh.length ? { ...t, evidence: [...t.evidence, ...fresh] } : t
            })
          }
          return

        // The verification report arrives unwrapped.
        case 'task.verified':
          if (Array.isArray(data.checks)) patchTask(id, (t) => ({ ...t, verification: data.checks }))
          return

        case 'task.cancelled':
          // Two publishers. The task service answers the stop request at
          // once, saying whether the run had started; the orchestrator
          // reports when the run has actually ended, and task.finished
          // follows. A run stopped before it began has no finish to wait for.
          if (data.was_running === false) void settleRef.current(id)
          else if (data.was_running === true) patchTask(id, (t) => ({ ...t, stopRequested: true }))
          return

        case 'task.finished':
        case 'task.blocked':
          void settleRef.current(id)
          return

        case 'task.failed':
          void settleRef.current(id, typeof data.reason === 'string' ? data.reason : 'The run failed.')
          return
      }
    },
    [patchTask],
  )

  useEventStream({ taskId: activeTaskId, enabled: busy && Boolean(activeTaskId), onEvent: handleEvent })

  /**
   * The authoritative read.
   *
   * Everything a finished turn shows comes from the task record, never
   * reassembled from event payloads. The stream is an optimisation; the
   * snapshot is the truth. Events are dropped for a subscriber that falls
   * behind, so a lost event must not be able to leave a completed run
   * displaying as empty.
   *
   * A record that does not yet say the run ended is left alone -- the
   * stream and the poll below carry on -- unless a failure was reported
   * outright, which a worker crash does without ever updating the record.
   * A read that fails is also left to the poll: it says nothing about how
   * the run ended, so it must not be shown as the run failing.
   */
  const settle = useCallback(
    async (taskId: string, failure?: string) => {
      let task: Task
      try {
        task = await api.getTask(taskId)
      } catch {
        return
      }
      const status = String(task.status).toLowerCase()
      if (TERMINAL.has(status)) {
        const outcome = outcomeFor(status)
        const recorded = stagesFromTask(task, false, DEFAULT_PIPELINE)
        patchTask(taskId, (t) => ({
          ...t,
          ...recordFields(task),
          // The live board, closed -- not the record's reconstruction,
          // which has nowhere to keep the timings the live one measured --
          // then corrected wherever the record shows a stage the stream
          // failed to report.
          stages: reconcileStages(
            closeStages(t.stages, outcome, task.completed_at || task.updated_at, task.error),
            recorded,
          ),
          stream: 'closed',
          // This read is the release: every path to it is the run this
          // thread is following, so the reader is watching the answer land.
          releasedLive: true,
        }))
        // The answer has landed: shown once, to a reader who was following,
        // after it has laid out. Nothing moves the page after this.
        if (pinnedRef.current) {
          window.requestAnimationFrame(() => {
            programmaticRef.current = true
            scrollToEnd(endRef.current)
          })
        }
        // A run held for a person has just joined the approval queue, so the
        // header reads its count again now rather than at the next
        // navigation. Once per run, however many times it settles.
        if (status === 'awaiting_approval' && !announcedHeldRef.current.has(taskId)) {
          announcedHeldRef.current.add(taskId)
          window.dispatchEvent(new Event(APPROVALS_CHANGED_EVENT))
        }
      } else if (failure) {
        patchTask(taskId, (t) => ({
          ...t,
          outcome: 'failed',
          error: failure,
          streamingDraft: null,
          streamProgress: null,
          stages: closeStages(t.stages, 'failed', null),
          stream: 'closed',
        }))
      } else {
        return
      }
      if (activeTaskIdRef.current === taskId) detach()
    },
    [patchTask, detach],
  )

  settleRef.current = settle

  /**
   * A safety net for a dropped stream.
   *
   * The event stream is an optimisation, not the source of truth, and it does
   * drop: a long run on this host produced ERR_INCOMPLETE_CHUNKED_ENCODING on
   * /api/events and the turn sat on RUNNING for ever, because the terminal
   * event that triggers the authoritative read never arrived. The backend had
   * finished two minutes earlier.
   *
   * So while a run is in flight we also ask the API directly every few
   * seconds. This is not polling as a substitute for the stream — the stream
   * still drives every intermediate transition — it is a floor under it, so
   * that losing the connection costs liveness rather than correctness. It is
   * also a real read of a real record, so nothing it displays is invented.
   */
  useEffect(() => {
    if (!busy || !activeTaskId) return
    let live = true
    const id = window.setInterval(async () => {
      try {
        const task = await api.getTask(activeTaskId)
        const status = String(task.status).toLowerCase()
        if (live && TERMINAL.has(status)) {
          window.clearInterval(id)
          await settleRef.current(activeTaskId)
        }
      } catch {
        // A failed poll is not itself news; the next one will try again.
      }
    }, 4000)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [busy, activeTaskId])

  // Follow the run while the reader is at the end, and let go the moment they
  // move away from it -- by intent, not by distance. Following used to hold
  // until the page was 160px from the end, and it re-pinned on every frame of
  // a draft: one notch of the wheel moves ~100px, so a reader scrolling up to
  // re-read something was pulled back down twenty times a second. Now any
  // upward move by the reader releases it at once, and reaching the end
  // again takes it back. Instant, not smooth: a smooth scroll retargeted by
  // every frame lags behind the text it chases.
  useEffect(() => {
    const gap = () => gapToEnd(endRef.current)
    let lastY = window.scrollY
    const release = () => {
      pinnedRef.current = false
    }
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) release()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home') release()
    }
    let touchY = 0
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0
      // A finger moving down the glass scrolls the page up.
      if (y > touchY + 4) release()
      touchY = y
    }
    const onScroll = () => {
      const y = window.scrollY
      // Upward and not ours: the scrollbar dragged, a find-in-page jump.
      if (y < lastY - 1 && !programmaticRef.current) release()
      programmaticRef.current = false
      lastY = y
      if (gap() < 48) pinnedRef.current = true
      // Same value, no render: React bails out, so scrolling costs nothing.
      setAwayFromEnd(gap() >= 160)
    }
    onScroll()
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('keydown', onKey)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  /** Scroll to the end on the thread's own behalf, so it is not read as the reader's. */
  const followToEnd = useCallback(() => {
    programmaticRef.current = true
    scrollToEnd(endRef.current)
  }, [])

  const jumpToLatest = useCallback(() => {
    pinnedRef.current = true
    followToEnd()
  }, [followToEnd])

  useEffect(() => {
    if (turns.length === 0) return
    if (openAtTopRef.current) {
      // A reopened run starts at its question. Done here, after its turns
      // have rendered, so the scroll event it causes is measured against
      // the run being shown rather than the thread it replaced.
      openAtTopRef.current = false
      pinnedRef.current = false
      programmaticRef.current = true
      window.scrollTo({ top: 0, behavior: 'instant' })
      return
    }
    // Only a run in progress is followed. Once its answer has landed the
    // page is the reader's: a late event or a re-read of the record changes
    // the turns, and must not move the page they are reading.
    if (!pinnedRef.current || !busyRef.current) return
    followToEnd()
  }, [turns, followToEnd])

  const attach = useCallback(
    async (files: File[]) => {
      setHint(null)
      for (const f of files) {
        const localId = `${Date.now()}-${f.name}`
        setAttachments((prev) => [
          ...prev,
          { id: localId, name: f.name, sizeBytes: f.size, classification: '', uploading: true },
        ])
        try {
          const stored = await api.uploadFile(f, f.name, 'confidential')
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === localId
                ? { ...a, uploading: false, classification: stored.classification, fileId: stored.id }
                : a,
            ),
          )
        } catch (err: any) {
          setAttachments((prev) => prev.filter((a) => a.id !== localId))
          push({
            title: 'Upload failed',
            detail: err?.detail || err?.message || 'The file was not stored.',
            tone: 'critical',
          })
        }
      }
    },
    [push],
  )

  const removeAttachment = useCallback((localId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== localId))
  }, [])

  const changePrompt = useCallback((value: string) => {
    setPrompt(value)
    if (!value.trim()) setHint(null)
  }, [])

  const authorName = user?.display_name || role.label

  /**
   * Send one request as a new run. Used by the composer and by Run again,
   * so both dispatch exactly the same way.
   */
  const dispatch = useCallback(
    async (request: RunRequest): Promise<boolean> => {
      if (busyRef.current) return false
      busyRef.current = true

      const now = new Date().toISOString()
      const stamp = `${Date.now()}`
      const assistantId = `a-${stamp}`
      const userTurn: UserTurnModel = {
        role: 'user',
        id: `u-${stamp}`,
        text: request.prompt,
        attachments: request.attachments,
        author: { displayName: authorName },
        at: now,
        skill: request.skill,
      }

      seenRef.current = new Set()
      pinnedRef.current = true
      // Each run stands alone: the model is not given the runs before it, and
      // the sidebar lists every run as its own entry. So a new request opens
      // on a clean page rather than under the last answer, where it would
      // read as a follow-up with a context it does not have. The run it
      // replaces is the first entry in the history.
      setTurns([userTurn, freshAssistantTurn(assistantId, request, now)])
      setDrawerOpen(false)
      setFocusEvidenceId(null)
      setEvidenceTurnId(null)
      setBusy(true)

      try {
        const task = await api.createTask(
          request.prompt,
          request.fileIds,
          request.format,
          request.preferredModel,
          request.skill?.id ?? null,
        )
        // The API answered with a classified task, so that stage is done:
        // a measured fact, where leaving it pending let the end-of-run
        // sweep mark classification "skipped" on every run.
        patchTurn(assistantId, (t) => ({
          ...t,
          taskId: task.id,
          stages: t.stages.map((s): PipelineStage => (s.id === 'classify' && task.profile ? { ...s, status: 'done' } : s)),
          approval: recordFields(task).approval,
          profile: recordFields(task).profile,
        }))
        activeTaskIdRef.current = task.id
        openedRef.current = task.id
        setActiveTaskId(task.id)
        setOpenedTaskId(task.id)
        replaceRunParam(task.id)
        setRunsVersion((n) => n + 1)
        return true
      } catch (err: any) {
        if (err?.status === 403) {
          // Not a failure. A 403 here is the API's policy gate refusing the
          // request -- a role without task.create, which is how an auditor
          // is kept from executing work -- and its detail is the policy's
          // own reason. A denial is the product working, so it is drawn as
          // one: nothing ran, and every stage is marked as never reached.
          patchTurn(assistantId, (t) => ({
            ...t,
            outcome: 'denied',
            denialReason: typeof err.detail === 'string' && err.detail ? err.detail : null,
            stages: closeStages(t.stages, 'denied', null),
            stream: 'closed',
          }))
        } else {
          // A failed dispatch is shown as a failed dispatch. Nothing ran, so
          // nothing is marked as having run.
          patchTurn(assistantId, (t) => ({
            ...t,
            outcome: 'failed',
            error:
              err?.status === 0
                ? 'The local workbench service is unreachable. Nothing was executed.'
                : err?.message || 'The backend refused the request. Nothing was executed.',
            stream: 'closed',
          }))
        }
        busyRef.current = false
        setBusy(false)
        return false
      }
    },
    [authorName, patchTurn],
  )

  /*
    The composer's submit reads the current draft, attachments and choices.
    Routed through a ref so the callback the memoised composer holds never
    changes, while what it sends is always current.
  */
  const sendRef = useRef<() => void>(() => {})
  sendRef.current = () => {
    const text = prompt.trim()
    if (!text || busyRef.current || attachments.some((a) => a.uploading)) return
    const ready = attachments.filter((a) => a.fileId)
    const request: RunRequest = {
      prompt: text,
      fileIds: ready.map((a) => a.fileId as string),
      attachments: ready.map((a) => ({
        fileId: a.fileId as string,
        filename: a.name,
        sizeBytes: a.sizeBytes,
        classification: a.classification,
      })),
      format: format === 'answer' ? null : format,
      preferredModel,
      skill: skill ? { id: skill.id, name: skill.name } : null,
    }
    setPrompt('')
    setHint(null)
    setSkill(null)
    void dispatch(request).then((ok) => {
      if (ok) setAttachments([])
    })
  }
  const send = useCallback(() => sendRef.current(), [])

  const rerun = useCallback(
    (turnId: string) => {
      const turn = turnsRef.current.find((t) => t.id === turnId)
      if (turn?.role === 'assistant' && turn.request) void dispatch(turn.request)
    },
    [dispatch],
  )

  /**
   * Stop the run in flight.
   *
   * The API accepts the request and the run ends at its next checkpoint --
   * within a quarter of a second even mid-generation, because the model call
   * itself is cancelled. Until the run reports that it has ended, the turn
   * says a stop was requested; it does not claim the run has stopped.
   */
  const stop = useCallback(async () => {
    const id = activeTaskIdRef.current
    if (!id || stoppingRef.current) return
    stoppingRef.current = true
    setStopping(true)
    try {
      const task = await api.cancelTask(id)
      patchTask(id, (t) => ({ ...t, stopRequested: true }))
      if (String(task.status).toLowerCase() === 'cancelled') void settleRef.current(id)
    } catch (err: any) {
      // Refused, most often because the run finished as the stop was sent.
      // Read back how it ended rather than report a stop that did not happen.
      let ended = false
      try {
        const current = await api.getTask(id)
        ended = TERMINAL.has(String(current.status).toLowerCase())
      } catch {}
      if (ended) {
        void settleRef.current(id)
      } else {
        push({
          title: 'The run was not stopped',
          detail: err?.detail || err?.message || 'The stop request was refused.',
          tone: 'critical',
        })
      }
    } finally {
      stoppingRef.current = false
      setStopping(false)
    }
  }, [patchTask, push])

  /**
   * Show a past run in the thread.
   *
   * Rebuilt from the task record, not from anything cached in the rail: the
   * summary the rail lists carries a prompt and a status and nothing else,
   * and the turn needs the answer, its evidence, its verification and its
   * usage. A run still in flight is attached to, so reloading the page in
   * the middle of a run and opening it again picks the run back up live
   * instead of showing a frozen RUNNING that nothing will ever update.
   *
   * Leaving a live run for another one does not stop it; it detaches. The
   * run carries on, and the rail can bring it back.
   */
  const openRun = useCallback(
    async (taskId: string) => {
      // Already on screen and live: rebuilding it from the record would only
      // throw away the stage timings the stream has been measuring.
      if (taskId === activeTaskIdRef.current) return
      const previous = openedRef.current
      openedRef.current = taskId
      let task: Task
      try {
        task = await api.getTask(taskId)
      } catch (err: any) {
        openedRef.current = previous
        push({
          title: 'Could not open that run',
          detail: err?.detail || err?.message || 'Its record could not be read.',
          tone: 'critical',
        })
        return
      }
      if (busyRef.current) leaveLiveRun()

      const status = String(task.status).toLowerCase()
      const inFlight = !TERMINAL.has(status)
      const request = requestFromTask(task)
      setTurns([
        {
          role: 'user',
          id: `u-${task.id}`,
          text: request.prompt,
          skill: request.skill,
          attachments: request.attachments,
          author: { displayName: task.user_display_name || 'Operator' },
          at: task.created_at,
        },
        {
          role: 'assistant',
          id: `a-${task.id}`,
          ...recordFields(task),
          // Opening a run is a read: its answer was released long ago, and
          // it is shown in place rather than released again.
          releasedLive: false,
          // Each stage read from the record, not blanket-marked done. A
          // reopened run must not imply work the snapshot cannot account
          // for: this one retrieved nothing and executed nothing, and
          // seven green rows would say it did both.
          stages: stagesFromTask(task, inFlight, DEFAULT_PIPELINE),
          error: null,
          startedAt: task.created_at,
          stream: inFlight ? 'live' : 'closed',
          request,
        },
      ])
      setOpenedTaskId(taskId)
      replaceRunParam(taskId)
      setDrawerOpen(false)
      setFocusEvidenceId(null)
      setEvidenceTurnId(null)
      // Opened at its question, not its last line.
      openAtTopRef.current = true

      if (inFlight) {
        seenRef.current = new Set()
        activeTaskIdRef.current = taskId
        busyRef.current = true
        setActiveTaskId(taskId)
        setBusy(true)
      }
    },
    [leaveLiveRun, push],
  )

  const newRun = useCallback(() => {
    if (busyRef.current) leaveLiveRun()
    openedRef.current = null
    setTurns([])
    setOpenedTaskId(null)
    replaceRunParam(null)
    setPrompt('')
    setAttachments([])
    setHint(null)
    setDrawerOpen(false)
    setFocusEvidenceId(null)
    setEvidenceTurnId(null)
    pinnedRef.current = true
    window.requestAnimationFrame(() => textareaRef.current?.focus())
  }, [leaveLiveRun])

  // The palette's "New run" navigates here and then announces itself, and
  // the thread clears exactly as its own New button does. From another
  // screen the thread mounts empty, which is already a new run.
  useEffect(() => {
    window.addEventListener(NEW_RUN_EVENT, newRun)
    return () => window.removeEventListener(NEW_RUN_EVENT, newRun)
  }, [newRun])

  // The sidebar lists the runs. It re-reads them when one starts or settles
  // here, and marks the one this tab is following live.
  const followingId = busy ? activeTaskId : null
  useEffect(() => {
    window.dispatchEvent(new CustomEvent<RunsChangedDetail>(RUNS_CHANGED_EVENT, { detail: { running: followingId } }))
  }, [runsVersion, followingId])

  /**
   * ?run=<id> opens that run.
   *
   * The command palette routes here rather than reaching into this
   * component's state, so a run is reachable by URL -- which also means a
   * reviewer can send someone a link to the exact run they are querying.
   * The thread keeps the parameter pointed at the run on screen, so it is
   * compared with a ref that is set before the URL changes, never after.
   */
  const params = useSearchParams()
  const requestedRun = params.get('run')
  useEffect(() => {
    if (requestedRun && requestedRun !== openedRef.current) void openRun(requestedRun)
  }, [requestedRun, openRun])

  const pickStarter = useCallback((template: StarterTemplate) => {
    // A skill starter puts the skill in the composer and its input in the
    // field, exactly as picking it from the / menu would.
    const starterSkill = template.skill ? skillsRef.current?.find((s) => s.id === template.skill) ?? null : null
    if (starterSkill) setSkill(starterSkill)
    setPrompt(template.prompt)
    setFormat(template.format)
    const file = starterAttachment(template)
    setHint(
      file
        ? `This request is about ${file.name}, and nothing is attached yet. Attach it from ${file.path.slice(0, file.path.length - file.name.length)} before running.`
        : null,
    )
    window.requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

  const cite = useCallback((turnId: string, evidenceId: string) => {
    setEvidenceTurnId(turnId)
    setFocusEvidenceId(evidenceId)
    setTraceCount((n) => n + 1)
    setDrawerOpen(true)
  }, [])

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const assistantTurns = turns.filter((t): t is AssistantTurnModel => t.role === 'assistant')
  const latestAssistant = assistantTurns[assistantTurns.length - 1]
  const railTurn = assistantTurns.find((t) => t.id === evidenceTurnId) ?? latestAssistant
  const railItems = railTurn?.evidence ?? NO_EVIDENCE
  const activeTurn = assistantTurns.find((t) => t.taskId !== null && t.taskId === activeTaskId)
  const canReview = Boolean(user?.permissions?.includes('approval.read'))

  return (
    /*
      The rail sits beside the reading column rather than inside it. The
      column keeps its 768px measure -- that is what makes the answer
      readable -- and the rail takes its own track to the left of it, so
      neither one narrows the other.
    */
    <div className="flex w-full items-stretch">
      {/*
        TRACE: a citation in an answer and its row in the rail light together
        under the pointer, and a click lands on the row. The rail belongs to
        this scope because it is rendered here, though it is fixed to the
        window's edge.
      */}
      <TraceScope
        className={cn(
          'mx-auto flex w-full max-w-[768px] flex-col gap-6 px-5 sm:px-6',
          // With a run on screen the column fills the window, so the composer
          // below it sits at the window's foot even under a short answer.
          turns.length === 0 ? 'thread-empty min-h-[calc(100dvh-var(--shell-top))] justify-center pb-[12vh] pt-8' : 'min-h-[calc(100dvh-var(--shell-top))] pt-8',
          // Above 1280px the rail docks rather than overlays, so the column
          // steps aside instead of being covered. Checking a citation should
          // never cost you the sentence that made the claim. It steps at
          // once: easing the margin would re-wrap the answer on every frame,
          // and nothing here animates layout.
          // The column keeps its full measure and moves over, clear of the
          // rail: padding it inside its own 768px had left the answer about
          // 300px wide and the composer's placeholder wrapping.
          drawerOpen && 'xl:mr-[400px]',
        )}
      >
        {/*
          An empty thread is a greeting and a field, centred, the way every
          good chat product opens. The readings that used to sit above it
          live in the header's egress popover, where they come from the API.
        */}
        {turns.length === 0 && (
          <div className="thread-hello text-center">
            <h1 className="text-[clamp(1.7rem,3vw,2.2rem)] font-semibold tracking-[-0.035em] text-foreground">
              What should we <em className="font-serif text-[1.08em] font-normal italic tracking-[-0.01em]">check</em> today?
            </h1>
            <p className="mx-auto mt-2 max-w-[52ch] text-[0.98rem] leading-[1.55] text-foreground-secondary">
              Ask about a procedure, a report or a calculation. Every answer is cited, checked against policy and
              recorded.
            </p>
          </div>
        )}

        {turns.map((t) =>
          t.role === 'user' ? (
            <UserTurn key={t.id} turn={t} />
          ) : (
            <AssistantTurn
              key={t.id}
              turn={t}
              onCite={cite}
              onRerun={rerun}
              busy={busy}
              canReview={canReview}
              models={models}
            />
          ),
        )}

        <div className={cn('z-[var(--z-rail)]', turns.length > 0 && 'thread-dock sticky bottom-0 mt-auto pb-6 pt-10')}>
          {/* Only while a run is writing below the fold: the one moment a
              reader who scrolled up to check something needs a way back. */}
          {busy && awayFromEnd && (
            <button
              type="button"
              onClick={jumpToLatest}
              className="hover-decay absolute -top-11 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface px-3.5 py-1.5 text-[12.5px] font-medium text-foreground-secondary shadow-[var(--elev-2)] hover:text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
            >
              <ArrowDown className="size-3" aria-hidden />
              Latest
            </button>
          )}
          <Composer
            value={prompt}
            onChange={changePrompt}
            format={format}
            onFormatChange={setFormat}
            attachments={attachments}
            onAttach={attach}
            onRemoveAttachment={removeAttachment}
            onSubmit={send}
            onStop={stop}
            busy={busy}
            stopping={stopping || Boolean(activeTurn?.stopRequested)}
            models={models}
            modelsError={modelsError}
            preferredModel={preferredModel}
            onPreferredModelChange={choosePreferredModel}
            hint={hint}
            textareaRef={textareaRef}
            skills={skills}
            harnesses={harnesses}
            skill={skill}
            onSkillChange={setSkill}
          />
        </div>

        {/* Zero height, and its margin cancels the column's gap, so marking
            the end adds no space after the composer. */}
        <div ref={endRef} aria-hidden className="-mt-6" />

        {turns.length === 0 && (
          <StarterPrompts
            onPick={pickStarter}
            visionReady={Boolean(models?.some((m) => m.available && m.capabilities.includes('vision')))}
          />
        )}

        <EvidenceRail
          open={drawerOpen}
          items={railItems}
          focusId={focusEvidenceId}
          onClose={closeDrawer}
          turnId={railTurn?.id ?? null}
          traceToken={traceCount}
        />
      </TraceScope>
    </div>
  )
}
