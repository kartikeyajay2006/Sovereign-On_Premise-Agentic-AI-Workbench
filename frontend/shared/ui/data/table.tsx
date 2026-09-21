'use client'

/**
 * Table — 20-DESIGN-SPEC §4.3, migration step B6.
 *
 * One table component; the row-height token is the only density decision
 * (conflict C5). Two scales by job: `interactive` (36px, --row-interactive)
 * for click targets — thread lists, approvals queues, candidate tables — and
 * `data` (32px, --row-data) for read-only ledgers, with `compact` (28px) as
 * the toggle. 24px is rejected on 12 §2.8's own grounds.
 *
 * 'use client' is required: `onSelect`, row keyboard handling and the cell
 * popover are all client behaviour.
 *
 * Rendered as a CSS grid rather than a <table> because `column.width` is
 * specified as a grid track ('minmax(0,1fr)' | '96px'), and because a grid is
 * what makes "one long cell can never change the row height" structural
 * rather than a promise. Table semantics are carried by ARIA roles.
 *
 * Deliberately NOT built here:
 *   - Virtualization. 12 §3.29 wants the audit log virtualized on react-window
 *     with `overscanRowCount` / `estimatedRowHeight` rather than paginated,
 *     because pagination hides "how much is there". That is a future need with
 *     a dependency this repo does not have yet; `total` in the header is the
 *     honest interim answer to the same question.
 *   - Sorting, faceting and the structured/raw toggle (12 §5.6) — separate
 *     components over this one.
 */

import type { ReactNode } from 'react'
import { Popover } from '@base-ui/react/popover'

import { cn } from '@/lib/utils'

export interface Column<T> {
  id: string
  /** As short as possible; units stated once, at the first data point. (12 §2.8) */
  header: string
  /** Numeric and hash columns end-align and go mono. (Ström) */
  align?: 'start' | 'end'
  mono?: boolean
  /** A CSS grid track: 'minmax(0,1fr)' | '96px'. Defaults to 'minmax(0,1fr)'. */
  width?: string
  /**
   * Long values truncate and open a cell popover. They NEVER wrap and they
   * never change the row height. (12 §3.28, EUI's forced truncation)
   */
  truncate?: boolean
  render: (row: T) => ReactNode
}

export interface TableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** 36 | 32 | 28. Default 'data'. */
  scale?: 'interactive' | 'data' | 'compact'
  selectedKey?: string | null
  onSelect?: (key: string) => void
  /**
   * Rendered instead of rows when rows.length === 0. Required, and never a
   * skeleton: a skeleton implies content of this shape is arriving. (10 §4.2)
   */
  empty: ReactNode
  /**
   * Shown in the header: "247 entries". An append-only ledger whose length
   * you cannot see is not obviously append-only. (12 §6.11)
   */
  total?: number
  /** When the view is hiding something, the view says so. (12 §3.33) */
  truncatedNotice?: string
}

/** Header row height MUST equal body row height. (12 §2.8, Carbon) */
const SCALE_HEIGHT: Record<NonNullable<TableProps<unknown>['scale']>, string> = {
  interactive: 'h-[var(--row-interactive)]',
  data: 'h-[var(--row-data)]',
  compact: 'h-[var(--row-data-compact)]',
}

// NEEDS-GLOBAL: §4.3's `.tbl*` rules are expressed below as Tailwind
// utilities over the same tokens. The two that would genuinely read better as
// global CSS, should globals.css ever want them:
//
//   .tbl[data-has-selection='true'] .tbl-row:not([aria-selected='true'])
//       { opacity: var(--opacity-dim); }        /* 12 §3.10 — dim the rest */
//   .tbl-row[aria-selected='true']
//       { background: var(--selected-surface);
//         box-shadow: inset 2px 0 0 0 var(--selected-rail); }
//
// Both are applied per row here instead, which is equivalent and needs no
// descendant selector.

export function Table<T>({
  columns,
  rows,
  rowKey,
  scale = 'data',
  selectedKey = null,
  onSelect,
  empty,
  total,
  truncatedNotice,
}: TableProps<T>) {
  const template = columns.map((c) => c.width ?? 'minmax(0,1fr)').join(' ')
  const height = SCALE_HEIGHT[scale]
  const selectable = typeof onSelect === 'function'
  const hasSelection = selectedKey !== null

  return (
    <div className="grouped" data-scale={scale}>
      {total !== undefined || truncatedNotice ? (
        <div className="flex items-baseline justify-between gap-[var(--space-5)] border-b border-line-default px-[var(--space-5)] py-[var(--space-3)] font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
          <span className="tabular">
            {total === undefined ? null : `${total} entries`}
          </span>
          {truncatedNotice ? (
            <span className="text-approval-text normal-case tracking-normal">
              {truncatedNotice}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        role={selectable ? 'grid' : 'table'}
        data-has-selection={hasSelection ? 'true' : undefined}
        className="w-full"
      >
        {/*
          Sticky against the page's scroll, not an inner scrollport: the rail
          and the ledger scroll as one column (12 §3.13, Sentry removed their
          inner scroll regions). This is why nothing on the path to this
          element sets `overflow`.
        */}
        <div
          role="row"
          style={{ gridTemplateColumns: template }}
          className={cn(
            'sticky top-0 z-[1] grid items-center rounded-t-[var(--radius)] border-b border-line-default bg-surface-sunken',
            height,
          )}
        >
          {columns.map((column) => (
            <div
              key={column.id}
              role="columnheader"
              className={cn(
                'min-w-0 truncate-cell px-[var(--space-5)] font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted',
                column.align === 'end' && 'text-right',
              )}
            >
              {column.header}
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <div role="row" style={{ gridTemplateColumns: template }} className="grid">
            <div role={selectable ? 'gridcell' : 'cell'} style={{ gridColumn: '1 / -1' }}>
              {empty}
            </div>
          </div>
        ) : (
          rows.map((row) => {
            const key = rowKey(row)
            const isSelected = selectedKey === key

            return (
              <div
                key={key}
                role="row"
                aria-selected={selectable ? isSelected : undefined}
                tabIndex={selectable ? 0 : undefined}
                onClick={selectable ? () => onSelect(key) : undefined}
                onKeyDown={
                  selectable
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onSelect(key)
                        }
                      }
                    : undefined
                }
                style={{ gridTemplateColumns: template }}
                className={cn(
                  'hover-decay grid items-center border-b border-line-subtle last:border-b-0',
                  height,
                  selectable &&
                    'cursor-pointer hover:bg-surface-sunken focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
                  // Ink, not the accent — "selected" must never read as "link". (10 §3.6)
                  isSelected &&
                    'bg-[var(--selected-surface)] shadow-[inset_2px_0_0_0_var(--selected-rail)]',
                  // Selecting dims the rest rather than brightening the selection. (12 §3.10)
                  hasSelection && !isSelected && 'opacity-[var(--opacity-dim)]',
                )}
              >
                {columns.map((column) => {
                  const content = column.render(row)
                  const cellClass = cn(
                    'min-w-0 px-[var(--space-5)] text-body',
                    // Right-aligned tabular numerals on every numeric and hash
                    // column: columns of numbers that do not align read as
                    // untrustworthy. (Ström; 12 §3.27)
                    column.align === 'end' && 'text-right tabular',
                    column.mono && 'font-mono text-meta',
                  )

                  return (
                    <div key={column.id} role={selectable ? 'gridcell' : 'cell'} className={cellClass}>
                      {column.truncate ? (
                        <TruncatedCell align={column.align}>{content}</TruncatedCell>
                      ) : (
                        <span className="truncate-cell">{content}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/**
 * EUI's forced truncation plus a cell popover (12 §3.28): a 64-char hash
 * truncates and expands, it never wraps. The affordance is a real button with
 * a click and a keyboard path, not a hover tooltip — hover does not exist on a
 * projector (12 §6.7).
 */
function TruncatedCell({
  align,
  children,
}: {
  align?: 'start' | 'end'
  children: ReactNode
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        onClick={(event) => event.stopPropagation()}
        className={cn(
          'truncate-cell w-full rounded-[var(--radius-xs)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
          align === 'end' ? 'text-right' : 'text-left',
        )}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} className="z-[var(--z-menu)]">
          <Popover.Popup className="max-w-[42ch] break-words rounded-[var(--radius-md-token)] bg-surface px-[var(--space-5)] py-[var(--space-4)] text-body shadow-[var(--elev-2)]">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
