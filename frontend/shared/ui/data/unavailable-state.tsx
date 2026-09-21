/* -------------------------------------------------------------------------- */
/* UnavailableState — 20-DESIGN-SPEC §4.11.                                    */
/*                                                                            */
/* "We cannot tell you, and here is what would be needed."                     */
/*                                                                            */
/* Not an error: nothing failed. Not an empty state: we never got as far as    */
/* asking. This host STRUCTURALLY cannot report on this thing, and saying so   */
/* plainly is the whole discipline of the product — it is what keeps the       */
/* screen honest while the backend is half-built, and it is the state a judge  */
/* is most likely to stumble into (01 §3.9, 04 §5.6).                          */
/*                                                                            */
/* So it must read as DELIBERATE, not broken. It spends no hue at all — an     */
/* amber or red tint would make an honest gap look like a fault — and takes    */
/* its whole identity from the one shape nothing else in the set uses: a       */
/* sunken ground inside a plain hairline. That is the visual of a panel that   */
/* is switched off on purpose, not one that fell over. No retry, no action:    */
/* there is nothing the reader can press that would change the answer.         */
/*                                                                            */
/* This component is intentionally not a client component. It holds no state   */
/* and takes no callbacks, because there is nothing here to interact with.     */
/* -------------------------------------------------------------------------- */

import { cn } from '@/lib/utils'

export interface UnavailableStateProps {
  /** The thing that cannot be reported: "Per-task egress attribution". */
  what: string
  /** Why, in one plain clause: "This host does not scope socket samples to a task." */
  whyUnavailable: string
  /** What would close the gap. Omitted when we genuinely do not know. */
  whatWouldBeNeeded?: string
  className?: string
}

export function UnavailableState({
  what,
  whyUnavailable,
  whatWouldBeNeeded,
  className,
}: UnavailableStateProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius)] bg-surface-sunken shadow-[0_0_0_1px_var(--line-default)]',
        'px-[var(--space-6)] py-[var(--pad-comfortable)] text-body text-foreground-secondary',
        className,
      )}
    >
      {/* The em dash is the house marker for something we do not have (P1),
          used here at the scale of a whole measurement rather than a single
          field. The caption supplies the verb, so the two sentences below are
          the caller's words and only the caller's words — this component
          never composes a claim out of them. */}
      <p className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
        <span aria-hidden>—</span> Unavailable on this host
      </p>

      {/* The subject sits in full ink so the reader knows exactly WHICH
          reading is missing. */}
      <p className="mt-[var(--space-4)] max-w-[66ch] text-body font-medium text-foreground">{what}</p>

      <p className="mt-[var(--space-3)] max-w-[66ch]">{whyUnavailable}</p>

      {whatWouldBeNeeded && (
        <div className="mt-[var(--space-5)]">
          <p className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
            What would be needed
          </p>
          <p className="mt-[var(--space-3)] max-w-[66ch] text-ui text-foreground-secondary">
            {whatWouldBeNeeded}
          </p>
        </div>
      )}
    </div>
  )
}
