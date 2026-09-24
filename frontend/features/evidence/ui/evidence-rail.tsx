'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { EvidenceItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Append, AppendScope, MeasuredNumber, TraceTarget } from '@/shared/motion'

/** A batch larger than this lands still: sixty rows moving at once is noise. */
const BULK_ROWS = 60

/**
 * The evidence rail.
 *
 * This was a `fixed inset-0` overlay with a scrim: opening a citation covered
 * the answer that cited it, so checking a claim meant losing the sentence
 * making it. On a product whose whole proposition is that you can check the
 * work, that is the wrong trade. Above 1280px it now docks beside the thread
 * and both are readable at once; below that there is not enough width for two
 * columns and it stays an overlay.
 *
 * Kept verbatim from the component this replaces, because it is the right
 * rule and worth restating: a similarity bar filled to an invented 0.95 is a
 * measurement the system never took. When the backend reports no score the
 * row is omitted rather than drawn at a flattering default.
 */
export function EvidenceRail({
  open,
  onClose,
  items,
  focusId,
  turnId = null,
  traceToken,
}: {
  open: boolean
  onClose: () => void
  items: EvidenceItem[]
  focusId?: string | null
  /**
   * The assistant turn these rows belong to. It keys the scope rows append
   * in, so switching the rail to another run is a read and nothing slides.
   * It also namespaces the trace ids: every run numbers its evidence from
   * S1, and hovering one run's [S1] must not light another run's row.
   */
  turnId?: string | null
  /** Bumped by each citation click, so a second click on one source lands again. */
  traceToken?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Where the rows that arrived with this render begin, and whether there
  // are too many of them to move. Rows are only ever added at the end, so
  // the previous length is the first new index. Derived during render, the
  // way the motion primitives derive theirs, so rows mounting now see it.
  const [batch, setBatch] = useState({ items, firstNew: items.length, bulk: false })
  if (batch.items !== items) {
    setBatch({
      items,
      firstNew: batch.items.length,
      bulk: items.length - batch.items.length > BULK_ROWS,
    })
  }

  return (
    <>
      {/* The scrim exists only in overlay mode. Docked, there is nothing to
          dismiss and nothing to dim. */}
      <div
        onClick={onClose}
        aria-hidden
        className={cn(
          'fixed inset-0 z-[var(--z-drawer)] bg-[var(--scrim)] transition-opacity xl:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={{ transitionDuration: 'var(--dur-panel)' }}
      />

      <aside
        role="complementary"
        aria-label="Evidence"
        aria-hidden={!open}
        // Off-screen is not gone: without inert, Tab walked into the closed
        // rail's close button and excerpts, focus vanishing off the edge.
        inert={!open}
        className={cn(
          'fixed right-0 top-0 z-[var(--z-drawer)] flex h-dvh w-full max-w-[400px] flex-col border-l border-line-default bg-surface',
          'transition-transform ease-[var(--ease-move)]',
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
        )}
        style={{ transitionDuration: 'var(--dur-panel)' }}
      >
        <header className="flex items-center justify-between border-b border-line-default px-5 py-4">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
              Evidence
            </span>
            <h2 className="text-heading font-medium text-foreground">
              {items.length === 0 ? (
                'Nothing retrieved'
              ) : (
                <>
                  {/* ROLL: task.evidence -- the count turns when a batch
                      lands. Keyed by the run, so opening another run shows
                      its count rather than rolling to it. */}
                  <MeasuredNumber key={turnId ?? 'none'} value={items.length} />
                  {` source${items.length === 1 ? '' : 's'}`}
                </>
              )}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close evidence"
            className="hover-decay flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-foreground-muted hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/*
          The scope wraps the empty state too, so it is already on screen
          when the first batch lands and those rows count as appended. Keyed
          by the run: opening another run is a read, and its rows are still.
        */}
        <AppendScope key={turnId ?? 'none'} bulk={batch.bulk}>
          {items.length === 0 ? (
            <div className="px-5 py-5">
              {/*
                An empty retrieval is a real outcome, not a loading state. The
                run genuinely found nothing, and saying so is the difference
                between "no sources" and "sources pending".
              */}
              <p className="text-body text-foreground-secondary">
                This run retrieved no evidence. Any citation in the answer above
                therefore resolves to nothing and is marked unresolved.
              </p>
            </div>
          ) : (
            <ol className="flex-1 overflow-y-auto">
              {items.map((e, i) => {
                const src = e.source_document || 'Local document'
                const loc = e.location || ''
                const score =
                  typeof e.similarity === 'number'
                    ? e.similarity
                    : typeof e.score === 'number'
                      ? e.score
                      : null
                const focused = focusId === e.id

                return (
                  // APPEND: task.evidence -- a row the run registered while
                  // the rail was on screen settles in lit and cools.
                  <Append
                    as="li"
                    key={e.id}
                    index={Math.max(0, i - batch.firstNew)}
                    tone="neutral"
                    className={cn('border-b border-line-subtle px-3 py-2', i === items.length - 1 && 'border-b-0')}
                  >
                    {/* TRACE: a citation click -- the row is brought into view
                        and an ink ring contracts onto it. The inset leaves the
                        ring room inside the scrolling list, which would clip
                        it at the edges. */}
                    <TraceTarget
                      active={focused}
                      token={traceToken}
                      data-trace={turnId ? `${turnId}:${e.id}` : undefined}
                      className={cn(
                        'rounded-[var(--radius)] px-2 py-2',
                        // Selection is ink, never a status hue: "selected" must
                        // not read as "verified".
                        focused && 'bg-[var(--selected-surface)] shadow-[inset_2px_0_0_0_var(--selected-rail)]',
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="shrink-0 border border-control-default px-1 font-mono text-ledger text-foreground">
                            {e.id}
                          </span>
                          <span className="truncate-cell text-ui text-foreground">{src}</span>
                        </span>
                        {loc && (
                          <span className="shrink-0 font-mono text-ledger text-foreground-muted">{loc}</span>
                        )}
                      </div>

                      <p className="mt-2 text-ui leading-[var(--lh-body)] text-foreground-secondary">
                        {e.excerpt}
                      </p>

                      {score !== null && (
                        <div className="mt-3 flex items-center gap-2">
                          <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                            score
                          </span>
                          <span className="tabular font-mono text-ledger text-foreground">
                            {score.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </TraceTarget>
                  </Append>
                )
              })}
            </ol>
          )}
        </AppendScope>
      </aside>
    </>
  )
}
