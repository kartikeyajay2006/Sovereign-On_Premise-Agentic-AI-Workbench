'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { harnessApi } from '../api'
import type { HarnessChildView } from '../model/types'
import { Ledger, OutcomeLabel } from './parts'
import { documentCode, formatClock, formatDuration, sectionName } from './format'

/**
 * A released answer does not change once released, so it is read once per
 * page and kept. Only released answers are ever read here.
 */
const answers = new Map<string, string>()

function CitedAnswer({ text, known }: { text: string; known: Set<string> }) {
  return (
    <>
      {text.split(/(\[[SFVCEH]\d+\])/g).map((part, index) => {
        const marker = part.match(/^\[([SFVCEH]\d+)\]$/)
        if (!marker) return <span key={index}>{part}</span>
        const id = marker[1]
        return (
          <span
            key={index}
            title={known.has(id) ? `Cites passage ${id}` : `No passage ${id} was retrieved for this run`}
            className={cn(
              'rounded-[var(--radius-xs)] px-1 font-mono text-meta',
              known.has(id) ? 'bg-surface-sunken text-foreground' : 'text-critical-text',
            )}
          >
            [{id}]
          </span>
        )
      })}
    </>
  )
}

function ReleasedAnswer({ taskId, known }: { taskId: string; known: Set<string> }) {
  const [text, setText] = useState<string | null>(answers.get(taskId) ?? null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (answers.has(taskId)) return
    let live = true
    harnessApi
      .childTask(taskId)
      .then((task) => {
        const answer = task.answer ?? ''
        answers.set(taskId, answer)
        if (live) setText(answer)
      })
      .catch((err) => {
        if (live) setError(err instanceof ApiError ? String(err.detail || err.message) : String(err))
      })
    return () => {
      live = false
    }
  }, [taskId])

  if (error) return <p className="text-ui text-critical-text">The answer could not be read: {error}</p>
  if (text === null) return <p className="font-mono text-meta text-foreground-muted">Reading the answer…</p>
  if (!text.trim()) return <p className="text-ui text-foreground-muted">The released answer is empty.</p>
  return (
    <p className="whitespace-pre-wrap text-answer leading-[var(--lh-answer)] text-foreground">
      <CitedAnswer text={text} known={known} />
    </p>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Ledger>{title}</Ledger>
      {children}
    </div>
  )
}

export function ChildDetail({ child }: { child: HarnessChildView }) {
  const known = new Set(child.citations.map((citation) => citation.id))
  const untraced =
    child.claims_total !== null && child.claims_supported !== null
      ? child.claims_total - child.claims_supported
      : null

  return (
    // Indented to the label column of the row above it: 16px padding, the
    // 28px index, the 16px marker and two 12px gaps.
    <div className="flex flex-col gap-5 border-t border-line-subtle bg-background/40 px-4 py-4 sm:pl-[84px]">
      <Block title="Outcome">
        <OutcomeLabel outcome={child.outcome} />
        <p className="text-body text-foreground">{child.outcome_detail}</p>
        {child.approval_reasons.length > 0 && (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-ui text-foreground-secondary">
            {child.approval_reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {child.error && child.error !== child.outcome_detail && (
          <pre className="whitespace-pre-wrap break-words border-l-2 border-critical bg-surface-sunken px-3 py-2 font-mono text-meta text-foreground">
            {child.error}
          </pre>
        )}
        {child.note && <p className="text-ui text-foreground-secondary">{child.note}</p>}
      </Block>

      {child.claims_total !== null && (
        <Block title="Verification">
          <p className="tabular font-mono text-meta text-foreground">
            {child.claims_supported} of {child.claims_total} material claims traced to a retrieved passage
          </p>
          {child.checks.length > 0 && (
            <ul className="flex list-none flex-col gap-1 p-0">
              {child.checks.map((check) => (
                <li key={check.name} className="flex items-start gap-2 text-ui">
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 font-mono text-meta',
                      check.passed ? 'text-sovereign-text' : 'text-critical-text',
                    )}
                  >
                    {check.passed ? '✓' : '✕'}
                  </span>
                  <span className="min-w-0">
                    <span className="font-mono text-meta text-foreground">{check.name}</span>{' '}
                    <span className="sr-only">{check.passed ? 'passed' : 'did not pass'}</span>
                    <span className="text-foreground-secondary">{check.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Block>
      )}

      {child.released && child.task_id ? (
        <>
          <Block title="Released answer">
            <ReleasedAnswer taskId={child.task_id} known={known} />
          </Block>

          <Block title={`Cited passages (${child.citations.length})`}>
            {child.citations.length === 0 ? (
              <p className="text-ui text-foreground-secondary">The answer cites no retrieved passage.</p>
            ) : (
              <ul className="flex list-none flex-col gap-3 p-0">
                {child.citations.map((citation) => (
                  <li key={citation.id} className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="rounded-[var(--radius-xs)] bg-surface-sunken px-1 font-mono text-meta text-foreground">
                        {citation.id}
                      </span>
                      <span className="font-mono text-meta text-foreground">
                        {documentCode(citation.source_document)}
                      </span>
                      {citation.location && (
                        <span className="text-ui text-foreground-secondary">
                          {sectionName(citation.location)}
                        </span>
                      )}
                      <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                        {citation.classification}
                        {citation.score !== null && ` · score ${citation.score.toFixed(2)}`}
                      </span>
                    </span>
                    <p className="border-l-2 border-line-strong pl-3 text-ui text-foreground-secondary">
                      {citation.excerpt}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {child.unretrieved_citations.length > 0 && (
              <p className="text-ui text-critical-text">
                Cites {child.unretrieved_citations.map((id) => `[${id}]`).join(', ')}, which this run
                never retrieved, so those markers cite nothing.
              </p>
            )}
          </Block>

          {child.unsupported_claims.length > 0 && (
            <Block
              title={
                untraced !== null && untraced > child.unsupported_claims.length
                  ? `Untraced claims (listing ${child.unsupported_claims.length} of ${untraced})`
                  : 'Untraced claims'
              }
            >
              <ul className="flex list-disc flex-col gap-1 pl-5 text-ui text-foreground-secondary">
                {child.unsupported_claims.map((claim) => (
                  <li key={claim}>{claim}</li>
                ))}
              </ul>
            </Block>
          )}
        </>
      ) : child.outcome === 'held' ? (
        <p className="text-ui text-foreground-secondary">
          The draft is held for a reviewer and is not shown here or included in the report. Open the
          run in the thread to read it as held, or in Approvals to decide on it.
        </p>
      ) : null}

      <Block title="Asked">
        <pre className="whitespace-pre-wrap break-words border-l-2 border-line-strong bg-surface-sunken px-3 py-2 font-mono text-meta text-foreground-secondary">
          {child.prompt}
        </pre>
      </Block>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="tabular font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
          submitted {formatClock(child.submitted_at)} · seen running {formatClock(child.started_at)} ·
          settled {formatClock(child.settled_at)} · run took {formatDuration(child.duration_ms)}
        </span>
        {child.task_id && (
          <Link
            href={`/console?run=${child.task_id}`}
            className="hover-decay inline-flex items-center gap-1 rounded-[var(--radius-xs)] px-1.5 py-0.5 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-secondary hover:bg-surface-sunken hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            Open run {child.task_id.slice(0, 8)} in the thread
            <ArrowUpRight className="size-3" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  )
}
