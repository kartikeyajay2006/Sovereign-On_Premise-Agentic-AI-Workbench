'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { PreviewCard } from '@base-ui/react/preview-card'
import type { EvidenceItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { AssistantTurn } from '../model/types'
import { CITE_CHIP } from './cite-chip'

/**
 * What a citation is, without leaving the sentence.
 *
 * Hovering a resolved chip for 150ms, or focusing it, opens a card with the
 * cited item as the run recorded it: the document and its revision, the
 * section, the passage, the retrieval score when there was one, a C item's
 * computed figures and result hash, and which of the answer's claims rest on
 * it with their verdicts. Every line is a field of the record; a field the
 * record does not have is left out, never filled. Escape closes it and a
 * click on the chip still opens the rail.
 *
 * One card per answer, shared by all its chips through a handle, so an answer
 * with forty citations mounts one popup rather than forty.
 */

const HOVER_DELAY_MS = 150

interface CardContext {
  handle: PreviewCard.Handle<string>
}

const EvidenceCardContext = createContext<CardContext | null>(null)

/** "SOP-INS-014" and its title, from "SOP-INS-014 — Title" or the code field. */
function documentName(item: EvidenceItem): { code: string; title: string | null } {
  const [head, ...rest] = (item.source_document ?? '').split(' — ')
  const code = item.document_code || head.trim() || item.id
  const title = rest.length ? rest.join(' — ').trim() : head.trim() && head.trim() !== code ? head.trim() : null
  return { code, title }
}

const VERDICT_TONE: Record<string, string> = {
  SUPPORTED: 'text-sovereign-text',
  CALCULATED: 'text-sovereign-text',
  CONFLICTED: 'text-approval-text',
  REQUIRES_HUMAN_DECISION: 'text-approval-text',
  UNSUPPORTED: 'text-critical-text',
}

const LABEL = 'font-mono text-[10px] uppercase tracking-[var(--ls-ledger)] text-foreground-muted'

function CardBody({ id, turn, onOpen }: { id: string; turn: AssistantTurn; onOpen: (id: string) => void }) {
  const item = turn.evidence.find((e) => e.id === id)
  if (!item) return null
  const { code, title } = documentName(item)
  const records = turn.calculations.filter((r) => r.evidence_id === id)
  const hash = records.find((r) => r.result_hash)?.result_hash ?? null
  const claims = turn.claims.filter((c) => c.evidence_ids.includes(id))
  const inForce =
    item.revision_status === 'active' ? 'in force' : item.revision_status ? String(item.revision_status) : null
  const section = item.location || null
  const meta = [item.version ? `v${item.version}` : null, inForce, section].filter(Boolean) as string[]

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <span className={cn(CITE_CHIP, 'h-[18px] shrink-0')}>{id}</span>
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold text-foreground">{code}</p>
          {title && <p className="text-[12.5px] leading-[1.4] text-foreground-secondary">{title}</p>}
        </div>
      </div>

      {meta.length > 0 && (
        <p className={cn(LABEL, 'flex flex-wrap gap-x-2')}>
          {meta.map((part) => (
            <span
              key={part}
              className={
                part === 'in force'
                  ? 'text-sovereign-text'
                  : part === item.revision_status && item.revision_status !== 'active'
                    ? 'text-critical-text'
                    : undefined
              }
            >
              {part}
            </span>
          ))}
          {item.superseded_by && <span>by {item.superseded_by}</span>}
        </p>
      )}

      {records.length > 0 ? (
        <ul className="flex flex-col gap-1 border-l-2 border-line-default pl-2.5">
          {records.slice(0, 3).map((record, i) => (
            <li key={`${record.formula_id}-${i}`} className="font-mono text-[11.5px] leading-[1.45] text-foreground">
              {record.status === 'calculated' ? record.display : <span className="text-critical-text">{record.reason}</span>}
            </li>
          ))}
          {records.length > 3 && <li className={LABEL}>+{records.length - 3} more</li>}
        </ul>
      ) : (
        item.excerpt && <p className="line-clamp-3 text-[12.5px] leading-[1.5] text-foreground-secondary">{item.excerpt}</p>
      )}

      {(typeof item.score === 'number' || hash) && (
        <p className={cn(LABEL, 'flex flex-wrap gap-x-3')}>
          {typeof item.score === 'number' && <span>score {item.score.toFixed(2)}</span>}
          {hash && <span title={hash}>result sha256:{hash.slice(0, 12)}…</span>}
        </p>
      )}

      {claims.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-line-subtle pt-2">
          <p className={LABEL}>
            {claims.length} claim{claims.length === 1 ? '' : 's'} rel{claims.length === 1 ? 'ies' : 'y'} on it
          </p>
          <ul className="flex flex-col gap-1">
            {claims.slice(0, 4).map((claim) => (
              <li key={claim.id} className="flex items-baseline gap-2 text-[12px] leading-[1.4]">
                <span className={cn('shrink-0 font-mono text-[10px] uppercase', VERDICT_TONE[claim.verdict])}>
                  {claim.verdict.replace(/_/g, ' ').toLowerCase()}
                </span>
                <span className="line-clamp-2 min-w-0 text-foreground-secondary">{claim.text}</span>
              </li>
            ))}
            {claims.length > 4 && <li className={LABEL}>+{claims.length - 4} more</li>}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() => onOpen(id)}
        className="hover-decay -mx-1 self-start rounded-[var(--radius-xs)] px-1 font-mono text-[10.5px] uppercase tracking-[var(--ls-ledger)] text-[var(--cite-ink)] hover:bg-[var(--cite-wash)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        Open in rail ↵
      </button>
    </div>
  )
}

/** Gives the chips under it one shared card, reading from `turn`. */
export function EvidenceCardScope({
  turn,
  onOpen,
  children,
}: {
  turn: AssistantTurn
  onOpen: (id: string) => void
  children: ReactNode
}) {
  const [context] = useState<CardContext>(() => ({ handle: PreviewCard.createHandle<string>() }))
  return (
    <EvidenceCardContext.Provider value={context}>
      {children}
      <PreviewCard.Root handle={context.handle}>
        {({ payload }) => (
          <PreviewCard.Portal>
            <PreviewCard.Positioner side="top" align="start" sideOffset={8} className="z-[var(--z-menu)] outline-none">
              <PreviewCard.Popup
                className={cn(
                  'w-[340px] max-w-[var(--available-width)] origin-[var(--transform-origin)] rounded-[var(--radius-md-token)] border border-line-default bg-surface p-3 shadow-[var(--elev-2)] outline-none',
                  'transition-[opacity,scale] duration-150 ease-[var(--ease-standard)] motion-reduce:transition-none',
                  'data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0',
                )}
              >
                {payload ? (
                  <CardBody
                    id={payload}
                    turn={turn}
                    onOpen={(id) => {
                      context.handle.close()
                      onOpen(id)
                    }}
                  />
                ) : null}
              </PreviewCard.Popup>
            </PreviewCard.Positioner>
          </PreviewCard.Portal>
        )}
      </PreviewCard.Root>
    </EvidenceCardContext.Provider>
  )
}

/**
 * A resolved citation chip. Inside a card scope it opens the card on hover
 * or focus; outside one it is the plain chip. A click opens the rail either way.
 */
export function CiteButton({
  id,
  onCite,
  trace,
  className,
  children,
}: {
  id: string
  onCite: (id: string) => void
  trace?: string | null
  className?: string
  children: ReactNode
}) {
  const context = useContext(EvidenceCardContext)
  const shared = {
    onClick: () => onCite(id),
    // TRACE: pairs the chip with its row in the evidence rail.
    'data-trace': trace ? `${trace}:${id}` : undefined,
    className,
  }
  if (!context) {
    return (
      <button type="button" {...shared}>
        {children}
      </button>
    )
  }
  return (
    <PreviewCard.Trigger
      handle={context.handle}
      payload={id}
      delay={HOVER_DELAY_MS}
      render={<button type="button" />}
      {...shared}
    >
      {children}
    </PreviewCard.Trigger>
  )
}
