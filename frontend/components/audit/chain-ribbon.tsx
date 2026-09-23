'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'
import type { CheckResults } from './use-chain-check'

/** Cells per memoised group. Only groups the sweep has touched re-render. */
const GROUP = 64

type CellState = 'pending' | 'ok' | 'fail'

const CELL: Record<CellState, string> = {
  pending: 'bg-line-default',
  ok: 'bg-sovereign',
  fail: 'bg-critical',
}

/*
 * A group re-renders only when its own count of checked cells or of failed
 * cells changes, so a sweep across 700 records repaints a few dozen cells a
 * frame rather than all of them.
 */
const RibbonGroup = memo(
  function RibbonGroup({
    start,
    count,
    checkedCells,
    results,
    firstSequence,
  }: {
    start: number
    count: number
    checkedCells: number
    failedCells: number
    results: CheckResults
    firstSequence: number
  }) {
    const cells = []
    for (let k = 0; k < count; k++) {
      const cell = start + k
      const state: CellState =
        results.cellFailures[cell] > 0 ? 'fail' : cell < checkedCells ? 'ok' : 'pending'
      const from = firstSequence + cell * results.bucket
      const to = from + results.bucket - 1
      cells.push(
        <span
          key={cell}
          title={`${results.bucket === 1 ? `#${from}` : `#${from}–#${to}`} ${
            state === 'ok' ? 'recomputes' : state === 'fail' ? 'does not recompute' : 'not yet checked'
          }`}
          className={cn('h-2 w-1 rounded-[1px]', CELL[state])}
        />,
      )
    }
    return <>{cells}</>
  },
  (a, b) =>
    a.results === b.results &&
    a.start === b.start &&
    a.count === b.count &&
    Math.min(Math.max(a.checkedCells - a.start, 0), a.count) ===
      Math.min(Math.max(b.checkedCells - b.start, 0), b.count) &&
    a.failedCells === b.failedCells,
)

/**
 * The whole chain at once, one cell per record, filling as this browser
 * recomputes each hash. Before a check runs, the cells show how many records
 * there are and nothing else; they are not drawn as passing until they pass.
 */
export function ChainRibbon({
  results,
  checked,
  total,
  firstSequence,
  className,
}: {
  results: CheckResults
  checked: number
  total: number
  firstSequence: number | null
  className?: string
}) {
  const cellCount = results.cells
  if (cellCount === 0 || total === 0) return null
  // A cell is checked once its last record is.
  const checkedCells = checked >= total ? cellCount : Math.floor(checked / results.bucket)
  const groups = []
  for (let start = 0; start < cellCount; start += GROUP) {
    const count = Math.min(GROUP, cellCount - start)
    let failedCells = 0
    for (let k = start; k < start + count; k++) if (results.cellFailures[k] > 0) failedCells++
    groups.push(
      <RibbonGroup
        key={start}
        start={start}
        count={count}
        checkedCells={checkedCells}
        failedCells={failedCells}
        results={results}
        firstSequence={firstSequence ?? 1}
      />,
    )
  }
  return (
    <div
      role="img"
      aria-label={`${checked} of ${total} records recomputed`}
      className={cn('flex flex-wrap gap-0.5', className)}
    >
      {groups}
    </div>
  )
}
