import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface StepCited {
  sentence: string
  id: string
  source: string
  excerpt: string
  /** A phrase of the excerpt the sentence rests on, marked where it appears. */
  highlight: string | null
}

export interface StepCheck {
  label: string
  passed: boolean
  note: string
}

export interface StepRecord {
  sequence: number
  what: string
  hash: string
}

/**
 * How it works, in three cards: what happens to every answer, each with the
 * thing it leaves behind, drawn small from the run the hero replays.
 *
 * It replaces a section of long captions over raw records and a second
 * section that showed the same answer and passage again. The records are
 * still on the page, whole, in the security section's evidence drawers;
 * here each step says what it does in one sentence and shows it at a glance.
 */
export function Steps({
  cited,
  checks,
  verdict,
  records,
}: {
  cited: StepCited | null
  checks: StepCheck[]
  /** How the run ended, in the record's words: released, or held and for whom. */
  verdict: string
  records: StepRecord[]
}) {
  const passed = checks.filter((c) => c.passed).length
  return (
    <ol className="m-0 grid list-none grid-cols-1 gap-4 p-0 lg:grid-cols-3">
      <Step
        n="01"
        title="Cited"
        line="Every claim points at the clause it came from, not at a file name."
        visual={
          cited ? (
            <>
              <p className="m-0 font-sans text-[0.86rem] leading-[1.55] text-foreground">
                {cited.sentence} <span className="ae-step-chip">{cited.id}</span>
              </p>
              <div className="ae-step-rule" />
              <p className="m-0 text-[0.72rem] text-foreground-muted">
                {cited.id} · {cited.source}
              </p>
              <p className="m-0 mt-1.5 font-sans text-[0.8rem] leading-[1.55] text-foreground-secondary">
                <Marked text={cited.excerpt} mark={cited.highlight} />
              </p>
            </>
          ) : null
        }
      />
      <Step
        n="02"
        title="Checked"
        line="A verifier checks each claim against its passage. One failed check holds the run for a person."
        visual={
          checks.length > 0 ? (
            <>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {checks.map((check) => (
                  <li key={check.label} className="grid grid-cols-[1ch_6.8rem_minmax(0,1fr)] items-baseline gap-x-2.5">
                    <span aria-hidden className={check.passed ? 'text-sovereign-text' : 'text-critical-text'}>
                      {check.passed ? '✓' : '✕'}
                    </span>
                    <span className="text-foreground">{check.label}</span>
                    <span className="text-foreground-muted">{check.note}</span>
                  </li>
                ))}
              </ul>
              <div className="ae-step-rule" />
              <p className="m-0 text-[0.72rem] text-foreground-muted">
                {passed} of {checks.length} passed · {verdict}
              </p>
            </>
          ) : null
        }
      />
      <Step
        n="03"
        title="Recorded"
        line="Every step is written to a hash chain. Editing a record breaks every hash after it."
        visual={
          records.length > 0 ? (
            <ol className="m-0 flex list-none flex-col p-0">
              {records.map((record, i) => (
                <li key={record.sequence} className="relative grid grid-cols-[7px_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
                  {i < records.length - 1 ? <span aria-hidden className="ae-step-link" /> : null}
                  <span aria-hidden className="ae-step-node mt-[5px] self-start" />
                  <span className="min-w-0">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-foreground">seq {record.sequence}</span>
                      <span className="text-foreground-muted">{record.hash.slice(0, 10)}…</span>
                    </span>
                    <span className="mt-0.5 block truncate text-foreground-secondary">{record.what}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : null
        }
      />
    </ol>
  )
}

function Step({ n, title, line, visual }: { n: string; title: string; line: string; visual: ReactNode }) {
  return (
    <li className="ae-reveal flex min-w-0 flex-col rounded-[22px] border border-line-subtle bg-surface p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="ae-step-n">{n}</span>
        <h3 className="m-0 text-[1.15rem] font-semibold tracking-[-0.02em] text-foreground">{title}</h3>
      </div>
      <p className="m-0 mt-3 text-[0.93rem] leading-[1.55] text-foreground-secondary">{line}</p>
      {visual ? (
        <div className={cn('mt-5 flex-1 rounded-[14px] bg-surface-sunken p-4 font-mono text-[0.76rem] leading-[1.5]')}>
          {visual}
        </div>
      ) : null}
    </li>
  )
}

/** The excerpt with one phrase marked, where it occurs; plain text otherwise. */
function Marked({ text, mark }: { text: string; mark: string | null }) {
  if (!mark) return <>{text}</>
  const at = text.toLowerCase().indexOf(mark.toLowerCase())
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="ae-step-mark">{text.slice(at, at + mark.length)}</mark>
      {text.slice(at + mark.length)}
    </>
  )
}
