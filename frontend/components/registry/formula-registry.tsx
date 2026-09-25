'use client'

import type { FormulaEntry } from './api'

/**
 * The formula registry: every calculation a run may make, as code the host
 * holds, not arithmetic a model performs. Each entry names the clause it
 * implements, its version, what it needs (with the dimension each input must
 * have), and the hash of its source, so a figure on a run can be traced to the
 * exact code that produced it.
 */
export function FormulaRegistry({ formulas }: { formulas: FormulaEntry[] }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-[72ch] text-body text-foreground-secondary">
        Figures in an integrity decision are computed by these formulas from inputs read out of the evidence, never by
        the model. An input of the wrong dimension (a pressure where a thickness belongs) is refused, and a missing
        one is reported as <span className="font-medium text-foreground">cannot calculate</span>.
      </p>
      <ul className="flex flex-col">
        {formulas.map((formula) => (
          <li key={formula.key} className="grouped-row flex flex-col gap-1.5 py-3 last:border-b-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="text-ui font-medium text-foreground">{formula.title}</span>
                <span className="font-mono text-meta text-foreground-secondary">{formula.key}</span>
              </span>
              <span className="text-meta text-foreground-muted">{formula.clause}</span>
            </div>
            <code className="font-mono text-meta text-foreground">{formula.expression}</code>
            <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-foreground-muted">
              {formula.inputs.map((input) => (
                <span key={input.name} title={input.description}>
                  <span className="font-mono text-foreground-secondary">{input.name}</span>
                  {input.dimension ? ` · ${input.dimension}` : ` · ${input.kind}`}
                  {input.optional ? ' · optional' : ''}
                </span>
              ))}
            </span>
            <span className="font-mono text-[11px] text-foreground-muted" title={formula.source_sha256}>
              source sha256:{formula.source_sha256.slice(0, 16)}…
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
