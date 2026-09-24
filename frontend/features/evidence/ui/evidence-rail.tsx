'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { EvidenceItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Append, AppendScope, MeasuredNumber, TraceTarget } from '@/shared/motion'

/** A batch larger than this lands still: sixty rows moving at once is noise. */
const BULK_ROWS = 60

/** A passage longer than this opens folded to four lines. */
const LONG_EXCERPT = 260

/**
 * A stored chunk as prose. The corpus is markdown, and the rail printed it
 * raw -- "### 2.2 Corrosive Service", "**SYNTHETIC DOCUMENT**" -- so the
 * one thing a reader opens the rail for read like source code. The markers
 * are removed, never interpreted: every branch leaves plain text.
 */
function plainExcerpt(text: string): string {
  return text
    // The heading a chunk opens with is its section, which the line above
    // the passage already says; run into the prose it read "2.2 Corrosive
    // Service A pressure vessel ...".
    .replace(/^\s{0,3}#{1,6}[^\n]*\n+/, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "SOP-INS-014 — Pressure Vessel ..." as its code, and the title after it. */
function documentParts(source: string): { code: string; title: string | null } {
  const [code, ...rest] = source.split(' — ')
  return { code: code.trim(), title: rest.length > 0 ? rest.join(' — ').trim() : null }
}

/**
 * Where in the document: "section: 2.2 Corrosive Service" as "§2.2 Corrosive
 * Service". A chunk from before the first section is located by the
 * document's own title line, and is said to be its opening.
 */
function placeOf(location: string): string {
  const section = location.match(/^\s*section:\s*(.*)$/i)?.[1]?.trim()
  if (section === undefined) return location
  if (/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\s+—\s+/.test(section)) return 'Opening of the document'
  return `§${section}`
}

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
  // Passages the reader has opened past four lines. The focused one is
  // always open: it is the passage they came to read.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

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
          'fixed inset-x-0 bottom-0 top-[var(--shell-top)] z-[var(--z-drawer)] bg-[var(--scrim)] transition-opacity xl:hidden',
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
          'fixed right-0 top-[var(--shell-top)] z-[var(--z-drawer)] flex h-[calc(100dvh-var(--shell-top))] w-full max-w-[400px] flex-col border-l border-line-default bg-surface',
          'transition-transform ease-[var(--ease-move)]',
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
        )}
        style={{ transitionDuration: 'var(--dur-panel)' }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-line-default px-5 py-3.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] text-foreground-muted">What this run retrieved</span>
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
            <ol className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
              {items.map((e, i) => {
                const src = e.source_document || 'Local document'
                const { code, title } = documentParts(src)
                const place = e.location ? placeOf(e.location) : null
                const score =
                  typeof e.similarity === 'number'
                    ? e.similarity
                    : typeof e.score === 'number'
                      ? e.score
                      : null
                const focused = focusId === e.id
                const prose = plainExcerpt(e.excerpt || '')
                const long = prose.length > LONG_EXCERPT
                const open = focused || expanded.has(e.id)

                return (
                  // APPEND: task.evidence -- a row the run registered while
                  // the rail was on screen settles in lit and cools.
                  <Append
                    as="li"
                    key={e.id}
                    index={Math.max(0, i - batch.firstNew)}
                    tone="neutral"
                    className="py-0.5"
                  >
                    {/* TRACE: a citation click -- the row is brought into view
                        and an ink ring contracts onto it. */}
                    <TraceTarget
                      active={focused}
                      token={traceToken}
                      data-trace={turnId ? `${turnId}:${e.id}` : undefined}
                      className={cn(
                        'min-w-0 rounded-[12px] px-3 py-3',
                        // Selection is ink, never a status hue: "selected" must
                        // not read as "verified".
                        focused ? 'bg-[var(--selected-surface)] shadow-[inset_2px_0_0_0_var(--selected-rail)]' : 'hover:bg-surface-sunken',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="inline-flex h-5 shrink-0 items-center rounded-[6px] bg-surface-sunken px-1.5 font-mono text-[11px] font-semibold text-foreground">
                          {e.id}
                        </span>
                        <span className="min-w-0 truncate text-ui font-medium text-foreground" title={src}>
                          {code}
                          {title && <span className="font-normal text-foreground-muted"> · {title}</span>}
                        </span>
                        {score !== null && (
                          <span
                            className="tabular ml-auto shrink-0 font-mono text-ledger text-foreground-muted"
                            title="How closely this passage matched the question, as retrieval scored it"
                          >
                            {score.toFixed(2)}
                          </span>
                        )}
                      </div>
                      {place && (
                        <p className="mt-1 truncate text-meta text-foreground-muted" title={e.location ?? undefined}>
                          {place}
                        </p>
                      )}

                      <p className={cn('mt-2 break-words text-ui leading-[1.55] text-foreground-secondary', !open && long && 'line-clamp-4')}>
                        {prose}
                      </p>
                      {long && !focused && (
                        <button
                          type="button"
                          onClick={() => toggle(e.id)}
                          className="hover-decay mt-1.5 rounded-[var(--radius-xs)] text-meta text-foreground-muted hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                        >
                          {open ? 'Show less' : 'Show all'}
                        </button>
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
