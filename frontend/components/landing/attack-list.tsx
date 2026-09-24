import type { CSSProperties } from 'react'

/**
 * The sandbox self-test this host recorded, one payload a line, each ticking
 * in when the section is reached. Read from the audit record the self-test
 * wrote, by the server; the ticks are the record's verdicts, only staggered.
 */
export interface Attack {
  name: string
  passed: boolean
  detail: string
}

export function AttackList({ attacks, foot }: { attacks: Attack[]; foot: string | null }) {
  return (
    <div className="ae-atk">
      <ul className="ae-atk-list">
        {attacks.map((attack, n) => (
          <li key={attack.name} className={attack.passed ? 'ok' : 'no'} style={{ '--i': n } as CSSProperties} title={attack.detail}>
            <span className="g" aria-hidden>
              {attack.passed ? '✓' : '✕'}
            </span>
            <span className="t">{attack.name}</span>
            <span className="sr-only">{attack.passed ? 'held' : 'did not hold'}</span>
          </li>
        ))}
      </ul>
      {foot && <p className="ae-atk-foot">{foot}</p>}
    </div>
  )
}
