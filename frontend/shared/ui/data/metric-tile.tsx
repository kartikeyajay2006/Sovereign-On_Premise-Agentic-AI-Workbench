/**
 * MetricTile — a number that cannot be rendered without saying where it came
 * from.
 *
 * Spec: 20-DESIGN-SPEC §4.7, §1 P1 ("absence renders as an em dash, never as a
 * favourable default"), §2.4 (type scale).
 * Research: 11-RESEARCH-LANDING-FIRSTRUN §2.5 — "quiet mono caption above, loud
 * numeral below … that pairing is the entire visual grammar of 'this was
 * counted, not claimed'."
 *
 *   ┌────────────────────────────────────┐
 *   │ EXTERNAL CALLS                     │  --text-ledger mono uppercase
 *   │                                    │
 *   │ 0                       [ source ] │  --text-display mono tabular
 *   │ psutil · 2s poll · 14:32:07        │  --text-meta mono, muted
 *   └────────────────────────────────────┘
 *
 * Two API decisions carry the product's claim:
 *
 *   `provenance` is REQUIRED. There is no way to put a figure on screen
 *   without stating its origin. This is why rewriting security-view.tsx's
 *   `127.0.0.1 : 8000` tiles as MetricTile is impossible — neither is measured,
 *   so there is nothing to put in `provenance`, and the engineer must wire the
 *   real field or delete the tile. That is the mechanism working.
 *
 *   `value` is `string | number | null`. The no-reading case is modelled
 *   explicitly and renders an em dash. A `?? 0` fallback is precisely the bug
 *   class this component exists to prevent: a zero is a measurement, and
 *   "we did not measure" must never be able to impersonate one.
 */

import { cn } from '@/lib/utils'

import {
  ProvenanceChip,
  formatProvenanceCaption,
  type Provenance,
} from './provenance-chip'

export type { Provenance } from './provenance-chip'

export type { Status } from '@/shared/ui/types'
import type { Status } from '@/shared/ui/types'

export type TrendDirection = 'up' | 'down' | 'flat'

export interface MetricTrend {
  direction: TrendDirection
  /** What moved and over what window: "+3 since the last poll". */
  detail: string
}

export interface MetricTileProps {
  label: string
  /** null renders "unavailable" with the method still shown. NEVER a zero. */
  value: string | number | null
  unit?: string
  /** Absent => ink. A tone is a reading about the number, not decoration. */
  tone?: Status
  /** REQUIRED. This is the point of the component. */
  provenance: Provenance
  trend?: MetricTrend
  className?: string
}

/**
 * Tone resolves to the `-text` variant, never the raw fill. --sovereign
 * (3.07:1), --active (3.82:1), --approval (2.97:1) and --critical (4.50:1) all
 * fail AA as text on paper; approval fails even the 3:1 non-text threshold.
 */
const TONE_CLASS: Record<Status, string> = {
  sovereign: 'text-sovereign-text',
  active: 'text-active-text',
  approval: 'text-approval-text',
  critical: 'text-critical-text',
}

/**
 * Direction is carried by shape alone and gets no hue: up is not good and down
 * is not bad — that judgement belongs to `tone`, which the caller sets
 * deliberately.
 */
const TREND_GLYPH: Record<TrendDirection, string> = {
  up: '↑',
  down: '↓',
  flat: '→',
}

const TREND_LABEL: Record<TrendDirection, string> = {
  up: 'up',
  down: 'down',
  flat: 'flat',
}

export function MetricTile({
  label,
  value,
  unit,
  tone,
  provenance,
  trend,
  className,
}: MetricTileProps) {
  // The one branch that matters. Explicit, not a coalesce.
  const hasReading = value !== null

  return (
    <div
      className={cn('grouped flex flex-col', className)}
      style={{ padding: 'var(--pad-comfortable)', gap: 'var(--space-4)' }}
    >
      <span
        className="text-foreground-muted font-mono uppercase"
        style={{
          fontSize: 'var(--size-ledger)',
          lineHeight: 'var(--lh-ledger)',
          letterSpacing: 'var(--ls-ledger)',
        }}
      >
        {label}
      </span>

      <div
        className="flex items-end justify-between"
        style={{ gap: 'var(--space-5)' }}
      >
        {hasReading ? (
          <span
            className="flex items-baseline"
            style={{ gap: 'var(--space-3)' }}
          >
            <span
              className={cn(
                'tabular font-mono',
                tone === undefined ? 'text-foreground' : TONE_CLASS[tone],
              )}
              style={{
                fontSize: 'var(--size-display)',
                lineHeight: 'var(--lh-display)',
                fontVariationSettings: `'wght' var(--weight-mono-med)`,
              }}
            >
              {value}
            </span>
            {unit !== undefined ? (
              <span
                className="text-foreground-muted font-mono"
                style={{
                  fontSize: 'var(--size-meta)',
                  lineHeight: 'var(--lh-meta)',
                  letterSpacing: 'var(--ls-meta)',
                }}
              >
                {unit}
              </span>
            ) : null}
          </span>
        ) : (
          // P1: absence is an em dash and a stated word, never a favourable
          // default. The unit is withheld too — there is no quantity for it to
          // qualify. The method below stays, so the reader still learns what
          // WOULD have produced this figure.
          <span
            className="flex items-baseline"
            style={{ gap: 'var(--space-3)' }}
            data-unavailable="true"
          >
            <span
              aria-hidden="true"
              className="text-foreground-muted tabular font-mono"
              style={{
                fontSize: 'var(--size-display)',
                lineHeight: 'var(--lh-display)',
                fontVariationSettings: `'wght' var(--weight-mono)`,
              }}
            >
              {'—'}
            </span>
            <span
              className="text-foreground-muted font-mono uppercase"
              style={{
                fontSize: 'var(--size-ledger)',
                lineHeight: 'var(--lh-ledger)',
                letterSpacing: 'var(--ls-ledger)',
              }}
            >
              no reading
            </span>
          </span>
        )}

        <ProvenanceChip provenance={provenance} className="shrink-0" />
      </div>

      <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
        <span
          className="text-foreground-muted font-mono"
          style={{
            fontSize: 'var(--size-meta)',
            lineHeight: 'var(--lh-meta)',
            letterSpacing: 'var(--ls-meta)',
          }}
        >
          {formatProvenanceCaption(provenance)}
        </span>

        {trend !== undefined ? (
          <span
            className="text-foreground-secondary flex items-baseline font-mono"
            style={{
              gap: 'var(--space-2)',
              fontSize: 'var(--size-meta)',
              lineHeight: 'var(--lh-meta)',
              letterSpacing: 'var(--ls-meta)',
            }}
            data-trend={trend.direction}
          >
            <span aria-hidden="true">{TREND_GLYPH[trend.direction]}</span>
            <span className="sr-only">{TREND_LABEL[trend.direction]}:</span>
            <span>{trend.detail}</span>
          </span>
        ) : null}
      </div>
    </div>
  )
}
