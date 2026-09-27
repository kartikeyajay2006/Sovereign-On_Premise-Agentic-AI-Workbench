import type { JSX } from 'react'
import { cn } from '@/lib/utils'

/**
 * Small line drawings for a screen whose answer is "nothing yet", in the
 * manner of the landing's vessel and crew: construction lines in the
 * faintest ink, the object in muted ink, one detail in the mark's core
 * colour (lime at night, olive on paper).
 *
 * They are still. A drawing here stands for a reading that came back
 * empty, and nothing is happening, so nothing moves; a read still in
 * flight is shown by the scan rule under its words (ReadingLine), not by
 * one of these. Decorative, so aria-hidden: the words beside it carry the
 * meaning.
 */

export type LineArtKind = 'queue' | 'shelf' | 'fanout'

const AUX = { stroke: 'var(--line-strong)', strokeWidth: 1, fill: 'none' } as const
const BODY = { stroke: 'var(--foreground-muted)', strokeWidth: 1.25, fill: 'none' } as const
const MARK = { stroke: 'var(--mark-core)', strokeWidth: 1.25, fill: 'none' } as const

function Queue() {
  // An in-tray, empty, with the reviewer's stamp set down beside it.
  return (
    <>
      <g {...AUX}>
        <path d="M8 84H152" strokeDasharray="14 4 2 4" />
        <path d="M22 30V76M18 30H26M18 76H26" />
      </g>
      <g {...BODY}>
        <path d="M34 52L44 40H104L114 52" />
        <path d="M34 52H114V76H34Z" />
        <path d="M58 52V58H90V52" />
        <path d="M126 76H148V68H126Z" />
        <path d="M131 68V60H143V68" />
        <path d="M134 60V50H140V60M131 50H143" />
      </g>
      {/* The clear rule: the tray's floor, nothing on it. */}
      <path d="M40 70H108" {...MARK} />
    </>
  )
}

function Shelf() {
  // Three document frames, dashed because nothing is indexed, beside an
  // index card box with its one empty card raised.
  return (
    <>
      <g {...AUX}>
        <path d="M8 84H152" strokeDasharray="14 4 2 4" />
      </g>
      <g {...BODY} strokeDasharray="3 3">
        <path d="M18 76V26H40L48 34V76Z" />
        <path d="M54 76V26H76L84 34V76Z" />
      </g>
      <g {...BODY}>
        <path d="M40 26V34H48" strokeDasharray="3 3" />
        <path d="M76 26V34H84" strokeDasharray="3 3" />
        <path d="M96 76V52H148V76Z" />
        <path d="M96 60H148" />
        <path d="M104 52V38H140V52" />
      </g>
      <path d="M110 45H134" {...MARK} />
    </>
  )
}

function Fanout() {
  // One definition, the fan to its items, and the items not yet run.
  return (
    <>
      <g {...AUX}>
        <path d="M8 84H152" strokeDasharray="14 4 2 4" />
        <path d="M28 48H56" strokeDasharray="2 3" />
      </g>
      <g {...BODY}>
        <path d="M14 40H30V56H14Z" />
        <path d="M56 48C80 48 84 20 108 20M56 48C80 48 84 34 108 34M56 48H108M56 48C80 48 84 62 108 62M56 48C80 48 84 76 108 76" />
      </g>
      <g {...BODY} strokeDasharray="3 3">
        <path d="M112 15H124V25H112Z" />
        <path d="M112 29H124V39H112Z" />
        <path d="M112 43H124V53H112Z" />
        <path d="M112 57H124V67H112Z" />
        <path d="M112 71H124V81H112Z" />
      </g>
      <path d="M52 44V52M52 48H60" {...MARK} />
    </>
  )
}

const DRAWINGS: Record<LineArtKind, () => JSX.Element> = { queue: Queue, shelf: Shelf, fanout: Fanout }

export function LineArt({ kind, className }: { kind: LineArtKind; className?: string }) {
  const Drawing = DRAWINGS[kind]
  return (
    <svg
      viewBox="0 0 160 96"
      width="160"
      height="96"
      aria-hidden
      focusable="false"
      className={cn('block h-auto w-[160px] max-w-full shrink-0 [&_path]:[vector-effect:non-scaling-stroke]', className)}
    >
      <Drawing />
    </svg>
  )
}
