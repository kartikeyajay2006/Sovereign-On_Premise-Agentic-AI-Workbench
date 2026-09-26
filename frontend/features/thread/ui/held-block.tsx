'use client'

import Link from 'next/link'
import { ArrowUpRight, Lock } from 'lucide-react'
import { roleName } from '@/lib/presentation'
import { cn } from '@/lib/utils'
import { Light } from '@/shared/motion'
import type { AssistantTurn } from '../model/types'

/**
 * Why this run is held, who may release it, and what is withheld until they
 * do -- directly under the answer, where the reader looks for what happens
 * next. It was one amber phrase at the right of the actions row, with the
 * first reason cut to a clause and the rest behind "(+2)".
 *
 * Every line is the record's: the approver roles and reasons the policy gate
 * wrote, the deliverable's own release flag, and -- once a reviewer decides --
 * their name, their decision and their note. When the decision changes while
 * the reader is here, the block blooms once in the new state's light.
 */

/**
 * A policy reason as a sentence. The engine records "rule_name: Sentence."
 * -- the rule name is for the audit trail, the sentence for the reader. A
 * reason with no sentence is its rule name, spaced out.
 */
export function reasonSentence(reason: string): string {
  const colon = reason.indexOf(':')
  const text = (colon === -1 ? reason.replace(/_/g, ' ') : reason.slice(colon + 1)).trim()
  if (!text) return ''
  const sentence = text.charAt(0).toUpperCase() + text.slice(1)
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`
}

/**
 * "Head of Inspection, then Plant Manager", or who is still to sign once one
 * has. A High finding needs both signatures in order; joining the roles with
 * "or" told a reader one of them would do.
 */
function signaturesNeeded(signatures: { authority: string; signedBy: string | null }[]): string {
  const waiting = signatures.filter((signature) => !signature.signedBy)
  const given = signatures.length - waiting.length
  const order = (list: typeof signatures) => list.map((signature) => signature.authority).join(', then ')
  if (given === 0) return order(signatures)
  return `${order(waiting)} (${given} of ${signatures.length} signed)`
}

const LABEL = 'font-mono text-[10.5px] uppercase tracking-[var(--ls-ledger)]'

export function HeldBlock({ turn, canReview }: { turn: AssistantTurn; canReview: boolean }) {
  const approval = turn.approval
  const decision = approval?.decision ?? null
  const held = turn.outcome === 'held'
  const decided = decision === 'approved' || decision === 'rejected' || decision === 'revision_requested'
  if (!approval || (!held && !decided)) return null

  const roles = approval.approverRoles.map(roleName)
  const reasons = approval.reasons.map(reasonSentence).filter(Boolean)
  const withheldFile = turn.deliverable && !turn.deliverable.released ? turn.deliverable.filename : null
  const by = approval.reviewerName ? ` by ${approval.reviewerName}` : ''
  const tone = decision === 'approved' ? 'sovereign' : decided ? 'critical' : 'approval'

  return (
    /* LIGHT: the decision is the event. Mounted with the held state, so a
       run opened already decided shows its state without a bloom, and a
       decision read while the reader is here blooms once. */
    <Light
      as="section"
      tone={tone}
      bloomKey={decision}
      aria-label={decided ? 'Review decision' : 'Held for release'}
      aria-live="polite"
      className={cn(
        'rounded-[var(--radius-xs)] border-l-2 py-2.5 pl-4 pr-3',
        tone === 'sovereign' ? 'border-sovereign' : tone === 'critical' ? 'border-critical' : 'border-approval wash-approval',
      )}
    >
      {decision === 'approved' ? (
        <>
          <p className={cn(LABEL, 'text-sovereign-text')}>Released{by}</p>
          {approval.comment && <p className="mt-1 text-body text-foreground">“{approval.comment}”</p>}
          {turn.deliverable?.released && (
            <p className="mt-1 text-meta text-foreground-secondary">{turn.deliverable.filename} can now be downloaded.</p>
          )}
        </>
      ) : decided ? (
        <>
          <p className={cn(LABEL, 'text-critical-text')}>
            {decision === 'revision_requested' ? 'Returned for revision' : 'Rejected at review'}
            {by}
          </p>
          <p className="mt-1 text-body text-foreground">
            {approval.comment ? `“${approval.comment}”` : 'The reviewer recorded no note.'}
          </p>
          {turn.deliverable && !turn.deliverable.released && (
            <p className="mt-1 text-meta text-foreground-secondary">{turn.deliverable.filename} was not released.</p>
          )}
        </>
      ) : (
        <>
          <p className={cn(LABEL, 'flex items-center gap-1.5 text-foreground')}>
            <Lock className="size-3 text-approval" aria-hidden />
            Held for release
          </p>
          {approval.signatures.length > 0 ? (
            <p className="mt-1.5 text-body text-foreground">Release needs {signaturesNeeded(approval.signatures)}.</p>
          ) : (
            roles.length > 0 && (
              <p className="mt-1.5 text-body text-foreground">
                Release needs {roles.length === 1 ? 'the' : 'a'} {roles.join(' or ')}.
              </p>
            )
          )}
          {reasons.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-1 text-meta leading-[1.5] text-foreground-secondary">
              {reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-meta text-foreground-secondary">
            <span className="text-foreground">Withheld: </span>
            {withheldFile
              ? `${withheldFile}, which cannot be downloaded until it is released.`
              : 'the release of this run. The answer above is shown for review, not released.'}
          </p>
          {canReview && (
            <Link
              href="/approvals"
              className={cn(
                LABEL,
                'hover-decay mt-2 inline-flex items-center gap-1 rounded-[var(--radius-xs)] px-1 py-0.5 -mx-1 text-foreground-secondary hover:bg-surface-sunken hover:text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none',
              )}
            >
              Open approvals
              <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          )}
        </>
      )}
    </Light>
  )
}
