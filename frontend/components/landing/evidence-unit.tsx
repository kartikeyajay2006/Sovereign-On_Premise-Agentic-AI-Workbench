import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { type EvidenceUnit as Unit, sectionLabel } from './run-fixture'
import { CARD, MONO_LABEL, MONO_META } from './tokens'

export interface EvidenceUnitProps {
  unit: Unit
  label: string
  source: string
  /** "similarity" or "score", chosen by the page from the retrieval mode. */
  scoreLabel: string
  caption?: ReactNode
  className?: string
}

/**
 * One evidence unit, as the run recorded it: the fields that make a citation
 * point at a place rather than at a file.
 *
 * The excerpt is shown to the end of its first paragraph and no further, and
 * the card says how much it left out. It is never cut mid-sentence, because a
 * clause that stops halfway can be made to say something the document does
 * not; the whole chunk is one section up, in the inspector.
 */
export function EvidenceUnit({ unit, label, source, scoreLabel, caption, className }: EvidenceUnitProps) {
  const paragraphs = unit.excerpt
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0 && !/^#{1,6}\s/.test(block))
  // Hard wraps joined, as markdown means them. **bold** is rendered, not
  // stripped, so the words and their emphasis are the stored ones.
  const first = (paragraphs[0] ?? '').split('\n').map((line) => line.trim()).join(' ')
  const excerpt = first
    .split(/(\*\*[^*\n]+\*\*)/g)
    .filter(Boolean)
    .map((part, i) =>
      /^\*\*[^*\n]+\*\*$/.test(part) ? (
        <strong key={i} className="font-medium">
          {part.slice(2, -2)}
        </strong>
      ) : (
        part
      ),
    )
  const rest = paragraphs.length - 1

  const rows: Array<[string, ReactNode]> = [
    ['id', unit.id],
    ['document', unit.source_document],
    ['document_id', unit.document_id],
    ['location', sectionLabel(unit)],
    ...(unit.score !== null ? ([[scoreLabel, unit.score.toFixed(4)]] as Array<[string, ReactNode]>) : []),
  ]

  return (
    <figure className={cn('m-0 flex flex-col', className)}>
      <div className={cn(CARD, 'overflow-hidden')}>
        <div className="flex h-9 items-center justify-between gap-3 border-b border-border px-3">
          <span className={MONO_LABEL}>{label}</span>
          <span className={cn(MONO_META, 'truncate')}>{source}</span>
        </div>
        <dl className="m-0 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 py-3 font-mono text-ui leading-[18px]">
          {/* Bare dt/dd pairs, no wrapping div: a <dl> may hold groups or
              pairs but not both, and the excerpt row below is a bare pair. */}
          {rows.map(([name, value]) => (
            <Fragment key={name}>
              <dt className="text-foreground-muted">{name}</dt>
              <dd className="m-0 min-w-0 break-words text-foreground-secondary">{value}</dd>
            </Fragment>
          ))}
          <dt className="text-foreground-muted">excerpt</dt>
          <dd className="m-0 min-w-0 text-foreground">
            “{excerpt}”
            {rest > 0 ? (
              <span className="mt-1 block text-foreground-muted">
                + {rest} more paragraph{rest === 1 ? '' : 's'} in the stored chunk
              </span>
            ) : null}
          </dd>
        </dl>
      </div>
      {caption ? <figcaption className="mt-3 text-body text-foreground-secondary">{caption}</figcaption> : null}
    </figure>
  )
}
