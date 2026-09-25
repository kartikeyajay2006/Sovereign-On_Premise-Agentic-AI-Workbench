'use client'

import { memo, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Check, Copy, FileCheck2, GitCompare, Quote, RotateCcw } from 'lucide-react'
import type { EvidenceItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import { expandCitations } from '../model/usage'

/**
 * What a reader does with an answer once it has landed.
 *
 * Two copies, because a bare "[S1]" pasted into an email points at nothing:
 * the second spells every citation out as source and location, which is what
 * makes the claim checkable once it has left this screen. Run again re-sends
 * the exact request -- same files, same format, same model choice -- as a new
 * run with its own record; it does not overwrite this one, and the new run
 * names this one as its parent. Proof opens the run's chain on one screen;
 * Compare sets it beside another run with every difference named.
 */

/** How long "Copied" stays: a label's read time, not an animation. */
const CONFIRM_MS = 1600

type CopyState = 'idle' | 'answer' | 'sources' | 'blocked'

/**
 * The Clipboard API exists only on a secure origin, and this workbench is as
 * likely to be opened at a LAN address over plain HTTP as at localhost. The
 * older selection-and-copy path works there, and it reports whether the copy
 * happened, so a success is still only claimed when there was one.
 */
function copyBySelection(text: string): boolean {
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(field)
  }
}

/**
 * The description half of a policy reason, as a clause that can follow
 * "Held for ... ·". The engine records "rule_name: Sentence." -- the rule
 * name is for the audit trail, the sentence is for the reader. A reason with
 * no description falls back to its rule name with underscores spaced out.
 */
function heldBecause(reason: string): string {
  const colon = reason.indexOf(':')
  const text = (colon === -1 ? reason.replace(/_/g, ' ') : reason.slice(colon + 1)).trim()
  const clause = text.replace(/\.$/, '')
  return clause.charAt(0).toLowerCase() + clause.slice(1)
}

const ACTION = cn(
  'hover-decay inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-xs)] px-2 text-ui text-foreground-muted',
  'hover:bg-surface-sunken hover:text-foreground',
  'focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none',
  'disabled:pointer-events-none disabled:opacity-[var(--opacity-disabled)]',
)

export const AnswerActions = memo(function AnswerActions({
  answer,
  evidence,
  onRerun,
  rerunDisabled,
  held,
  approverRoles,
  reasons = [],
  canReview,
  taskId = null,
}: {
  /** The verified answer, or null when there is none to copy. */
  answer: string | null
  evidence: EvidenceItem[]
  /** Absent when this turn has no request to repeat. */
  onRerun?: () => void
  /** Another run is in flight; one runs at a time. */
  rerunDisabled: boolean
  held: boolean
  approverRoles: string[]
  /**
   * Why the gate held it, as the policy engine recorded it:
   * "rule_name: description". A held answer that said only who must sign it
   * left a reader looking at "4/4 checks passed" beside HELD with no way to
   * tell that retrieval had touched a restricted document.
   */
  reasons?: string[]
  /** Whether this person can open the approval queue at all. */
  canReview: boolean
  /** The run's id, once the API has issued one: Proof Mode opens by it. */
  taskId?: string | null
}) {
  const [copied, setCopied] = useState<CopyState>('idle')

  useEffect(() => {
    if (copied === 'idle') return
    const timer = window.setTimeout(() => setCopied('idle'), CONFIRM_MS)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copy(kind: 'answer' | 'sources') {
    if (!answer) return
    const text = kind === 'sources' ? expandCitations(answer, evidence) : answer
    // Clipboard access can be denied outright. Saying so beats a
    // confirmation for a copy that never happened.
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(kind)
        return
      } catch {
        // Denied: the selection path below may still be allowed.
      }
    }
    setCopied(copyBySelection(text) ? kind : 'blocked')
  }

  if (!answer && !onRerun && !held && !taskId) return null

  return (
    <div className="flex flex-wrap items-center gap-1" aria-label="Answer actions">
      {answer && (
        <button type="button" onClick={() => void copy('answer')} className={ACTION}>
          {copied === 'answer' ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied === 'answer' ? 'Copied' : 'Copy'}
        </button>
      )}
      {answer && (
        <button
          type="button"
          onClick={() => void copy('sources')}
          className={ACTION}
          title="Copies the answer with every citation written out as its source and location"
        >
          {copied === 'sources' ? <Check className="size-3.5" aria-hidden /> : <Quote className="size-3.5" aria-hidden />}
          {copied === 'sources' ? 'Copied' : 'Copy with sources'}
        </button>
      )}
      {copied === 'blocked' && (
        <span role="status" className="px-1 text-meta text-critical-text">
          The browser refused clipboard access.
        </span>
      )}
      {onRerun && (
        <button
          type="button"
          onClick={onRerun}
          disabled={rerunDisabled}
          className={ACTION}
          title={rerunDisabled ? 'One run at a time: this is available when the current run ends.' : 'Sends the same request again as a new run'}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Run again
        </button>
      )}

      {taskId && (
        <Link
          href={`/proof?run=${taskId}`}
          className={ACTION}
          title="The run's chain on one screen: request, policy, models, evidence, formulas, claims, approval and certificate"
        >
          <FileCheck2 className="size-3.5" aria-hidden />
          Proof
        </Link>
      )}
      {taskId && (
        <Link
          href={`/compare?b=${taskId}`}
          className={ACTION}
          title="Set this run beside another -- the run it re-ran, if it is a re-run -- with every difference named"
        >
          <GitCompare className="size-3.5" aria-hidden />
          Compare
        </Link>
      )}

      {held && (
        <span className="ml-auto flex items-center gap-2 text-meta">
          {approverRoles.length > 0 && (
            <span className="text-approval-text" title={reasons.join('\n') || undefined}>
              Held for {approverRoles.map((r) => r.replace(/_/g, ' ')).join(' or ')}
              {reasons.length > 0 && (
                <span className="text-foreground-muted">
                  {' · '}
                  {heldBecause(reasons[0])}
                  {reasons.length > 1 ? ` (+${reasons.length - 1})` : ''}
                </span>
              )}
            </span>
          )}
          {canReview && (
            <Link
              href="/approvals"
              className="hover-decay inline-flex items-center gap-1 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-foreground-secondary hover:bg-surface-sunken hover:text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
            >
              Open approvals
              <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          )}
        </span>
      )}
    </div>
  )
})
