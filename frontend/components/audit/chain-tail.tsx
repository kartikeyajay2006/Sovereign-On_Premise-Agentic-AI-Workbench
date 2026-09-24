'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Append, AppendScope } from '@/shared/motion'
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
 * The newest blocks, oldest at the top, and what each one commits to.
 *
 * One grouped ledger rather than six cards: read downward it is the chain
 * itself, each row committing to the row above it, and a block the backend
 * writes while the screen is open joins at the bottom, where a chain grows.
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
      {/* Mounted with the first reading, so the blocks read then stay still
          and only a block that arrives on a later re-read appends. */}
      <AppendScope>
        <ol className="grouped overflow-hidden">
          {blocks.map((block, i) => {
            const previous = blocks[i - 1]
            const gap = previous ? block.sequence - previous.sequence - 1 : 0
            const isFocused = active === block.sequence
            const isPredecessor = focused !== null && predecessor?.sequence === block.sequence
            // Six blocks are most of a phone screen; three show the idea,
            // and the rest of the chain is in the list below.
            const olderThanThree = i < blocks.length - 3
            return (
              // APPEND: an audit record written after the tail was read (the
              // export a browser check makes, or any action meanwhile), on a
              // re-read.
              <Append
                as="li"
                key={block.id}
                className={cn('grouped-row min-w-0 last:border-b-0', olderThanThree && 'hidden sm:block')}
              >
                {gap > 0 && (
                  <p className="px-4 pt-2 font-mono text-ledger text-foreground-muted">
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
                    'hover-decay grid w-full min-w-0 grid-cols-1 gap-y-0.5 px-4 py-2 text-left',
                    'lg:grid-cols-[64px_96px_minmax(0,1fr)_minmax(0,200px)_112px_112px] lg:items-baseline lg:gap-x-3',
                    'focus-visible:shadow-[inset_0_0_0_2px_var(--foreground)] focus-visible:outline-none',
                    isFocused ? 'bg-surface-sunken' : 'hover:bg-surface-sunken',
                  )}
                >
                  {/* Stacked below 1024px, where six columns leave the action
                      a few characters wide. */}
                  <span className="flex min-w-0 items-baseline gap-2 font-mono text-ledger lg:hidden">
                    <span className="tabular shrink-0 text-foreground">#{block.sequence}</span>
                    <span className="shrink-0 uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                      {block.category}
                    </span>
                    <span className="tabular ml-auto min-w-0 truncate text-foreground-muted">
                      {block.actor} · {clock(block.at)}
                    </span>
                  </span>
                  <span className="truncate text-ui font-medium text-foreground lg:hidden">{block.action}</span>

                  <span className="tabular hidden font-mono text-ui text-foreground lg:block">#{block.sequence}</span>
                  <span className="hidden truncate font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted lg:block">
                    {block.category}
                  </span>
                  <span className="hidden truncate text-ui font-medium text-foreground lg:block">{block.action}</span>
                  <span className="hidden truncate font-mono text-ledger text-foreground-muted lg:block">
                    {block.actor} · {clock(block.at)}
                  </span>

                  {/* The two hashes, in every layout: they are the point. At
                      lg they fall into the last two columns, so each row's
                      prev sits one row below the hash it names. */}
                  <span className="flex min-w-0 gap-3 font-mono text-ledger lg:contents">
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
              </Append>
            )
          })}
        </ol>
      </AppendScope>

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
