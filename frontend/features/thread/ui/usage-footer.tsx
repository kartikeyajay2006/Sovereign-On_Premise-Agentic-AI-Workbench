'use client'

import { memo } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ModelDescriptor, ModelUsage } from '@/lib/types'
import { cn } from '@/lib/utils'
import { MeasuredNumber } from '@/shared/motion'
import type { ModelChoice } from '../model/types'
import {
  answerCall,
  completedCalls,
  contextFill,
  declinedPreferences,
  formatCount,
  formatKnownSum,
  formatPercent,
  formatRate,
  formatSeconds,
  modelsThatRan,
  peakFill,
  stageName,
  sumKnown,
  type KnownSum,
} from '../model/usage'

/**
 * What the run cost, under the answer: which models ran, how many tokens
 * went in and came out, how fast the answer was written and how full the
 * fullest context window got. Folded to one quiet line, open for a row per
 * model call.
 *
 * Every figure is read from a usage record the backend wrote -- the runtime's
 * own counts and the orchestrator's own timings -- and a figure the runtime
 * did not report renders as nothing. There is no estimate anywhere in this
 * file: no characters-over-four token guess, no rate derived from the draft
 * streaming past, no window size assumed for a call that did not say.
 */

const DASH = (
  <span className="text-foreground-muted" title="Not reported by the runtime for this call">
    —
  </span>
)

function cell(value: number | null | undefined, format: (v: number) => string) {
  return typeof value === 'number' && Number.isFinite(value) ? format(value) : DASH
}

/** A total printed as formatKnownSum prints it: marked as a floor when some calls reported no count. */
function knownSumFormat(total: KnownSum) {
  return (value: number) => (total.known < total.total ? `≥${formatCount(value)}` : formatCount(value))
}

/** The small print under one call: where its time went, and why it stopped. */
function callDetail(call: ModelUsage): string[] {
  if (call.cancelled) {
    return [
      `Stopped by request after ${formatSeconds(call.latency_ms)}. The runtime reports counts only for a call that completes.`,
    ]
  }
  const parts: string[] = []
  if (call.first_token_ms !== null) parts.push(`first token after ${formatSeconds(call.first_token_ms)}`)
  // The runtime reports a few milliseconds of "load" even for a model that
  // was already resident. Only a load long enough to be a real (re)load is
  // named -- the case that explains a slow call, e.g. a model swap.
  if (call.load_ms !== null && call.load_ms >= 100) parts.push(`model load ${formatSeconds(call.load_ms)}`)
  if (call.prompt_eval_ms !== null) parts.push(`prompt ${formatSeconds(call.prompt_eval_ms)}`)
  if (call.eval_ms !== null) parts.push(`generation ${formatSeconds(call.eval_ms)}`)
  const lines = parts.length ? [parts.join(' · ')] : []
  if (call.done_reason === 'length') {
    lines.push(
      call.output_limit
        ? `Stopped at its ${formatCount(call.output_limit)}-token output limit, not at the end of what it was writing.`
        : 'Stopped at its output limit, not at the end of what it was writing.',
    )
  }
  return lines
}

function UsageTable({
  usage,
  declared,
}: {
  usage: ModelUsage[]
  declared: Map<string, number>
}) {
  return (
    <div className="mt-1.5 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-[12px] tabular-nums">
        <thead>
          <tr className="text-left uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
            <th scope="col" className="py-1 pr-3 font-normal">Stage</th>
            <th scope="col" className="py-1 pr-3 font-normal">Model</th>
            <th scope="col" className="py-1 pr-3 text-right font-normal">In</th>
            <th scope="col" className="py-1 pr-3 text-right font-normal">Out</th>
            <th scope="col" className="py-1 pr-3 text-right font-normal">Speed</th>
            <th scope="col" className="py-1 pr-3 text-right font-normal">Time</th>
            <th scope="col" className="py-1 text-right font-normal">Context</th>
          </tr>
        </thead>
        <tbody>
          {usage.map((call, index) => {
            const fill = contextFill(call)
            const detail = callDetail(call)
            const max = declared.get(call.model)
            const windowTitle =
              call.context_window !== null
                ? `${call.prompt_tokens !== null ? `${formatCount(call.prompt_tokens)} prompt tokens of` : 'No prompt count for'} the ${formatCount(call.context_window)}-token window this call ran with.` +
                  (max ? ` The model declares up to ${formatCount(max)}; each stage runs in a smaller window.` : '')
                : undefined
            return [
              <tr
                key={`${call.started_at}-${index}`}
                className={cn('border-t border-line-subtle align-baseline', call.cancelled && 'text-foreground-muted')}
              >
                <td className="py-1 pr-3 text-foreground-secondary">{stageName(call.stage)}</td>
                <td className="max-w-[18ch] truncate py-1 pr-3 text-foreground" title={call.model}>
                  {call.display_name || call.model}
                </td>
                <td className="tabular py-1 pr-3 text-right text-foreground">{cell(call.prompt_tokens, formatCount)}</td>
                <td className="tabular py-1 pr-3 text-right text-foreground">{cell(call.output_tokens, formatCount)}</td>
                <td className="tabular py-1 pr-3 text-right text-foreground">{cell(call.tokens_per_second, formatRate)}</td>
                <td className="tabular py-1 pr-3 text-right text-foreground">{formatSeconds(call.latency_ms)}</td>
                <td className="tabular py-1 text-right text-foreground" title={windowTitle}>
                  {fill !== null && call.context_window !== null
                    ? `${formatPercent(fill)} of ${formatCount(call.context_window)}`
                    : DASH}
                </td>
              </tr>,
              detail.length > 0 && (
                <tr key={`${call.started_at}-${index}-detail`}>
                  <td colSpan={7} className="pb-1.5 pr-3 text-foreground-muted">
                    {detail.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

export const UsageFooter = memo(function UsageFooter({
  usage,
  choices,
  models,
}: {
  usage: ModelUsage[]
  choices: ModelChoice[]
  /** From GET /api/models, for each model's declared maximum window. */
  models: ModelDescriptor[] | null
}) {
  const declined = declinedPreferences(choices)
  if (usage.length === 0 && declined.length === 0) return null

  const completed = completedCalls(usage)
  const names = modelsThatRan(usage)
  const tokensIn = sumKnown(completed.map((u) => u.prompt_tokens))
  const tokensOut = sumKnown(completed.map((u) => u.output_tokens))
  const inLabel = formatKnownSum(tokensIn)
  const outLabel = formatKnownSum(tokensOut)
  const answer = answerCall(usage)
  const peak = peakFill(completed)
  const declared = new Map((models || []).map((m) => [m.id, m.context_window]))
  const partial = (total: { known: number; total: number }) =>
    total.known < total.total
      ? ` ${total.total - total.known} of ${total.total} calls reported no count, so this is a floor.`
      : ''

  return (
    <div className="flex flex-col gap-1">
      {usage.length > 0 && (
        <details className="group/usage">
          <summary className="flex w-fit cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 rounded-full py-0.5 pr-2 text-[12px] tabular-nums text-foreground-muted transition-colors hover:text-foreground-secondary focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="size-3 shrink-0 transition-transform duration-[var(--micro)] ease-[var(--ease-micro)] group-open/usage:rotate-90"
              aria-hidden
            />
            <span className="text-foreground-secondary">{names.join(' · ')}</span>
            {/* ROLL: task.model_completed -- each call that reports moves
                these totals, and only the digits that changed turn. */}
            {inLabel && (
              <span title={`Prompt tokens across ${tokensIn.total} model calls, as the runtime counted them.${partial(tokensIn)}`}>
                <MeasuredNumber
                  value={tokensIn.sum}
                  format={knownSumFormat(tokensIn)}
                  className="text-foreground-secondary"
                />{' '}
                in
              </span>
            )}
            {outLabel && (
              <span title={`Tokens generated across ${tokensOut.total} model calls, including any reasoning the workbench stripped before display.${partial(tokensOut)}`}>
                <MeasuredNumber
                  value={tokensOut.sum}
                  format={knownSumFormat(tokensOut)}
                  className="text-foreground-secondary"
                />{' '}
                out
              </span>
            )}
            {answer && answer.tokens_per_second !== null && (
              <span title="How fast this answer was generated: its output tokens over the runtime's own generation time, which excludes model load and prompt processing.">
                <MeasuredNumber value={answer.tokens_per_second} format={formatRate} className="text-foreground-secondary" />
              </span>
            )}
            {peak && (
              <span
                title={`The fullest context window of any call in this run: ${stageName(peak.call.stage).toLowerCase()}, ${formatCount(peak.promptTokens)} prompt tokens of the ${formatCount(peak.window)}-token window it ran with.`}
              >
                context <MeasuredNumber value={peak.fill} format={formatPercent} className="text-foreground-secondary" />
              </span>
            )}
          </summary>
          <UsageTable usage={usage} declared={declared} />
        </details>
      )}

      {/* Said outright rather than folded away: a request that was not
          honoured is the one thing here the reader did not expect. */}
      {declined.map((note) => (
        <p key={note.key} className="text-meta text-foreground-secondary">
          You asked for <span className="font-mono text-foreground">{note.preferred}</span>.{' '}
          {note.used ? (
            <>
              {stageName(note.stage)} used <span className="text-foreground">{note.used}</span>
              {note.reason ? `: ${note.reason}.` : '.'}
            </>
          ) : (
            <>
              No model could run {stageName(note.stage).toLowerCase()}
              {note.reason ? `: ${note.reason}.` : '.'}
            </>
          )}
        </p>
      ))}

      {answer && answer.done_reason === 'length' && (
        // Amber, because it asks for attention: the runtime reported that the
        // model was still writing when the budget ran out.
        <p className="text-meta text-approval-text">
          The answer stopped at its{' '}
          {answer.output_limit ? `${formatCount(answer.output_limit)}-token ` : ''}output limit, before the
          model had finished it.
        </p>
      )}
    </div>
  )
})
