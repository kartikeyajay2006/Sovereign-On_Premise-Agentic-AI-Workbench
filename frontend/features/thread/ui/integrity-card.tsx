'use client'

import { useMemo, useState } from 'react'
import { Calculator, ChevronDown, CircleSlash } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalculationRecord, ConflictRecord, IntegrityAssessment } from '@/lib/types'

/**
 * The asset-integrity decision, as the formula registry computed it.
 *
 * Every figure on this card came from a registered, versioned formula applied
 * to inputs read from the run's evidence, never from the model. Each row names
 * the C item that carries it, and the fold below shows every formula, every
 * input with the evidence cell it was read from, and the result hash. When an
 * input is missing the card says "Cannot calculate" and names it: an absent
 * figure is shown as absent, not estimated.
 */

const SEVERITY_TONE: Record<string, string> = {
  high: 'text-critical-text',
  medium: 'text-approval-text',
  low: 'text-sovereign-text',
}

function fmt(value: unknown, digits = 4): string {
  if (typeof value === 'number') return String(Number(value.toFixed(digits)))
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return value == null ? '—' : String(value)
}

function CiteChip({ id, onCite }: { id: string | null | undefined; onCite: (id: string) => void }) {
  if (!id) return null
  return (
    <button
      type="button"
      onClick={() => onCite(id)}
      className="hover-decay inline-flex h-5 items-center rounded-full bg-surface-sunken px-1.5 font-mono text-[11px] font-semibold text-foreground hover:bg-[color-mix(in_oklab,var(--foreground)_9%,var(--background))] focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
      title={`Open ${id}`}
    >
      {id}
    </button>
  )
}

function Reading({ label, children, cite, onCite }: {
  label: string
  children: React.ReactNode
  cite?: string | null
  onCite: (id: string) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">{label}</span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-1.5 text-ui text-foreground">
        {children}
        <CiteChip id={cite} onCite={onCite} />
      </span>
    </div>
  )
}

function Records({ records, onCite }: { records: CalculationRecord[]; onCite: (id: string) => void }) {
  const groups = useMemo(() => {
    const bySubject = new Map<string, CalculationRecord[]>()
    for (const record of records) {
      const key = record.subject || 'calculation'
      bySubject.set(key, [...(bySubject.get(key) ?? []), record])
    }
    return [...bySubject.entries()].sort(([a], [b]) => Number(a.endsWith('· decision')) - Number(b.endsWith('· decision')))
  }, [records])

  return (
    <div className="mt-3 flex flex-col gap-4">
      {groups.map(([subject, group]) => (
        <section key={subject} aria-label={subject} className="flex flex-col gap-1.5">
          <h4 className="flex items-center gap-2 text-ui font-medium text-foreground">
            {subject}
            <CiteChip id={group[0]?.evidence_id} onCite={onCite} />
          </h4>
          <ol className="flex flex-col gap-2 border-l-2 border-line-default pl-3">
            {group.map((record, index) => (
              <li key={`${record.formula_id}-${index}`} className="flex flex-col gap-1">
                <span className="flex flex-wrap items-baseline gap-x-2 text-meta">
                  <span className="font-mono text-foreground">{record.formula_id}@{record.formula_version}</span>
                  <span className="text-foreground-muted">{record.clause}</span>
                </span>
                {record.status === 'calculated' ? (
                  <span className="font-mono text-meta text-foreground-secondary">{record.display}</span>
                ) : (
                  <span className="font-mono text-meta text-critical-text">{record.reason}</span>
                )}
                {record.inputs.some((input) => input.evidence_id) && (
                  <ul className="flex flex-col gap-0.5">
                    {record.inputs.filter((input) => input.evidence_id).map((input) => (
                      <li key={input.name} className="flex flex-wrap items-baseline gap-1.5 text-[12px] text-foreground-muted">
                        <span className="font-mono">{input.name}</span>
                        <span>=</span>
                        <span className="text-foreground-secondary">{input.stated ?? fmt(input.value)}</span>
                        <span>from</span>
                        <CiteChip id={input.evidence_id} onCite={onCite} />
                        {input.locator && <span className="truncate">{input.locator}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {record.result_hash && (
                  <span className="font-mono text-[11px] text-foreground-muted" title={record.result_hash}>
                    result sha256:{record.result_hash.slice(0, 12)}…
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

export function IntegrityCard({
  assessment,
  records,
  conflicts = [],
  onCite,
}: {
  assessment: IntegrityAssessment
  records: CalculationRecord[]
  conflicts?: ConflictRecord[]
  onCite: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const calculated = records.filter((record) => record.status === 'calculated').length
  const governingId = records.find(
    (record) => record.subject === `${assessment.subject} · ${assessment.governing_location}`,
  )?.evidence_id
  const decisionId = records.find((record) => (record.subject || '').endsWith('· decision'))?.evidence_id
  const severity = (assessment.severity || '').toLowerCase()
  const cannot = assessment.status !== 'calculated'
  const withheld = assessment.status === 'conflicted'
  const disputed = conflicts.filter((c) => (assessment.conflicts ?? []).includes(c.id))

  return (
    <section
      aria-label={`Integrity decision for ${assessment.subject}`}
      className={cn('grouped flex flex-col gap-3 px-4 py-3', cannot ? 'wash-critical' : severity === 'high' ? 'wash-critical' : severity === 'medium' ? 'wash-approval' : '')}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          {cannot ? (
            <CircleSlash className="h-4 w-4 text-critical" aria-hidden />
          ) : (
            <Calculator className="h-4 w-4 text-foreground-secondary" aria-hidden />
          )}
          <span className="text-ui font-medium text-foreground">
            {withheld ? 'Decision withheld' : cannot ? 'Cannot calculate' : 'Integrity decision'} · {assessment.subject}
          </span>
        </span>
        <span className="font-mono text-meta text-foreground-muted">
          {calculated} figure{calculated === 1 ? '' : 's'} by registered formulas · not by the model
        </span>
      </header>

      {withheld ? (
        <p className="text-ui text-foreground">
          The sources disagree about{' '}
          <span className="font-medium">
            {disputed.length ? disputed.map((c) => `${c.label} (${c.id})`).join(', ') : (assessment.conflicts ?? []).join(', ')}
          </span>
          . No rate, remaining life, severity or due date is computed until a reviewer chooses the value; the
          formulas then recompute from that choice.
        </p>
      ) : cannot ? (
        <p className="text-ui text-foreground">
          The evidence is missing <span className="font-medium">{assessment.missing.join(', ') || 'required inputs'}</span>.
          No figure is estimated in its place.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Reading label="Governing location" cite={governingId} onCite={onCite}>
            {assessment.governing_location}
          </Reading>
          <Reading label="Corrosion rate" cite={governingId} onCite={onCite}>
            <span className="tabular font-medium">{fmt(assessment.governing_rate_mm_yr)} mm/year</span>
            <span className="text-meta text-foreground-muted">{assessment.governing_rate_is} governs</span>
          </Reading>
          <Reading label="Remaining life" cite={governingId} onCite={onCite}>
            <span className="tabular font-medium">
              {assessment.remaining_life_years == null ? 'not limited by corrosion' : `${fmt(assessment.remaining_life_years, 2)} years`}
            </span>
          </Reading>
          <Reading label="Severity" cite={decisionId} onCite={onCite}>
            <span className={cn('font-medium capitalize', SEVERITY_TONE[severity])}>{assessment.severity}</span>
          </Reading>
          <Reading label="Approving authority" cite={decisionId} onCite={onCite}>
            {assessment.approver}
          </Reading>
          <Reading label={assessment.kind === 'vessel' ? 'Next thickness survey' : 'Next measurement'} cite={decisionId} onCite={onCite}>
            {assessment.next_due ? (
              <>
                <span className="tabular font-medium">{assessment.next_due}</span>
                <span className="text-meta text-foreground-muted">{assessment.interval_months} months</span>
              </>
            ) : (
              <span className="text-foreground-muted">not calculable from the evidence</span>
            )}
          </Reading>
          {assessment.severity_basis && (
            <p className="text-meta text-foreground-secondary sm:col-span-2 lg:col-span-3">
              <span className="font-medium text-foreground">Basis.</span> {assessment.severity_basis}.{' '}
              {assessment.required_action && <>Required action: {assessment.required_action}.</>}
            </p>
          )}
          <p className="text-meta text-foreground-secondary sm:col-span-2 lg:col-span-3">
            <span className="font-medium text-foreground">Fitness-For-Service.</span>{' '}
            {assessment.ffs_triggers.length
              ? assessment.ffs_triggers.join('; ')
              : assessment.local_metal_loss_percent != null
                ? `No trigger applies (local metal loss ${fmt(assessment.local_metal_loss_percent, 1)}% of nominal, under the 25% trigger).`
                : 'No trigger applies.'}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="hover-decay flex items-center gap-1.5 self-start text-meta text-foreground-secondary hover:text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        {open ? 'Hide' : 'Show'} every formula, input and hash
      </button>
      {open && <Records records={records} onCite={onCite} />}
    </section>
  )
}
