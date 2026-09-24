'use client'

import { memo } from 'react'
import { ClassificationTag } from '@/components/primitives'
import { Light, type LightTone } from '@/shared/motion'
import { cn } from '@/lib/utils'
import { ago, type Decision, type QueueItem } from './model'

/**
 * Shape carries the state and hue reinforces it, so the queue reads in
 * greyscale and on a projector: ⏸ held, ✓ approved, ✕ rejected.
 */
export const DECISION_MARK: Record<
  Decision,
  { glyph: string; label: string; text: string; rail: string; light: LightTone }
> = {
  held: { glyph: '⏸', label: 'Held', text: 'text-approval-text', rail: 'bg-approval', light: 'approval' },
  approved: { glyph: '✓', label: 'Approved', text: 'text-sovereign-text', rail: 'bg-sovereign', light: 'sovereign' },
  rejected: { glyph: '✕', label: 'Rejected', text: 'text-critical-text', rail: 'bg-critical', light: 'critical' },
}

/**
 * One queue entry. A row, not a card: a hairline under it, the selection as
 * an ink rail and a tint, and nothing that invents urgency. The badge on the
 * right is the classification the run actually carries, which varies and
 * decides who may release it; the priority that used to sit there was a
 * constant.
 */
export const QueueRow = memo(function QueueRow({
  item,
  selected,
  mine,
  onSelect,
  registerRow,
}: {
  item: QueueItem
  selected: boolean
  /** The signed-in reviewer submitted it, so it waits for someone else. */
  mine: boolean
  /** `viaKeyboard` is true for Enter or Space, which also opens the detail. */
  onSelect: (id: string, viaKeyboard: boolean) => void
  registerRow: (id: string, el: HTMLButtonElement | null) => void
}) {
  const mark = DECISION_MARK[item.decision]
  return (
    <li>
      <button
        ref={(el) => registerRow(item.id, el)}
        type="button"
        aria-current={selected ? 'true' : undefined}
        // A click synthesised from Enter or Space reports detail 0.
        onClick={(event) => onSelect(item.id, event.detail === 0)}
        className={cn(
          'hover-decay flex w-full flex-col gap-1 border-b border-line-subtle px-4 py-3 text-left',
          // Inset, because an outer ring is clipped by the scrolling list.
          'focus-visible:shadow-[inset_0_0_0_2px_var(--foreground)] focus-visible:outline-none',
          selected
            ? 'bg-[var(--selected-surface)] shadow-[inset_2px_0_0_0_var(--selected-rail)]'
            : 'hover:bg-surface-sunken',
        )}
      >
        <span className="flex items-center justify-between gap-2">
          {/* LIGHT: a decision recorded (the row's own decision changing
              from held, here or in another session). It blooms once in the
              tone of what was decided and lets go. Keyed on the decision,
              never the selection, so j/k through the queue lights nothing,
              and a row that mounts already decided was read, not decided. */}
          <Light
            as="span"
            tone={mark.light}
            bloomKey={item.decision === 'held' ? null : item.decision}
            rest="none"
            className={cn(
              '-mx-1 inline-flex items-center gap-2 rounded-[var(--radius-xs)] px-1 font-mono text-ledger uppercase tracking-[var(--ls-ledger)]',
              mark.text,
            )}
          >
            <span aria-hidden>{mark.glyph}</span>
            {mark.label}
          </Light>
          <span className="flex min-w-0 items-center gap-2">
            <ClassificationTag level={item.sensitivity ?? 'unclassified'} />
            <time
              dateTime={item.createdAt}
              title={new Date(item.createdAt).toLocaleString()}
              className="tabular w-8 shrink-0 text-right font-mono text-ledger text-foreground-muted"
            >
              {ago(item.createdAt)}
            </time>
          </span>
        </span>
        <span
          className={cn(
            'line-clamp-2 text-body',
            selected ? 'text-foreground' : 'text-foreground-secondary',
          )}
        >
          {item.prompt}
        </span>
        <span className="flex min-w-0 items-center gap-2 font-mono text-ledger text-foreground-muted">
          <span className="shrink-0">#{item.id.slice(0, 8)}</span>
          {item.submittedBy && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{item.submittedBy}</span>
            </>
          )}
          {mine && (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0 text-approval-text">yours</span>
            </>
          )}
          {item.deliverableCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0">
                {item.deliverableCount === 1 ? 'file' : `${item.deliverableCount} files`}
              </span>
            </>
          )}
        </span>
      </button>
    </li>
  )
})
