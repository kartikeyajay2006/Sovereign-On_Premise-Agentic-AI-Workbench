'use client'

import { cn } from '@/lib/utils'
import { CITE_CHIP } from './cite-chip'
import { CiteButton } from './evidence-card'

/**
 * Renders one run of plain text, applying the small amount of inline
 * markdown a local model actually emits.
 *
 * The model returns markdown whether or not anyone asked it to, and printing
 * it raw put literal asterisks in the answer — "The severity applies as
 * **Medium** under SOP-MNT-022" — on the one piece of prose the whole
 * pipeline exists to produce. That is a small thing that makes the output
 * look unfinished.
 *
 * Deliberately not a markdown library. Three inline forms are handled, and
 * nothing is parsed as HTML, so a document that arrives carrying markup
 * cannot inject anything: every branch produces a text node inside an
 * element this function chose.
 */
export function InlineMarkdown({ text }: { text: string }) {
  const tokens = text.split(/(\*\*[^*\n]+\*\*|(?<!\*)\*[^*\n]+\*(?!\*)|`[^`\n]+`)/g)
  return (
    <>
      {tokens.map((t, i) => {
        if (/^\*\*[^*\n]+\*\*$/.test(t)) {
          return (
            <strong key={i} className="font-medium text-foreground">
              {t.slice(2, -2)}
            </strong>
          )
        }
        if (/^`[^`\n]+`$/.test(t)) {
          return (
            <code
              key={i}
              className="rounded-[var(--radius-xs)] bg-surface-sunken px-1 font-mono text-meta"
            >
              {t.slice(1, -1)}
            </code>
          )
        }
        if (/^\*[^*\n]+\*$/.test(t)) {
          return <em key={i}>{t.slice(1, -1)}</em>
        }
        return <span key={i}>{t}</span>
      })}
    </>
  )
}

export type Cite = ((id: string) => void) | null

/**
 * Inline text with its citations resolved. A citation that resolves to
 * recorded evidence is a button; one that resolves to nothing is marked on
 * the sentence rather than linked. With no `onCite` -- the draft -- they are
 * plain text, because a draft's citations have not been checked yet.
 *
 * `trace` is the run the citations belong to. Every run numbers its
 * evidence from S1, so a trace id is the run and the citation together,
 * and hovering one run's [S1] never lights another run's source.
 */
export function Inline({
  text,
  known,
  onCite,
  trace = null,
}: {
  text: string
  known: Set<string>
  onCite: Cite
  trace?: string | null
}) {
  // Anything written as a citation, including a malformed one like [V2.1],
  // so a marker that points at nothing is marked as such, never passed off
  // as prose.
  const parts = text.split(/(\[[A-Z]{1,3}\d+(?:\.\d+)*\])/g)
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[([A-Z]{1,3}\d+(?:\.\d+)*)\]$/)
        if (!m) return <InlineMarkdown key={i} text={p} />
        const id = m[1]
        if (!onCite) {
          return (
            <span key={i} className="font-mono text-[0.85em] text-foreground-muted">
              {p}
            </span>
          )
        }
        if (!known.has(id)) {
          // A citation that leads nowhere is a finding about the answer,
          // not a link, so it is marked rather than linked -- but as a mark
          // on the sentence rather than a box beside it. Five bordered chips
          // reading "S1 unresolved" outweighed the prose they annotated,
          // inverting what the reader is meant to come away with. The
          // tooltip carries the detail.
          return (
            <sup
              key={i}
              title={`No evidence ${id} was recorded for this run. This citation supports nothing.`}
              className="mx-px cursor-help font-mono text-[0.68em] text-critical-text decoration-dotted underline-offset-2 [text-decoration-line:underline]"
            >
              {id}
            </sup>
          )
        }
        return (
          <CiteButton
            key={i}
            id={id}
            onCite={onCite}
            trace={trace}
            // Punctuation after a chip sits against it, as it would against a word.
            className={cn(CITE_CHIP, 'ml-0.5 h-[19px] align-[2px] text-[11px]', /^[.,;:!?)]/.test(parts[i + 1] ?? '') ? 'mr-0' : 'mr-0.5')}
          >
            {id}
          </CiteButton>
        )
      })}
    </>
  )
}
