'use client'

import type { ReactNode } from 'react'
import { Play } from 'lucide-react'
import { Button } from '@/shared/ui/controls/button'
import { LEDGER_MUTED } from '@/shared/ui/data/ledger'
import type { ReadFailure } from '@/shared/ui/data/reading'
import { cn } from '@/lib/utils'
import type { Policies, SovereigntyStatus } from './api'
import { Ago, stamp } from './egress-panel'
import { clock, type SandboxRun } from './sandbox-panel'

/**
 * The top of Assurance: one card per kind of fact, each with the one figure
 * it exists for, what the figure means in a line, and where it came from.
 *
 * The three kinds are named on the cards because they are not the same
 * kind of claim. Egress is a measurement the host keeps taking; containment
 * is a test result from a run someone asked for; policy is configuration --
 * what the gateway is told, not what it did. A card with no reading shows
 * no figure, never a zero.
 */

function Card({
  label,
  kind,
  figure,
  tone = 'default',
  caption,
  foot,
  action,
  href,
}: {
  label: string
  kind: 'Measured' | 'Tested' | 'Configured'
  figure: ReactNode
  tone?: 'default' | 'sovereign' | 'critical' | 'muted'
  caption: ReactNode
  foot?: ReactNode
  action?: ReactNode
  href: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[var(--radius)] bg-surface p-5 shadow-[var(--elev-0)]">
      <div className="flex items-center justify-between gap-3">
        <a href={href} className="text-ui font-medium text-foreground hover:underline">
          {label}
        </a>
        <span className={cn(LEDGER_MUTED, 'rounded-full px-2 py-0.5 shadow-[0_0_0_1px_var(--line-subtle)]')}>{kind}</span>
      </div>
      <div
        className={cn(
          'tabular font-mono text-[2.25rem] font-medium leading-none tracking-[-0.02em]',
          tone === 'sovereign'
            ? 'text-sovereign-text'
            : tone === 'critical'
              ? 'text-critical-text'
              : tone === 'muted'
                ? 'text-foreground-muted'
                : 'text-foreground',
        )}
      >
        {figure}
      </div>
      <p className="text-body text-foreground-secondary">{caption}</p>
      {foot && <p className="mt-auto font-mono text-ledger text-foreground-muted">{foot}</p>}
      {action}
    </div>
  )
}

export function EgressVerdict({
  status,
  live,
  failure,
}: {
  status: SovereigntyStatus | null
  live: boolean
  failure: ReadFailure | null
}) {
  if (!status) {
    return (
      <Card
        label="Egress"
        kind="Measured"
        href="#egress"
        figure="—"
        tone="muted"
        caption={failure ? 'The egress monitor could not be read.' : 'Reading the egress monitor…'}
      />
    )
  }
  const n = status.unapproved_connections
  return (
    <Card
      label="Egress"
      kind="Measured"
      href="#egress"
      figure={n}
      tone={n === 0 ? 'default' : 'critical'}
      caption={
        n === 0
          ? 'connections from the workbench left this machine'
          : `connection${n === 1 ? '' : 's'} from the workbench left this machine`
      }
      foot={
        status.monitor_active ? (
          <>
            since {stamp(status.monitored_since)} · sampled <Ago iso={status.last_checked} />
            {live ? '' : ' · not live'}
          </>
        ) : (
          <span className="text-approval-text">The monitor is not running, so nothing is being counted.</span>
        )
      }
    />
  )
}

export function ContainmentVerdict({ run, onRun }: { run: SandboxRun; onRun: () => void }) {
  const button = (
    <Button
      variant={run.phase === 'done' ? 'secondary' : 'primary'}
      size="sm"
      ground="paper"
      icon={Play}
      busy={run.phase === 'running'}
      busyLabel="Testing…"
      onClick={onRun}
      className="self-start"
    >
      {run.phase === 'done' || run.phase === 'failed' ? 'Run it again' : 'Run the self-test'}
    </Button>
  )

  if (run.phase === 'done' && run.report.assessable) {
    const { passed, total, all_passed: held } = run.report
    return (
      <Card
        label="Containment"
        kind="Tested"
        href="#sandbox"
        figure={`${passed}/${total}`}
        tone={held ? 'sovereign' : 'critical'}
        caption={held ? 'attacks contained by this host’s sandbox' : `${total - passed} of ${total} attacks were not contained`}
        foot={`ran ${clock(run.report.ran_at)} · ${run.report.duration_ms} ms · ${run.report.backend ?? 'limits not reported'}`}
        action={button}
      />
    )
  }
  return (
    <Card
      label="Containment"
      kind="Tested"
      href="#sandbox"
      figure="—"
      tone="muted"
      caption={
        run.phase === 'running'
          ? 'Submitting the attack payloads to this host’s sandbox…'
          : run.phase === 'failed'
            ? 'The self-test did not report back.'
            : run.phase === 'done'
              ? 'Not assessable on this host: nothing was submitted, so no claim either way.'
              : 'Not tested in this session. No claim is shown until a run makes one.'
      }
      action={button}
    />
  )
}

export function PolicyVerdict({ policies }: { policies: Policies | null }) {
  if (!policies) {
    return <Card label="Policy" kind="Configured" href="#policy" figure="—" tone="muted" caption="Reading the policy files…" />
  }
  const tools = Object.keys(policies.tools).length
  const rules = policies.approval_rules.length
  const destinations = policies.egress?.allowed_destinations ?? []
  return (
    <Card
      label="Policy"
      kind="Configured"
      href="#policy"
      figure={policies.hard_denied_actions.length}
      caption="actions no role can take, with no override"
      foot={`${tools} tools allowed by role · ${rules} rules hold a run for a person · ${
        destinations.length === 0 ? 'no egress destination allowed' : `${destinations.length} egress destinations allowed`
      }`}
    />
  )
}
