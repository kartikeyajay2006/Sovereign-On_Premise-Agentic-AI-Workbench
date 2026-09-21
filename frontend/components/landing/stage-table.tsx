import { cn } from '@/lib/utils'
import { CARD, MONO_LABEL, MONO_META } from './tokens'

export interface Stage {
  /** "01".."07" */
  index: string
  /** Classify | Plan | Read | Retrieve | Sandbox | Draft | Verify */
  name: string
  /** What the stage does. One clause, present tense. */
  action: string
  /** What the stage leaves behind, in machine terms. */
  leaves: string
}

const COLUMNS = 'sm:grid-cols-[32px_112px_minmax(0,1fr)_minmax(0,1fr)]'

export function StageTable({ stages, className }: { stages: Stage[]; className?: string }) {
  return (
    <div className={cn(CARD, 'overflow-hidden', className)}>
      <div className={cn('hidden h-9 items-center gap-4 border-b border-border px-4 sm:grid', COLUMNS)}>
        <span className={MONO_LABEL} aria-hidden>
          #
        </span>
        <span className={MONO_LABEL}>Stage</span>
        <span className={MONO_LABEL}>What runs</span>
        <span className={MONO_LABEL}>What it leaves</span>
      </div>

      <ul className="m-0 list-none p-0">
        {stages.map((stage, i) => (
          <li
            key={stage.index}
            className={cn(
              'grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 sm:min-h-11 sm:items-center sm:gap-y-0 sm:py-2',
              COLUMNS,
              i > 0 && 'border-t border-border',
            )}
          >
            <span className={MONO_META}>{stage.index}</span>
            <span className="text-body font-medium text-foreground">{stage.name}</span>
            <span className="text-body text-foreground-secondary">{stage.action}</span>
            <span className={cn(MONO_META, 'leading-[18px]')}>{stage.leaves}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
