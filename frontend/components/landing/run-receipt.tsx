import { cn } from '@/lib/utils'
import { CARD, MONO_LABEL, MONO_META } from './tokens'

/** One row of the receipt. Every field comes from the captured fixture. */
export interface ReceiptRow {
  /** Uppercase verb, from the fixture. CITED | CHECKED | COMPUTED | HELD | RECORDED. */
  label: string
  /** Sentence describing what happened. Sans, ink. */
  value: string
  /** The machine fact. Mono, secondary. Page ref, check count, hash, timestamp. */
  meta: string
}

export interface RunReceiptProps {
  /** Run id, verbatim from the fixture. */
  runId: string
  /** Human date of the run, e.g. "21 Sep 2026". */
  capturedOn: string
  rows: ReceiptRow[]
  /** Sentence printed under the card. Names where the values come from. */
  caption: string
  className?: string
}

/**
 * The hero visual: a run receipt, rendered as real DOM from a fixture exported
 * from an actual completed run.
 *
 * Not a screenshot. Real DOM is crisp at every DPR, weighs about two kilobytes
 * instead of a hundred and eighty, re-themes with the tokens, is readable by a
 * screen reader, and -- the point -- can be selected and pasted by a sceptical
 * reader who wants to grep the hash.
 *
 * The fixed 104px label gutter at `sm` and up is what aligns the five verbs
 * into a column, and that alignment is what makes the card read as an
 * instrument rather than as a list. Below `sm` the grid collapses to one
 * column and each row stacks label / value / meta.
 */
export function RunReceipt({ runId, capturedOn, rows, caption, className }: RunReceiptProps) {
  return (
    <figure className={cn('m-0', className)}>
      <div className={cn(CARD, 'overflow-hidden')}>
        <div className="flex min-h-10 flex-col gap-0.5 border-b border-border px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
          <span className={MONO_LABEL}>Run receipt</span>
          <span className={cn(MONO_META, 'truncate')}>
            {runId} · {capturedOn}
          </span>
        </div>

        <dl className="m-0">
          {rows.map((row, i) => (
            <div
              key={row.label}
              className={cn(
                'grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-4',
                'sm:min-h-14 sm:grid-cols-[104px_minmax(0,1fr)_auto] sm:items-center sm:py-3',
                i > 0 && 'border-t border-border',
              )}
            >
              <dt className={MONO_LABEL}>{row.label}</dt>
              <dd className="m-0 text-body text-foreground">{row.value}</dd>
              <dd className={cn(MONO_META, 'm-0 sm:text-right')}>{row.meta}</dd>
            </div>
          ))}
        </dl>
      </div>

      <figcaption className="mt-4 max-w-[68ch] text-ui leading-[18px] text-foreground-secondary">
        {caption}
      </figcaption>
    </figure>
  )
}
