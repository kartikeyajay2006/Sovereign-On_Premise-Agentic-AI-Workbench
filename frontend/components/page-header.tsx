import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Written out rather than interpolated: Tailwind scans source for complete
 * class names, and a template literal like `md:grid-cols-${n}` produces no
 * CSS at all.
 */
const META_COLUMNS: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  dark,
}: {
  eyebrow: string
  title: ReactNode
  description?: string
  actions?: ReactNode
  meta?: { label: string; value: string }[]
  dark?: boolean
}) {
  return (
    <div className={cn('relative overflow-hidden border-b', dark ? 'border-ink-border' : 'border-border')}>
      <div className={cn('pointer-events-none absolute inset-0 opacity-[0.5]', dark ? 'tech-grid-ink' : 'tech-grid')} />
      <div className="relative mx-auto max-w-[1400px] px-5 py-12 lg:px-10 lg:py-16">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div className="flex flex-col gap-5">
            <span
              className={cn(
                'font-mono text-[11px] uppercase tracking-[0.22em]',
                dark ? 'text-ink-muted' : 'text-foreground-muted',
              )}
            >
              {eyebrow}
            </span>
            <h1
              className={cn(
                'text-balance text-4xl font-medium leading-[1.02] tracking-[-0.025em] md:text-6xl',
                dark ? 'text-ink-foreground' : 'text-foreground',
              )}
            >
              {title}
            </h1>
            {description && (
              <p
                className={cn(
                  'max-w-xl text-[15px] leading-relaxed',
                  dark ? 'text-ink-muted' : 'text-foreground-secondary',
                )}
              >
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
        </div>

        {meta && (
          /*
            The column count follows the number of stats.

            The hairlines here are a painted container showing through a
            one-pixel gap between cells, which only works while the cells
            fill the grid. This was fixed at four columns whatever it was
            given, so the Registry's two stats left two cells of bare
            container -- a pair of grey blocks half the width of the page,
            and the ugliest thing in the app. Approvals, with three, showed
            one.
          */
          <div
            className={cn(
              'mt-10 grid gap-px border',
              meta.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
              META_COLUMNS[Math.min(meta.length, 4)],
              dark ? 'border-ink-border bg-ink-border' : 'border-border bg-border',
            )}
          >
            {meta.map((m) => (
              <div key={m.label} className={cn('flex flex-col gap-1.5 px-4 py-3.5', dark ? 'bg-ink' : 'bg-surface')}>
                <span className={cn('font-mono text-[10px] uppercase tracking-[0.16em]', dark ? 'text-ink-muted' : 'text-foreground-muted')}>
                  {m.label}
                </span>
                <span className={cn('font-mono text-[15px]', dark ? 'text-ink-foreground' : 'text-foreground')}>
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
