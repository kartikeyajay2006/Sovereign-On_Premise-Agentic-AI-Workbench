import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'default' | 'muted' | 'sovereign' | 'active' | 'approval' | 'critical'

const TONE_TEXT: Record<Tone, string> = {
  default: 'text-foreground',
  muted: 'text-foreground-muted',
  sovereign: 'text-sovereign-text',
  active: 'text-active-text',
  approval: 'text-approval-text',
  critical: 'text-critical-text',
}

export interface PageHeaderStat {
  label: string
  /** Rendered as given. Pass an em dash for "no reading", never a default. */
  value: ReactNode
  /** A state the value reports. Hue is spent only when there is a state. */
  tone?: Tone
  /** How the value was obtained, shown on hover: "GET /api/audit/chain, 11:32:05". */
  hint?: string
}

/**
 * The top of every app screen except the thread.
 *
 * It was an eyebrow, a 60px headline, a paragraph and a boxed grid of stats
 * over a tech-grid background: about 350px of chrome before the first row of
 * content, on screens whose whole job is the content. The grid was not even
 * visible. It sat at z-auto under an opaque shell, so it was paid for and
 * never painted.
 *
 * Now it is a title at the product's title size, one line saying what the
 * screen is for, and the screen's measured readings as a row of labelled
 * values: about 130px. The row wraps instead of sitting in a grid, which is
 * also what retires the grey-cell problem for good. A fixed column count
 * with fewer stats than columns left painted holes; a wrapping row has no
 * empty cells to paint, and no interpolated class names to go missing.
 *
 * `contained` (default true) keeps the header inside the same 1400px column
 * as the global navigation, so titles line up under the logo. A screen that
 * places the header inside its own column passes false.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  dark,
  contained = true,
  children,
}: {
  eyebrow?: string
  title: ReactNode
  description?: string
  actions?: ReactNode
  meta?: PageHeaderStat[]
  dark?: boolean
  contained?: boolean
  /** A row under the readings, for a screen-level toolbar. */
  children?: ReactNode
}) {
  const body = (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          {eyebrow && (
            <p
              className={cn(
                'mb-1 font-mono text-ledger uppercase tracking-[var(--ls-ledger)]',
                dark ? 'text-ink-muted' : 'text-foreground-muted',
              )}
            >
              {eyebrow}
            </p>
          )}
          <h1
            className={cn(
              'text-balance text-title font-medium tracking-[var(--ls-title)]',
              dark ? 'text-ink-foreground' : 'text-foreground',
            )}
          >
            {title}
          </h1>
          {description && (
            <p
              className={cn(
                'mt-1 max-w-[72ch] text-body',
                dark ? 'text-ink-muted' : 'text-foreground-secondary',
              )}
            >
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {meta && meta.length > 0 && (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          {meta.map((m) => (
            <div key={m.label} className="flex min-w-0 flex-col gap-0.5" title={m.hint}>
              <dt
                className={cn(
                  'font-mono text-ledger uppercase tracking-[var(--ls-ledger)]',
                  dark ? 'text-ink-muted' : 'text-foreground-muted',
                )}
              >
                {m.label}
              </dt>
              <dd
                className={cn(
                  'tabular min-w-0 truncate font-mono text-body',
                  dark ? 'text-ink-foreground' : TONE_TEXT[m.tone ?? 'default'],
                )}
              >
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {children && <div className="mt-4">{children}</div>}
    </>
  )

  return (
    <header className={cn('border-b', dark ? 'border-ink-border bg-ink' : 'border-line-default')}>
      {contained ? (
        <div className="mx-auto w-full max-w-[1400px] px-4 pb-4 pt-2 sm:px-6 sm:pt-4">{body}</div>
      ) : (
        <div className="pb-4 pt-2 sm:pt-4">{body}</div>
      )}
    </header>
  )
}
