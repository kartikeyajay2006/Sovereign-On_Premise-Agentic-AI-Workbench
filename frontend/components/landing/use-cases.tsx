import {
  BookOpenCheck,
  Calculator,
  ClipboardCheck,
  FileSignature,
  FileText,
  Flame,
  Gauge,
  Layers,
  ListChecks,
  ScanLine,
  ShieldAlert,
  Timer,
  Wand2,
  type LucideIcon,
} from 'lucide-react'

/**
 * What people ask it, as two slow rows running opposite ways.
 *
 * Each chip is a request from the demo script or a built-in skill: an
 * example of what to ask, never a result. The rows are two identical sets
 * translated by half their width, so they loop without a seam; they pause
 * under the pointer, and stand still -- wrapping instead -- under reduced
 * motion. Only transform moves, so the loop runs on the compositor.
 */

const ICON: Record<string, LucideIcon> = {
  Clause: BookOpenCheck,
  Severity: ShieldAlert,
  'Sign-off': FileSignature,
  Permit: Flame,
  Interval: Timer,
  Test: Gauge,
  Calculation: Calculator,
  'Approval note': FileText,
  Skill: Wand2,
  Handover: ClipboardCheck,
  'Scanned report': ScanLine,
  Records: ListChecks,
  Harness: Layers,
}

interface UseCase {
  kind: string
  text: string
}

function Row({ items, reverse }: { items: readonly UseCase[]; reverse?: boolean }) {
  const set = (hidden: boolean) => (
    <ul className="ae-uc-set" aria-hidden={hidden || undefined}>
      {items.map((item) => {
        const Icon = ICON[item.kind] ?? BookOpenCheck
        const skill = item.text.match(/^(\/[\w-]+)\s+(.*)$/)
        return (
          <li key={item.text} className="ae-uc">
            <span className="ae-uc-icon" aria-hidden>
              <Icon className="size-3.5" />
            </span>
            <span className="ae-uc-kind">{item.kind}</span>
            <span className="ae-uc-text">
              {skill ? (
                <>
                  <span className="cmd">{skill[1]}</span> {skill[2]}
                </>
              ) : (
                item.text
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
  return (
    <div className="ae-uc-row">
      <div className={reverse ? 'ae-uc-track reverse' : 'ae-uc-track'}>
        {set(false)}
        {set(true)}
      </div>
    </div>
  )
}

export function UseCases({ rows, note }: { rows: readonly (readonly UseCase[])[]; note: string }) {
  return (
    <div className="ae-uc-wrap">
      {rows.map((items, i) => (
        <Row key={i} items={items} reverse={i % 2 === 1} />
      ))}
      <p className="ae-note mx-auto mt-2 max-w-[70ch] text-center">{note}</p>
    </div>
  )
}
