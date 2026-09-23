'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { AuditRecord } from './api'

function short(hash: string | null | undefined, n = 8) {
  return hash ? `${hash.slice(0, n)}…` : '—'
}

function clock(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * The newest blocks, oldest on the left, and what each one commits to.
 *
 * Hovering or focusing a block lights its prev_hash and the hash of the
 * block before it, and the line underneath says whether the two are equal.
 * That comparison is made here, on the two records as the service returned
 * them; it is the same link the full check tests, shown for one pair at a
 * time so a reader can see what "hash-linked" means.
 *
 * A role that reads only its own records sees blocks that are not adjacent
 * in the chain. The gap is drawn and counted rather than closed up, because
 * closing it would picture a link between two records that do not commit to
 * each other.
 */
export function ChainTail({
  records,
  onOpen,
}: {
  /** Newest first, as GET /api/audit returns them. */
  records: AuditRecord[]
  onOpen?: (record: AuditRecord) => void
}) {
  const [active, setActive] = useState<number | null>(null)
  const blocks = [...records].reverse()
  const bySequence = new Map(blocks.map((b) => [b.sequence, b]))

  const focused = active === null ? null : (bySequence.get(active) ?? null)
  const predecessor = focused ? (bySequence.get(focused.sequence - 1) ?? null) : null
  const linked = focused && predecessor ? focused.prev_hash === predecessor.hash : null

  return (
    <div className="flex flex-col gap-3">
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {blocks.map((block, i) => {
          const previous = blocks[i - 1]
          const gap = previous ? block.sequence - previous.sequence - 1 : 0
          const isFocused = active === block.sequence
          const isPredecessor = focused !== null && predecessor?.sequence === block.sequence
          // Six stacked blocks are most of a phone screen; three show the
          // idea, and the rest of the chain is in the list below.
          const olderThanThree = i < blocks.length - 3
          return (
            <li key={block.id} className={cn('min-w-0 flex-col', olderThanThree ? 'hidden sm:flex' : 'flex')}>
              {gap > 0 && (
                <p className="mb-1 font-mono text-ledger text-foreground-muted">
                  {gap} record{gap === 1 ? '' : 's'} not shown
                </p>
              )}
              <button
                type="button"
                onMouseEnter={() => setActive(block.sequence)}
                onMouseLeave={() => setActive((s) => (s === block.sequence ? null : s))}
                onFocus={() => setActive(block.sequence)}
                onBlur={() => setActive((s) => (s === block.sequence ? null : s))}
                onClick={() => onOpen?.(block)}
                aria-describedby="chain-link-caption"
                className={cn(
                  'hover-decay flex min-w-0 flex-1 flex-col gap-1 rounded-[var(--radius)] bg-surface p-3 text-left shadow-[var(--elev-0)]',
                  'focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none',
                  isFocused && 'shadow-[0_0_0_1px_var(--foreground)]',
                  isPredecessor && 'shadow-[0_0_0_1px_var(--line-strong)]',
                )}
              >
                <span className="flex items-baseline justify-between gap-2 font-mono text-ledger uppercase tracking-[var(--ls-ledger)]">
                  <span className="tabular text-foreground">#{block.sequence}</span>
                  <span className="truncate text-foreground-muted">{block.category}</span>
                </span>
                <span className="truncate text-ui font-medium text-foreground">{block.action}</span>
                <span className="truncate font-mono text-ledger text-foreground-muted">
                  {block.actor} · {clock(block.at)}
                </span>
                <span className="mt-1 flex flex-col gap-0.5 font-mono text-ledger">
                  <span
                    className={cn(
                      'truncate',
                      isFocused ? 'text-foreground underline decoration-foreground underline-offset-2' : 'text-foreground-muted',
                    )}
                  >
                    prev {short(block.prev_hash)}
                  </span>
                  <span
                    className={cn(
                      'truncate',
                      isPredecessor
                        ? 'text-foreground underline decoration-foreground underline-offset-2'
                        : 'text-foreground-secondary',
                    )}
                  >
                    hash {short(block.hash)}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <p id="chain-link-caption" aria-live="polite" className="min-h-5 text-ui text-foreground-secondary">
        {!focused ? (
          <span className="text-foreground-muted">
            Hover or focus a block to see the record it commits to.
          </span>
        ) : predecessor ? (
          <>
            <span className="font-mono text-foreground">#{focused.sequence}</span> commits to{' '}
            <span className="font-mono text-foreground">#{predecessor.sequence}</span>: its prev_hash{' '}
            <span className="font-mono">{short(focused.prev_hash, 12)}</span>{' '}
            {linked ? (
              <span className="text-sovereign-text">equals</span>
            ) : (
              <span className="text-critical-text">does not equal</span>
            )}{' '}
            the hash of #{predecessor.sequence}, <span className="font-mono">{short(predecessor.hash, 12)}</span>.
          </>
        ) : focused.prev_hash === '0'.repeat(64) ? (
          <>
            <span className="font-mono text-foreground">#{focused.sequence}</span> is the first record. Its
            prev_hash is the all-zero genesis value.
          </>
        ) : (
          <>
            <span className="font-mono text-foreground">#{focused.sequence}</span> commits to #
            {focused.sequence - 1}, which is not shown here: prev_hash{' '}
            <span className="font-mono">{short(focused.prev_hash, 12)}</span>.
          </>
        )}
      </p>
    </div>
  )
}
