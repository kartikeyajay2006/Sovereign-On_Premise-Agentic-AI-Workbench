'use client'

import { useState } from 'react'
import { Download, RefreshCw, Stamp } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ClassificationTag } from '@/components/primitives'
import { useToast } from '@/components/toast'
import { Button } from '@/shared/ui/controls/button'
import { harnessApi } from '../api'
import type { HarnessRunView } from '../model/types'
import { ACTIVE_RUN } from './outcome'
import { CopyValue, Ledger, Notice, Panel } from './parts'
import { formatBytes, formatDateTime } from './format'

function message(err: unknown): string {
  return err instanceof ApiError ? String(err.detail || err.message) : String(err)
}

export function ReportPanel({
  run,
  onReplace,
}: {
  run: HarnessRunView
  onReplace: (next: HarnessRunView) => void
}) {
  const { push } = useToast()
  const [regenerating, setRegenerating] = useState(false)
  const [confirming, setConfirming] = useState<null | 'approve' | 'reject'>(null)
  const [deciding, setDeciding] = useState(false)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  const active = ACTIVE_RUN.has(run.status)
  const view = run.report
  const record = view?.record ?? null

  const regenerate = async () => {
    setRegenerating(true)
    setError(null)
    try {
      const next = await harnessApi.regenerateReport(run.id)
      onReplace(next)
      push({
        title: `Report version ${next.report?.record.version ?? ''} written`,
        detail: 'Hashed and recorded in the audit log.',
        tone: 'default',
      })
    } catch (err) {
      setError(message(err))
    } finally {
      setRegenerating(false)
    }
  }

  const decide = async (decision: 'approve' | 'reject') => {
    setDeciding(true)
    setError(null)
    try {
      const next = await harnessApi.decideReport(run.id, {
        decision,
        comment: comment.trim() || null,
      })
      onReplace(next)
      setConfirming(null)
      setComment('')
      push({
        title: decision === 'approve' ? 'Report released' : 'Report rejected',
        detail: 'The decision is recorded in the audit log against your account.',
        tone: decision === 'approve' ? 'sovereign' : 'critical',
      })
    } catch (err) {
      setError(message(err))
    } finally {
      setDeciding(false)
    }
  }

  return (
    <Panel
      title="Report"
      id="harness-report"
      aside={
        record ? (
          <span className="flex items-center gap-3">
            <Ledger>
              v{record.version} · {record.reason}
            </Ledger>
            <ClassificationTag level={record.classification} />
          </span>
        ) : null
      }
    >
      <div className="flex flex-col gap-4 p-4">
        {!record ? (
          active ? (
            <p className="text-body text-foreground-secondary">
              Written when the run ends, as markdown and JSON. Each file is sha256-hashed, and the
              hashes are recorded on the run and in the audit log.
            </p>
          ) : (
            <>
              <p className="text-body text-foreground-secondary">No report was written for this run.</p>
              {run.permissions.can_regenerate_report && (
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={RefreshCw}
                    onClick={() => void regenerate()}
                    busy={regenerating}
                    busyLabel="Writing…"
                  >
                    Write the report now
                  </Button>
                </div>
              )}
            </>
          )
        ) : (
          <>
            <p className="text-ui text-foreground-secondary">
              Version {record.version}, written {formatDateTime(record.generated_at)} by{' '}
              <span className="font-mono text-foreground">{record.generated_by}</span> from the child
              records as they stood then. Classified{' '}
              <span className="font-mono text-foreground">{record.classification}</span>: the highest
              classification among the released answers and the passages they cite.
            </p>

            {/* Sign-off */}
            {record.approval.required ? (
              <div className="flex flex-col gap-2">
                {record.approval.decision === 'pending' && (
                  <p className="flex items-center gap-2 text-ui font-medium text-approval-text">
                    <span aria-hidden>⏸</span> Held until someone holding approval.decide releases it.
                  </p>
                )}
                {record.approval.decision === 'approved' && (
                  <p className="text-ui text-sovereign-text">
                    Released by {record.approval.reviewer_name} on{' '}
                    {formatDateTime(record.approval.decided_at)}
                    {record.approval.comment ? `: “${record.approval.comment}”` : '.'}
                  </p>
                )}
                {record.approval.decision === 'rejected' && (
                  <p className="text-ui text-critical-text">
                    Rejected by {record.approval.reviewer_name} on{' '}
                    {formatDateTime(record.approval.decided_at)}
                    {record.approval.comment ? `: “${record.approval.comment}”` : '.'} It is not released.
                  </p>
                )}
                <ul className="flex list-disc flex-col gap-1 pl-5 text-ui text-foreground-muted">
                  {record.approval.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-ui text-foreground-secondary">
                Released when written: this harness does not require sign-off, and the report carries
                no answer that was held.
              </p>
            )}

            {view?.stale && (
              <Notice>
                <span className="text-foreground">
                  Item{view.changed_items.length === 1 ? '' : 's'}{' '}
                  {view.changed_items.map((index) => `#${index}`).join(', ')} changed after this version
                  was written
                </span>
                , for example a held run approved since. This version does not reflect that.
                {run.permissions.can_regenerate_report && (
                  <span className="mt-3 block">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={RefreshCw}
                      onClick={() => void regenerate()}
                      busy={regenerating}
                      busyLabel="Writing…"
                      ground="sunken"
                    >
                      Write version {record.version + 1}
                    </Button>
                  </span>
                )}
              </Notice>
            )}

            {/* Files */}
            <ul className="flex list-none flex-col p-0">
              {record.files.map((file) => {
                const download = view?.downloads.find((entry) => entry.format === file.format)
                return (
                  <li
                    key={file.filename}
                    className="grid grid-cols-1 items-center gap-x-4 gap-y-1 border-t border-line-subtle py-2.5 sm:grid-cols-[48px_minmax(0,1fr)_auto]"
                  >
                    <Ledger className="text-foreground-secondary">{file.format}</Ledger>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-mono text-meta text-foreground">{file.filename}</span>
                      <CopyValue
                        label={`${file.format} sha256`}
                        value={file.sha256}
                        display={`sha256 ${file.sha256.slice(0, 24)}…`}
                      />
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular font-mono text-meta text-foreground-muted">
                        {formatBytes(file.size_bytes)}
                      </span>
                      {download && (
                        <a
                          href={download.url}
                          download={download.filename}
                          className="btn"
                          data-variant="secondary"
                          data-size="sm"
                        >
                          <Download className="size-3.5" aria-hidden />
                          <span>Download</span>
                        </a>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
            {view && view.downloads.length === 0 && (
              <p className="text-ui text-foreground-muted">
                {record.released
                  ? 'Your role is not entitled to download this report.'
                  : 'Not released, so only a role holding approval.decide can download it.'}
              </p>
            )}

            {/* Decision */}
            {run.permissions.can_decide_report && (
              <div className="flex flex-col gap-3 border-t border-line-subtle pt-4">
                <label htmlFor="report-comment" className="text-ui font-medium text-foreground-secondary">
                  Decision note <span className="font-normal text-foreground-muted">optional, recorded</span>
                </label>
                <textarea
                  id="report-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="What you checked before deciding"
                  className="hover-decay w-full resize-y rounded-[var(--radius)] bg-surface px-3 py-2 text-body text-foreground shadow-[0_0_0_1px_var(--control-default)] outline-none placeholder:text-foreground-muted hover:shadow-[0_0_0_1px_var(--control-strong)] focus:shadow-[var(--focus-halo)]"
                />
                {confirming ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-ui text-foreground">
                      {confirming === 'approve'
                        ? `Release version ${record.version}, recorded against your account?`
                        : `Reject version ${record.version}, recorded against your account?`}
                    </span>
                    <Button
                      variant={confirming === 'approve' ? 'primary' : 'danger'}
                      size="sm"
                      onClick={() => void decide(confirming)}
                      busy={deciding}
                      busyLabel="Recording…"
                    >
                      {confirming === 'approve' ? 'Confirm release' : 'Confirm rejection'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(null)} disabled={deciding}>
                      Back
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="primary" size="sm" icon={Stamp} onClick={() => setConfirming('approve')}>
                      Release report
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setConfirming('reject')}>
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {error && <p className={cn('text-ui text-critical-text')}>{error}</p>}
      </div>
    </Panel>
  )
}
