'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Seal } from '@/shared/motion'
import { LEDGER_MUTED } from '@/shared/ui/data/ledger'
import { FailureState, clockTime, type Reading } from '@/shared/ui/data/reading'
import type { ChainStatus } from './api'
import { ChainRibbon } from './chain-ribbon'
import type { CheckFailure, CheckResults, CheckState } from './use-chain-check'

function short(hash: string | null | undefined, n = 8) {
  return hash ? `${hash.slice(0, n)}…${hash.slice(-4)}` : '—'
}

function Verdict({
  who,
  glyph,
  tone,
  children,
}: {
  who: string
  glyph: string
  tone: 'sovereign' | 'critical' | 'muted' | 'active'
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-[96px_16px_minmax(0,1fr)] items-baseline gap-x-2 sm:grid-cols-[120px_16px_minmax(0,1fr)]">
      <span className={LEDGER_MUTED}>{who}</span>
      <span
        aria-hidden
        className={cn(
          'font-mono text-ui',
          tone === 'sovereign' && 'text-sovereign-text',
          tone === 'critical' && 'text-critical-text',
          tone === 'muted' && 'text-foreground-muted',
          tone === 'active' && 'text-active-text',
        )}
      >
        {glyph}
      </span>
      <span className="min-w-0 text-body text-foreground">{children}</span>
    </div>
  )
}

function describeFailure(f: CheckFailure): string {
  if (f.reasons.includes('digest') && f.reasons.includes('link')) {
    return 'its prev_hash is not the hash of the record before it, and its own content no longer produces its hash'
  }
  if (f.reasons.includes('digest')) return 'its content no longer produces its stored hash: it was changed after it was written'
  return 'its prev_hash is not the hash of the record before it: a record between them was removed, inserted or altered'
}

/**
 * Two verdicts, side by side, from two independent computations.
 *
 * The server's comes from GET /api/audit/chain. The browser's comes from this
 * page downloading the log and recomputing every hash itself (chain-verify.ts),
 * with no code shared with the server beyond the file. When both are present
 * the panel says whether they agree, and on what head.
 */
export function VerificationPanel({
  chain,
  check,
  results,
  canCheck,
}: {
  chain: Reading<ChainStatus>
  check: CheckState
  results: CheckResults
  canCheck: boolean
}) {
  const server = chain.data
  const serverFresh =
    server !== null && check.finishedAt !== null && chain.readAt !== null && chain.readAt >= check.finishedAt
  // Two independent computations ending at the same head: this browser's
  // recompute, and the server's check read after it finished.
  const headAgreed =
    check.phase === 'done' &&
    check.failureCount === 0 &&
    serverFresh &&
    server !== null &&
    server.valid &&
    server.head_hash === check.headHash

  let agreement: ReactNode = null
  if (check.phase === 'done' && serverFresh && server) {
    const browserValid = check.failureCount === 0
    if (browserValid === server.valid) {
      if (browserValid) {
        agreement =
          server.events === check.total && server.head_hash === check.headHash ? (
            <>
              Both agree: {check.total} records, ending at the same head{' '}
              <span className="font-mono">{short(server.head_hash)}</span>.
            </>
          ) : server.events === check.total ? (
            <span className="text-critical-text">
              Both count {check.total} records but end at different heads: the server at{' '}
              <span className="font-mono">{short(server.head_hash)}</span>, this browser at{' '}
              <span className="font-mono">{short(check.headHash)}</span>. The log changed between the two
              reads.
            </span>
          ) : server.events > check.total ? (
            <>
              Both agree on the {check.total} records this browser read. The server&rsquo;s chain has
              since grown to {server.events}; the newer records were not part of this check.
            </>
          ) : (
            <span className="text-critical-text">
              The server now reports {server.events} records, fewer than the {check.total} this browser
              read. Records have been removed since the export.
            </span>
          )
      } else {
        agreement = (
          <>
            Both find the chain broken. The server stops at #{server.broken_at ?? '?'}; this browser
            first fails at #{check.failures[0]?.sequence ?? '?'}.
          </>
        )
      }
    } else {
      agreement = (
        <span className="text-critical-text">
          The server and this browser disagree about this chain. Neither verdict should be relied on
          until the log is inspected.
        </span>
      )
    }
  }

  return (
    <section aria-labelledby="verification-heading" className="flex flex-col gap-4 rounded-[var(--radius)] bg-surface p-4 shadow-[var(--elev-0)] sm:p-5">
      <h2 id="verification-heading" className={LEDGER_MUTED}>
        Chain verification
      </h2>

      <div className="flex flex-col gap-2">
        {chain.status === 'failed' && !server ? (
          <Verdict who="Server" glyph="?" tone="muted">
            No verdict. The server&rsquo;s check could not be read, which says nothing about whether the
            chain is intact.
          </Verdict>
        ) : !server ? (
          <Verdict who="Server" glyph="·" tone="muted">
            Reading…
          </Verdict>
        ) : server.valid ? (
          <Verdict who="Server" glyph="✓" tone="sovereign">
            {server.events} records recompute, head <span className="font-mono">{short(server.head_hash)}</span>
            <span className="text-foreground-muted"> · checked {clockTime(Date.parse(server.checked_at))}</span>
          </Verdict>
        ) : (
          <Verdict who="Server" glyph="✕" tone="critical">
            Broken at #{server.broken_at ?? '?'}. Records from there on cannot be trusted; everything before
            it still verifies.
            <span className="text-foreground-muted"> · checked {clockTime(Date.parse(server.checked_at))}</span>
          </Verdict>
        )}

        {!canCheck ? (
          <Verdict who="This browser" glyph="—" tone="muted">
            Not available to this role. Recomputing the chain needs the full log, and reading the full log
            needs <span className="font-mono text-ui">audit.read.all</span>.
          </Verdict>
        ) : check.phase === 'idle' ? (
          <Verdict who="This browser" glyph="·" tone="muted">
            Not run. <span className="text-foreground-secondary">Verify chain</span> downloads the log and
            recomputes every hash here, independently of the server.
          </Verdict>
        ) : check.phase === 'fetching' ? (
          <Verdict who="This browser" glyph="·" tone="active">
            Downloading the log…
          </Verdict>
        ) : check.phase === 'sweeping' ? (
          <Verdict who="This browser" glyph="◐" tone="active">
            <span className="tabular">
              {check.checked} of {check.total}
            </span>{' '}
            recomputed
            {check.cursorSequence !== null && (
              <span className="font-mono text-ui text-foreground-muted">
                {' '}
                · #{check.cursorSequence} {check.cursorHash?.slice(0, 12)}…
              </span>
            )}
            {check.failureCount > 0 && (
              <span className="text-critical-text"> · {check.failureCount} failing</span>
            )}
          </Verdict>
        ) : check.phase === 'done' ? (
          check.failureCount === 0 ? (
            <Verdict who="This browser" glyph="✓" tone="sovereign">
              {check.total} of {check.total} records recompute, head{' '}
              {/* SEAL: the check finishing, then the server's re-read
                  agreeing on this head. Mounted unsealed with the verdict, so
                  the rule draws at the moment the agreement arrives; until
                  then, or if the two disagree, the rule stays dashed. */}
              <Seal
                sealed={headAgreed}
                token={check.headHash}
                srLabel={headAgreed ? 'chain head, verified in this browser' : 'chain head, not confirmed by the server'}
              >
                <span className="font-mono">{short(check.headHash)}</span>
              </Seal>
              <span className="text-foreground-muted">
                {' '}
                · {Math.max(1, Math.round(check.computeMs))} ms recomputing, SHA-256 via{' '}
                {check.engine === 'webcrypto' ? 'Web Crypto' : 'a built-in implementation'}
              </span>
            </Verdict>
          ) : (
            <Verdict who="This browser" glyph="✕" tone="critical">
              {check.failureCount} of {check.total} records do not recompute. The first is #
              {check.failures[0]?.sequence ?? '?'}.
            </Verdict>
          )
        ) : null}
      </div>

      {canCheck && check.phase === 'failed' && check.failure && (
        <FailureState failure={check.failure} what="the full audit log" />
      )}

      {canCheck && (check.phase === 'sweeping' || check.phase === 'done') && (
        <ChainRibbon
          results={results}
          checked={check.checked}
          total={check.total}
          firstSequence={check.firstSequence}
        />
      )}

      {agreement && <p className="text-body text-foreground-secondary">{agreement}</p>}

      {check.phase === 'done' && check.failures.length > 0 && (
        <ol className="flex flex-col border-t border-line-subtle pt-3">
          {check.failures.map((f) => (
            <li key={f.index} className="flex flex-col gap-1 border-b border-line-subtle py-2 last:border-b-0">
              <p className="text-body text-foreground">
                <span className="font-mono text-critical-text">#{f.sequence ?? '?'}</span>{' '}
                <span className="text-foreground-secondary">
                  {f.category ?? '?'} / {f.action ?? '?'} by {f.actor ?? '?'}
                </span>
                : {describeFailure(f)}.
              </p>
              <p className="break-all font-mono text-ledger text-foreground-muted">
                stored {f.storedHash ?? 'none'} · recomputed {f.recomputed}
              </p>
            </li>
          ))}
          {check.failureCount > check.failures.length && (
            <li className="pt-2 text-ui text-foreground-muted">
              {check.failureCount - check.failures.length} more not listed.
            </li>
          )}
        </ol>
      )}

      {canCheck && (
        <p className="max-w-[80ch] text-ui text-foreground-muted">
          The browser recomputes SHA-256 over each record&rsquo;s predecessor hash and its canonical
          body, exactly as the server writes it, and checks each prev_hash against the record before it.
          Downloading the log is itself recorded, so every check leaves an{' '}
          <span className="font-mono">audit / exported</span> record at the head of the chain it
          verified.
          {check.skipped > 0 && ` ${check.skipped} line${check.skipped === 1 ? '' : 's'} could not be parsed and were skipped, as the server skips them.`}
        </p>
      )}
    </section>
  )
}
