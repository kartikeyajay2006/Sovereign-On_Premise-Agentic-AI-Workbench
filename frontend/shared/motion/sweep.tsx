import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

/**
 * VERIFY: a check moving across a set, exactly as far as it has got.
 *
 * This is the one progress indicator the product allows, and it is allowed
 * because its numerator and denominator are both counted: `done` records
 * of `total` have been recomputed, by the browser's own chain check or by
 * a verifier reporting claim by claim. The checked part is sovereign
 * because those records passed. The leading edge is the check in progress;
 * if a record fails, the edge turns critical and the sweep stops on it,
 * which is where the reader should look.
 *
 * It is never used for a model generating text, or for anything whose
 * total is not known in advance: a bar that fills at an invented rate is a
 * claim about work nobody measured. When either count is missing it
 * renders nothing, not an empty track -- an empty track would read as
 * "nothing checked yet", which is itself a claim.
 *
 * A check that returns all of its results at once is not a sweep. Reveal
 * those results with <Append> in reading order instead; a sweep drawn
 * across results that already exist would be theatre.
 *
 * Size it with className: `w-[2px] self-stretch` beside a list, or
 * `h-[2px] w-full` under a panel.
 */
export function Sweep({
  done,
  total,
  state,
  axis = 'y',
  label,
  className,
}: {
  done: number | null | undefined
  total: number | null | undefined
  state: 'running' | 'passed' | 'broken'
  axis?: 'x' | 'y'
  /** What is being checked, for assistive technology: "Audit chain". */
  label: string
  className?: string
}) {
  if (
    typeof done !== 'number' ||
    typeof total !== 'number' ||
    !Number.isFinite(done) ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return null
  }
  const fraction = Math.min(1, Math.max(0, done / total))

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={
        state === 'broken'
          ? `Stopped at ${done} of ${total}: a record did not verify`
          : `${done} of ${total} checked`
      }
      data-axis={axis}
      data-state={state}
      className={cn('aegis-sweep', className)}
      style={{ '--sweep': fraction } as CSSProperties}
    >
      <span aria-hidden className="aegis-sweep-fill" />
    </div>
  )
}
