/**
 * DenialCard — 20-DESIGN-SPEC §4.9, migration step B7.
 *
 * "A denial is not an error state, it is a correct outcome." (01 §3.1)
 *
 * When the policy gateway refuses an action, the product is working. This card
 * is the most persuasive single artefact in the demo, so it states four things
 * and nothing else: what was requested, which rule fired (its id, its file and
 * line, and the policy version it came from), the decision — three-valued,
 * never boolean — and what the operator can do about it.
 *
 * It does NOT look like a crash and it does NOT apologise. `failed` and
 * `denied` are different states for exactly this reason (04 §3.2: "a denial is
 * the product working; a failure is a bug"). There is no "Sorry", no "Oops",
 * no "Something went wrong", and the page around it stays completely normal
 * (10 §2.4, Sentry: "the error is the content").
 *
 * MOTION: none. An unfavourable outcome delivered slowly and theatrically
 * scores worse than the same outcome delivered instantly, so this card has no
 * entrance animation, no transition, no shake, no flash, no strobe and no
 * sound. It is simply already there, fully legible, on the first frame. The
 * only motion in the denial sequence lives on the stage board, where it is
 * subtraction — the other ten stages going quiet (04 §3.5). The denial is loud
 * because everything else went dim, which is a far more confident gesture than
 * an explosion.
 *
 * No 'use client': this component has no handlers and no state. Its one
 * control is an <a> to the policy rule.
 */

import type { ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * NOTE: §4 puts `Provenance` in `shared/ui/types.ts`, which is owned by a
 * different migration step and does not exist yet. Declared here so B7
 * compiles standalone; re-export from there once it lands.
 */
export type { Provenance } from '@/shared/ui/types'
import type { Provenance } from '@/shared/ui/types'

export type DenialKind =
  | 'policy'
  | 'sandbox'
  | 'egress'
  | 'injection'
  | 'file_guard'
  | 'integrity'
  | 'dimensional'

/**
 * Three-valued, never boolean. "No rule permitted this" is a different
 * governance fact from "a rule prohibited this". (12 §3.32, AWS IAM)
 */
export type DenialOutcome = 'explicit_deny' | 'implicit_deny'

export interface DenialCardProps {
  kind: DenialKind
  outcome: DenialOutcome
  /** A definition grid: what was requested, in the requester's own terms. */
  subject: { label: string; detail: string }[]
  checks: { label: string; passed: boolean; detail?: string }[]
  /**
   * Only the CONTRIBUTING rule by default. When an explicit deny wins, the
   * deny is the ONLY entry. (12 §3.31, AWS IAM)
   */
  rule?: { id: string; file: string; line: number; excerpt: string; href: string }
  /**
   * The version of the policy set this decision was evaluated against —
   * "2026.03.1", the `policy_version` of the `policy.denied` event (04 §3.5).
   * Required and nullable: a rule id without the version it came from cannot
   * be reproduced, and an unknown version renders an em dash rather than
   * being quietly omitted. (Addition to §4.9's prop list; see the report.)
   */
  policyVersion: string | null
  evaluatedCount?: number
  /** Why, in one plain sentence, backend-authored. */
  reason: string
  /**
   * What the operator can do next, backend-authored when the gateway knows.
   * When absent, the card states the outcome's own definitional consequence
   * (see OUTCOME_REMEDY) — never an invented route to an override.
   */
  remedy?: string
  /**
   * Text lifted verbatim from an untrusted source — the injected instruction
   * that triggered a `kind: 'injection'` denial. Rendered inside a block
   * labelled QUOTED FROM UNTRUSTED SOURCE — NOT EXECUTED, which is the point:
   * document text can supply facts, it cannot grant permissions.
   */
  quoted?: string
  /**
   * "nothing was executed; 0 bytes left this host." Carries its own
   * Provenance: a containment line with no measurement behind it is
   * security-view.tsx's old "0 outbound sockets opened" all over again.
   * OMITTED ENTIRELY, never defaulted, when egress cannot be attributed to
   * this task. (01 §3.4)
   */
  containment?: { statement: string; provenance: Provenance }
  /**
   * When any part of the evaluation is withheld, SAY SO. Silence is worse
   * than refusal. (12 §3.33 / §5.4)
   */
  withheld?: string
  auditSequences: number[]
}

const EM_DASH = '—'

const KIND_LABEL: Record<DenialKind, string> = {
  policy: 'POLICY',
  sandbox: 'SANDBOX',
  egress: 'EGRESS',
  injection: 'PROMPT INJECTION',
  file_guard: 'FILE GUARD',
  integrity: 'INTEGRITY',
  dimensional: 'DIMENSIONAL',
}

const OUTCOME_LABEL: Record<DenialOutcome, string> = {
  explicit_deny: 'EXPLICIT DENY',
  implicit_deny: 'IMPLICIT DENY',
}

/** The decision, stated as a fact rather than as an apology. */
const OUTCOME_SENTENCE: Record<DenialOutcome, string> = {
  explicit_deny: 'A rule prohibited this request. It was not executed.',
  implicit_deny: 'No rule permitted this request. It was not executed.',
}

/**
 * The fallback for `remedy`. Each sentence is true by the definition of the
 * outcome it belongs to — it describes how the gateway works, and claims
 * nothing about this particular request that the card was not told.
 */
const OUTCOME_REMEDY: Record<DenialOutcome, string> = {
  explicit_deny:
    'Re-running this will be refused again. Changing the outcome means changing the rule above, or running under a role the rule permits.',
  implicit_deny:
    'Nothing prohibited this and nothing permitted it. A rule that explicitly allows it has to exist before it can run.',
}

// NEEDS-GLOBAL: §4.9's `.denial`, `.denial-head`, `.denial-check`,
// `.denial-rule` and `.denial-quote` rules are expressed below as Tailwind
// utilities over the same tokens. Nothing here needs a global rule to work;
// the class form would only shorten the markup.

export function DenialCard({
  kind,
  outcome,
  subject,
  checks,
  rule,
  policyVersion,
  evaluatedCount,
  reason,
  remedy,
  quoted,
  containment,
  withheld,
  auditSequences,
}: DenialCardProps) {
  return (
    <section
      data-kind={kind}
      data-outcome={outcome}
      aria-label={`${KIND_LABEL[kind]} ${OUTCOME_LABEL[outcome]}`}
      className="rounded-[var(--radius)] bg-surface shadow-[0_0_0_1px_var(--critical-border)]"
    >
      {/* The decision, at the top, in words, before any detail. */}
      <header className="flex items-center gap-[var(--space-4)] border-b border-critical-border bg-critical-surface px-[var(--space-6)] py-[var(--pad-comfortable)] text-critical-text">
        <ShieldAlert aria-hidden width={16} height={16} className="shrink-0" />
        <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)]">
          {KIND_LABEL[kind]} · {OUTCOME_LABEL[outcome]}
        </span>
        <span className="text-body font-strong">{OUTCOME_SENTENCE[outcome]}</span>
      </header>

      <Band label="Requested">
        <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-[var(--space-6)] gap-y-[var(--space-3)] text-body">
          {subject.map((item) => (
            <div key={item.label} className="contents">
              <dt className="text-ui text-foreground-secondary">{item.label}</dt>
              <dd className="min-w-0 truncate-cell font-mono text-meta tabular">
                {item.detail}
              </dd>
            </div>
          ))}
        </dl>
      </Band>

      {checks.length > 0 ? (
        <Band label="Checks">
          <ul className="flex flex-col gap-[var(--space-3)]">
            {checks.map((check) => (
              <li
                key={check.label}
                data-passed={check.passed ? 'true' : 'false'}
                className={cn(
                  'flex items-baseline gap-[var(--space-4)] text-body',
                  check.passed ? 'text-foreground-secondary' : 'text-critical-text',
                )}
              >
                {/* Glyph before hue: the pass/fail read survives greyscale. (P2) */}
                <span aria-hidden className="font-mono">
                  {check.passed ? '✓' : '✕'}
                </span>
                <span className="sr-only">{check.passed ? 'passed' : 'failed'}</span>
                <span className="min-w-0">
                  {check.label}
                  {check.detail ? (
                    <span className="ml-[var(--space-3)] font-mono text-meta text-foreground-muted tabular">
                      {check.detail}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Band>
      ) : null}

      <Band label={outcome === 'explicit_deny' ? 'Rule' : 'Evaluation'}>
        {rule ? (
          <div className="flex flex-col gap-[var(--space-4)]">
            <div className="flex flex-wrap items-baseline gap-x-[var(--space-5)] gap-y-[var(--space-2)] font-mono text-meta tabular">
              <span className="text-foreground font-medium">{rule.id}</span>
              <span className="text-foreground-muted">
                {rule.file}:{rule.line}
              </span>
              <span className="text-foreground-muted">
                POLICY {policyVersion ?? EM_DASH}
              </span>
            </div>

            <pre className="overflow-x-auto whitespace-pre border-l-2 border-l-critical bg-surface-sunken px-[var(--space-5)] py-[var(--space-4)] font-mono text-meta">
              {rule.excerpt}
            </pre>

            <a
              href={rule.href}
              className="hover-decay self-start rounded-[var(--radius-xs)] text-ui text-foreground underline underline-offset-2 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              Open policy rule →
            </a>
          </div>
        ) : (
          <p className="text-body text-foreground-secondary">
            No rule matched this request.{' '}
            <span className="font-mono text-meta tabular">
              POLICY {policyVersion ?? EM_DASH}
            </span>
          </p>
        )}

        {/*
          IAM's behaviour: only the contributing rule is shown. The count is
          stated rather than offered as an expansion, because this component is
          given one rule and nothing else — a control that expanded to nothing
          would be a lie about what the card holds. (12 §3.31)
        */}
        {evaluatedCount === undefined ? null : (
          <p className="mt-[var(--space-4)] font-mono text-meta text-foreground-muted tabular">
            {evaluatedCount} rules evaluated · {rule ? '1' : '0'} contributing
          </p>
        )}
      </Band>

      {quoted ? (
        <Band label="Quoted from untrusted source — not executed">
          <pre className="overflow-x-auto whitespace-pre-wrap break-words border border-critical-border bg-critical-surface px-[var(--space-5)] py-[var(--space-4)] font-mono text-meta text-critical-text">
            {quoted}
          </pre>
        </Band>
      ) : null}

      <Band label="Why">
        <p className="max-w-[66ch] text-body">{reason}</p>
      </Band>

      <Band label="What you can do">
        <p className="max-w-[66ch] text-body">{remedy ?? OUTCOME_REMEDY[outcome]}</p>
      </Band>

      {containment ? (
        <Band label="Containment">
          <p className="max-w-[66ch] text-body">{containment.statement}</p>
          <p className="mt-[var(--space-3)] font-mono text-meta text-foreground-muted tabular">
            {containment.provenance.source} · {containment.provenance.method} ·{' '}
            {containment.provenance.measuredAt ?? 'age unknown'}
          </p>
        </Band>
      ) : null}

      {withheld ? (
        <Band label="Withheld">
          <p className="max-w-[66ch] text-body text-foreground-secondary">{withheld}</p>
        </Band>
      ) : null}

      <footer className="px-[var(--space-6)] py-[var(--space-4)] font-mono text-meta text-foreground-muted tabular">
        AUDIT{' '}
        {auditSequences.length > 0
          ? auditSequences.map((n) => `#${n}`).join(' · ')
          : EM_DASH}
      </footer>
    </section>
  )
}

/** One labelled band. Same geometry as InspectorSection, so the two read as
 *  the same object when a DenialCard is rendered inside an InspectorPanel. */
function Band({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="border-b border-line-subtle px-[var(--space-6)] py-[var(--pad-comfortable)]">
      <h3 className="mb-[var(--space-4)] font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
        {label}
      </h3>
      {children}
    </section>
  )
}
