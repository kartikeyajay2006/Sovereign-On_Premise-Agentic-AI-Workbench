import { cn } from '@/lib/utils'
import { MONO_LABEL, MONO_META } from './tokens'

export interface TimelineSegment {
  id: string
  name: string
  ms: number
  /** A model call. The three of them are the story of a CPU run, so they share a tone. */
  model: boolean
}

export interface RunTimelineProps {
  label: string
  /** "195.2 s", as measured end to end. */
  total: string
  totalMs: number
  segments: TimelineSegment[]
  /** Printed under the bar for segments too thin to label, e.g. "Retrieve 4.6 s". */
  small: string[]
  format: (ms: number) => string
  className?: string
}

/**
 * Where one run's time went, drawn to scale.
 *
 * Each segment's width is its measured share of the run's end-to-end
 * duration, and nothing about the bar moves: a length that animates is a
 * length that is wrong for as long as it is animating, and a screenshot
 * taken mid-way would record a false measurement. The remainder -- time the
 * audit log does not attribute to any stage -- is drawn as its own segment
 * and named, rather than spread invisibly across the others.
 *
 * Segments under 6% of the run are not labelled inside the bar; they are
 * listed under it instead, so no label is ever cut off or overlaps its
 * neighbour.
 */
export function RunTimeline({ label, total, totalMs, segments, small, format, className }: RunTimelineProps) {
  const known = segments.reduce((sum, segment) => sum + segment.ms, 0)
  const rest = Math.max(0, totalMs - known)
  const parts = rest > 0 ? [...segments, { id: 'between', name: '', ms: rest, model: false }] : segments
  const columns = parts.map((part) => `${Math.max(part.ms, 1)}fr`).join(' ')

  return (
    <figure className={cn('m-0', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <span className={MONO_LABEL}>{label}</span>
        <span className="font-mono text-ui tabular text-foreground">{total}</span>
      </div>

      <div
        role="img"
        aria-label={`${label}: ${parts
          .filter((part) => part.id !== 'between')
          .map((part) => `${part.name} ${format(part.ms)}`)
          .join(', ')}${rest > 0 ? `, and ${format(rest)} between stages` : ''}, of ${total}.`}
        className="mt-3 grid h-2.5 gap-[2px]"
        style={{ gridTemplateColumns: columns }}
      >
        {parts.map((part) => (
          <span
            key={part.id}
            className={cn(
              'min-w-px rounded-[1px]',
              part.id === 'between'
                ? 'bg-line-default'
                : part.model
                  ? 'bg-foreground/70'
                  : 'bg-foreground/35',
            )}
          />
        ))}
      </div>

      <div aria-hidden className="mt-2 grid gap-[2px]" style={{ gridTemplateColumns: columns }}>
        {parts.map((part) => (
          <span key={part.id} className="min-w-0 overflow-hidden">
            {part.id !== 'between' && part.ms / totalMs >= 0.06 ? (
              <span className="flex flex-col">
                <span className="truncate text-ui text-foreground">{part.name}</span>
                <span className={cn(MONO_META, 'truncate tabular')}>{format(part.ms)}</span>
              </span>
            ) : null}
          </span>
        ))}
      </div>

      {small.length > 0 ? (
        <figcaption className={cn(MONO_META, 'mt-3 flex flex-wrap gap-x-4 gap-y-0.5')}>
          {small.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </figcaption>
      ) : null}
    </figure>
  )
}
