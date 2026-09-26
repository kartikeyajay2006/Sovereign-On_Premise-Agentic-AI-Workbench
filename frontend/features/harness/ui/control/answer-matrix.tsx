'use client'

import { forwardRef } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HarnessChildView, HarnessRunView } from '../../model/types'
import { ChildDetail } from '../child-detail'
import { OUTCOME } from '../outcome'
import { documentCode, formatDuration, sectionName } from '../format'
import { OutcomeMarker } from '../parts'
import { BODY, LABEL, LABEL_STRONG, MONO, PANE, PANE_HEAD } from './style'

function claimsCell(child: HarnessChildView): string {
  if (child.claims_total === null || child.claims_supported === null) return '—'
  return `${child.claims_supported}/${child.claims_total}`
}

function firstCitation(child: HarnessChildView): string {
  const first = child.citations[0]
  if (!first) return '—'
  const section = sectionName(first.location)
  return section ? `${documentCode(first.source_document)} §${section}` : documentCode(first.source_document)
}

/**
 * One 28px row per child: index, outcome glyph, label, claims traced over
 * claims, how long its run took, the first passage its answer cites, and a
 * square per verification check. Every cell is a field of the child's
 * record; an absent one is a dash, never a zero. Enter (or a click) opens
 * the existing child detail beneath the row, at once -- nothing a key
 * does animates.
 */
export const AnswerMatrix = forwardRef<
  HTMLDivElement,
  {
    run: HarnessRunView
    selected: number | null
    expanded: number | null
    onSelect: (index: number) => void
    onToggle: (index: number) => void
  }
>(function AnswerMatrix({ run, selected, expanded, onSelect, onToggle }, ref) {
  return (
    <section aria-label="Answer matrix" className={PANE}>
      <header className={PANE_HEAD}>
        <h2 className={LABEL_STRONG}>
          {run.harness.aggregation === 'requirements_register' ? 'Register' : 'Answer matrix'}
        </h2>
        <span className={LABEL}>m to focus · enter to open</span>
      </header>
      <div
        className={cn(
          LABEL,
          'hidden h-7 grid-cols-[28px_16px_minmax(0,1fr)_48px_64px_minmax(0,150px)_64px_28px] items-center gap-x-2 border-b border-l-2 border-b-line-subtle border-l-transparent px-3 md:grid',
        )}
      >
        <span>#</span>
        <span />
        <span>item</span>
        <span className="text-right">claims</span>
        <span className="text-right">took</span>
        <span>first citation</span>
        <span>checks</span>
        <span />
      </div>
      <div ref={ref} tabIndex={-1} className="focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-foreground">
        <ol className="flex list-none flex-col p-0">
          {run.children.map((child) => {
            const open = expanded === child.index
            const isSelected = selected === child.index
            const spec = OUTCOME[child.outcome]
            const unreached = spec.state === 'pending' || spec.state === 'skipped'
            return (
              <li key={child.key} className="border-b border-line-subtle last:border-b-0">
                <div
                  className={cn(
                    'grid min-h-7 grid-cols-[minmax(0,1fr)_28px] items-center gap-x-2 border-l-2 px-3',
                    isSelected ? 'border-foreground bg-surface-sunken' : 'border-transparent',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(child.index)
                      onToggle(child.index)
                    }}
                    aria-expanded={open}
                    aria-controls={`matrix-child-${child.index}`}
                    className="grid min-h-7 min-w-0 grid-cols-[28px_16px_minmax(0,1fr)] items-center gap-x-2 text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-foreground md:grid-cols-[28px_16px_minmax(0,1fr)_48px_64px_minmax(0,150px)_64px]"
                    data-matrix-row={child.index}
                  >
                    <span className={cn(MONO, 'text-foreground-muted')}>{child.index}</span>
                    <OutcomeMarker outcome={child.outcome} size={14} />
                    <span className={cn(BODY, 'truncate', unreached ? 'text-foreground-muted' : 'text-foreground')} title={`${child.label} · ${child.outcome_detail}`}>
                      {child.label}
                    </span>
                    <span className={cn(MONO, 'hidden text-right text-foreground-secondary md:block')} title="Material claims traced / material claims">
                      {claimsCell(child)}
                    </span>
                    <span className={cn(MONO, 'hidden text-right text-foreground-muted md:block')} title="How long the child run took, from its own record">
                      {formatDuration(child.duration_ms)}
                    </span>
                    <span className={cn(MONO, 'hidden truncate text-foreground-secondary md:block')} title={child.citations[0]?.source_document}>
                      {firstCitation(child)}
                    </span>
                    <span className="hidden items-center gap-0.5 md:flex" aria-label={`${child.checks.filter((c) => c.passed).length} of ${child.checks.length} checks passed`}>
                      {child.checks.length === 0 ? (
                        <span className={cn(MONO, 'text-foreground-muted')}>—</span>
                      ) : (
                        child.checks.map((check) => (
                          <span
                            key={check.name}
                            title={`${check.name}: ${check.passed ? 'passed' : 'did not pass'} · ${check.detail}`}
                            className={cn(
                              'inline-block size-2 border',
                              check.passed ? 'border-[var(--hv-ok)] bg-[var(--hv-ok)]' : 'border-[var(--hv-critical)] bg-transparent',
                            )}
                          />
                        ))
                      )}
                    </span>
                  </button>
                  {child.task_id ? (
                    <Link
                      href={`/console?run=${child.task_id}`}
                      aria-label={`Open run ${child.index} in the thread`}
                      title="Open this run in the thread (o)"
                      className="flex size-7 items-center justify-center text-foreground-muted hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-foreground"
                    >
                      <ArrowUpRight className="size-3.5" aria-hidden />
                    </Link>
                  ) : (
                    <span aria-hidden />
                  )}
                </div>
                {open && (
                  <div id={`matrix-child-${child.index}`}>
                    <ChildDetail child={child} />
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
})
