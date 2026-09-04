import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

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
          <div className={cn('mt-10 grid grid-cols-2 gap-px border md:grid-cols-4', dark ? 'border-ink-border bg-ink-border' : 'border-border bg-border')}>
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
