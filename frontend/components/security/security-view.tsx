'use client'

import { useCallback, type ReactNode } from 'react'
import { PageHeader } from '@/components/page-header'
import { useRole } from '@/components/role-context'
import { useEventStream } from '@/hooks/use-event-stream'
import type { StreamEvent } from '@/lib/types'
import { LEDGER_MUTED } from '@/shared/ui/data/ledger'
import { FailureState, ReadingLine, useReading } from '@/shared/ui/data/reading'
import { isSovereigntyStatus, readPolicies, readSovereignty } from './api'
import { EgressPanel } from './egress-panel'
import { PolicyPanel } from './policy-panel'
import { SandboxPanel, useSandboxTest } from './sandbox-panel'
import { ContainmentVerdict, EgressVerdict, PolicyVerdict } from './verdicts'

function Section({
  id,
  title,
  kind,
  lede,
  children,
}: {
  id: string
  title: string
  kind: string
  lede: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} className="flex scroll-mt-28 flex-col gap-4">
      <div className="flex flex-col gap-1 border-b border-line-default pb-3">
        <h2
          id={`${id}-title`}
          className="flex items-baseline gap-3 text-heading font-medium tracking-[var(--ls-heading)] text-foreground"
        >
          {title}
          <span className={LEDGER_MUTED}>{kind}</span>
        </h2>
        <p className="max-w-[80ch] text-body text-foreground-secondary">{lede}</p>
      </div>
      {children}
    </section>
  )
}

/**
 * Assurance: what this host can show about its own conduct.
 *
 * It was three numbered sections, each opening with a paragraph, under a
 * header whose row of readings repeated the first section's -- the egress
 * count appeared three times before the page said anything else. Now the
 * answer comes first: one card per kind of fact, each with its one figure,
 * and the detail behind each below it for whoever wants to check.
 *
 * Each is labelled with what kind of fact it is -- measured, tested or
 * configured -- because they are not the same kind of claim. The egress
 * figures follow the event stream, which carries each new sample, so the
 * last-sample age ages visibly if the stream stops rather than going quietly
 * stale.
 */
export function SecurityView() {
  const { user } = useRole()
  const sovereignty = useReading((signal) => readSovereignty(signal), [])
  const policies = useReading((signal) => readPolicies(signal), [])
  const sandbox = useSandboxTest()
  const { setData } = sovereignty

  const onEvent = useCallback(
    (event: StreamEvent) => {
      if (event.event === 'sovereignty.status' && isSovereigntyStatus(event.data)) {
        const next = event.data
        setData(() => next)
      }
    },
    [setData],
  )
  const { connected } = useEventStream({ onEvent })

  const status = sovereignty.data

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Assurance"
        description="What this host can show about its own conduct: what it measured, what it tested, and what it is configured to allow."
      />

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-12 px-4 pb-16 pt-6 sm:px-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <EgressVerdict status={status} live={connected} failure={sovereignty.status === 'failed' ? sovereignty.failure : null} />
          <ContainmentVerdict run={sandbox.run} onRun={() => void sandbox.start()} />
          <PolicyVerdict policies={policies.data} />
        </div>

        <Section
          id="egress"
          title="Egress"
          kind="Measured"
          lede="The monitor samples the network connections of the workbench's own processes and counts any that leave loopback."
        >
          {status ? (
            <EgressPanel status={status} live={connected} />
          ) : sovereignty.status === 'failed' ? (
            <FailureState failure={sovereignty.failure!} what="the egress monitor" retry={sovereignty.reload} />
          ) : (
            <ReadingLine what="the egress monitor" source="GET /api/sovereignty" startedAt={sovereignty.startedAt} />
          )}
        </Section>

        <Section
          id="sandbox"
          title="Containment"
          kind="Tested"
          lede="Only what the sandbox did when payloads were submitted just now. Nothing is carried over from an earlier run."
        >
          <SandboxPanel run={sandbox.run} onRun={() => void sandbox.start()} />
        </Section>

        <Section
          id="policy"
          title="Policy"
          kind="Configured"
          lede="What the gateway is told to allow and refuse, read from the policy files. It says what should happen; the audit chain records what did."
        >
          <PolicyPanel policies={policies} currentRole={user?.role ?? null} />
        </Section>
      </div>
    </div>
  )
}
