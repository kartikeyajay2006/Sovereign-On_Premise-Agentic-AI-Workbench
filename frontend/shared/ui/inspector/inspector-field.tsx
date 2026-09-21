'use client'

/**
 * InspectorField — 20-DESIGN-SPEC §4.8, migration step B5.
 *
 * 'use client' is required: `copyable` touches navigator.clipboard and holds
 * transient state. Nothing else in this file needs the client.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE ONE RULE THIS COMPONENT EXISTS TO ENFORCE
 *
 * `value` is `string | number | null`, and `null` renders an em dash. There is
 * deliberately no `defaultValue`, no `placeholder`, no `fallback` and no
 * `emptyText` prop, and none may ever be added. The entire bug class this
 * product suffers from is a component quietly substituting a plausible value
 * for a missing one — `?? 0`, `|| 6`, `: 0.95`. A field that cannot be handed
 * a substitute cannot invent one. (P1; 01 §6.3.2)
 *
 * If a caller wants different words for "we did not measure this", that is a
 * different component (UnavailableState, §4.11), not a prop here.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface InspectorFieldProps {
  label: string
  /**
   * null renders an em dash. THERE IS NO WAY TO PASS A FALLBACK. This is the
   * anti-fabrication mechanism at the field level. (01 §6.3.2)
   *
   * A number renders as given — this component never rounds, never formats to
   * a fixed precision and never appends a unit, because each of those is a
   * claim about the measurement it was not told.
   */
  value: string | number | null
  /** Default true — most inspector values are machine-issued. (P4) */
  mono?: boolean
  copyable?: boolean
  truncate?: boolean
}

/** The em dash is the only thing an absent value may render as. */
const EM_DASH = '—'

/** How long the copy affordance shows its acknowledgement. */
const COPIED_ACK_MS = 1200

// NEEDS-GLOBAL: §4.8's `.insp-grid` / `.insp-value` rules. The 140px label
// track lives on each field rather than on a wrapper so that a section can
// also hold non-field content; the visual result is identical.

export function InspectorField({
  label,
  value,
  mono = true,
  copyable = false,
  truncate = false,
}: InspectorFieldProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const isEmpty = value === null
  const text = isEmpty ? EM_DASH : String(value)

  const onCopy = useCallback(() => {
    if (isEmpty) return
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), COPIED_ACK_MS)
    })
  }, [isEmpty, text])

  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-baseline gap-x-[var(--space-6)] text-body">
      <span className="text-ui text-foreground-secondary">{label}</span>

      <span className="flex min-w-0 items-baseline gap-[var(--space-2)]">
        <span
          data-empty={isEmpty ? 'true' : undefined}
          className={cn(
            'min-w-0',
            mono ? 'font-mono text-meta' : 'text-body',
            'tabular',
            isEmpty && 'text-foreground-muted',
            truncate && 'truncate-cell',
          )}
        >
          {text}
        </span>

        {isEmpty ? <span className="sr-only">no value recorded</span> : null}

        {copyable && !isEmpty ? (
          <button
            type="button"
            onClick={onCopy}
            aria-label={copied ? `${label} copied` : `Copy ${label}`}
            className="hover-decay shrink-0 rounded-[var(--radius-xs)] p-[var(--space-1)] text-foreground-muted hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            {copied ? (
              <Check aria-hidden width={12} height={12} />
            ) : (
              <Copy aria-hidden width={12} height={12} />
            )}
          </button>
        ) : null}
      </span>
    </div>
  )
}
