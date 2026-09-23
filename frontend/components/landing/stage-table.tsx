import { cn } from '@/lib/utils'
import { CARD, MONO_LABEL, MONO_META } from './tokens'

export interface Stage {
  /** "01".."07" */
  index: string
  /** Matches the timeline ids the capture script writes: classify | plan | read | retrieve | sandbox | draft | verify */
  id: string
  /** Classify | Plan | Read | Retrieve | Sandbox | Draft | Verify */
  name: string
  /** What the stage does. One clause, present tense. */
  action: string
  /** What the stage leaves behind, in machine terms. */
  leaves: string
}

/** What one real run did at this stage. */
export interface StageReading {
  ran: boolean
  /** Printed as measured; null prints "not measured", never a zero. */
  duration: string | null
  note: string
}

/*
 * Two layouts, every class written out: Tailwind only generates what it can
 * read in the source, so a breakpoint assembled from a variable would ship no
 * CSS at all. The measured column adds a fifth track, which is too many for
 * 640px, so that variant goes wide at md instead of sm.
 */
const LAYOUT = {
  plain: {
    head: 'hidden h-9 items-center gap-4 border-b border-border px-4 sm:grid sm:grid-cols-[32px_112px_minmax(0,1fr)_minmax(0,1fr)]',
    row: 'grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 sm:min-h-11 sm:grid-cols-[32px_112px_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-y-0 sm:py-2',
  },
  measured: {
    head: 'hidden h-9 items-center gap-4 border-b border-border px-4 md:grid md:grid-cols-[28px_92px_minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,1fr)]',
    row: 'grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 md:min-h-12 md:grid-cols-[28px_92px_minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,1fr)] md:items-center md:gap-y-0 md:py-2',
  },
} as const

export function StageTable({
  stages,
  readings,
  runLabel,
  labels = { notRun: 'not run', notMeasured: 'not measured' },
  className,
}: {
  stages: Stage[]
  /** Keyed by stage id. Omit to show the table without a run. */
  readings?: Record<string, StageReading>
  /** Heading of the measured column, e.g. "This run". */
  runLabel?: string
  labels?: { notRun: string; notMeasured: string }
  className?: string
}) {
  const withRun = readings !== undefined
  const layout = withRun ? LAYOUT.measured : LAYOUT.plain

  return (
    <div className={cn(CARD, 'overflow-hidden', className)}>
      <div className={layout.head}>
        <span className={MONO_LABEL} aria-hidden>
          #
        </span>
        <span className={MONO_LABEL}>Stage</span>
        <span className={MONO_LABEL}>What runs</span>
        <span className={MONO_LABEL}>What it leaves</span>
        {withRun ? <span className={MONO_LABEL}>{runLabel}</span> : null}
      </div>

      <ul className="m-0 list-none p-0">
        {stages.map((stage, i) => {
          const reading = readings?.[stage.id]
          return (
            <li key={stage.index} className={cn(layout.row, i > 0 && 'border-t border-border')}>
              <span className={MONO_META}>{stage.index}</span>
              <span className="text-body font-medium text-foreground">{stage.name}</span>
              <span className="text-body text-foreground-secondary">{stage.action}</span>
              <span className={cn(MONO_META, 'leading-[18px]')}>{stage.leaves}</span>
              {withRun ? (
                reading ? (
                  <span className="flex items-baseline gap-2 pt-1 md:pt-0">
                    {/*
                      A filled square for a stage the audit log shows running,
                      a hollow one for a stage it does not. Ink, not the green
                      the console's board uses: beside "Verify" a green mark
                      reads as "verified", and on this run verification did
                      not pass. Ran is not the same claim as succeeded.
                    */}
                    <span
                      aria-hidden
                      className={cn(
                        'relative top-[1px] size-[7px] shrink-0 rounded-[1px]',
                        reading.ran ? 'bg-foreground' : 'border border-control-strong',
                      )}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span
                        className={cn(
                          'font-mono text-ui tabular',
                          reading.ran ? 'text-foreground' : 'text-foreground-muted',
                        )}
                      >
                        {reading.ran ? (reading.duration ?? labels.notMeasured) : labels.notRun}
                      </span>
                      <span className={cn(MONO_META, 'leading-[16px] text-foreground-muted')}>{reading.note}</span>
                    </span>
                  </span>
                ) : (
                  // A stage the capture has no row for is unknown, and says so.
                  <span className={cn(MONO_META, 'text-foreground-muted')}>{labels.notMeasured}</span>
                )
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
