'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { describeFailure, type ReadFailure } from '@/shared/ui/data/reading'
import { readExport } from './api'
import {
  GENESIS_HASH,
  carriedHash,
  hashEngine,
  parseExport,
  verifyRecord,
  type ChainRecord,
} from './chain-verify'

export type CheckPhase = 'idle' | 'fetching' | 'sweeping' | 'done' | 'failed'

export interface CheckFailure {
  index: number
  sequence: number | null
  reasons: ('link' | 'digest')[]
  category: string | null
  action: string | null
  actor: string | null
  at: string | null
  storedHash: string | null
  recomputed: string
  claimedPrev: string | null
  expectedPrev: string
}

export interface CheckState {
  phase: CheckPhase
  /** Records in the browser's copy of the log. */
  total: number
  /** Records recomputed so far. */
  checked: number
  failureCount: number
  /** The first few, in file order. */
  failures: CheckFailure[]
  /** Lines the server would also skip because they are not JSON objects. */
  skipped: number
  firstSequence: number | null
  lastSequence: number | null
  /** The stored hash of the last record in the browser's copy. */
  headHash: string | null
  /** Sequence of the record most recently checked, for the live readout. */
  cursorSequence: number | null
  cursorHash: string | null
  /** Time spent hashing, not the paced wall-clock time of the sweep. */
  computeMs: number
  engine: 'webcrypto' | 'fallback'
  failure: ReadFailure | null
  startedAt: number
  finishedAt: number | null
}

/**
 * Per-record results the list and ribbon read directly. Held in a ref and
 * mutated in place as the sweep advances; the state's `checked` count is
 * what tells React to look again. Rebuilding a 700-entry Map on every chunk
 * would cost more than the hashing does.
 */
export interface CheckResults {
  bySequence: Map<number, 'ok' | 'fail'>
  cells: number
  bucket: number
  cellFailures: Int32Array
}

const IDLE: CheckState = {
  phase: 'idle',
  total: 0,
  checked: 0,
  failureCount: 0,
  failures: [],
  skipped: 0,
  firstSequence: null,
  lastSequence: null,
  headHash: null,
  cursorSequence: null,
  cursorHash: null,
  computeMs: 0,
  engine: 'webcrypto',
  failure: null,
  startedAt: 0,
  finishedAt: null,
}

/** The ribbon draws at most this many cells; beyond it each cell is a range. */
export const MAX_CELLS = 1200
/** Failures kept for display. The count is always exact. */
const KEEP_FAILURES = 25
/** The export is one file read; allow for a large log on a busy host. */
const EXPORT_TIMEOUT_MS = 60_000

function nextFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
}

/**
 * Downloads the log and recomputes the chain record by record.
 *
 * The work is cut into chunks of roughly 1/80th of the log, one chunk per
 * animation frame. That is what keeps the main thread free while a model may
 * be generating on the same CPU, and it is also what makes the sweep visible:
 * each cell and each row flips only after its own hash has been recomputed.
 * Nothing is shown as checked ahead of the arithmetic.
 */
export interface CheckSummary {
  total: number
  failureCount: number
  firstFailure: CheckFailure | null
  computeMs: number
  lastSequence: number | null
}

export function useChainCheck(onFinished?: (summary: CheckSummary) => void) {
  const [state, setState] = useState<CheckState>(IDLE)
  const results = useRef<CheckResults>({
    bySequence: new Map(),
    cells: 0,
    bucket: 1,
    cellFailures: new Int32Array(0),
  })
  const runId = useRef(0)
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  useEffect(() => {
    return () => {
      // Abandon any sweep in flight when the screen goes away.
      runId.current++
    }
  }, [])

  const run = useCallback(async () => {
    const id = ++runId.current
    const startedAt = Date.now()
    results.current = { bySequence: new Map(), cells: 0, bucket: 1, cellFailures: new Int32Array(0) }
    setState({ ...IDLE, phase: 'fetching', startedAt, engine: hashEngine() })

    const controller = new AbortController()
    let timedOut = false
    const timer = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, EXPORT_TIMEOUT_MS)

    let text: string
    try {
      text = await readExport(controller.signal)
    } catch (error) {
      if (id !== runId.current) return
      setState((s) => ({
        ...s,
        phase: 'failed',
        failure: timedOut
          ? { kind: 'timeout', status: null, detail: null, waitedS: EXPORT_TIMEOUT_MS / 1000 }
          : describeFailure(error),
      }))
      return
    } finally {
      window.clearTimeout(timer)
    }
    if (id !== runId.current) return

    const { records, skipped } = parseExport(typeof text === 'string' ? text : '')
    const total = records.length
    const cells = Math.min(total, MAX_CELLS)
    const bucket = cells === 0 ? 1 : Math.ceil(total / cells)
    results.current = {
      bySequence: new Map(),
      cells: Math.ceil(total / bucket),
      bucket,
      cellFailures: new Int32Array(Math.ceil(total / bucket)),
    }
    setState((s) => ({
      ...s,
      phase: 'sweeping',
      total,
      skipped,
      firstSequence: records[0]?.sequence ?? null,
      lastSequence: records[total - 1]?.sequence ?? null,
      headHash: records[total - 1]?.hash ?? null,
    }))

    const chunk = Math.max(8, Math.ceil(total / 80))
    const failures: CheckFailure[] = []
    let failureCount = 0
    let computeMs = 0
    let previous = GENESIS_HASH
    let index = 0
    let last: ChainRecord | null = null

    while (index < total) {
      const t0 = performance.now()
      const end = Math.min(total, index + chunk)
      for (; index < end; index++) {
        const record = records[index]
        const verdict = await verifyRecord(record, previous)
        const key = record.sequence ?? -(index + 1)
        if (verdict.ok) {
          results.current.bySequence.set(key, 'ok')
        } else {
          results.current.bySequence.set(key, 'fail')
          results.current.cellFailures[Math.floor(index / bucket)]++
          failureCount++
          if (failures.length < KEEP_FAILURES) {
            failures.push({
              index,
              sequence: record.sequence,
              reasons: verdict.reasons,
              category: record.category,
              action: record.action,
              actor: record.actor,
              at: record.at,
              storedHash: record.hash,
              recomputed: verdict.recomputed,
              claimedPrev: record.prevHash,
              expectedPrev: verdict.expectedPrev,
            })
          }
        }
        previous = carriedHash(record)
        last = record
      }
      computeMs += performance.now() - t0
      if (id !== runId.current) return
      setState((s) => ({
        ...s,
        checked: index,
        failureCount,
        failures: [...failures],
        cursorSequence: last?.sequence ?? null,
        cursorHash: last?.hash ?? null,
        computeMs,
      }))
      if (index < total) await nextFrame()
    }

    if (id !== runId.current) return
    setState((s) => ({ ...s, phase: 'done', finishedAt: Date.now(), computeMs }))
    onFinishedRef.current?.({
      total,
      failureCount,
      firstFailure: failures[0] ?? null,
      computeMs,
      lastSequence: records[total - 1]?.sequence ?? null,
    })
  }, [])

  return { state, results, run }
}
