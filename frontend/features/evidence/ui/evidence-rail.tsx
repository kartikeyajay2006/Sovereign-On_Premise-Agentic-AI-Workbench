'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { EvidenceItem } from '@/lib/types'
import { cn } from '@/lib/utils'

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
}: {
  open: boolean
  onClose: () => void
  items: EvidenceItem[]
  focusId?: string | null
}) {
  const focusRef = useRef<HTMLLIElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Bring the cited item into view rather than making the reader hunt for it.
  useEffect(() => {
    if (open && focusId) focusRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open, focusId])

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
              {items.length === 0
                ? 'Nothing retrieved'
                : `${items.length} source${items.length === 1 ? '' : 's'}`}
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
                <li
                  key={e.id}
                  ref={focused ? focusRef : undefined}
                  className={cn(
                    'border-b border-line-subtle px-5 py-4',
                    i === items.length - 1 && 'border-b-0',
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
                </li>
              )
            })}
          </ol>
        )}
      </aside>
    </>
  )
}
